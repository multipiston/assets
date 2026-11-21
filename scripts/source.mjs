// The catalog source → checked → the published file. One place for every rule, so
// `verify`, `build` and the tests agree. Nothing here talks to the network.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFINITION_ERRORS, TYPED_TERMS, buildDefinition, deriveAsset } from "../engine/index.js";
import { ISO4217 } from "./iso4217.mjs";
import { checkRecipe } from "./recipes.mjs";
import { familyTemplates } from "./templates.mjs";
import { checkSvg } from "./svg.mjs";

// 3: the catalog is English only — every name and description is one string (owner, 2026-11-01).
export const SCHEMA = "multipiston.catalog/3";
const ENTRY_FIELDS = ["status", "family", "symbol", "aliases", "name", "decimals", "icon", "ref", "definition", "replaced_by", "note"];
const STATUSES = ["draft", "listed", "retired"];
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SYMBOL = /^[A-Za-z0-9]{2,8}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN = /^[a-z0-9._:-]{1,32}$/;
// Stricter than the runtime, so a catalog entry reads the same to everyone.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]");
// A lone surrogate is not text: the runtime's strict JSON refuses it.
const LONE = /\p{Cs}/u;
// A network by its CAIP-2 id (namespace:reference); networks.json names each one the catalog uses.
const CAIP2 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;
// An on-chain asset is named by its CAIP-19 id (chain_id/asset_namespace:asset_reference[/token_id]);
// EVM addresses in lower case, so one asset has one spelling.
const CAIP19 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}(\/[-.%a-zA-Z0-9]{1,78})?$/;
// A token id in decimal without leading zeros (as the runtime's own network refs), so one NFT has one spelling.
const EVM_ADDRESS = /^eip155:[0-9]+\/(erc20|erc721|erc1155):0x[0-9a-f]{40}(\/(0|[1-9][0-9]*))?$/;
// The catalog is English only: a letter of another script (Cyrillic, Greek, …) is refused.
const FOREIGN = /(?=\p{L})\P{Script=Latin}/u;

// Look-alike characters fold together, so "ETH" cannot sit next to "EtH", "E-TH" or a Cyrillic
// look-alike, nor "DOT" next to "D0T" (digits 0 and 1 fold into o and l).
export const fold = (s) => s.normalize("NFKC").toLowerCase()
  .replace(/[аaα]/g, "a").replace(/[еeε]/g, "e").replace(/[оoο0]/g, "o").replace(/[рp]/g, "p")
  .replace(/[сc]/g, "c").replace(/[хx]/g, "x").replace(/[уy]/g, "y").replace(/[кk]/g, "k")
  .replace(/[мm]/g, "m").replace(/[тt]/g, "t").replace(/[нh]/g, "h").replace(/[вb]/g, "b").replace(/[il1|]/g, "l")
  .replace(/[\s._-]+/g, "");

const readJson = (file, problems, where) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`${where}: ${e.message}`);
    return null;
  }
};
const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !CONTROL.test(v) && !LONE.test(v);
const english = (v, max) => text(v, max) && !FOREIGN.test(v);
const name = (v) => english(v, 64);
const only = (value, fields, at, say) => {
  for (const k of Object.keys(value ?? {})) if (!fields.includes(k)) say(at, `unknown field ${k}`);
};
// The domain an inline asset of a family takes: the family id unless the family names another.
export const familyDomain = (family) => family.domain ?? family.id;
// The network of an on-chain asset: the CAIP-2 part of its CAIP-19 id; null for any other asset.
export const assetNetwork = (definition) =>
  definition?.source === "spec:caip19" && typeof definition.instrument === "string" ? definition.instrument.split("/")[0] : null;

export const loadSource = (root) => {
  const problems = [];
  const release = readJson(join(root, "release.json"), problems, "release.json") ?? {};
  const families = readJson(join(root, "families.json"), problems, "families.json") ?? {};
  const networks = readJson(join(root, "networks.json"), problems, "networks.json") ?? {};
  const dir = join(root, "entries");
  const entries = [];
  for (const file of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -5);
    const value = readJson(join(dir, file), problems, `entries/${file}`);
    if (value) entries.push({ id, ...value, __file: `entries/${file}` });
  }
  const units = readJson(join(root, "units.json"), problems, "units.json") ?? {};
  const recipes = [];
  const rdir = join(root, "recipes");
  for (const file of existsSync(rdir) ? readdirSync(rdir).sort() : []) {
    if (!file.endsWith(".json")) continue;
    const value = readJson(join(rdir, file), problems, `recipes/${file}`);
    if (value) recipes.push({ id: file.slice(0, -5), ...value, __file: `recipes/${file}` });
  }
  // Every family no open code covers gets its template, derived from the family (templates.mjs).
  if (Array.isArray(families.families)) recipes.push(...familyTemplates(families.families));
  return { root, release, families, networks, entries, units, recipes, problems };
};

