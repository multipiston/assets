// The views of one release (README.md, «Public files»): everything a person, a search engine, an LLM agent, a
// program or an SDK reads is generated from the same published catalog — nothing is written by hand.
//   catalog/latest.json            the pointer: current version, its address and sha256
//   catalog/index.json             sections → families → recipes, the files, the units
//   catalog/entries.json           every entry in one line: id, symbol, name, network, family, ref
//   catalog/entries/<id>.json      one entry, whole
//   catalog/recipes/<id>.json|.md  one recipe as data and as a card for a reader with little context
//   catalog/changes.json           what this version changed (catalog/changes/v<N>.json keeps each)
//   catalog/*.html, sitemap.xml    the public manual: static pages, no script — but build.html, the one
//                                  interactive page (site/build.js over the engine in catalog/engine/)
//   agents.html                    the rules for agents and programs (site/agents.html), in the same page
import { DEFINITION_ERRORS, buildDefinition } from "../engine/index.js";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const byId = (list) => new Map(list.map((x) => [x.id, x]));

// ---- data views ----
export const dataViews = (catalog, { sha256, base }) => {
  const files = {};
  const families = byId(catalog.families);
  const units = byId(catalog.units);
  const latest = `/catalog/v${catalog.version}/catalog.json`;
  files["catalog/latest.json"] = json({
    schema: "multipiston.catalog-latest/1", version: catalog.version, updated: catalog.updated,
    catalog: latest, sha256, index: "/catalog/index.json",
  });
  const recipesOf = (family) => catalog.recipes.filter((r) => r.family === family).sort((a, b) => Number(a.template) - Number(b.template));
  files["catalog/index.json"] = json({
    schema: "multipiston.catalog-index/1", version: catalog.version, updated: catalog.updated, repository: catalog.repository,
    files: {
      catalog: "/catalog/catalog.json", pinned: latest, sha256: "/catalog/catalog.json.sha256", schema: "/catalog/catalog.schema.json",
      entries: "/catalog/entries.json", entry: "/catalog/entries/<id>.json", recipe: "/catalog/recipes/<id>.json",
      card: "/catalog/recipes/<id>.md", changes: "/catalog/changes.json", rules: "/agents.html",
      manual: "/catalog/index.html",
    },
    units: catalog.units.map((u) => u.id),
    sections: catalog.sections.map((s) => ({
      id: s.id, name: s.name,
      families: catalog.families.filter((f) => f.section === s.id).map((f) => ({
        id: f.id, name: f.name, kinds: f.kinds,
        entries: catalog.assets.filter((a) => a.family === f.id && a.status === "listed").length,
        recipes: recipesOf(f.id).map((r) => r.id),
      })),
    })),
  });
  files["catalog/entries.json"] = json({
    schema: "multipiston.catalog-entries/1", version: catalog.version,
    entries: catalog.assets.map((a) => ({ id: a.id, status: a.status, symbol: a.symbol, name: a.name, network: a.network, family: a.family, decimals: a.decimals, ref: a.ref })),
  });
  for (const a of catalog.assets) files[`catalog/entries/${a.id}.json`] = json({ schema: "multipiston.catalog-entry/1", catalog_version: catalog.version, ...a });
  for (const r of catalog.recipes) {
    const family = families.get(r.family);
    files[`catalog/recipes/${r.id}.json`] = json({
      schema: "multipiston.catalog-recipe/1", catalog_version: catalog.version,
      family_name: family.name, family_identity: family.identity.replace("the runtime does not compute payouts", "MultiPiston does not calculate payouts"), units: unitsOfRecipe(r).map((id) => ({ id, ...units.get(id) })), ...r,
    });
    files[`catalog/recipes/${r.id}.md`] = recipeCard(catalog, r, family);
  }
  const changes = changesOf(base, catalog);
  files["catalog/changes.json"] = json(changes);
  files[`catalog/changes/v${catalog.version}.json`] = json(changes);
  return files;
};

// The units a recipe can give: its own, or each option's.
const unitsOfRecipe = (r) => {
  const set = new Set(r.unit ? [r.unit, r.display ?? r.unit] : []);
  for (const p of r.params) for (const o of p.options ?? []) if (o.unit) [o.unit, o.display ?? o.unit].forEach((u) => set.add(u));
  return [...set];
};

