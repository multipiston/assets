// node --test: the codec agrees with the runtime bytes; every rule refuses what it must.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { definitionBytes, deriveAsset } from "../engine/index.js";
import { ISO4217 } from "../scripts/iso4217.mjs";
import { checkSvg } from "../scripts/svg.mjs";
import { FIAT_FAMILY, SCHEMA, checkSource, compareReleases, fiatDefinition, loadSource, publish } from "../scripts/source.mjs";
import { checkSources, parseSlip44 } from "../scripts/check-sources.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const vectors = JSON.parse(readFileSync(join(root, "vectors/runtime-codec.json"), "utf8"));
const svg = (body, box = "0 0 24 24") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`);

test("definition bytes and token equal the runtime vector", () => {
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  assert.equal(hex(definitionBytes(vectors.definition.raw)), vectors.definition.binary);
  assert.equal(deriveAsset(vectors.definition.raw).token, vectors.definition.token);
});

test("typed terms: the runtime's valid set passes, each invalid set is refused", () => {
  const withTerms = (pairs) => ({ ...vectors.definition.raw,
    terms: pairs.map(([key, value]) => ({ key, value })).sort((a, b) => (Buffer.from(a.key) < Buffer.from(b.key) ? -1 : 1)) });
  assert.doesNotThrow(() => deriveAsset(withTerms(vectors.typed_terms_valid)));
  for (const bad of vectors.typed_terms_invalid) assert.throws(() => deriveAsset(withTerms(bad)), String(bad));
});

test("a stored definition is exact: unsorted or repeated keys, unknown fields, upper-case domain", () => {
  const raw = vectors.definition.raw;
  assert.throws(() => deriveAsset({ ...raw, terms: [{ key: "b", value: "" }, { key: "a", value: "" }] }));
  assert.throws(() => deriveAsset({ ...raw, terms: [{ key: "a", value: "1" }, { key: "a", value: "1" }] }));
  assert.throws(() => deriveAsset({ ...raw, issuer: "x" }));
  assert.throws(() => deriveAsset({ ...raw, domain: "EVM:1" }));
});

test("icons: an allow-list, nothing else", () => {
  assert.deepEqual(checkSvg(svg('<circle cx="12" cy="12" r="8" fill="#fff"/>')), []);
  assert.deepEqual(checkSvg(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/>')), []);
  for (const bad of [
    '<script>alert(1)</script>', '<circle r="1" onload="x()"/>', '<image href="https://x/y.png"/>', '<use href="#a"/>',
    '<style>@import "https://x/y.css";</style>', '<text>ETH</text>', '<foreignObject/>', '<rect fill="url(https://x/y)"/>',
    '<rect style="fill:red"/>', '<!-- note --><rect/>',
  ]) assert.notDeepEqual(checkSvg(svg(bad)), [], bad);
  assert.notDeepEqual(checkSvg(svg("<rect/>", "0 0 24 12")), []);
  assert.notDeepEqual(checkSvg(Buffer.from('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')), []);
  assert.notDeepEqual(checkSvg(Buffer.alloc(20000, 32)), []);
});

// A copy of the catalog to break one rule at a time.
const sandbox = (edit) => {
  const dir = mkdtempSync(join(tmpdir(), "catalog-"));
  for (const p of ["release.json", "families.json", "networks.json", "units.json", "entries", "recipes", "icons", "engine", "scripts", "schema", "vectors", "site", "llms.txt", "openapi.json"])
    cpSync(join(root, p), join(dir, p), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const entry = (id) => JSON.parse(readFileSync(join(dir, "entries", `${id}.json`), "utf8"));
  const put = (id, e) => writeFileSync(join(dir, "entries", `${id}.json`), JSON.stringify(e));
  const families = (change) => {
    const f = JSON.parse(readFileSync(join(dir, "families.json"), "utf8"));
    change(f);
    writeFileSync(join(dir, "families.json"), JSON.stringify(f));
  };
  const networks = (change) => {
    const n = JSON.parse(readFileSync(join(dir, "networks.json"), "utf8"));
    change(n);
    writeFileSync(join(dir, "networks.json"), JSON.stringify(n));
  };
  edit?.({ dir, entry, put, families, networks });
  return dir;
};
const problems = (dir) => checkSource(loadSource(dir));
// Each case must be refused, and only the rule it names may be what refuses it.
const refusedEach = (cases) => {
  for (const [name, edit] of Object.entries(cases)) {
    const dir = sandbox(edit);
    const found = problems(dir);
    if (process.env.CATALOG_TEST_DEBUG) console.log(`${name}:\n  ${found.join("\n  ")}`);
    assert.notDeepEqual(found, [], name);
    rmSync(dir, { recursive: true, force: true });
  }
};
const cleanWith = (edit) => {
  const dir = sandbox(edit);
  const found = problems(dir);
  rmSync(dir, { recursive: true, force: true });
  return found;
};

// An entry with its ref computed, so a case breaks only the rule it names.
const withDefinition = (put, base, id, over = {}, def = {}) => {
  const d = { ...base.definition, ...def };
  put(id, { ...base, icon: null, ...over, definition: d, ref: { chain: d.domain, token: deriveAsset(d).token } });
};
const onChain = (put, base, id, instrument, over = {}, def = {}) => withDefinition(put, base, id, over, { instrument, ...def });

test("the source of this repository is clean", () => assert.deepEqual(problems(root), []));

test("an on-chain asset has one spelling: CAIP-19, lower-case EVM address, unit atom", () => {
  assert.deepEqual(cleanWith(({ entry, put }) =>
    onChain(put, entry("eth"), "nft", "eip155:1/erc721:0x0000000000000000000000000000000000000001/7",
      { symbol: "NFTX", family: "crypto.nft", decimals: 0, name: "N" }, { domain: "crypto.nft", kind: "Unique" })
  ), []);
  assert.deepEqual(cleanWith(({ entry, put }) =>
    onChain(put, entry("eth"), "etc", "eip155:61/slip44:61", { symbol: "ETC", decimals: 18, name: "Ether Classic" })
  ), []);
});

test("one token on several networks: one symbol, one name, the network apart", () => {
  // The same token on a named network the catalog does not list it on yet (BNB Smart Chain).
  assert.deepEqual(cleanWith(({ entry, put }) => onChain(put, entry("usdc"), "usdc-bsc",
    "eip155:56/erc20:0x1111111111111111111111111111111111111111")), []);
  const { catalog } = publish(loadSource(root));
  const usdc = catalog.assets.filter((a) => a.symbol === "USDC");
  for (const n of ["eip155:1", "eip155:137", "eip155:42161", "eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"])
    assert.ok(usdc.some((a) => a.network === n), n);
  assert.equal(new Set(usdc.map((a) => a.network)).size, usdc.length, "one USDC per network");
  assert.ok(usdc.every((a) => a.name === "USD Coin"));
  // Every network of an asset is named; anything off-chain has none.
  const named = new Set(catalog.networks.map((n) => n.id));
  for (const a of catalog.assets) {
    if (a.definition.source === "spec:caip19") assert.ok(named.has(a.network), a.id);
    else assert.equal(a.network, null, a.id);
  }
});

test("each entry rule refuses its case", () => refusedEach({
  "forged ref": ({ entry, put }) => put("h100h", { ...entry("h100h"), ref: entry("stgb").ref }),
  "domain is not the family": ({ entry, put }) => put("stgb", { ...entry("stgb"), family: "compute.api" }),
  "look-alike name (Cyrillic)": ({ entry, put }) => onChain(put, entry("eth"), "x1", "eip155:10/slip44:60", { symbol: "ETHB",
    name: "Еther" }),
  "name differing only in case": ({ entry, put }) => onChain(put, entry("eth"), "x1", "eip155:10/slip44:60", { symbol: "ETHB",
    name: "ETHER" }),
  "name differing by a digit for a letter": ({ entry, put }) => onChain(put, entry("eth"), "x1", "eip155:10/slip44:60", { symbol: "ETHB",
    name: "D0gecoin" }),
  "symbol taken by a former one": ({ entry, put }) => onChain(put, entry("eth"), "x2", "eip155:61/slip44:61", { symbol: "ETC",
    aliases: ["USDC"], name: "Classic" }),
  "a symbol given to another asset on another network": ({ entry, put }) => onChain(put, entry("usdc"), "x3",
    "eip155:56/erc20:0x2222222222222222222222222222222222222222", { name: "Bridged Coin" }),
  "a name given to another symbol on another network": ({ entry, put }) => onChain(put, entry("usdc"), "x3",
    "eip155:56/erc20:0x2222222222222222222222222222222222222222", { symbol: "USDCE" }),
  "the same symbol twice on one network": ({ entry, put }) => onChain(put, entry("usdc"), "x3",
    "eip155:1/erc20:0x2222222222222222222222222222222222222222"),
  "a network missing from networks.json": ({ entry, put }) => onChain(put, entry("usdc"), "x3",
    "eip155:999999/erc20:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"),
  "a network name in Russian": ({ networks }) => networks((n) => { n["eip155:1"].name = "Эфириум"; }),
  "two networks under one name": ({ networks }) => networks((n) => { n["eip155:10"].name = "Ethereum"; }),
  "a network id that is not CAIP-2": ({ networks }) => networks((n) => { n["Ethereum"] = { name: "Mainnet" }; }),
  "a network ref instead of a description": ({ entry, put }) => {
    const { definition, ...e } = entry("usdc");
    put("usdc", { ...e, ref: { chain: "evm:1", token: "erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" } });
  },
  "EVM address in upper case": ({ entry, put }) => onChain(put, entry("usdc"), "usdc", "eip155:1/erc20:0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48"),
  "on-chain asset without CAIP-19": ({ entry, put }) => onChain(put, entry("eth"), "eth", "ethereum"),
  "NFT token id with a leading zero": ({ entry, put }) => onChain(put, entry("eth"), "nft",
    "eip155:1/erc721:0x0000000000000000000000000000000000000001/007",
    { symbol: "NFTX", family: "crypto.nft", decimals: 0, name: "N" }, { domain: "crypto.nft", kind: "Unique" }),
  "a multi-token id as Unique": ({ entry, put }) => onChain(put, entry("eth"), "mt",
    "eip155:1/erc1155:0x0000000000000000000000000000000000000001/7",
    { symbol: "MTX", family: "crypto.multi-token", decimals: 0, name: "M" }, { domain: "crypto.multi-token", kind: "Unique" }),
  "an mp.* key that is not typed": ({ entry, put }) => withDefinition(put, entry("stgb"), "stgb", {},
    { terms: [{ key: "mp.custom", value: "1" }] }),
  "a lone surrogate in a name": ({ entry, put }) => put("eth", { ...entry("eth"), name: "Ether \ud800" }),
  "NFT without a token id": ({ entry, put }) => onChain(put, entry("eth"), "nft", "eip155:1/erc721:0x0000000000000000000000000000000000000001",
    { symbol: "NFTX", family: "crypto.nft", decimals: 0, name: "N" }, { domain: "crypto.nft", kind: "Unique" }),
  "stablecoin under its own domain": ({ entry, put }) => withDefinition(put, entry("usdc"), "usdc", {}, { domain: "crypto.stablecoin" }),
  "CAIP-19 outside the crypto section": ({ entry, put }) => withDefinition(put, entry("eth"), "eth", { family: "other.custom" }, { domain: "other.custom" }),
  "domain is not the family's": ({ entry, put }) => withDefinition(put, entry("stgb"), "stgb", {}, { domain: "evm:1" }),
  "replaced_by on a listed entry": ({ entry, put }) => put("eth", { ...entry("eth"), status: "listed", replaced_by: "usdc" }),
  "unsafe icon": ({ dir, entry, put }) => {
    writeFileSync(join(dir, "icons", "eth.svg"), svg("<script>x</script>"));
    put("eth", { ...entry("eth"), icon: "icons/eth.svg" });
  },
}));

test("the catalog is English only: one English string per name and description", () => refusedEach({
  "entry name as { ru, en }": ({ entry, put }) => put("eth", { ...entry("eth"), name: { ru: "Эфир", en: "Ether (Ethereum)" } }),
  "entry name in Russian": ({ entry, put }) => put("eth", { ...entry("eth"), name: "Эфир (Ethereum)" }),
  "entry name in Greek": ({ entry, put }) => put("eth", { ...entry("eth"), name: "Ether (Εthereum)" }),
  "entry note in Russian": ({ entry, put }) => put("stgb", { ...entry("stgb"), note: "Черновик." }),
  "section name as { ru, en }": ({ families }) => families((f) => { f.sections[0].name = { ru: "Деньги", en: "Money" }; }),
  "section name in Russian": ({ families }) => families((f) => { f.sections[0].name = "Деньги"; }),
  "family name as { ru, en }": ({ families }) => families((f) => { f.families[0].name = { ru: "Наличные", en: "Cash" }; }),
  "family identity as { ru }": ({ families }) => families((f) => { f.families[0].identity = { ru: "Валюта" }; }),
  "family identity in Russian": ({ families }) => families((f) => { f.families[0].identity = "Валюта и форма наличных."; }),
  "family identity missing": ({ families }) => families((f) => { delete f.families[0].identity; }),
  "family unit as { ru }": ({ families }) => families((f) => { f.families[0].unit = { ru: "денежная единица" }; }),
  "family with an extra language field": ({ families }) => families((f) => { f.families[0].ru = "Наличные"; }),
  "source with ru and en": ({ families }) => families((f) => { f.sources.spec = { prefix: "spec:", ru: "Стандарт", en: "A standard" }; }),
  "term group description in Russian": ({ families }) => families((f) => { f.term_groups.place.description = "Место"; }),
}));

// A national currency: family money.bank-transfer, ISO 4217 code, minor-unit, decimals = the ISO exponent.
const fiat = (put, base, id, over = {}, def = {}) => withDefinition(put, base, id, { symbol: "SEK", name: "Swedish Krona", ...over },
  { ...fiatDefinition("SEK"), ...def });

test("a national currency has one description: the ISO 4217 rule", () => {
  assert.deepEqual(fiatDefinition("USD"),
    { version: 1, domain: "money.bank-transfer", instrument: "USD", source: "spec:iso4217", kind: "Fungible", unit: "minor-unit", terms: [] });
  // The derivation is pinned: a change of spelling would be a new asset for every agent.
  assert.equal(deriveAsset(fiatDefinition("USD")).token, "af1:a81a7bb31bda60be66f68dce559ea7bedd4d1e7c9b4ea40020f62f9c92bd7daa");
  assert.deepEqual([ISO4217.get("USD"), ISO4217.get("JPY"), ISO4217.get("KWD"), ISO4217.has("XAU"), ISO4217.has("USN")], [2, 0, 3, false, false]);
  assert.deepEqual(cleanWith(({ entry, put }) => fiat(put, entry("usd"), "sek")), []);
  assert.deepEqual(cleanWith(({ entry, put }) => fiat(put, entry("usd"), "kwd", { symbol: "KWD", name: "Kuwaiti Dinar", decimals: 3 },
    { instrument: "KWD" })), []);
  refusedEach({
    "code in lower case": ({ entry, put }) => fiat(put, entry("usd"), "sek", {}, { instrument: "sek" }),
    "not an ISO 4217 code": ({ entry, put }) => fiat(put, entry("usd"), "sek", {}, { instrument: "SEKX" }),
    "a fund code": ({ entry, put }) => fiat(put, entry("usd"), "sek", { symbol: "USN", name: "US Dollar (Next day)" }, { instrument: "USN" }),
    "a code without a minor unit": ({ entry, put }) => fiat(put, entry("usd"), "sek", { symbol: "XAU", name: "Gold", decimals: 0 }, { instrument: "XAU" }),
    "decimals other than the ISO exponent": ({ entry, put }) => fiat(put, entry("usd"), "sek", { decimals: 0 }),
    "JPY with two decimals": ({ entry, put }) => put("jpy", { ...entry("jpy"), decimals: 2 }),
    "unit other than minor-unit": ({ entry, put }) => fiat(put, entry("usd"), "sek", {}, { unit: "ore" }),
    "unit in major units": ({ entry, put }) => fiat(put, entry("usd"), "sek", { decimals: 0 }, { unit: "currency-unit" }),
    "terms on a currency": ({ entry, put }) => fiat(put, entry("usd"), "sek", {}, { terms: [{ key: "rail", value: "sepa" }] }),
    "another money family": ({ entry, put }) => fiat(put, entry("usd"), "sek", { family: "money.cash" }, { domain: "money.cash" }),
    "a domain other than the family's": ({ entry, put }) => fiat(put, entry("usd"), "sek", {}, { domain: "money" }),
    "the same currency twice": ({ entry, put }) => put("usd2", { ...entry("usd"), icon: null, symbol: "USDX", name: "Dollar" }),
  });
});

// The starter set, with the identifiers checked against their sources (see each entry's note).
const STARTER = {
  usd: ["USD", "USD", 2], eur: ["EUR", "EUR", 2], cny: ["CNY", "CNY", 2], jpy: ["JPY", "JPY", 0], gbp: ["GBP", "GBP", 2],
  chf: ["CHF", "CHF", 2], rub: ["RUB", "RUB", 2], inr: ["INR", "INR", 2], aed: ["AED", "AED", 2], cad: ["CAD", "CAD", 2],
  aud: ["AUD", "AUD", 2], krw: ["KRW", "KRW", 0], brl: ["BRL", "BRL", 2],
  btc: ["BTC", "bip122:000000000019d6689c085ae165831e93/slip44:0", 8],
  eth: ["ETH", "eip155:1/slip44:60", 18],
  sol: ["SOL", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501", 9],
  xrp: ["XRP", "xrpl:0/slip44:144", 6],
  trx: ["TRX", "tron:728126428/slip44:195", 6],
  doge: ["DOGE", "bip122:1a91e3dace36e2be3bf030a65679fe82/slip44:3", 8],
  ltc: ["LTC", "bip122:12a765e31ffd4059bada1e25190f6e98/slip44:2", 8],
  xlm: ["XLM", "stellar:pubnet/slip44:148", 7],
  usdc: ["USDC", "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6],
  "usdc-solana": ["USDC", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 6],
  "usdc-base": ["USDC", "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6],
  "usdc-arbitrum": ["USDC", "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831", 6],
  "usdc-polygon": ["USDC", "eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", 6],
  usdt: ["USDT", "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7", 6],
  "usdt-solana": ["USDT", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", 6],
  dai: ["DAI", "eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f", 18],
};

test("the starter set: listed, described by its rule, with a safe icon", () => {
  const { catalog } = publish(loadSource(root));
  const listed = catalog.assets.filter((a) => a.status === "listed" && a.id in STARTER);
  assert.deepEqual(listed.map((a) => a.id).sort(), Object.keys(STARTER).sort());
  const icons = new Map();
  for (const a of listed) {
    const [symbol, instrument, decimals] = STARTER[a.id];
    assert.deepEqual([a.symbol, a.definition.instrument, a.decimals], [symbol, instrument, decimals], a.id);
    if (a.family === FIAT_FAMILY) assert.deepEqual(a.definition, fiatDefinition(symbol), a.id);
    else assert.deepEqual([a.definition.source, a.definition.unit, a.definition.terms], ["spec:caip19", "atom", []], a.id);
    assert.equal(a.ref.token, deriveAsset(a.definition).token, a.id);
    assert.ok(a.icon, `${a.id} has an icon`);
    const bytes = readFileSync(join(root, "icons", `${a.id}.svg`));
    assert.deepEqual(checkSvg(bytes), [], a.id);
    icons.set(a.id, bytes);
  }
  // One asset on several networks: one icon, one symbol and name, the network apart.
  for (const [token, ids] of [["usdc", ["usdc-solana", "usdc-base", "usdc-arbitrum", "usdc-polygon"]], ["usdt", ["usdt-solana"]]])
    for (const id of ids) {
      const one = listed.find((a) => a.id === id), first = listed.find((a) => a.id === token);
      assert.ok(icons.get(id).equals(icons.get(token)), `${id} shares the ${token} icon`);
      assert.deepEqual([one.symbol, one.name], [first.symbol, first.name], id);
      assert.notEqual(one.network, first.network, id);
    }
  // The published refs of the two former drafts did not move.
  assert.equal(listed.find((a) => a.id === "eth").ref.token, "af1:a4bece30f7578756c10cd6c5db132415c25ac44956cc2167fdad88c34daade41");
  assert.equal(listed.find((a) => a.id === "usdc").ref.token, "af1:a48b483bbce152247c7d1da34b4fc85db3dcce9c3d977de95a549416532a5082");
});

// A small JSON Schema reader (the keywords catalog.schema.json uses), so the published file is
// checked against the schema the cabinet and agents load it with.
const validate = (schema, value, defs, at = "$") => {
  if (schema.$ref) return validate(defs[schema.$ref.replace("#/$defs/", "")], value, defs, at);
  const errors = [];
  const fail = (what) => errors.push(`${at}: ${what}`);
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => !validate(s, value, defs, at).length).length;
    if (ok !== 1) fail("oneOf");
    return errors;
  }
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) fail(`const ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`enum ${schema.enum}`);
  const types = [schema.type ?? []].flat();
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (types.length && !types.includes(typeOf(value))) return [...errors, `${at}: type ${types} (got ${typeOf(value)})`];
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail("minLength");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail("maxLength");
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) fail(`pattern ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail("minimum");
    if (schema.maximum !== undefined && value > schema.maximum) fail("maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail("minItems");
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, defs, `${at}[${i}]`)));
  }
  if (typeOf(value) === "object") {
    for (const k of schema.required ?? []) if (!(k in value)) fail(`required ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errors.push(...validate(schema.properties[k], v, defs, `${at}.${k}`));
      else if (schema.additionalProperties === false) fail(`additional property ${k}`);
      else if (typeof schema.additionalProperties === "object") errors.push(...validate(schema.additionalProperties, v, defs, `${at}.${k}`));
    }
  }
  return errors;
};