const checkFamilies = (f, say) => {
  only(f, ["sources", "term_groups", "sections", "families"], "families.json", say);
  for (const [k, v] of Object.entries(f.sources ?? {})) {
    const at = `families.json sources.${k}`;
    only(v, ["prefix", "description"], at, say);
    if (v.prefix !== `${k}:`) say(at, `prefix: ${k}:`);
    if (!english(v.description, 256)) say(at, "description: English text, up to 256 characters");
  }
  for (const [k, v] of Object.entries(f.term_groups ?? {})) {
    const at = `families.json term_groups.${k}`;
    only(v, ["keys", "description"], at, say);
    if (!Array.isArray(v.keys) || !v.keys.length || v.keys.some((key) => !TYPED_TERMS.includes(key))) say(at, "keys: typed terms mp.*");
    if (!english(v.description, 256)) say(at, "description: English text, up to 256 characters");
  }
  const sources = new Set(Object.keys(f.sources ?? {}));
  const groups = new Set(Object.keys(f.term_groups ?? {}));
  const sections = new Map();
  for (const [i, s] of (f.sections ?? []).entries()) {
    const at = `families.json sections[${i}]`;
    only(s, ["id", "name", "source", "terms"], at, say);
    if (!/^[a-z][a-z0-9-]{1,15}$/.test(s.id ?? "")) say(at, "id: a-z, 0-9, -");
    if (sections.has(s.id)) say(at, `section ${s.id} repeats`);
    if (!name(s.name)) say(at, "name: English text, 1–64 characters");
    if (!sources.has(s.source)) say(at, `source: one of ${[...sources].join(", ")}`);
    for (const g of s.terms ?? []) if (!groups.has(g)) say(at, `terms: unknown group ${g}`);
    sections.set(s.id, s);
  }
  const families = new Map();
  for (const [i, x] of (f.families ?? []).entries()) {
    const at = `families.json families[${i}]`;
    only(x, ["id", "section", "name", "kinds", "unit", "identity", "domain"], at, say);
    if (typeof x.id !== "string" || x.id.length > 32 || !/^[a-z]+\.[a-z0-9-]+$/.test(x.id)) say(at, "id: <section>.<name>, up to 32");
    else if (x.id.split(".")[0] !== x.section) say(at, "id starts with its section");
    if (x.domain !== undefined && (!DOMAIN.test(x.domain) || x.domain.split(".")[0] !== x.section)) say(at, "domain: a domain of its own section");
    if (!sections.has(x.section)) say(at, `section ${x.section} does not exist`);
    if (families.has(x.id)) say(at, `family ${x.id} repeats`);
    if (!name(x.name)) say(at, "name: English text, 1–64 characters");
    if (!english(x.identity, 256)) say(at, "identity: English text, up to 256 characters");
    if (x.unit !== undefined && !english(x.unit, 64)) say(at, "unit: English text, up to 64 characters");
    if (!Array.isArray(x.kinds) || !x.kinds.length || x.kinds.some((k) => k !== "Fungible" && k !== "Unique")) say(at, "kinds: Fungible and/or Unique");
    families.set(x.id, x);
  }
  return { sections, families };
};

// The on-chain convention: CAIP-19 id in instrument, source spec:caip19, unit atom, no terms.
const checkOnChain = (d, say, at) => {
  if (d.source !== "spec:caip19") say(at, "an on-chain asset: source spec:caip19");
  if (!CAIP19.test(d.instrument)) say(at, "an on-chain asset: instrument is its CAIP-19 id, e.g. eip155:1/erc20:0x…");
  else if (d.instrument.startsWith("eip155:") && /\/(erc20|erc721|erc1155):/.test(d.instrument) && !EVM_ADDRESS.test(d.instrument))
    say(at, "an on-chain asset: EVM address in lower case, token id in decimal without leading zeros");
  if (d.unit !== "atom") say(at, "an on-chain asset: unit atom (the smallest unit the chain counts)");
  if (d.terms.length) say(at, "an on-chain asset: no terms, the CAIP-19 id says it all");
  const tokenId = /\/[^/]+\/[^/]+$/.test(d.instrument);
  const needsId = d.domain === "crypto.nft" || d.domain === "crypto.multi-token";
  if (needsId && !tokenId) say(at, "an NFT or multi-token names its token id: …/erc721:0x…/<id>");
  if (!needsId && tokenId) say(at, "only an NFT or multi-token names a token id");
};

