// node --test: the engine as an SDK reads it — whole-number amounts, refusal codes, a published
// catalog loaded with every ref re-derived — and the views of a release generated from it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATALOG_SCHEMA, DEFINITION_ERRORS, MAX_AMOUNT, U128_MAX, buildDefinition, deriveAsset, fromAtoms, isAmount, loadCatalog, toAtoms,
} from "../engine/index.js";
import { IMPORT_MAP, dataViews, manualPages } from "../scripts/publication.mjs";
import { loadSource, publish } from "../scripts/source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { catalog } = publish(loadSource(root));
const runtime = JSON.parse(readFileSync(join(root, "vectors/runtime-codec.json"), "utf8"));
const views = dataViews(catalog, { sha256: "0".repeat(64), base: null });
const view = (path) => JSON.parse(views[path]);
const rules = readFileSync(join(root, "site/agents.html"), "utf8");
// Keep validation fixtures private: client-facing pages explain how to use the SDK.
const refusedBase = { version: 1, domain: "other.custom", instrument: "example", source: "spec:example", kind: "Fungible", unit: "item", terms: [] };
const term = (key, value) => ({ key, value });
const refusals = [
  ["invalid_definition", { domain: "Other" }],
  ["invalid_definition", { unit: "" }],
  ["empty_term_key", { terms: [term("", "x")] }],
  ["noncanonical_terms", { terms: [term("b", "1"), term("a", "2")] }],
  ["noncanonical_terms", { terms: [term("a", "1"), term("a", "2")] }],
  ["incomplete_terms", { terms: [term("mp.place_authority", "unlocode")] }],
  ["empty_term", { terms: [term("mp.place_authority", ""), term("mp.place_id", "DEHAM")] }],
  ["invalid_term", { terms: [term("mp.end_us", "01"), term("mp.start_us", "0")] }],
  ["invalid_term", { terms: [term("mp.capacity_unit", "gpu"), term("mp.concurrent_units", "0")] }],
  ["invalid_interval", { terms: [term("mp.end_us", "1"), term("mp.start_us", "2")] }],
  ["invalid_window", { terms: [term("mp.end_us", "20"), term("mp.start_us", "10"), term("mp.start_window_from_us", "5"), term("mp.start_window_to_us", "15")] }],
  ["invalid_deadline", { terms: [term("mp.end_us", "20"), term("mp.provision_complete_by_us", "15"), term("mp.start_us", "10")] }],
].map(([error, patch]) => ({ definition: { ...refusedBase, ...patch }, error }));

test("amounts: a whole number of the unit, the display only moves the decimal point", () => {
  assert.equal(toAtoms("12.5", 3), "12500");
  assert.equal(toAtoms(" 12.500 ", 3), "12500");
  assert.equal(toAtoms("0.001", 3), "1");
  assert.equal(toAtoms("12.5004", 3), null);
  for (const bad of ["0", "0.000", "-1", "1e3", "1,5", "", "١٢"]) assert.equal(toAtoms(bad, 3), null, bad);
  assert.equal(fromAtoms("12500", 3), "12.5");
  assert.equal(fromAtoms("1", 6), "0.000001");
  assert.equal(fromAtoms("5", 0), "5");
  assert.equal(MAX_AMOUNT, U128_MAX.toString());
  assert.ok(isAmount(MAX_AMOUNT));
  assert.ok(!isAmount((U128_MAX + 1n).toString()));
  assert.ok(!isAmount("01"));
  for (const atoms of ["1", "999", "123456789012345678901234567890"]) for (const d of [0, 2, 18]) assert.equal(toAtoms(fromAtoms(atoms, d), d), atoms);
});

test("refusals: every code the codec throws is named, with its rule", () => {
  assert.ok(refusals.length >= 10);
  for (const { definition, error } of refusals) {
    assert.ok(Object.hasOwn(DEFINITION_ERRORS, error), error);
    assert.throws(() => deriveAsset(definition), { message: error });
  }
  // Every code but the UTF-8 and size ones has a private fixture.
  assert.deepEqual(
    [...new Set(refusals.map((r) => r.error))].sort(),
    Object.keys(DEFINITION_ERRORS).filter((c) => c !== "invalid_utf8" && c !== "definition_too_large").sort(),
  );
  assert.throws(() => deriveAsset({ ...runtime.definition.raw, instrument: "\ud800" }), { message: "invalid_utf8" });
});