// What changed against the previous release (verify --base gives it); the first release adds all.
const changesOf = (base, next) => {
  const head = { schema: "multipiston.catalog-changes/1", version: next.version, updated: next.updated, from: base?.version ?? null };
  if (!base) return { ...head, entries: { added: next.assets.map((a) => a.id) }, recipes: { added: next.recipes.map((r) => r.id) } };
  const old = byId(base.assets), oldRecipes = byId(base.recipes ?? []);
  const shown = (a) => JSON.stringify([a.symbol, a.name, a.icon]);
  return {
    ...head,
    entries: {
      added: next.assets.filter((a) => !old.has(a.id)).map((a) => a.id),
      retired: next.assets.filter((a) => a.status === "retired" && old.get(a.id)?.status === "listed").map((a) => a.id),
      renamed: next.assets.filter((a) => old.has(a.id) && shown(old.get(a.id)) !== shown(a)).map((a) => a.id),
    },
    recipes: {
      added: next.recipes.filter((r) => !oldRecipes.has(r.id)).map((r) => r.id),
      grown: next.recipes.filter((r) => oldRecipes.has(r.id) && JSON.stringify(r.params) !== JSON.stringify(oldRecipes.get(r.id).params)).map((r) => r.id),
    },
  };
};

// ---- a recipe as a card for a reader with little context (an LLM agent) ----
const paramRule = (p) =>
  p.type === "choice" ? `one of ${p.options.length} options (below)`
    : p.type === "code" ? `a ${p.check} code, written as the check spells it`
      : p.type === "place" ? `a ${p.authority} code${p.options ? `: ${p.options.map((o) => o.id).join(", ")}` : ""}`
        : p.type === "text" ? `text up to ${p.max} characters${p.case === "keep" ? "" : `, ${p.case} case`}`
          : p.type === "period" ? `a period label (${p.grains.join(", ")}), ${p.clock} clock, the day starts at ${String(p.day_start).padStart(2, "0")}:00`
            : `a day YYYY-MM-DD, ${p.clock} clock`;
const recipeUsage = (r) => `import { loadCatalog } from "@multipiston/catalog";
const site = "https://<site>"; // Replace with your MultiPiston site's address.
const catalog = loadCatalog(await (await fetch(site + "/catalog/catalog.json")).json());
const built = catalog.build(${JSON.stringify(r.id)}, ${JSON.stringify(r.example.values)});
if (!built.ok) throw new Error("Check parameters: " + built.invalid.join(", "));
// Use built.ref for the asset and include built.definition in asset_definitions.`;
const definitionRule = (code, rule) => code === "noncanonical_terms"
  ? "Each term key must be unique. Prepare terms with sortTerms(terms), or use the asset builder."
  : rule;
const recipeCard = (catalog, r, family) => {
  const built = buildDefinition(r, r.example.values);
  const lines = [
    `# ${r.name} (${r.symbol})`, "",
    `Recipe \`${r.id}\` of family \`${r.family}\` — ${family.name}. Catalog version ${catalog.version}.${r.template ? " A family template: use it only when no own recipe of the family fits." : ""}${r.regulated ? " Regulated instrument." : ""}`, "",
    r.note, "",
    "## Parameters", "",
    "| id | name | value | example |", "|---|---|---|---|",
    ...r.params.map((p) => `| \`${p.id}\` | ${p.name} | ${paramRule(p)} | \`${p.example}\` |`), "",
  ];
  for (const p of r.params.filter((x) => x.type === "choice" || x.options)) {
    lines.push(`### Options of \`${p.id}\``, "", "| id | name |", "|---|---|", ...p.options.map((o) => `| \`${o.id}\` | ${o.name}${o.short && !o.name.startsWith(o.short) ? ` (${o.short})` : ""}${o.unit ? `; unit ${o.unit}` : ""} |`), "");
  }
  lines.push(
    "## Build", "",
    `Fill in this recipe at /catalog/build.html?recipe=${encodeURIComponent(r.id)}, or use the SDK:`, "",
    "```js", recipeUsage(r), "```", "",
    r.unit ? `Unit \`${r.unit}\`: an amount is a whole number of it${r.decimals ? `; shown in ${r.display} (1 ${r.display} = 10^${r.decimals} ${r.unit})` : ""}.` : "The unit is set by the chosen option: an amount is a whole number of it.",
    "Use the returned definition and ref as supplied.", "",
    "## Example", "", "```json", JSON.stringify({ values: r.example.values, definition: built.definition, ref: r.example.ref }, null, 2), "```", "",
    `Data: /catalog/recipes/${r.id}.json · Manual: /catalog/recipes/${r.id}.html`, "",
  );
  return lines.join("\n");
};