// A national currency by ISO 4217 has one description (CONTRIBUTING.md §2, «National currencies»):
// family money.bank-transfer, instrument = the alphabetic code, unit minor-unit, Fungible, no terms;
// decimals = the code's ISO 4217 minor unit, so 1 USD shows for 100 minor units.
export const FIAT_FAMILY = "money.bank-transfer";
export const fiatDefinition = (code) =>
  ({ version: 1, domain: FIAT_FAMILY, instrument: code, source: "spec:iso4217", kind: "Fungible", unit: "minor-unit", terms: [] });
const checkIso4217 = (e, say, at) => {
  const d = e.definition;
  if (e.family !== FIAT_FAMILY) say(at, `a national currency (spec:iso4217) is in family ${FIAT_FAMILY}`);
  if (!ISO4217.has(d.instrument)) say(at, "a national currency: instrument is its ISO 4217 alphabetic code in capitals, e.g. USD");
  else if (e.decimals !== ISO4217.get(d.instrument))
    say(at, `a national currency: decimals ${ISO4217.get(d.instrument)}, the ISO 4217 minor unit of ${d.instrument}`);
  if (d.unit !== "minor-unit") say(at, "a national currency: unit minor-unit (cent, penny, kopeck…; the yen itself for JPY)");
  if (d.kind !== "Fungible") say(at, "a national currency: Fungible");
  if (d.terms.length) say(at, "a national currency: no terms, the ISO 4217 code says it all");
};

// networks.json: CAIP-2 id → its English name; one name per network.
const checkNetworks = (n, say) => {
  const names = new Map();
  for (const [id, v] of Object.entries(n ?? {})) {
    const at = `networks.json ${id}`;
    if (!CAIP2.test(id)) say(at, "a CAIP-2 id, e.g. eip155:1");
    only(v, ["name"], at, say);
    if (!name(v?.name)) say(at, "name: English text, 1–64 characters");
    else if (names.has(fold(v.name))) say(at, `name repeats ${names.get(fold(v.name))}`);
    else names.set(fold(v.name), id);
  }
  return new Map(Object.entries(n ?? {}));
};

// Checks the whole source; returns the problems (empty when the catalog can be published).
// units.json: id → { name, quantity, base, exp } — one ladder of powers of ten per base, so a
// display unit is always the unit times 10^decimals (RECIPES.md §2).
const checkUnitList = (u, say) => {
  for (const [id, v] of Object.entries(u ?? {})) {
    const at = `units.json ${id}`;
    only(v, ["symbol", "name", "quantity", "base", "exp"], at, say);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(id)) say(at, "id: letters, digits, -");
    if (!english(v?.name, 128) || !english(v?.quantity, 32)) say(at, "name and quantity: English text");
    // How an amount is marked wherever it is shown (MWh, t, troy oz): one universal spelling.
    if (!english(v?.symbol, 16)) say(at, "symbol: English, up to 16 characters");
    if ((v?.base === undefined) !== (v?.exp === undefined)) say(at, "base and exp go together");
    if (v?.base !== undefined && (!Number.isInteger(v.exp) || v.exp < -18 || v.exp > 18)) say(at, "exp: −18…18");
  }
};

