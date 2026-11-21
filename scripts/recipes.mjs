// The checks of a recipe file (RECIPES.md §5): what the catalog demands of a recipe before it is
// published. Building and reading are the engine's (engine/recipes.js): one implementation for the
// catalog, the cabinet, agents and SDKs.
import { CODES, CLOCKS, GRAINS, TARGETS, buildDefinition, canonicalValue, deriveAsset, readDefinition } from "../engine/index.js";

export const PLACE_AUTHORITIES = ["unlocode", "iso3166", "eic"];

const RECIPE_FIELDS = ["family", "name", "symbol", "icon", "kind", "source", "unit", "decimals", "display", "instrument", "terms", "params", "regulated", "note"];
const PARAM_FIELDS = ["id", "name", "type", "to", "example", "options", "check", "authority", "max", "case", "clock", "day_start", "grains"];
const OPTION_FIELDS = ["id", "name", "short", "unit", "decimals", "display"];
const TYPES = ["choice", "code", "place", "text", "period", "date"];
const TARGETS_OF = {
  choice: "value", code: "value", text: "value",
  place: ["place", "origin", "destination"], period: ["period", "window"], date: ["deadline"],
};
const VALUE_TARGETS = ["instrument", "object", "configuration", "resource", "meter", "package"];
const OPAQUE = /^term:([a-z][a-z0-9_.-]{0,63})$/;