// ---- the public manual: static pages ----
const STYLE = `:root{color-scheme:light dark;--bg:#f6f7f8;--fg:#14191c;--muted:#5b656c;--panel:#fff;--line:#dfe3e6;--accent:#1f6feb}
@media (prefers-color-scheme:dark){:root{--bg:#0b1215;--fg:#e8edf0;--muted:#94a1a9;--panel:#131c20;--line:#24323a;--accent:#58a6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}a{color:var(--accent)}h1{font-size:28px;line-height:1.25;margin:8px 0 4px}h2{font-size:20px;margin:32px 0 8px}h3{font-size:16px;margin:20px 0 6px}
.muted{color:var(--muted)}.crumbs{font-size:14px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 16px;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
code,pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}pre{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
.row{display:flex;align-items:center;gap:10px}.row img{width:22px;height:22px;flex:none}.badge{font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
ul.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}ul.grid li{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
details summary{cursor:pointer;color:var(--muted)}footer{margin-top:48px;font-size:14px}
input,select,button{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:0}button{cursor:pointer}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:12px 0}.field{display:grid;gap:4px;align-content:start}.field>span:first-child{font-size:14px;font-weight:600;color:var(--muted)}.field>.muted{font-size:13px}
.terms{display:grid;gap:8px}.term{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px}.bad{border-color:#e07064}.error{color:#e07064}`;
// The engine's one dependency, for a browser without a bundler (catalog/engine/noble-hashes).
export const IMPORT_MAP = JSON.stringify({ imports: {
  "@noble/hashes/blake3": "/catalog/engine/noble-hashes/blake3.js",
  "@noble/hashes/crypto": "/catalog/engine/noble-hashes/crypto.js",
} });
// The frame of a page: the name after its title and its footer — the catalog's, or the rules'.
const CATALOG = {
  name: "MultiPiston asset catalog",
  footer: `MultiPiston asset catalog. A dictionary, not a permission: any valid description works in an intent right away. Machine-readable: <a href="/llms.txt">llms.txt</a> · <a href="/catalog/index.json">index.json</a> · <a href="/catalog/catalog.json">catalog.json</a> · <a href="/agents.html">rules for agents</a>.`,
};
const RULES = {
  name: "MultiPiston",
  footer: `MultiPiston. Machine-readable: <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> · the asset catalog: <a href="/catalog/index.html">for people</a>, <a href="/catalog/catalog.json">catalog.json</a>.`,
};
// The rules read as a document: the contents first, a line over each section, code set apart.
const RULES_STYLE = `main{max-width:860px}p,li{max-width:76ch}li{margin:4px 0}
h2{margin:48px 0 12px;padding-top:24px;border-top:1px solid var(--line)}h3{margin:28px 0 8px}section,h3{scroll-margin-top:16px}
:not(pre)>code{padding:1px 5px;border:1px solid var(--line);border-radius:6px;background:var(--panel);font-size:12.5px;overflow-wrap:break-word}
.toc{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 20px;margin:24px 0}.toc__head{margin:0 0 8px;font-weight:600}
.toc ul{list-style:none;margin:0;padding:0}.toc>ul{columns:2 280px;column-gap:32px}.toc>ul>li{break-inside:avoid;margin:0 0 8px}.toc ul ul{margin:4px 0 0 16px;font-size:14px}.toc a{text-decoration:none}.toc a:hover{text-decoration:underline}
#in-short ol{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 20px 12px 40px}.wide{overflow-x:auto;margin:8px 0}pre{margin:12px 0}`;
const page = (title, description, body, canonical, twin = null, head = "", frame = CATALOG) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${frame.name}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">${twin ? `<link rel="alternate" type="application/json" href="${esc(twin)}">` : ""}
<style>${STYLE}</style>${head}</head><body><main>
${body}
<footer class="muted">${frame.footer}</footer>
</main></body></html>
`;
const icon = (path) => (path ? `<img src="/catalog/${esc(path)}" alt="">` : "");
const shortRef = (ref) => `${ref.chain} ${ref.token.slice(0, 10)}…${ref.token.slice(-6)}`;

// `rules`: the body of the rules for agents (site/agents.html), the site's page beside the manual.
export const manualPages = (catalog, rules, site = null) => {
  const files = {};
  files["agents.html"] = page("Rules for agents and programs",
    "How an agent or a program connects to MultiPiston, describes an asset, publishes, renews and withdraws an intent, and reads its tickets.",
    rules.trimEnd(), "/agents.html", "/openapi.json", `<style>${RULES_STYLE}</style>`, RULES);
  const families = byId(catalog.families);
  const sectionOf = (family) => catalog.sections.find((s) => s.id === families.get(family).section);
  const recipesOf = (family) => catalog.recipes.filter((r) => r.family === family).sort((a, b) => Number(a.template) - Number(b.template));
  const entriesOf = (family) => catalog.assets.filter((a) => a.family === family && a.status === "listed");

  // The hub: how assets work, the order of choice, the sections.
  files["catalog/index.html"] = page("Asset catalog", "Every asset of MultiPiston in one shape: entries, recipes and family templates, with the rule to describe any asset.", `