test("the published file matches catalog.schema.json, names are plain English strings", () => {
  const schema = JSON.parse(readFileSync(join(root, "schema/catalog.schema.json"), "utf8"));
  const { catalog } = publish(loadSource(root));
  assert.equal(catalog.schema, SCHEMA);
  assert.equal(schema.$id, SCHEMA);
  assert.deepEqual(validate(schema, catalog, schema.$defs), []);
  const old = structuredClone(catalog);
  old.assets[0].name = { ru: "Дирхам", en: "UAE Dirham" };
  old.sections[0].name = { ru: "Деньги", en: "Money" };
  old.families[0].identity = { ru: "Валюта" };
  old.sources.spec = { prefix: "spec:", ru: "Стандарт", en: "A standard" };
  const errors = validate(schema, old, schema.$defs);
  for (const at of ["$.assets[0].name", "$.sections[0].name", "$.families[0].identity", "$.sources.spec"])
    assert.ok(errors.some((e) => e.startsWith(`${at}:`)), at);
  assert.ok(errors.every((e) => /^\$\.(assets\[0\]\.name|sections\[0\]\.name|families\[0\]\.identity|sources\.spec):/.test(e)), errors.join("\n"));
});

test("a release cannot rewrite the previous one", () => {
  const base = publish(loadSource(root)).catalog;
  const next = (change) => {
    const c = structuredClone(base);
    change(c);
    return compareReleases(base, c);
  };
  assert.deepEqual(next(() => {}), []);
  assert.notDeepEqual(next((c) => { c.version += 1; c.assets.pop(); }), []);
  assert.notDeepEqual(next((c) => { c.version += 1; c.assets[0].decimals = 8; }), []);
  assert.notDeepEqual(next((c) => { c.version += 1; c.assets[0].symbol = "AEDX"; }), []);
  assert.deepEqual(next((c) => { c.version += 1; c.assets[0].aliases = [c.assets[0].symbol]; c.assets[0].symbol = "AEDX"; }), []);
  assert.deepEqual(next((c) => { c.version += 1; c.assets[0].name = "Emirati Dirham"; }), []);
  assert.notDeepEqual(next((c) => { c.assets[0].name = "Emirati Dirham"; }), [], "a change without a new version");
  assert.notDeepEqual(next((c) => { c.version += 1; c.families.pop(); }), []);
});

