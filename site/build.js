// «Build an asset» (/catalog/build.html): fill in a recipe or describe an asset and copy the result.
// Inputs stay in this browser. English, like the catalog.
// Text is set as text, never as markup: what is typed here never becomes part of the page.
import { DEFINITION_ERRORS, TYPED_TERMS, canonicalValue, deriveAsset, loadCatalog, recipeUnits, sortTerms } from "/catalog/engine/index.js";

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};
// A node when the condition holds, else nothing at all.
const when = (condition, node) => (condition ? [node()] : []);
const field = (label, control, note) =>
  el("label", { class: "field" }, el("span", {}, label), control, note && el("span", { class: "muted" }, note));
const output = (definition, ref) => [
  el("p", { class: "muted" }, "Ref"),
  el("pre", { tabindex: 0 }, `${ref.chain} ${ref.token}`),
  el("p", { class: "muted" }, "Definition — what an intent carries"),
  el("pre", { tabindex: 0 }, JSON.stringify(definition, null, 2)),
];

// What a parameter takes, in words.
const hint = (p) =>
  p.type === "period" ? `${p.grains.join(", ")}; bounds in ${p.clock} time, the day starts at ${String(p.day_start).padStart(2, "0")}:00`
    : p.type === "date" ? `a day YYYY-MM-DD in ${p.clock} time`
      : p.type === "code" ? `a code by the ${p.check} rule: spaces and case do not matter`
        : p.type === "place" ? `a code by the ${p.authority} rule`
          : p.type === "text" ? `text up to ${p.max} characters` : null;

const recipeForm = (catalog, box, chosen) => {
  const units = new Map(catalog.units.map((u) => [u.id, u]));
  const body = el("div");
  const show = (recipe) => {
    body.replaceChildren();
    if (!recipe) return;
    // It opens with its worked example, so the result is there at once.
    const values = { ...recipe.example.values };
    const status = el("div", { role: "status" });
    const amount = el("p", { class: "muted" });
    const update = () => {
      const built = catalog.build(recipe, values);
      for (const p of recipe.params) {
        const control = body.querySelector(`[data-param="${p.id}"]`);
        control.classList.toggle("bad", values[p.id].trim() !== "" && canonicalValue(p, values[p.id]) === null);
      }
      const u = recipeUnits(recipe, built.ok ? built.values : values);
      const symbol = (id) => units.get(id)?.symbol ?? id;
      // A unit with no ladder (atom, minor unit) is shown as itself, its decimals the asset's.
      amount.textContent = u.decimals === 0
        ? `An amount is a whole number of ${symbol(u.unit)}.`
        : u.unit === u.display
          ? `An amount is a whole number of ${symbol(u.unit)}, shown with ${u.decimals} decimals.`
          : `An amount is a whole number of ${symbol(u.unit)}; shown in ${symbol(u.display)}: 1 ${symbol(u.display)} = ${"1" + "0".repeat(u.decimals)} ${symbol(u.unit)}.`;
      status.replaceChildren(...(built.ok ? output(built.definition, built.ref)
        : [el("p", { class: "error" }, `Not valid: ${built.invalid.map((id) => recipe.params.find((p) => p.id === id)?.name ?? id).join(", ")}.`)]));
    };
    const control = (p) => {
      const on = { oninput: (e) => { values[p.id] = e.target.value; update(); } };
      return p.type === "choice"
        ? el("select", { "data-param": p.id, ...on }, p.options.map((o) =>
          el("option", { value: o.id, selected: o.id === values[p.id] }, o.short && !o.name.startsWith(o.short) ? `${o.short} — ${o.name}` : o.name)))
        : el("input", { "data-param": p.id, value: values[p.id], placeholder: p.example, autocomplete: "off", spellcheck: "false", ...on });
    };
    body.append(
      el("p", {}, el("strong", {}, `${recipe.symbol} · ${recipe.name}`), " — ", el("a", { href: `/catalog/recipes/${recipe.id}.html` }, "recipe page")),
      ...when(recipe.regulated, () => el("p", { class: "error" }, "A regulated instrument: trade it only where you and the counterparty may.")),
      el("div", { class: "fields" }, recipe.params.map((p) => field(p.name, control(p), hint(p)))),
      amount,
      status,
    );
    update();
  };
  const pick = el("input", {
    list: "recipes", placeholder: "A recipe's id — type its name or symbol to find it", autocomplete: "off", spellcheck: "false",
    value: chosen ?? "",
    oninput: (e) => show(catalog.recipe(e.target.value.trim())),
  });
  box.append(
    field("Recipe", pick),
    el("datalist", { id: "recipes" }, catalog.recipes.map((r) => el("option", { value: r.id }, `${r.symbol} — ${r.name}`))),
    body,
  );
  show(chosen ? catalog.recipe(chosen) : null);
};