<p class="crumbs muted">MultiPiston</p>
<h1>Asset catalog</h1>
<p class="muted">Version ${catalog.version} · ${esc(catalog.updated)} · ${catalog.assets.length} entries · ${catalog.recipes.length} recipes · ${catalog.sections.length} sections · ${catalog.families.length} families</p>
<h2>How an asset is described</h2>
<p>Choose an asset from the catalog or describe your own. Use its supplied <code>ref</code> in an intent and include its <code>definition</code> in <code>asset_definitions</code>. A valid definition works immediately; a catalog listing is optional.</p>
<ol>
<li><strong>An entry</strong> — one asset with one accepted spelling (a currency, a coin, a stablecoin): take its ref as it is.</li>
<li><strong>A recipe</strong> — every asset of a kind from open codes, closed lists and periods: fill in the values; the same values give the same ref to everyone.</li>
<li><strong>A family template</strong> — what no code or list reaches: the subject in words, the unit, the place and time.</li>
<li><strong>Your own definition</strong> — <a href="/catalog/describe.html">the rule for any asset</a>.</li>
</ol>
<p><a href="/catalog/build.html">Build an asset</a>: fill in a recipe or describe any asset, and get its exact definition and ref in your browser.</p>
<p>Amounts are whole numbers of the definition's unit: no fractions, no rounding. The display unit only moves the decimal point.</p>
<h2>Sections</h2>
<ul class="grid">${catalog.sections.map((s) => {
    const fams = catalog.families.filter((f) => f.section === s.id);
    const recipes = fams.reduce((n, f) => n + recipesOf(f.id).length, 0), entries = fams.reduce((n, f) => n + entriesOf(f.id).length, 0);
    return `<li><a href="/catalog/sections/${s.id}.html">${esc(s.name)}</a><br><span class="muted">${fams.length} families · ${entries} entries · ${recipes} recipes</span></li>`;
  }).join("")}</ul>
<h2>For programs and agents</h2>
<p><a href="/catalog/latest.json">latest.json</a> (the current catalog version and download address) · <a href="/catalog/index.json">index.json</a> · <a href="/catalog/entries.json">entries.json</a> · <code>/catalog/recipes/&lt;id&gt;.json</code> and <code>.md</code> · <a href="/catalog/changes.json">changes.json</a> · the SDK <code>@multipiston/catalog</code> for choosing and building assets.</p>
`, "/catalog/index.html", "/catalog/index.json");

  // The one interactive page: its script and the engine are static files beside it (build.mjs);
  // the import map names the engine's one dependency for the browser.
  files["catalog/build.html"] = page("Build an asset", "Fill in a recipe or describe any asset: its exact definition and ref, computed in your browser by the catalog's own rules.", `
<p class="crumbs muted"><a href="/catalog/index.html">Asset catalog</a></p>
<h1>Build an asset</h1>
<p>Fill in a recipe or describe any asset. Copy the returned definition and ref into your intent. Your inputs stay in this browser.</p>
<noscript><p>This page needs JavaScript. The same, without it: the recipe cards (<code>/catalog/recipes/&lt;id&gt;.md</code>) and <a href="/catalog/describe.html">the rule for any asset</a>.</p></noscript>
<h2 id="recipe">By a recipe</h2>
<div data-recipe></div>
<h2 id="any">Any asset</h2>
<p>For what no entry or recipe reaches (<a href="/catalog/describe.html">the rule</a>).</p>
<div data-any></div>
`, "/catalog/build.html", null, `<script type="importmap">${IMPORT_MAP}</script><script type="module" src="/catalog/build.js"></script>`);

  files["catalog/describe.html"] = page("Describe any asset", "The one rule for any asset: seven fields, typed terms, whole-number amounts, and how to make two descriptions meet.", `