test("the build is repeatable and an old version is never overwritten", () => {
  const dir = sandbox();
  const out = mkdtempSync(join(tmpdir(), "catalog-out-"));
  const build = () => execFileSync(process.execPath, [join(dir, "scripts/build.mjs"), out], { stdio: "pipe" });
  build();
  const first = readFileSync(join(out, "catalog/v1/catalog.json"));
  build();
  assert.ok(first.equals(readFileSync(join(out, "catalog/catalog.json"))));
  // Icons are published under content addresses.
  const usd = JSON.parse(first).assets.find((a) => a.id === "usd");
  assert.match(usd.icon, /^icons\/usd-[0-9a-f]{12}\.svg$/);
  assert.ok(readFileSync(join(out, "catalog", usd.icon)).equals(readFileSync(join(root, "icons/usd.svg"))));
  const release = JSON.parse(readFileSync(join(dir, "entries/eth.json"), "utf8"));
  writeFileSync(join(dir, "entries/eth.json"), JSON.stringify({ ...release, name: "Ether coin" }));
  assert.throws(build, "v1 already holds other bytes");
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

// Every native coin is a CAIP-20 id on a named network: <network>/slip44:<coin type>.
test("native coins: one per network, on a named network, by SLIP-0044 coin type", () => {
  const { catalog } = publish(loadSource(root));
  const named = new Set(catalog.networks.map((n) => n.id));
  const coins = catalog.assets.filter((a) => a.family === "crypto.coin");
  for (const a of coins) {
    assert.match(a.definition.instrument, /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/slip44:\d+$/, a.id);
    assert.ok(named.has(a.network), a.id);
  }
  assert.equal(new Set(coins.map((a) => a.network)).size, coins.length, "one native coin per network");
  // ETH over a rollup's canonical bridge: the same symbol and name, its own network and ref.
  const eth = coins.filter((a) => a.symbol === "ETH");
  assert.ok(eth.length > 1 && eth.every((a) => a.name === "Ether"));
  assert.equal(new Set(eth.map((a) => a.ref.token)).size, eth.length);
});

// The reconciliation with the public sources, on a small synthetic registry.
test("check-sources: every network and native coin stands on its source", () => {
  const src = loadSource(root);
  const coin = (id) => src.entries.find((e) => e.id === id);
  const one = (entries, networks) => ({ ...src, entries, networks });
  const sources = (over = {}) => ({
    chains: [{ chainId: 1, nativeCurrency: { symbol: "ETH", decimals: 18 }, slip44: 60 }, { chainId: 137, nativeCurrency: { symbol: "POL", decimals: 18 }, slip44: 966 }],
    slip44: parseSlip44("| 60 | ETH | Ether |\n| 966 | MATIC | Matic |\n| 0 | BTC | Bitcoin |"),
    namespace: (n) => (n === "bip122" ? "# Bitcoin mainnet\nbip122:000000000019d6689c085ae165831e93" : null),
    ...over,
  });
  const nets = { "eip155:1": { name: "Ethereum" }, "eip155:137": { name: "Polygon PoS" }, "bip122:000000000019d6689c085ae165831e93": { name: "Bitcoin" } };
  assert.deepEqual(checkSources(one([coin("eth"), coin("pol"), coin("btc")], nets), sources()), []);
  // A rename passes only through the entry's own former symbol.
  assert.notDeepEqual(checkSources(one([{ ...coin("pol"), aliases: [] }], nets), sources()), []);
  // Wrong decimals, an unknown coin type, a network missing from its source: each refused.
  assert.notDeepEqual(checkSources(one([{ ...coin("eth"), decimals: 8 }], nets), sources()), []);
  assert.notDeepEqual(checkSources(one([coin("btc")], nets), sources({ slip44: parseSlip44("| 60 | ETH | Ether |") })), []);
  assert.notDeepEqual(checkSources(one([], { "eip155:999999": { name: "Nowhere" } }), sources()), []);
  assert.notDeepEqual(checkSources(one([], { "cosmos:cosmoshub-4": { name: "Cosmos Hub" } }), sources()), []);
});

test("check-sources: a network the registries cannot settle stands on its reviewed record", () => {
  const src = loadSource(root);
  const hype = src.entries.find((e) => e.id === "hype");
  const nets = { "eip155:999": { name: "HyperEVM" } };
  const sources = (holder) => ({
    chains: holder ? [{ chainId: 999, name: holder, nativeCurrency: { symbol: "WAN", decimals: 18 } }] : [],
    slip44: parseSlip44("| 2457 | HYPE | Hyperliquid |"),
    namespace: () => null,
  });
  // The test network holding 999 in the registry does not speak for the mainnet: the record does.
  assert.deepEqual(checkSources({ ...src, entries: [hype], networks: nets }, sources("Wanchain Testnet")), []);
  // The registry changed: the record is reviewed again before the network passes.
  assert.notDeepEqual(checkSources({ ...src, entries: [hype], networks: nets }, sources("Hyperliquid")), []);
  // The coin must still be the one the network documents.
  assert.notDeepEqual(checkSources({ ...src, entries: [{ ...hype, decimals: 8 }], networks: nets }, sources("Wanchain Testnet")), []);
});

test("codes: one canonical spelling or none (RECIPES.md §3)", async () => {
  const { CODES } = await import("../engine/index.js");
  for (const [check, raw, want] of [
    ["isin", "us0378331005", "US0378331005"], ["isin", "US0378331006", null], ["lei", "HWUPKR0MPOU8FGXBT394", "HWUPKR0MPOU8FGXBT394"],
    ["imo", "IMO 9074729", "9074729"], ["imo", "9074728", null], ["iso6346", "CSQU 305438 3", "CSQU3054383"], ["iso6346", "CSQU3054384", null],
    ["eic", "10y1001a1001a82h", "10Y1001A1001A82H"], ["eic", "10Y1001A1001A82J", null], ["unlocode", "GB LON", "GBLON"], ["unlocode", "XX LON", null],
    ["gtin", "4006381333931", "04006381333931"], ["isbn", "0-306-40615-2", "9780306406157"], ["iswc", "T-034.524.680-1", "T0345246801"],
    ["doi", "https://doi.org/10.1000/ABC", "10.1000/abc"], ["domain", "Example.COM.", "example.com"], ["domain", "localhost", null],
  ]) assert.equal(CODES[check](raw), want, `${check} ${raw}`);
});

test("periods: one pair of instants for a period, summer time included (RECIPES.md §4)", async () => {
  const { periodBounds, periodLabel } = await import("../engine/index.js");
  const all = ["hour", "day", "week", "month", "quarter", "year"];
  const iso = (b) => b && [new Date(Number(b.start_us.slice(0, -3))).toISOString(), new Date(Number(b.end_us.slice(0, -3))).toISOString()];
  assert.deepEqual(iso(periodBounds("2026-12-01", { clock: "CET", dayStart: 6, grains: all })), ["2026-12-01T05:00:00.000Z", "2026-12-02T05:00:00.000Z"]);
  assert.deepEqual(iso(periodBounds("2026-10-25", { clock: "CET", dayStart: 0, grains: all })), ["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
  assert.deepEqual(iso(periodBounds("2026-03-08", { clock: "CT", dayStart: 9, grains: all })), ["2026-03-08T14:00:00.000Z", "2026-03-09T14:00:00.000Z"]);
  assert.equal(periodBounds("2027-W53", { clock: "UTC", dayStart: 0, grains: all }), null);
  const b = periodBounds("2026-Q4", { clock: "CET", dayStart: 0, grains: all });
  assert.equal(periodLabel(b.start_us, b.end_us, { clock: "CET", dayStart: 0, grains: all }), "2026-Q4");
});

test("recipes: every one builds its example, reads it back, and a published one never changes what it builds", () => {
  const src = loadSource(root);
  assert.deepEqual(checkSource(src).filter((p) => p.startsWith("recipes/") || p.startsWith("families.json template")), []);
  assert.ok(src.recipes.length > 300, "every family has a recipe or a template");
  const { catalog } = publish(src);
  for (const r of catalog.recipes) assert.match(r.example.ref.token, /^(af1|au1):[0-9a-f]{64}$/, r.id);
  // Changing what a recipe builds after publication is refused; a new option at the end is not.
  const changed = structuredClone(catalog);
  changed.recipes[0].unit = "Wh";
  assert.notDeepEqual(compareReleases(catalog, { ...changed, version: catalog.version + 1 }), []);
  const grown = structuredClone(catalog);
  const choice = grown.recipes.find((r) => r.params.some((p) => p.type === "choice"));
  choice.params.find((p) => p.type === "choice").options.push({ id: "new-option", name: "New option" });
  assert.deepEqual(compareReleases(catalog, { ...grown, version: catalog.version + 1 }), []);
});