test("a published catalog loads with every ref re-derived; a forged one is dropped", () => {
  const json = JSON.parse(JSON.stringify(catalog));
  const loaded = loadCatalog(json);
  assert.deepEqual(loaded.dropped, []);
  assert.equal(loaded.assets.length, catalog.assets.length);
  assert.equal(loaded.recipes.length, catalog.recipes.length);
  assert.equal(loaded.repository, catalog.repository);
  const usdc = loaded.assets.find((a) => a.id === "usdc");
  assert.equal(loaded.entry(usdc.ref), usdc);
  const cash = loaded.recipe("money.cash.banknotes");
  const built = loaded.build(cash.id, cash.example.values);
  assert.equal(built.ok, true);
  assert.deepEqual(built.ref, cash.example.ref);
  assert.deepEqual(loaded.read(built.definition), { recipe: cash, values: built.values });
  assert.deepEqual(loaded.build("no.such.recipe", {}), { ok: false, invalid: ["recipe"] });
  // A name can never be claimed for a foreign token, nor a recipe for another ref.
  const forged = JSON.parse(JSON.stringify(catalog));
  forged.assets.find((a) => a.id === "usdc").ref = forged.assets.find((a) => a.id === "eurc").ref;
  forged.recipes.find((r) => r.id === "money.cash.banknotes").example.ref.token = `af1:${"0".repeat(64)}`;
  assert.deepEqual(loadCatalog(forged).dropped.sort(), ["money.cash.banknotes", "usdc"]);
  assert.throws(() => loadCatalog({ ...json, schema: "multipiston.catalog/2" }), { message: "unsupported_catalog_schema" });
  assert.equal(json.schema, CATALOG_SCHEMA);
});

test("the views of a release say the same as the catalog, in smaller files", () => {
  const latest = view("catalog/latest.json");
  assert.deepEqual(latest, {
    schema: "multipiston.catalog-latest/1", version: catalog.version, updated: catalog.updated,
    catalog: `/catalog/v${catalog.version}/catalog.json`, sha256: "0".repeat(64), index: "/catalog/index.json",
  });
  const index = view("catalog/index.json");
  assert.deepEqual(index.sections.map((s) => s.id), catalog.sections.map((s) => s.id));
  assert.deepEqual(index.sections.flatMap((s) => s.families.flatMap((f) => f.recipes)).sort(), catalog.recipes.map((r) => r.id).sort());
  assert.equal(view("catalog/entries.json").entries.length, catalog.assets.length);
  for (const a of catalog.assets) assert.deepEqual(view(`catalog/entries/${a.id}.json`).ref, a.ref, a.id);
  for (const r of catalog.recipes) {
    assert.equal(view(`catalog/recipes/${r.id}.json`).id, r.id);
    assert.ok(views[`catalog/recipes/${r.id}.md`].includes(`\`${r.id}\``), r.id);
  }
  // Every published recipe's values must still give its expected ref.
  for (const r of catalog.recipes) {
    const published = view(`catalog/recipes/${r.id}.json`);
    const built = buildDefinition(published, published.example.values);
    assert.equal(built.ok, true, r.id);
    assert.deepEqual(deriveAsset(built.definition), r.example.ref, r.id);
  }
  assert.equal(views["catalog/vectors.json"], undefined);
  assert.equal(index.files.vectors, undefined);
  assert.deepEqual(view("catalog/changes.json").entries.added.length, catalog.assets.length);
});

