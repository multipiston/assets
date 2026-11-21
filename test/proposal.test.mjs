// node --test: a proposal issue is read as GitHub renders its form, turned into the files it would
// change and checked by the rules of a pull request; the comment never pings anyone.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFINITION_ERRORS, buildDefinition, deriveAsset } from "../engine/index.js";
import { FORMS, MARK, parseForm, proposal } from "../scripts/proposal.mjs";
import { loadSource, publish } from "../scripts/source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const CONFIRM = "- [ ] The icon is my own work, or I own the brand\n- [X] No keys, passwords, payment details or personal data";
// The body GitHub writes for an issue form: every field under its label, an empty one as "_No response_".
const render = (form, answers) =>
  Object.entries(FORMS[form].fields).map(([id, label]) => `### ${label}\n\n${answers[id] ?? "_No response_"}`).join("\n\n");
const issue = (form, answers, number = 7) => ({ number, labels: [{ name: "proposal" }, { name: form }], body: render(form, { confirm: CONFIRM, ...answers }) });
const fenced = (lang, value) => `\`\`\`${lang}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n\`\`\``;
const widget = { instrument: "widget-7", source: "spec:acme", kind: "Fungible", unit: "item", terms: [] };
const newAsset = (over = {}, number) =>
  proposal(root, issue("new-asset", { family: "other.custom", symbol: "WIDG7", name: "Widget Seven", asset: fenced("json", widget), who: "Acme buyers", ...over }, number));