export const checkSource = (src) => {
  const problems = [...src.problems];
  const say = (where, what) => problems.push(`${where}: ${what}`);
  const r = src.release;
  if (!Number.isSafeInteger(r.version) || r.version < 1) say("release.json", "version: positive integer");
  if (!DATE.test(r.updated ?? "")) say("release.json", "updated: YYYY-MM-DD");
  if (r.repository !== undefined && !/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._-]+)+$/.test(r.repository ?? ""))
    say("release.json", "repository: the https address of the catalog repository, no trailing slash");
  const { families } = checkFamilies(src.families, say);
  const networks = checkNetworks(src.networks, say);
  checkUnitList(src.units, say);
  const recipeCtx = { families, units: src.units, name, english, text, typedTerms: TYPED_TERMS };
  const recipeKeys = new Map();
  for (const r of src.recipes) {
    checkRecipe(r, recipeCtx, say);
    // One recipe per domain and source: a definition is read back by exactly one recipe.
    const family = families.get(r.family);
    if (!family) continue;
    const key = `${familyDomain(family)} ${r.source}`;
    if (recipeKeys.has(key)) say(r.__file, `domain and source repeat ${recipeKeys.get(key)}`);
    else recipeKeys.set(key, r.__file);
    if (typeof r.icon === "string") {
      if (!existsSync(join(src.root, r.icon))) say(r.__file, `${r.icon} does not exist`);
      else for (const p of checkSvg(readFileSync(join(src.root, r.icon)))) say(r.icon, p);
    }
  }
  const byId = new Map(src.entries.map((e) => [e.id, e]));
  // A symbol and a name are unique within a network (look-alikes fold together). One token
  // issued on several networks is a separate asset on each (its own ref) that shares symbol
  // and name: a symbol, or a name, met on another network must be the same token's — the
  // same symbol, name and family.
  const seen = { ref: new Map(), symbol: new Map(), name: new Map(), asset: new Map() };
  const claim = (map, key, id, what) => {
    if (map.has(key) && map.get(key) !== id) say(`entries/${id}.json`, `${what} repeats or looks like ${map.get(key)}`);
    else map.set(key, id);
  };
  const sameAsset = (key, e, what) => {
    const one = { symbol: fold(e.symbol), name: fold(e.name), family: e.family };
    const known = seen.asset.get(key);
    if (!known) seen.asset.set(key, { ...one, id: e.id });
    else if (known.id !== e.id && (known.symbol !== one.symbol || known.name !== one.name || known.family !== one.family))
      say(e.__file, `${what} is ${known.id}'s: on another network the same token shares its symbol, name and family`);
  };
  for (const e of src.entries) {
    const at = e.__file;
    for (const k of Object.keys(e)) if (k !== "id" && k !== "__file" && !ENTRY_FIELDS.includes(k)) say(at, `unknown field ${k}`);
    if (!ID.test(e.id)) say(at, "file name: a-z, 0-9, -, 2–40 characters");
    if (!STATUSES.includes(e.status)) say(at, "status: draft, listed or retired");
    const family = families.get(e.family);
    if (!family) say(at, `family ${e.family} does not exist in families.json`);
    if (!SYMBOL.test(e.symbol ?? "")) say(at, "symbol: 2–8 Latin letters and digits");
    if (!Array.isArray(e.aliases) || e.aliases.some((a) => !SYMBOL.test(a) || a === e.symbol)) say(at, "aliases: former symbols, not the current one");
    if (!name(e.name)) say(at, "name: English text, 1–64 characters");
    if (!Number.isInteger(e.decimals) || e.decimals < 0 || e.decimals > 38) say(at, "decimals: 0–38");
    // Every catalog asset is described: the runtime settles only af1:/au1: assets
    // (protocol_fcap payout.rs ReceiveRoute::new and fcap.rs settlement legs take inline refs only).
    try {
      const d = deriveAsset(e.definition);
      if (typeof e.ref !== "object" || e.ref === null || Object.keys(e.ref).sort().join() !== "chain,token"
        || e.ref.chain !== d.chain || e.ref.token !== d.token)
        say(at, `ref must be { "chain": "${d.chain}", "token": "${d.token}" }`);
      if (family) {
        if (e.definition.domain !== familyDomain(family)) say(at, `definition.domain must be ${familyDomain(family)} (family ${family.id})`);
        if (!family.kinds.includes(e.definition.kind)) say(at, `family ${family.id} takes ${family.kinds.join(" or ")}`);
        if (family.section === "crypto") {
          checkOnChain(e.definition, say, at);
          const network = assetNetwork(e.definition);
          if (network && !networks.has(network)) say(at, `network ${network} is not in networks.json`);
        }
        else if (e.definition.source === "spec:caip19") say(at, "spec:caip19 is for a family of the crypto section");
      }
      if (e.definition.source === "spec:iso4217") checkIso4217(e, say, at);
      for (const f of ["instrument", "source", "unit"]) if (!text(e.definition[f], 256)) say(at, `definition.${f}: no edge spaces or control characters`);
      for (const t of e.definition.terms) {
        if (!text(t.key, 64) || CONTROL.test(t.value) || LONE.test(t.value)) say(at, `term ${t.key}: no edge spaces or control characters`);
        // mp.* is Multipiston's: the runtime would read a new typed key differently from today.
        if (t.key.startsWith("mp.") && !TYPED_TERMS.includes(t.key)) say(at, `term ${t.key}: mp.* is reserved for the typed terms`);
      }
      if (!/^(spec|issuer|registry):\S/.test(e.definition.source)) say(at, "definition.source: spec:…, issuer:… or registry:…");
      if (e.definition.kind === "Unique" && e.decimals !== 0) say(at, "a unique asset has 0 decimals");
    } catch (err) {
      say(at, `definition: ${DEFINITION_ERRORS[err.message] ?? err.message}`);
    }
    if (e.replaced_by !== null) {
      const next = byId.get(e.replaced_by);
      if (e.status !== "retired") say(at, "replaced_by only on a retired entry");
      if (!next || next.status !== "listed") say(at, "replaced_by: id of a listed entry");
    }
    if (e.icon !== null) {
      if (e.icon !== `icons/${e.id}.svg`) say(at, `icon: null or icons/${e.id}.svg`);
      else if (!existsSync(join(src.root, e.icon))) say(at, `${e.icon} does not exist`);
      else for (const p of checkSvg(readFileSync(join(src.root, e.icon)))) say(e.icon, p);
    }
    if (typeof e.note !== "undefined" && !english(e.note, 1024)) say(at, "note: English text, up to 1024 characters");
    // Refs are unique across every entry, drafts included; symbols (with former ones) and names
    // within a network; across networks one symbol or name is one token's.
    const net = assetNetwork(e.definition) ?? "";
    if (e.ref?.chain && e.ref?.token) claim(seen.ref, `${e.ref.chain} ${e.ref.token}`, e.id, "ref");
    for (const s of [e.symbol, ...(e.aliases ?? [])])
      if (typeof s === "string") {
        claim(seen.symbol, `${net} ${fold(s)}`, e.id, `symbol ${s}`);
        if (typeof e.symbol === "string" && name(e.name)) sameAsset(`symbol ${fold(s)}`, e, `symbol ${s}`);
      }
    if (name(e.name)) {
      claim(seen.name, `${net} ${fold(e.name)}`, e.id, "name");
      if (typeof e.symbol === "string") sameAsset(`name ${fold(e.name)}`, e, "name");
    }
  }
  return problems;
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The published file: listed and retired entries (a retired one keeps old tickets named),
// icons under content addresses. Same source → same bytes.
export const publish = (src) => {
  const byId = new Map(src.entries.map((e) => [e.id, e]));
  const icons = [];
  const assets = src.entries
    .filter((e) => e.status !== "draft")
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => {
      let icon = null;
      if (e.icon) {
        const bytes = readFileSync(join(src.root, e.icon));
        icon = `icons/${e.id}-${sha256(bytes).slice(0, 12)}.svg`;
        icons.push({ from: join(src.root, e.icon), to: icon });
      }
      return {
        id: e.id,
        status: e.status,
        family: e.family,
        kind: e.definition.kind,
        symbol: e.symbol,
        aliases: e.aliases,
        name: e.name,
        network: assetNetwork(e.definition),
        decimals: e.decimals,
        icon,
        ref: e.ref,
        definition: e.definition,
        replaced_by: e.replaced_by ? byId.get(e.replaced_by).ref : null,
      };
    });
  const f = src.families;
  const catalog = {
    schema: SCHEMA,
    version: src.release.version,
    updated: src.release.updated,
    // Where the catalog lives and proposals go (the issue forms).
    repository: src.release.repository ?? null,
    sources: f.sources,
    term_groups: f.term_groups,
    sections: f.sections,
    families: f.families,
    networks: Object.entries(src.networks).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, v]) => ({ id, name: v.name })),
    units: Object.entries(src.units).map(([id, v]) => ({ id, ...v })),
    recipes: src.recipes.map((r) => publishRecipe(src, r, icons)),
    assets,
  };
  return { catalog, text: `${JSON.stringify(catalog, null, 2)}\n`, icons };
};

