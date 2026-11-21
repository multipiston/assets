// Recipes (RECIPES.md): one way to describe every asset of a kind from open codes, closed lists and
// calendar periods. The same values give the same definition — and the same ref — to everyone.
//   buildDefinition(recipe, values) → the exact definition an agent publishes;
//   readDefinition(recipes, definition) → the recipe and values that made it.
// A recipe here is the published form (catalog.json `recipes`): it carries its `domain`.
import { CODES } from "./codes.js";
import { sortTerms } from "./definition.js";
import { periodBounds, periodLabel } from "./periods.js";

const HOUR = 3_600_000;

export const TARGETS = {
  period: ["mp.start_us", "mp.end_us"],
  window: ["mp.start_window_from_us", "mp.start_window_to_us"],
  deadline: ["mp.provision_complete_by_us"],
  place: ["mp.place_authority", "mp.place_id"],
  origin: ["mp.origin_authority", "mp.origin_id"],
  destination: ["mp.destination_authority", "mp.destination_id"],
  object: ["mp.object_id"],
  configuration: ["mp.configuration_id"],
  resource: ["mp.resource_id"],
  meter: ["mp.meter_id"],
  package: ["mp.package_id"],
};
const TEXT_CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]");
export const periodRule = (p) => ({
  clock: p.clock ?? "UTC",
  dayStart: p.day_start ?? 0,
  grains: p.type === "date" ? ["day"] : (p.grains ?? []),
});

// One typed value → its canonical spelling, or null.
export const canonicalValue = (param, raw) => {
  if (typeof raw !== "string") return null;
  switch (param.type) {
    case "choice":
      return (param.options ?? []).some((o) => o.id === raw.trim()) ? raw.trim() : null;
    case "code":
      return param.check && CODES[param.check] ? CODES[param.check](raw) : null;
    case "place": {
      const code = param.authority && CODES[param.authority] ? CODES[param.authority](raw) : null;
      return code && (!param.options || param.options.some((o) => o.id === code)) ? code : null;
    }
    case "text": {
      const t = raw.normalize("NFC").trim().replace(/\s+/g, " ");
      const cased = param.case === "upper" ? t.toUpperCase() : param.case === "lower" ? t.toLowerCase() : t;
      return cased && cased.length <= (param.max ?? 0) && !TEXT_CONTROL.test(cased) ? cased : null;
    }
    case "period":
    case "date":
      return periodBounds(raw, periodRule(param)) ? raw.trim() : null;
  }
};
const optionOf = (param, value) =>
  (param.options ?? []).find((o) => o.id === value) ?? null;
// The unit, decimals and display once the values are known (an option may set them).
export const recipeUnits = (recipe, values = {}) => {
  for (const p of recipe.params) {
    const o = optionOf(p, values[p.id]);
    if (o?.unit) return { unit: o.unit, decimals: o.decimals ?? 0, display: o.display ?? o.unit };
  }
  return { unit: recipe.unit ?? "", decimals: recipe.decimals ?? 0, display: recipe.display ?? recipe.unit ?? "" };
};
// values → { ok: true, definition, values (canonical) } or { ok: false, invalid: [param ids] }.
export const buildDefinition = (recipe, values) => {
  const canon = {};
  const invalid = [];
  for (const p of recipe.params) {
    const v = canonicalValue(p, values?.[p.id] ?? "");
    if (v === null) invalid.push(p.id);
    else canon[p.id] = v;
  }
  if (invalid.length) return { ok: false, invalid };
  const terms = [...(recipe.terms ?? [])];
  let instrument = recipe.instrument;
  for (const p of recipe.params) {
    const v = canon[p.id];
    if (p.to === "unit") continue;
    if (p.to === "instrument") instrument = instrument.replace(`{${p.id}}`, () => v);
    else if (p.to.startsWith("term:")) terms.push({ key: p.to.slice(5), value: v });
    else if (p.type === "period" || p.type === "date") {
      const b = periodBounds(v, periodRule(p));
      if (!b) return { ok: false, invalid: [p.id] };
      if (p.type === "date") terms.push({ key: TARGETS[p.to][0], value: b.end_us });
      else terms.push({ key: TARGETS[p.to][0], value: b.start_us }, { key: TARGETS[p.to][1], value: b.end_us });
    } else if (p.type === "place") terms.push({ key: TARGETS[p.to][0], value: p.authority ?? "" }, { key: TARGETS[p.to][1], value: v });
    else terms.push({ key: TARGETS[p.to][0], value: v });
  }
  return {
    ok: true,
    definition: { version: 1, domain: recipe.domain, instrument, source: recipe.source, kind: recipe.kind, unit: recipeUnits(recipe, canon).unit, terms: sortTerms(terms) },
    values: canon,
  };
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameDefinition = (a, b) =>
  a.domain === b.domain && a.instrument === b.instrument && a.source === b.source && a.kind === b.kind && a.unit === b.unit &&
  a.terms.length === b.terms.length && a.terms.every((t, i) => t.key === b.terms[i].key && t.value === b.terms[i].value);
const dayEndingAt = (p, endUs) => {
  const end = Number(endUs.slice(0, -3));
  for (const back of [24, 23, 25]) {
    const label = periodLabel(`${end - back * HOUR}000`, endUs, { clock: p.clock ?? "UTC", dayStart: p.day_start ?? 0, grains: ["day"] });
    if (label) return label;
  }
  return null;
};
// A definition (or a verified label of one) → the recipe and values that made it exactly, or null.
export const readDefinition = (recipes, d) => {
  for (const recipe of recipes) {
    if (recipe.domain !== d.domain || recipe.source !== d.source || recipe.kind !== d.kind) continue;
    const names = [];
    const pattern = recipe.instrument
      .split(/(\{[a-z][a-z0-9_]*\})/)
      .map((part) => {
        const m = /^\{([a-z][a-z0-9_]*)\}$/.exec(part);
        if (!m) return escapeRe(part);
        names.push(m[1]);
        return "(.+?)";
      })
      .join("");
    const m = new RegExp(`^${pattern}$`).exec(d.instrument);
    if (!m) continue;
    const values = {};
    names.forEach((n, i) => {
      values[n] = m[i + 1];
    });
    const term = (key) => d.terms.find((t) => t.key === key)?.value;
    for (const p of recipe.params) {
      if (p.to === "instrument") continue;
      if (p.to === "unit") values[p.id] = (p.options ?? []).find((o) => o.unit === d.unit)?.id;
      else if (p.to.startsWith("term:")) values[p.id] = term(p.to.slice(5));
      else if (p.type === "period") values[p.id] = periodLabel(term(TARGETS[p.to][0]) ?? "", term(TARGETS[p.to][1]) ?? "", periodRule(p));
      else if (p.type === "date") {
        const end = term(TARGETS[p.to][0]) ?? "";
        values[p.id] = /^[1-9][0-9]*000$/.test(end) ? dayEndingAt(p, end) : null;
      } else if (p.type === "place") values[p.id] = term(TARGETS[p.to][0]) === p.authority ? term(TARGETS[p.to][1]) : null;
      else values[p.id] = term(TARGETS[p.to][0]);
    }
    if (Object.values(values).some((v) => typeof v !== "string")) continue;
    const built = buildDefinition(recipe, values);
    if (built.ok && sameDefinition(built.definition, d)) return { recipe, values: built.values };
  }
  return null;
};