const anyForm = (catalog, box) => {
  const input = { domain: "other.custom", instrument: "", source: "spec:", kind: "Fungible", unit: "item", terms: [] };
  const status = el("div", { role: "status" });
  const update = () => {
    const definition = {
      version: 1, domain: input.domain.trim(), instrument: input.instrument.trim(), source: input.source.trim(),
      kind: input.kind, unit: input.unit.trim(),
      // Omit empty rows and prepare the terms. Keep each value as typed.
      terms: sortTerms(input.terms.filter((t) => t.key.trim() || t.value).map((t) => ({ key: t.key.trim(), value: t.value }))),
    };
    // Nothing is said until the instrument is typed and the source names its rule.
    if (!definition.instrument || !/:./.test(definition.source))
      return status.replaceChildren(el("p", { class: "muted" }, "Type the instrument and the source: the definition and its ref appear here."));
    let ref;
    try {
      ref = deriveAsset(definition);
    } catch (e) {
      const hint = e.message === "noncanonical_terms" ? "Each term key must be unique."
        : DEFINITION_ERRORS[e.message] ?? "Check the asset's fields.";
      return status.replaceChildren(el("p", { class: "error" }, el("code", {}, e.message), ` — ${hint}`));
    }
    const family = catalog.families.find((f) => (f.domain ?? f.id) === definition.domain);
    const proposal = new URLSearchParams({ template: "propose-asset.yml", title: `Propose ${definition.instrument}`, asset: JSON.stringify(definition) });
    if (family) proposal.set("family", family.id);
    status.replaceChildren(...output(definition, ref),
      ...when(catalog.repository, () => el("p", {}, el("a", { href: `${catalog.repository}/issues/new?${proposal}` }, "Propose it to the catalog"))));
  };
  const text = (key, attrs = {}) =>
    el("input", { value: input[key], autocomplete: "off", spellcheck: "false", oninput: (e) => { input[key] = e.target.value; update(); }, ...attrs });
  const terms = el("div", { class: "terms" });
  const drawTerms = () => {
    terms.replaceChildren(...input.terms.map((t, i) => el("div", { class: "term" },
      el("input", { value: t.key, list: "typed-terms", placeholder: "key", "aria-label": `Term ${i + 1} key`, autocomplete: "off", spellcheck: "false", oninput: (e) => { t.key = e.target.value; update(); } }),
      el("input", { value: t.value, placeholder: "value", "aria-label": `Term ${i + 1} value`, autocomplete: "off", spellcheck: "false", oninput: (e) => { t.value = e.target.value; update(); } }),
      el("button", { type: "button", "aria-label": `Remove term ${i + 1}`, onclick: () => { input.terms.splice(i, 1); drawTerms(); update(); } }, "✕"),
    )));
  };
  const domains = [...new Set(catalog.families.map((f) => f.domain ?? f.id))];
  box.append(
    el("div", { class: "fields" },
      field("Domain", text("domain", { list: "domains" }), "the family's domain: a-z, 0-9 and . _ : -, up to 32"),
      field("Instrument", text("instrument"), "what exactly, by the rule of the source"),
      field("Source", text("source"), "the rule the instrument is written by: spec:…, issuer:…, registry:…"),
      field("Kind", el("select", { oninput: (e) => { input.kind = e.target.value; update(); } },
        el("option", { value: "Fungible" }, "Fungible — counted by amount"), el("option", { value: "Unique" }, "Unique — one thing")), null),
      field("Unit", text("unit", { list: "units" }), "an amount is a whole number of it"),
    ),
    el("datalist", { id: "domains" }, domains.map((d) => el("option", { value: d }))),
    el("datalist", { id: "units" }, catalog.units.map((u) => el("option", { value: u.id }, `${u.symbol} — ${u.name}`))),
    el("datalist", { id: "typed-terms" }, TYPED_TERMS.map((k) => el("option", { value: k }))),
    el("p", { class: "muted" }, "Terms: use the suggested mp.* keys for place, time and capacity; times are UTC microseconds and each group's fields go together. Add other fixed properties as needed. Use each key once."),
    terms,
    el("p", {}, el("button", { type: "button", onclick: () => { input.terms.push({ key: "", value: "" }); drawTerms(); update(); } }, "Add a term")),
    status,
  );
  update();
};

const main = async () => {
  const response = await fetch("/catalog/catalog.json");
  // Load the catalog before opening either form.
  const catalog = loadCatalog(await response.json());
  recipeForm(catalog, document.querySelector("[data-recipe]"), new URLSearchParams(location.search).get("recipe"));
  anyForm(catalog, document.querySelector("[data-any]"));
};
main().catch(() =>
  document.querySelector("[data-recipe]").replaceChildren(el("p", { class: "error" }, "The catalog could not be loaded: reload the page.")));
