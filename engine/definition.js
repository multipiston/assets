// Prepare an asset reference from a definition, or report a field that needs correction.
import { blake3 } from "@noble/hashes/blake3";

// Supported asset property groups.
export const TYPED_TERMS = [
  "mp.place_authority", "mp.place_id", "mp.origin_authority", "mp.origin_id", "mp.destination_authority",
  "mp.destination_id", "mp.start_us", "mp.end_us", "mp.start_window_from_us", "mp.start_window_to_us",
  "mp.provision_complete_by_us", "mp.configuration_id", "mp.resource_id", "mp.object_id", "mp.object_version",
  "mp.meter_id", "mp.package_id", "mp.capacity_unit", "mp.concurrent_units",
];
// Definition errors and the field rules to correct.
export const DEFINITION_ERRORS = {
  invalid_definition: "version 1; domain a-z, 0-9 and . _ : - up to 32; instrument, source and unit not empty; kind Fungible or Unique; terms [{ key, value }] and no other field",
  invalid_utf8: "text must be valid UTF-8 (no lone surrogates)",
  empty_term_key: "a term key must not be empty",
  noncanonical_terms: "term keys must be unique; use sortTerms before preparing the asset",
  incomplete_terms: "typed terms of one group go together: place, route, period, start window, capacity",
  empty_term: "place, route, capacity unit and exact identifiers must not be empty",
  invalid_term: "times are UTC microseconds without leading zeros, up to 2^63 − 1; concurrent units a positive whole number",
  invalid_interval: "a period and a start window start before they end",
  invalid_window: "the start window lies inside the period",
  invalid_deadline: "the deadline is at or after the period's end and after the window's start",
  definition_too_large: "the definition is too large",
};
const TEXT_KEYS = TYPED_TERMS.filter((k) => !/_us$|concurrent_units$/.test(k));
const FIELDS = ["version", "domain", "instrument", "source", "kind", "unit", "terms"];
const DOMAIN = /^[a-z0-9._:-]{1,32}$/;
const I64_MAX = 2n ** 63n - 1n;
export const U128_MAX = 2n ** 128n - 1n;
const PREFIX = new TextEncoder().encode("asset_definition:v1\0");

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
// UTF-8 of a string that is text: a lone surrogate would be replaced on encoding — refused.
const utf8 = (text) => {
  const bytes = encoder.encode(text);
  if (decoder.decode(bytes) !== text) throw new Error("invalid_utf8");
  return bytes;
};
const compareBytes = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
// Prepare term order for an asset definition.
export const sortTerms = (terms) => [...terms].sort((a, b) => compareBytes(encoder.encode(a.key), encoder.encode(b.key)));

const canonicalInteger = (value, max, positive = false) => {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > max.toString().length) throw new Error("invalid_term");
  const n = BigInt(value);
  if (n > max || (positive && n === 0n)) throw new Error("invalid_term");
  return n;
};

// The typed terms' rules: groups go together, identifiers are not
// empty, times are UTC microseconds in order, a capacity counts at least one unit.
export const validateTypedTerms = (terms) => {
  const map = new Map(terms.map((t) => [t.key, t.value]));
  const group = (keys) => {
    const count = keys.filter((k) => map.has(k)).length;
    if (count !== 0 && count !== keys.length) throw new Error("incomplete_terms");
    return count > 0;
  };
  for (const key of TEXT_KEYS) if (map.has(key) && map.get(key) === "") throw new Error("empty_term");
  group(["mp.place_authority", "mp.place_id"]);
  group(["mp.origin_authority", "mp.origin_id", "mp.destination_authority", "mp.destination_id"]);
  const instant = (key) => canonicalInteger(map.get(key), I64_MAX);
  const period = group(["mp.start_us", "mp.end_us"]);
  const window = group(["mp.start_window_from_us", "mp.start_window_to_us"]);
  const start = period ? instant("mp.start_us") : null, end = period ? instant("mp.end_us") : null;
  const from = window ? instant("mp.start_window_from_us") : null, to = window ? instant("mp.start_window_to_us") : null;
  const by = map.has("mp.provision_complete_by_us") ? instant("mp.provision_complete_by_us") : null;
  if (start !== null && start >= end) throw new Error("invalid_interval");
  if (from !== null && from >= to) throw new Error("invalid_interval");
  if (start !== null && from !== null && (from < start || to > end)) throw new Error("invalid_window");
  if (end !== null && by !== null && end > by) throw new Error("invalid_deadline");
  if (from !== null && by !== null && from >= by) throw new Error("invalid_deadline");
  if (group(["mp.capacity_unit", "mp.concurrent_units"])) canonicalInteger(map.get("mp.concurrent_units"), U128_MAX, true);
};

const u32 = (n) => {
  if (n > 0xffffffff) throw new Error("definition_too_large");
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const isText = (v) => typeof v === "string";

// Serialize a definition, or report an invalid field.
export const definitionBytes = (d) => {
  if (typeof d !== "object" || d === null || Array.isArray(d) || Object.keys(d).some((k) => !FIELDS.includes(k)))
    throw new Error("invalid_definition");
  if (d.version !== 1 || !isText(d.domain) || !DOMAIN.test(d.domain) || (d.kind !== "Fungible" && d.kind !== "Unique"))
    throw new Error("invalid_definition");
  if (!isText(d.instrument) || !d.instrument || !isText(d.source) || !d.source || !isText(d.unit) || !d.unit || !Array.isArray(d.terms))
    throw new Error("invalid_definition");
  const parts = [];
  const lp = (text) => {
    const b = utf8(text);
    parts.push(u32(b.length), b);
    return b;
  };
  parts.push(new Uint8Array([1, 0]));
  lp(d.domain);
  lp(d.instrument);
  lp(d.source);
  parts.push(new Uint8Array([d.kind === "Fungible" ? 0 : 1]));
  lp(d.unit);
  parts.push(u32(d.terms.length));
  let previous = null;
  for (const t of d.terms) {
    if (typeof t !== "object" || t === null || Object.keys(t).sort().join() !== "key,value" || !isText(t.key) || !isText(t.value))
      throw new Error("invalid_definition");
    if (!t.key) throw new Error("empty_term_key");
    const key = lp(t.key);
    if (previous && compareBytes(previous, key) >= 0) throw new Error("noncanonical_terms");
    previous = key;
    lp(t.value);
  }
  validateTypedTerms(d.terms);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};

const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
// The exact ref of a definition: the only identity of an asset.
export const deriveAsset = (d) => {
  const bytes = definitionBytes(d);
  const h = blake3.create();
  h.update(PREFIX);
  h.update(bytes);
  return { chain: d.domain, token: `${d.kind === "Fungible" ? "af1" : "au1"}:${hex(h.digest())}` };
};
// An asset reference supported by the API.
export const isInlineToken = (token) => /^(af1|au1):[0-9a-f]{64}$/.test(token);
export const refKey = (ref) => `${ref.chain} ${ref.token}`;