// The rules for agents are a page of the site (site/agents.html in the site's frame): HTML both a
// person and an agent read, no Markdown left in it; every link inside it reaches its place on the page.
// Every page of the site links only files the release publishes.
test("the rules for agents: one page of the site, every link of it reaches its place", () => {
  const pages = manualPages(catalog, rules), page = pages["agents.html"];
  assert.ok(page.startsWith("<!doctype html>") && page.includes("<title>Rules for agents and programs — MultiPiston</title>"));
  assert.ok(page.includes('<link rel="canonical" href="/agents.html"><link rel="alternate" type="application/json" href="/openapi.json">'));
  assert.ok(!/<script/i.test(page));
  assert.ok(!/\*\*|```|\]\(|^#+ /m.test(rules), "no Markdown left");
  for (const name of ["MULTIPISTON_NODE_URL", "MULTIPISTON_PERSONA_ID", "MULTIPISTON_API_KEY", "offer_fdl", "asset_definitions", "receive_routes"])
    assert.ok(rules.includes(name), name);
  // Publication is one request; there is no preview, preparation or renewal on the node.
  for (const gone of ["submit_version", "simulate-settlement", "prepared_admission_ref_hex", "reconcile", "replace_of"])
    assert.ok(!rules.includes(gone), gone);
  const ids = new Set([...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 0);
  for (const a of anchors) assert.ok(ids.has(a), `#${a}`);
  // The files the build writes beside the views (scripts/build.mjs), and the views themselves.
  const published = new Set([...Object.keys(views), ...Object.keys(pages),
    "catalog/catalog.json", "catalog/catalog.json.sha256", "catalog/catalog.schema.json", "openapi.json", "llms.txt"]);
  for (const [name, html] of Object.entries(pages))
    for (const [, path] of html.matchAll(/href="\/([^"#?]+)/g)) assert.ok(published.has(path), `${name} → /${path}`);
});

test("the manual: static pages without script but the Build page, a sitemap only with the site's origin", () => {
  const pages = manualPages(catalog, rules);
  assert.ok(pages["catalog/index.html"] && pages["catalog/describe.html"]);
  for (const s of catalog.sections) assert.ok(pages[`catalog/sections/${s.id}.html`], s.id);
  for (const r of catalog.recipes) {
    assert.ok(pages[`catalog/recipes/${r.id}.html`], r.id);
    assert.ok(pages[`catalog/recipes/${r.id}.html`].includes(`/catalog/build.html?recipe=${encodeURIComponent(r.id)}`), r.id);
  }
  for (const [path, html] of Object.entries(pages)) if (path !== "catalog/build.html") assert.ok(!/<script/i.test(html), path);
  // The one interactive page: the import map of the engine's one dependency and its own script, nothing else.
  assert.deepEqual(pages["catalog/build.html"].match(/<script[^>]*>/g), ['<script type="importmap">', '<script type="module" src="/catalog/build.js">']);
  assert.ok(pages["catalog/build.html"].includes(IMPORT_MAP));
  // The site's CSP for this page names the import map by its hash (CATALOG_LAUNCH_TZ, appendix A):
  // a new map is a new header.
  assert.equal(createHash("sha256").update(IMPORT_MAP).digest("base64"), "cN2YIKMURBzTE48CQOm7a8gBCC2NQbtBFKT/K89QDOs=");
  assert.ok(!/\/agents"/.test(Object.values(pages).join("")), "no page sends a reader into the dashboard");
  assert.equal(pages["catalog/sitemap.xml"], undefined);
  for (const code of Object.keys(DEFINITION_ERRORS)) assert.ok(pages["catalog/describe.html"].includes(`<code>${code}</code>`), code);
  const sitemap = manualPages(catalog, rules, "https://multipiston.example")["catalog/sitemap.xml"];
  assert.ok(sitemap.includes("<loc>https://multipiston.example/catalog/describe.html</loc>"));
  assert.equal((sitemap.match(/<url>/g) ?? []).length, Object.keys(pages).filter((p) => p.endsWith(".html")).length);
});

// What an agent reads is its contract — routes, request and reply shapes, keys, events, closed codes,
// limits — and nothing of how the market canonicalises or finds deals (owner, 2026-11-21). The read
// routes are the runtime's: an intent by offer_seq, tickets by cursor, since and head.
test("the agent texts carry the contract only, at the runtime's routes", () => {
  const engine = readdirSync(join(root, "engine")).filter((f) => f.endsWith(".js") || f.endsWith(".d.ts") || f.endsWith(".md")).map((f) => `engine/${f}`);
  const texts = ["site/agents.html", "llms.txt", "openapi.json", "README.md", "RECIPES.md", "CONTRIBUTING.md", ...engine]
    .map((file) => [file, readFileSync(join(root, file), "utf8")]);
  // The engine's code derives the ref the node requires in offer_fdl (wire): it may import its hash,
  // never name the runtime's sources.
  for (const [file, text] of texts)
    for (const word of [...(/^engine\/.*\.js$/.test(file) ? [] : [/BLAKE3/i]), /\.rs\b/, /crates\//, /protocol_fcap/, /runtime proof/i, /splits the market into segments/i,
      /after_exec_id_hex/, /\/central\/offers\/\{intent\}/, /cursor_invalid/, /lease_until_epoch/, /"Retired"/, /check a proposed trade/i])
      assert.ok(!word.test(text), `${file}: ${word}`);
  const api = JSON.parse(readFileSync(join(root, "openapi.json"), "utf8"));
  for (const path of ["/central/offers/{offer_seq}", "/central/execs", "/ws/ticket"]) assert.ok(api.paths[path], path);
  assert.deepEqual(api.paths["/central/execs"].get.parameters.map((p) => p.name), ["limit_u16", "cursor", "since"]);
  // The closed lists are whole: a copy of the runtime's (error_matrix.rs StableErrorCode, http_execs.rs,
  // node bus.rs NodeCommandCode and core/api.rs NodeApiErrorCode, ingest_wire.rs AdmissionRefusalCause::ALL).
  const stable = ["busy", "central_unavailable", "conflict", "not_found", "invalid_request", "unsupported_client", "unauthorized",
    "not_allowed", "storage_full", "resident_capacity", "root_capacity", "market_member_capacity", "billing_capacity",
    "device_key_capacity", "session_capacity", "login_replay_quota", "login_rate_limited", "ws_ticket_rate_limited"];
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(api.components.schemas.CentralError.properties.error.enum), sorted([...stable,
    "invalid_limit", "invalid_cursor", "invalid_since", "invalid_exec_id_hex", "exec_not_found", "exec_binding_invalid", "fcap_unsupported_version"]));
  assert.deepEqual(sorted(api.components.schemas.NodeError.properties.error.enum), sorted([...stable,
    "rpc_correlation_conflict", "invalid_relay_response", "node_unavailable", "fdl_canon_error"]));
  assert.deepEqual(sorted(api.components.schemas.AdmissionRefusal.properties.cause.enum), sorted(["node_rpc_pending_capacity",
    "node_rpc_target_mailbox_full", "node_rpc_command_credit_capacity", "node_rpc_allocation_pressure", "node_rpc_target_resolution_incomplete",
    "node_strategist_admission_capacity", "node_submit_owner_capacity", "root_offer_limit_exceeded", "segment_registry_domain_capacity",
    "segment_registry_resident_bytes_capacity", "segment_registry_allocation_pressure", "node_withdraw_owner_capacity",
    "session_auth_mailbox_full", "dpop_lookup_mailbox_full", "dpop_lookup_key_capacity", "dpop_lookup_waiter_capacity",
    "dpop_lookup_total_waiter_capacity", "target_publication_pending", "cell_row_allocation_pressure", "owner_binding_conflict",
    "target_in_plan", "intent_live", "market_closed"]));
  // The agent page names every code of the lists, and the Origin a program's socket must send.
  const page = readFileSync(join(root, "site/agents.html"), "utf8");
  for (const code of new Set([...api.components.schemas.CentralError.properties.error.enum, ...api.components.schemas.NodeError.properties.error.enum,
    ...api.components.schemas.AdmissionRefusal.properties.cause.enum])) assert.ok(page.includes(`<code>${code}</code>`), code);
  assert.ok(page.includes("<code>Origin</code>"));
});