// A published recipe carries its worked example as values and the exact ref they give.
const publishRecipe = (src, r, icons) => {
  let icon = null;
  if (r.icon) {
    const bytes = readFileSync(join(src.root, r.icon));
    icon = `icons/recipe-${r.icon.slice("icons/recipes/".length, -4)}-${sha256(bytes).slice(0, 12)}.svg`;
    if (!icons.some((i) => i.to === icon)) icons.push({ from: join(src.root, r.icon), to: icon });
  }
  const family = new Map(src.families.families.map((f) => [f.id, f])).get(r.family);
  const domain = familyDomain(family);
  const values = Object.fromEntries(r.params.map((p) => [p.id, p.example]));
  const { definition } = buildDefinition({ ...r, domain }, values);
  const { chain, token } = deriveAsset(definition);
  const { id, family: fam, name: rname, symbol, kind, source, instrument, terms = [], params, note } = r;
  return {
    // The domain is published with the recipe: a program builds from the recipe alone.
    id, family: fam, domain, name: rname, symbol, icon, kind, source,
    ...(r.unit !== undefined ? { unit: r.unit, decimals: r.decimals ?? 0, display: r.display ?? r.unit } : {}),
    instrument, terms, params, regulated: r.regulated === true, template: r.__template === true, note,
    // A template's definition follows from its values (RECIPES.md §6): its example keeps values and ref.
    example: r.__template ? { values, ref: { chain, token } } : { values, definition, ref: { chain, token } },
  };
};