test("the forms and the checker name the same fields", () => {
  for (const [label, form] of Object.entries(FORMS)) {
    const yaml = readFileSync(join(root, ".github/ISSUE_TEMPLATE", form.file), "utf8");
    assert.match(yaml, new RegExp(`^labels: \\["proposal", "${label}"\\]$`, "m"), form.file);
    const fields = Object.fromEntries([...yaml.matchAll(/^ {4}id: (\S+)\n {4}attributes:\n {6}label: (.+)$/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(fields, form.fields, form.file);
  }
});

test("an issue form's body: answers by label, no response, fenced text, line ends", () => {
  const fields = { a: "First", b: "Second", c: "Third" };
  const body = "### First\r\n\r\nalpha\r\n\r\n### Unknown\n\nx\n\n### Second\n\n_No response_\n\n### Third\n\n```json\n{ \"k\": 1 }\n```\n";
  assert.deepEqual(parseForm(body, fields), { a: "alpha\n\n### Unknown\n\nx", b: "", c: '{ "k": 1 }' });
  assert.deepEqual(parseForm(undefined, fields), { a: "", b: "", c: "" });
});

test("a new asset: a draft entry with its exact ref, the family's domain filled in", () => {
  const r = newAsset();
  assert.equal(r.ok, true, r.comment);
  assert.equal(r.form, "new-asset");
  assert.deepEqual(Object.keys(r.files), ["entries/widg7.json"]);
  const entry = JSON.parse(r.files["entries/widg7.json"]);
  const definition = { version: 1, domain: "other.custom", ...widget };
  assert.deepEqual(entry, {
    status: "draft", family: "other.custom", symbol: "WIDG7", aliases: [], name: "Widget Seven", decimals: 0, icon: null,
    ref: deriveAsset(definition), definition, replaced_by: null, note: "Proposed in issue #7.",
  });
  assert.ok(r.comment.startsWith(MARK));
  assert.match(r.comment, new RegExp(deriveAsset(definition).token));
  assert.equal(r.branch, "proposal/7");
  assert.equal(r.title, "Asset WIDG7: Widget Seven");
  assert.match(r.body, /Closes #7/);
});

test("a new asset: every problem is said, and nothing is written", () => {
  const problems = (over) => {
    const r = newAsset(over);
    assert.equal(r.ok, false);
    assert.deepEqual(r.files, {});
    return r.comment;
  };
  assert.match(problems({ asset: "instrument = widget-7" }), /the definition as JSON/);
  assert.match(problems({ asset: fenced("json", { ...widget, issuer: "acme" }) }), /no other fields \(`issuer`\)/);
  const unsorted = { ...widget, terms: [{ key: "b", value: "1" }, { key: "a", value: "2" }] };
  assert.ok(problems({ asset: fenced("json", unsorted) }).includes(DEFINITION_ERRORS.noncanonical_terms));
  assert.match(problems({ family: "other.nothing" }), /Family: `other.nothing` is not in families.json/);
  assert.match(problems({ confirm: "- [ ] No keys, passwords, payment details or personal data" }), /Confirmation/);
  assert.match(problems({ decimals: "two" }), /Display decimals/);
  // The same rules as a pull request: a symbol that another asset bears.
  assert.match(problems({ symbol: "USDC" }), /symbol USDC is proposal-7's/);
  // An asset the catalog has already: its entry is named.
  const usdc = JSON.parse(readFileSync(join(root, "entries/usdc.json"), "utf8"));
  assert.match(problems({ family: "crypto.stablecoin", symbol: "USDX", asset: fenced("json", usdc.definition) }), /already the entry `usdc` \(listed\)/);
});

test("a new asset a recipe already makes: the recipe is named, the entry still possible", () => {
  const recipe = publish(loadSource(root)).catalog.recipes.find((x) => x.id === "money.cash.banknotes");
  const built = buildDefinition(recipe, recipe.example.values);
  const r = newAsset({ family: "money.cash", symbol: "CASHX", name: "Cash Example", asset: fenced("json", built.definition) });
  assert.match(r.comment, /The recipe `money\.cash\.banknotes` describes this asset/);
});

test("a mention in what was typed never pings", () => {
  const r = newAsset({ family: "@octocat" });
  assert.ok(r.comment.includes("@​octocat"));
  assert.ok(!/@octocat/.test(r.comment));
});

test("a change: a new name, a new symbol with the former one kept, a retirement", () => {
  const change = (answers) => proposal(root, issue("asset-change", { entry: "h100h", why: "clearer", ...answers }));
  const named = change({ action: "Change name, symbol or icon", name: "GPU hour, NVIDIA H100" });
  assert.equal(named.ok, true, named.comment);
  assert.equal(JSON.parse(named.files["entries/h100h.json"]).name, "GPU hour, NVIDIA H100");
  const renamed = change({ action: "Change name, symbol or icon", symbol: "H100X" });
  assert.equal(renamed.ok, true, renamed.comment);
  assert.deepEqual(JSON.parse(renamed.files["entries/h100h.json"]).aliases, ["H100H"]);
  const retired = change({ action: "Retire" });
  assert.equal(retired.ok, true, retired.comment);
  assert.equal(JSON.parse(retired.files["entries/h100h.json"]).status, "retired");
  assert.match(change({ action: "Change name, symbol or icon" }).comment, /at least one/);
  assert.match(change({ entry: "nothing-here", action: "Retire" }).comment, /no entry id or ref/);
});

test("a recipe: options grow at the end; what it builds never changes", () => {
  const file = JSON.parse(readFileSync(join(root, "recipes/agro.coffee.grade.json"), "utf8"));
  const propose = (recipe, action = "Add options to a recipe", id = "agro.coffee.grade") =>
    proposal(root, issue("recipe", { action, recipe: id, definition: fenced("json", recipe), sources: "ICE rules", who: "roasters" }));
  const grown = structuredClone(file);
  grown.params[0].options.push({ id: "ice-test-grade", name: "Test grade coffee (ICE)", short: "TG", unit: "lb" });
  const ok = propose(grown);
  assert.equal(ok.ok, true, ok.comment);
  assert.deepEqual(Object.keys(ok.files), ["recipes/agro.coffee.grade.json"]);
  const shrunk = structuredClone(file);
  shrunk.params[0].options.pop();
  assert.match(propose(shrunk).comment, /only new options may be added at the end/);
  assert.match(propose(file, "New recipe").comment, /exists — propose its new options instead/);
  assert.match(propose(file, "New recipe", "Coffee").comment, /Recipe id/);
});

test("an issue from none of the forms is told so", () => {
  const r = proposal(root, { number: 3, labels: [{ name: "proposal" }], body: "### Family\n\nx" });
  assert.equal(r.ok, false);
  assert.match(r.comment, /none of the proposal forms/);
});

test("the command line writes the comment, the result and the files of the pull request", () => {
  const dir = mkdtempSync(join(tmpdir(), "proposal-cli-"));
  try {
    const event = join(dir, "event.json");
    writeFileSync(event, JSON.stringify({ issue: issue("new-asset", { family: "other.custom", symbol: "WIDG7", name: "Widget Seven", asset: fenced("json", widget), who: "Acme buyers" }, 12) }));
    execFileSync(process.execPath, [join(root, "scripts/proposal.mjs"), event, join(dir, "out")]);
    const result = JSON.parse(readFileSync(join(dir, "out/result.json"), "utf8"));
    assert.deepEqual(result, { ok: true, form: "new-asset", branch: "proposal/12", title: "Asset WIDG7: Widget Seven", files: ["entries/widg7.json"] });
    assert.ok(readFileSync(join(dir, "out/comment.md"), "utf8").startsWith(MARK));
    assert.equal(JSON.parse(readFileSync(join(dir, "out/files/entries/widg7.json"), "utf8")).status, "draft");
    assert.match(readFileSync(join(dir, "out/message.txt"), "utf8"), /^Asset WIDG7: Widget Seven\n\nFrom issue #12/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