<p class="crumbs muted"><a href="/catalog/index.html">Asset catalog</a></p>
<h1>Describe any asset</h1>
<p>Prefer an entry, then a recipe, then the family template; describe on your own only what none of them reaches.</p>
<table><tr><th>Field</th><th>Rule</th></tr>
<tr><td><code>version</code></td><td><code>1</code></td></tr>
<tr><td><code>domain</code></td><td>the family's domain (<code>other.custom</code> when nothing fits); a-z, 0-9 and <code>. _ : -</code>, up to 32</td></tr>
<tr><td><code>instrument</code></td><td>what exactly: model, part number, class, code</td></tr>
<tr><td><code>source</code></td><td><code>spec:&lt;standard&gt;</code> anyone can deliver · <code>issuer:&lt;domain&gt;</code> an obligation of an issuer · <code>registry:&lt;registry&gt;</code> a right recorded in a registry</td></tr>
<tr><td><code>kind</code></td><td><code>Fungible</code> — any two units are equal · <code>Unique</code> — one specific item</td></tr>
<tr><td><code>unit</code></td><td>the smallest unit delivered; an amount is a whole number of it</td></tr>
<tr><td><code>terms</code></td><td>essential fixed properties, <code>[{ "key", "value" }]</code>; prepare them with <code>sortTerms</code> or the asset builder</td></tr></table>
<h2>Supported terms</h2>
<table><tr><th>Group</th><th>Keys</th></tr>
<tr><td>Place</td><td><code>mp.place_authority</code>, <code>mp.place_id</code></td></tr>
<tr><td>Route</td><td><code>mp.origin_authority</code>, <code>mp.origin_id</code>, <code>mp.destination_authority</code>, <code>mp.destination_id</code></td></tr>
<tr><td>Period [start, end)</td><td><code>mp.start_us</code>, <code>mp.end_us</code> — UTC microseconds</td></tr>
<tr><td>Start window</td><td><code>mp.start_window_from_us</code>, <code>mp.start_window_to_us</code></td></tr>
<tr><td>Deadline</td><td><code>mp.provision_complete_by_us</code></td></tr>
<tr><td>Capacity</td><td><code>mp.capacity_unit</code>, <code>mp.concurrent_units</code></td></tr>
<tr><td>Exact identifiers</td><td><code>mp.configuration_id</code>, <code>mp.resource_id</code>, <code>mp.object_id</code>, <code>mp.object_version</code>, <code>mp.meter_id</code>, <code>mp.package_id</code></td></tr></table>
<h2>Validation errors</h2>
<table><tr><th>Code</th><th>Rule</th></tr>
${Object.entries(DEFINITION_ERRORS).map(([code, rule]) => `<tr><td><code>${code}</code></td><td>${esc(definitionRule(code, rule))}</td></tr>`).join("\n")}</table>
<h2>Create an asset</h2>
<p>Use <a href="/catalog/build.html#any">Build an asset → Any asset</a>, or the SDK <code>@multipiston/catalog</code>. Replace the example fields with your asset's description:</p>
<pre>${esc(`import { deriveAsset, sortTerms } from "@multipiston/catalog";
const definition = {
  version: 1, domain: "other.custom", instrument: "widget-7",
  source: "spec:acme", kind: "Fungible", unit: "item",
  terms: sortTerms([{ key: "colour", value: "red" }]),
};
const ref = deriveAsset(definition);
// Use ref for the asset and include definition in asset_definitions.`)}</pre>
<p>Never put a price, an amount, a seller of a standard good, payment details or keys into a definition. For a shared asset, use its existing entry or recipe and keep the returned definition and ref.</p>
`, "/catalog/describe.html");

  for (const s of catalog.sections) {
    const fams = catalog.families.filter((f) => f.section === s.id);
    files[`catalog/sections/${s.id}.html`] = page(s.name, `${s.name}: ${fams.length} families of the MultiPiston asset catalog, their entries and recipes.`, `