const body = (c) => JSON.stringify({ ...c, version: 0, updated: "" });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What a release may not do to the previous one: an id, a ref or a former symbol never
// disappears or changes meaning; the version grows by one with any change.
export const compareReleases = (base, next) => {
  const problems = [];
  const at = new Map(next.assets.map((a) => [a.id, a]));
  for (const old of base.assets) {
    const now = at.get(old.id);
    if (!now) { problems.push(`asset ${old.id} was published and cannot be removed (retire it)`); continue; }
    for (const k of ["ref", "definition", "decimals", "kind"]) if (!same(old[k], now[k])) problems.push(`asset ${old.id}: ${k} is fixed once published (add a new entry)`);
    if (old.status === "retired" && now.status !== "retired") problems.push(`asset ${old.id}: a retired asset stays retired`);
    for (const s of [old.symbol, ...old.aliases]) if (s !== now.symbol && !now.aliases.includes(s)) problems.push(`asset ${old.id}: former symbol ${s} must stay in aliases`);
  }
  const families = new Map(next.families.map((x) => [x.id, x]));
  for (const old of base.families) {
    const now = families.get(old.id);
    if (!now) problems.push(`family ${old.id} was published and cannot be removed`);
    else if (now.section !== old.section || familyDomain(now) !== familyDomain(old)) problems.push(`family ${old.id}: section and domain are fixed`);
  }
  const sections = new Set(next.sections.map((s) => s.id));
  for (const s of base.sections) if (!sections.has(s.id)) problems.push(`section ${s.id} was published and cannot be removed`);
  // A published recipe keeps the definitions it gives: what may grow is only its options.
  const recipes = new Map((next.recipes ?? []).map((r) => [r.id, r]));
  const shape = (r) => JSON.stringify({ ...r, name: "", symbol: "", icon: "", note: "", example: null,
    params: r.params.map((p) => ({ ...p, name: "", example: "", options: (p.options ?? []).map((o) => ({ ...o, name: "", short: "" })) })) });
  for (const old of base.recipes ?? []) {
    const now = recipes.get(old.id);
    if (!now) { problems.push(`recipe ${old.id} was published and cannot be removed`); continue; }
    const trimmed = { ...now, params: now.params.map((p, i) => ({ ...p, options: p.options && old.params[i]?.options ? p.options.slice(0, old.params[i].options.length) : p.options })) };
    if (shape(old) !== shape(trimmed)) problems.push(`recipe ${old.id}: what it builds is fixed once published; only new options may be added at the end`);
  }
  if (body(base) !== body(next)) {
    if (next.version !== base.version + 1) problems.push(`release.json version must be ${base.version + 1}`);
    if (next.updated < base.updated) problems.push("release.json updated cannot go back");
  } else if (next.version !== base.version) problems.push(`nothing changed: release.json version stays ${base.version}`);
  return problems;
};