// The display unit is the unit times 10^decimals on the same ladder (units.json).
export const checkUnits = (units, unit, decimals, display, say, at) => {
  const u = units[unit];
  if (!u) return say(at, `unit ${unit} is not in units.json`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return say(at, "decimals: 0–18");
  // atom and minor-unit have no ladder: their decimals belong to the asset, the display is the unit.
  if (u.base === undefined) {
    if (display !== unit) say(at, `unit ${unit}: shown as itself`);
    return;
  }
  const d = units[display];
  if (!d || d.base !== u.base || d.exp - u.exp !== decimals)
    say(at, `display ${display} must be ${unit} × 10^${decimals} on the same ladder (units.json)`);
};

export const checkRecipe = (r, ctx, say) => {
  const at = r.__file;
  for (const k of Object.keys(r)) if (k !== "id" && !k.startsWith("__") && !RECIPE_FIELDS.includes(k)) say(at, `unknown field ${k}`);
  const family = ctx.families.get(r.family);
  if (!/^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/.test(r.id) || r.id.length > 64 || !family || !r.id.startsWith(`${r.family}.`))
    return say(at, "file name: <family id>.<name> of an existing family, up to 64");
  if (!ctx.name(r.name)) say(at, "name: English text, 1–64 characters");
  if (!/^[A-Za-z0-9]{2,8}$/.test(r.symbol ?? "")) say(at, "symbol: 2–8 Latin letters and digits");
  if (!family.kinds.includes(r.kind)) say(at, `kind: family ${family.id} takes ${family.kinds.join(" or ")}`);
  if (!/^(spec|registry):[a-z0-9][a-z0-9._-]{1,62}$/.test(r.source ?? "")) say(at, "source: spec:<name> or registry:<name> (an issuer is an entry, not a recipe)");
  if (r.regulated !== undefined && r.regulated !== true) say(at, "regulated: true or absent");
  if (r.icon !== null && !(typeof r.icon === "string" && /^icons\/recipes\/[a-z0-9-]+\.svg$/.test(r.icon))) say(at, "icon: null or icons/recipes/<name>.svg");
  if (!ctx.english(r.note, 1024)) say(at, "note: English text with the sources, up to 1024 characters");
  if (!Array.isArray(r.params) || r.params.length < 1 || r.params.length > 8) return say(at, "params: 1–8");
  const ids = new Set(), keys = new Set();
  const takeKey = (key) => {
    if (keys.has(key)) say(at, `term ${key} is set twice`);
    keys.add(key);
  };
  for (const t of r.terms ?? []) {
    if (!ctx.text(t?.key, 64) || typeof t.value !== "string" || !ctx.text(t.value, 256)) say(at, "terms: { key, value } text");
    else if (t.key.startsWith("mp.") && !ctx.typedTerms.includes(t.key)) say(at, `term ${t.key}: mp.* is reserved for the typed terms`);
    else takeKey(t.key);
  }
  let unitOptions = 0;
  for (const p of r.params) {
    const pat = `${at} param ${p?.id}`;
    for (const k of Object.keys(p ?? {})) if (!PARAM_FIELDS.includes(k)) say(pat, `unknown field ${k}`);
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(p?.id ?? "") || ids.has(p.id)) { say(pat, "id: a-z, 0-9, _; unique"); continue; }
    ids.add(p.id);
    if (!ctx.name(p.name)) say(pat, "name: English text, 1–64 characters");
    if (!TYPES.includes(p.type)) { say(pat, `type: one of ${TYPES.join(", ")}`); continue; }
    const allowed = TARGETS_OF[p.type];
    const opaque = OPAQUE.exec(p.to ?? "");
    if (p.to === "unit") {
      if (p.type !== "choice" || !(p.options ?? []).every((o) => o.unit)) say(pat, "to unit: a choice whose every option is a unit");
    } else if (allowed === "value") {
      if (!VALUE_TARGETS.includes(p.to) && !opaque) say(pat, `to: ${VALUE_TARGETS.join(", ")} or term:<key>`);
      else if (opaque) {
        if (opaque[1].startsWith("mp.")) say(pat, "term:<key>: mp.* is reserved");
        takeKey(opaque[1]);
      } else if (p.to !== "instrument") takeKey(TARGETS[p.to][0]);
    } else if (!allowed.includes(p.to)) say(pat, `to: ${allowed.join(", ")}`);
    else for (const key of p.type === "date" ? TARGETS[p.to].slice(0, 1) : TARGETS[p.to]) takeKey(key);
    if (p.type === "choice") {
      if (!Array.isArray(p.options) || p.options.length < 1 || p.options.length > 4096) say(pat, "options: 1–4096");
      const seen = new Set();
      let withUnit = 0;
      for (const o of p.options ?? []) {
        for (const k of Object.keys(o ?? {})) if (!OPTION_FIELDS.includes(k)) say(pat, `option: unknown field ${k}`);
        if (!ctx.text(o?.id, 128) || /[{}]/.test(o.id) || seen.has(o.id)) say(pat, `option ${o?.id}: an id of up to 128 characters, unique`);
        seen.add(o?.id);
        if (!ctx.name(o?.name)) say(pat, `option ${o?.id}: name in English, 1–64 characters`);
        if (o?.short !== undefined && !ctx.text(o.short, 24)) say(pat, `option ${o?.id}: short up to 24 characters`);
        if (o?.unit !== undefined) {
          withUnit++;
          checkUnits(ctx.units, o.unit, o.decimals ?? 0, o.display ?? o.unit, say, `${pat} option ${o.id}`);
        }
      }
      if (withUnit) {
        unitOptions++;
        if (withUnit !== p.options.length) say(pat, "options: every option names its unit, or none");
      }
    }
    if (p.type === "code" && !Object.hasOwn(CODES, p.check)) say(pat, `check: one of ${Object.keys(CODES).join(", ")}`);
    if (p.type === "place") {
      if (!PLACE_AUTHORITIES.includes(p.authority)) say(pat, `authority: ${PLACE_AUTHORITIES.join(", ")}`);
      else for (const o of p.options ?? []) if (CODES[p.authority](o.id) !== o.id || !ctx.name(o.name)) say(pat, `option ${o.id}: a canonical ${p.authority} code with a name`);
    }
    if (p.type === "text" && (!Number.isInteger(p.max) || p.max < 1 || p.max > 256 || !["keep", "upper", "lower"].includes(p.case)))
      say(pat, "text: max 1–256, case keep, upper or lower");
    if (p.type === "period" || p.type === "date") {
      if (!Object.hasOwn(CLOCKS, p.clock)) say(pat, `clock: one of ${Object.keys(CLOCKS).join(", ")}`);
      if (!Number.isInteger(p.day_start) || p.day_start < 0 || p.day_start > 23) say(pat, "day_start: 0–23");
      if (p.type === "period" && (!Array.isArray(p.grains) || !p.grains.length || p.grains.some((g) => !GRAINS.includes(g))))
        say(pat, `grains: some of ${GRAINS.join(", ")}`);
    }
    if (typeof p.example !== "string" || canonicalValue(p, p.example) !== p.example) say(pat, "example: a canonical value of this parameter");
  }
  if (unitOptions > 1) say(at, "only one parameter may set the unit");
  if (!unitOptions) checkUnits(ctx.units, r.unit, r.decimals ?? 0, r.display ?? r.unit, say, at);
  else if (r.unit !== undefined || r.decimals !== undefined || r.display !== undefined) say(at, "the unit is set by the options");
  // The instrument names every instrument parameter once, and nothing else.
  const placeholders = [...(r.instrument ?? "").matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const wanted = r.params.filter((p) => p.to === "instrument").map((p) => p.id);
  if (!ctx.text(r.instrument, 256) || placeholders.sort().join() !== [...wanted].sort().join() || new Set(placeholders).size !== placeholders.length)
    say(at, "instrument: text with {param} once for each parameter that goes to the instrument");
  // The worked example: it builds, the runtime takes it, and it reads back to the same values.
  const rule = { ...r, domain: family.domain ?? family.id };
  const values = Object.fromEntries(r.params.map((p) => [p.id, p.example]));
  const built = buildDefinition(rule, values);
  if (!built.ok) return say(at, `the example: not valid for ${built.invalid.join(", ")}`);
  try {
    deriveAsset(built.definition);
  } catch (e) {
    return say(at, `the example: the runtime refuses it (${e.message})`);
  }
  const back = readDefinition([rule], built.definition);
  if (!back || JSON.stringify(back.values) !== JSON.stringify(values)) say(at, "the example does not read back to its own values");
};