<p class="crumbs muted"><a href="/catalog/index.html">Asset catalog</a></p>
<h1>${esc(s.name)}</h1>
${fams.map((f) => {
      const entries = entriesOf(f.id), recipes = recipesOf(f.id);
      return `<h2 id="${esc(f.id)}">${esc(f.name)} <span class="badge">${esc(f.id)}</span></h2>
<p class="muted">${esc(f.identity.replace("the runtime does not compute payouts", "MultiPiston does not calculate payouts"))}</p>
${recipes.length ? `<div class="panel"><table><tr><th>Recipe</th><th></th></tr>${recipes.map((r) => `<tr><td><div class="row">${icon(r.icon)}<a href="/catalog/recipes/${esc(r.id)}.html">${esc(r.name)}</a></div></td><td>${r.template ? '<span class="badge">template</span>' : ""}${r.regulated ? ' <span class="badge">regulated</span>' : ""}</td></tr>`).join("")}</table></div>` : ""}
${entries.length ? `<div class="panel"><table><tr><th>Entry</th><th>Name</th><th>Ref</th></tr>${entries.map((a) => `<tr><td><div class="row">${icon(a.icon)}<a href="/catalog/entries/${esc(a.id)}.json">${esc(a.symbol)}</a></div></td><td>${esc(a.name)}${a.network ? ` <span class="muted">· ${esc(catalog.networks.find((n) => n.id === a.network)?.name ?? a.network)}</span>` : ""}</td><td><code>${esc(shortRef(a.ref))}</code></td></tr>`).join("")}</table></div>` : ""}`;
    }).join("\n")}
`, `/catalog/sections/${s.id}.html`);
  }

  for (const r of catalog.recipes) {
    const family = families.get(r.family), section = sectionOf(r.family);
    const built = buildDefinition(r, r.example.values);
    files[`catalog/recipes/${r.id}.html`] = page(r.name, `${r.name}: the MultiPiston recipe ${r.id} — parameters, options, a worked example and its exact ref.`, `
<p class="crumbs muted"><a href="/catalog/index.html">Asset catalog</a> › <a href="/catalog/sections/${esc(section.id)}.html">${esc(section.name)}</a> › <a href="/catalog/sections/${esc(section.id)}.html#${esc(r.family)}">${esc(family.name)}</a></p>
<div class="row">${icon(r.icon)}<h1>${esc(r.name)}</h1></div>
<p><span class="badge">${esc(r.symbol)}</span> <span class="badge">${r.template ? "family template" : "recipe"}</span>${r.regulated ? ' <span class="badge">regulated</span>' : ""} <code>${esc(r.id)}</code></p>
<p>${esc(r.note)}</p>
<h2>Parameters</h2>
<div class="panel"><table><tr><th>Parameter</th><th>Value</th><th>Example</th></tr>
${r.params.map((p) => `<tr><td><code>${esc(p.id)}</code><br>${esc(p.name)}</td><td>${esc(paramRule(p))}</td><td><code>${esc(p.example)}</code></td></tr>`).join("\n")}</table></div>
${r.params.filter((p) => p.options).map((p) => `<details><summary>Options of ${esc(p.id)} (${p.options.length})</summary><div class="panel"><table><tr><th>id</th><th>name</th></tr>${p.options.map((o) => `<tr><td><code>${esc(o.id)}</code></td><td>${esc(o.name)}${o.unit ? ` <span class="muted">· ${esc(o.unit)}</span>` : ""}</td></tr>`).join("")}</table></div></details>`).join("\n")}
<h2>Build</h2>
<p><a href="/catalog/build.html?recipe=${encodeURIComponent(r.id)}">Fill in this recipe</a>, then use the returned definition and ref. ${r.unit ? `An amount is a whole number of <code>${esc(r.unit)}</code>${r.decimals ? `, shown in ${esc(r.display)} (×10^${r.decimals})` : ""}.` : "The chosen option sets the unit; an amount is a whole number of it."}</p>
<h2>Example</h2>
<pre>${esc(JSON.stringify({ values: r.example.values, definition: built.definition, ref: r.example.ref }, null, 2))}</pre>
<h2>Use it</h2>
<pre>${esc(recipeUsage(r))}</pre>
<p>Interactive: <a href="/catalog/build.html?recipe=${encodeURIComponent(r.id)}">build it</a> · Data: <a href="/catalog/recipes/${esc(r.id)}.json">${esc(r.id)}.json</a> · Card: <a href="/catalog/recipes/${esc(r.id)}.md">${esc(r.id)}.md</a></p>
`, `/catalog/recipes/${r.id}.html`, `/catalog/recipes/${r.id}.json`);
  }
  // A sitemap lists absolute addresses: it is written when the build knows the site's origin.
  if (site) {
    const urls = Object.keys(files).filter((p) => p.endsWith(".html")).sort();
    files["catalog/sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(site)}/${u}</loc><lastmod>${catalog.updated}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  }
  return files;
};
