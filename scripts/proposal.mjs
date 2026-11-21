// A proposal — an issue made from a form in .github/ISSUE_TEMPLATE — is turned into the files it
// would change and checked in a copy of the source by the rules of a pull request: checkSource, and
// compareReleases against the catalog as it stands. The issue text is data: it never reaches a shell
// and only becomes the files below, under paths the rules allow. A new entry stays a draft: only a
// maintainer lists it (CONTRIBUTING.md §5, §8).
//   node scripts/proposal.mjs <event.json> <out>
//     <out>/comment.md     the check, as the bot's comment — always
//     <out>/result.json    { ok, form, branch, title, files }
//     <out>/files/<path>   the files of the draft pull request — when ok
//     <out>/message.txt    its commit message, <out>/body.md its description — when ok
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFINITION_ERRORS, deriveAsset, readDefinition } from "../engine/index.js";
import { checkSource, compareReleases, loadSource, publish } from "./source.mjs";

// The forms by the label each adds besides "proposal": field id → the field's label in the form.
// test/proposal.test.mjs keeps them equal to the YAML.
export const FORMS = {
  "new-asset": {
    file: "propose-asset.yml",
    fields: {
      family: "Family", symbol: "Symbol", name: "Name", asset: "Exact asset", decimals: "Display decimals",
      who: "Who will trade it", icon: "Icon", confirm: "Confirmation",
    },
  },
  "asset-change": {
    file: "change-asset.yml",
    fields: {
      entry: "Entry", action: "What to do", symbol: "New symbol", name: "New name", icon: "New icon",
      replaced_by: "Replaced by", why: "Why", confirm: "Confirmation",
    },
  },
  recipe: {
    file: "propose-recipe.yml",
    fields: {
      action: "What to do", recipe: "Recipe id", definition: "Recipe", icon: "Icon",
      sources: "Where the values come from", who: "Who will trade it", confirm: "Confirmation",
    },
  },
};
export const MARK = "<!-- multipiston-proposal -->";
const SHOWN = 20;
const SOURCE = ["release.json", "families.json", "networks.json", "units.json", "entries", "recipes", "icons"];
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const RECIPE_ID = /^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/;
const RECIPE_ICON = /^icons\/recipes\/[a-z0-9-]+\.svg$/;
const DEFINITION_FIELDS = ["version", "domain", "instrument", "source", "kind", "unit", "terms"];
const ENTRY_FIELDS = ["status", "family", "symbol", "aliases", "name", "decimals", "icon", "ref", "definition", "replaced_by", "note"];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An issue form's body as GitHub renders it: "### <label>", then the answer; an empty answer is
// "_No response_", a textarea with `render:` a fenced block, a checkbox "- [X] <label>".
export const parseForm = (body, fields) => {
  const text = String(body ?? "").replace(/\r\n?/g, "\n");
  const byLabel = new Map(Object.entries(fields).map(([id, label]) => [label, id]));
  const heading = new RegExp(`^### (${[...byLabel.keys()].map(escape).join("|")})[ \\t]*$`, "gm");
  const marks = [...text.matchAll(heading)];
  const out = Object.fromEntries(Object.keys(fields).map((id) => [id, ""]));
  marks.forEach((m, i) => {
    let value = text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length).trim();
    if (value === "_No response_") value = "";
    const fence = /^(`{3,})[\w-]*\n([\s\S]*?)\n?\1$/.exec(value);
    out[byLabel.get(m[1])] = fence ? fence[2] : value;
  });
  return out;
};
const checked = (answer, label) => new RegExp(`^- \\[[xX]\\] ${escape(label)}`, "m").test(answer);

// User text shown in the comment: one line, in code, so it is never markup or a mention.
const shown = (s) => `\`${String(s).replace(/[`\n\r]/g, " ").trim().slice(0, 120)}\``;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ordered = (value, keys) => Object.fromEntries(keys.filter((k) => k in value).map((k) => [k, value[k]]));
const svgOf = (answer) => (answer.trim() ? `${answer.trim()}\n` : null);

// The files applied to a copy of the source, checked as a pull request would be. A proposal is a
// part of the next release: the release's own version rule is the maintainer's.
const checkWith = (root, files) => {
  const dir = mkdtempSync(join(tmpdir(), "proposal-"));
  try {
    for (const p of SOURCE) cpSync(join(root, p), join(dir, p), { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const src = loadSource(dir);
    const problems = checkSource(src);
    if (problems.length) return problems;
    const base = publish(loadSource(root)).catalog;
    return compareReleases(base, publish(src).catalog).filter((p) => !/^(release\.json|nothing changed)/.test(p));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// A definition as JSON → the exact definition, in its field order, or why not.
const readAsset = (answer, domain, say) => {
  let raw;
  try {
    raw = JSON.parse(answer);
  } catch {
    say("Exact asset: the definition as JSON — catalog/build.html gives it, catalog/describe.html explains each field");
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    say("Exact asset: a JSON object { version, domain, instrument, source, kind, unit, terms }");
    return null;
  }
  const extra = Object.keys(raw).filter((k) => !DEFINITION_FIELDS.includes(k));
  if (extra.length) say(`Exact asset: no other fields (${extra.map(shown).join(", ")})`);
  // The family sets the domain, and the version is 1: both may be left out.
  return ordered({ version: 1, domain, ...raw }, DEFINITION_FIELDS);
};

const newAsset = (root, src, f, issue) => {
  const problems = [], notes = [], rows = [], files = {};
  const say = (p) => problems.push(p);
  if (!checked(f.confirm, "No keys, passwords, payment details or personal data")) say("Confirmation: no keys, passwords, payment details or personal data");
  const family = (src.families.families ?? []).find((x) => x.id === f.family.trim());
  if (!family) say(`Family: ${shown(f.family)} is not in families.json`);
  const definition = readAsset(f.asset, family?.domain ?? family?.id, say);
  let ref = null;
  if (definition) {
    try {
      ref = deriveAsset(definition);
      rows.push(["Ref", `\`${ref.chain} ${ref.token}\``]);
    } catch (e) {
      say(`Exact asset: ${e.message} — ${DEFINITION_ERRORS[e.message] ?? "the runtime refuses it"}`);
    }
  }
  if (ref) {
    const same = src.entries.find((e) => e.ref?.chain === ref.chain && e.ref?.token === ref.token);
    if (same) say(`this asset is already the entry \`${same.id}\` (${same.status})`);
    const recipe = readDefinition(publish(src).catalog.recipes, definition);
    if (recipe)
      notes.push(`The recipe \`${recipe.recipe.id}\` describes this asset (${Object.entries(recipe.values).map(([k, v]) => `${k} ${shown(v)}`).join(", ")}): anyone can use it without an entry; an entry gives it a symbol and a name.`);
  }
  const decimals = f.decimals.trim() === "" ? 0 : Number(f.decimals.trim());
  if (!Number.isSafeInteger(decimals) || decimals < 0) say("Display decimals: a whole number, 0 or more");
  const symbol = f.symbol.trim(), wanted = symbol.toLowerCase();
  const id = ID.test(wanted) && !src.entries.some((e) => e.id === wanted) ? wanted : `proposal-${issue.number}`;
  const icon = svgOf(f.icon);
  if (icon) files[`icons/${id}.svg`] = icon;
  if (!definition || !family || problems.length) return { problems, notes, rows, files: {} };
  const entry = {
    status: "draft", family: family.id, symbol, aliases: [], name: f.name.trim(), decimals,
    icon: icon ? `icons/${id}.svg` : null, ref, definition,
    replaced_by: null, note: `Proposed in issue #${issue.number}.`,
  };
  files[`entries/${id}.json`] = json(entry);
  rows.push(["Entry", `\`entries/${id}.json\` — a draft`]);
  return { problems: checkWith(root, files), notes, rows, files, title: `Asset ${symbol}: ${entry.name}` };
};

const assetChange = (root, src, f) => {
  const problems = [], rows = [], files = {};
  const say = (p) => problems.push(p);
  if (!checked(f.confirm, "No keys, passwords, payment details or personal data")) say("Confirmation: no keys, passwords, payment details or personal data");
  const key = f.entry.trim();
  const entry = src.entries.find((e) => e.id === key || `${e.ref?.chain} ${e.ref?.token}` === key);
  if (!entry) return { problems: [...problems, `Entry: ${shown(key)} is no entry id or ref of the catalog`], notes: [], rows, files };
  const next = ordered(entry, ENTRY_FIELDS);
  if (f.action === "Retire") {
    next.status = "retired";
    if (f.replaced_by.trim()) next.replaced_by = f.replaced_by.trim();
  } else if (f.action === "Change name, symbol or icon") {
    const symbol = f.symbol.trim(), name = f.name.trim(), icon = svgOf(f.icon);
    if (!symbol && !name && !icon) say("New symbol, New name, New icon: at least one");
    // A former symbol stays in aliases: it keeps naming this asset (CONTRIBUTING.md §5).
    if (symbol && symbol !== entry.symbol) Object.assign(next, { symbol, aliases: [...entry.aliases.filter((a) => a !== symbol), entry.symbol] });
    if (name) next.name = name;
    if (icon) {
      files[`icons/${entry.id}.svg`] = icon;
      next.icon = `icons/${entry.id}.svg`;
    }
  } else say(`What to do: ${shown(f.action)} is not one of the form's`);
  if (problems.length) return { problems, notes: [], rows, files: {} };
  files[`entries/${entry.id}.json`] = json(next);
  rows.push(["Entry", `\`entries/${entry.id}.json\` — ${next.status}`]);
  return { problems: checkWith(root, files), notes: [], rows, files, title: `Asset ${entry.id}: ${f.action.toLowerCase()}` };
};

const recipeChange = (root, src, f) => {
  const problems = [], rows = [], files = {};
  const say = (p) => problems.push(p);
  if (!checked(f.confirm, "No keys, passwords, payment details or personal data")) say("Confirmation: no keys, passwords, payment details or personal data");
  const id = f.recipe.trim();
  const exists = src.recipes.some((r) => r.id === id && r.__file);
  if (!RECIPE_ID.test(id)) say(`Recipe id: ${shown(id)} — <family>.<name>, as recipes/<id>.json names it`);
  else if (f.action === "New recipe" && src.recipes.some((r) => r.id === id)) say(`Recipe id: \`${id}\` exists — propose its new options instead`);
  else if (f.action === "Add options to a recipe" && !exists) say(`Recipe id: \`${id}\` is no recipe file of the catalog`);
  else if (f.action !== "New recipe" && f.action !== "Add options to a recipe") say(`What to do: ${shown(f.action)} is not one of the form's`);
  let recipe = null;
  try {
    recipe = JSON.parse(f.definition);
    if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) throw new Error();
  } catch {
    say("Recipe: the whole recipe file as JSON (RECIPES.md)");
  }
  const icon = svgOf(f.icon);
  if (icon && !(typeof recipe?.icon === "string" && RECIPE_ICON.test(recipe.icon))) say("Icon: the recipe's icon names icons/recipes/<name>.svg");
  if (problems.length) return { problems, notes: [], rows, files: {} };
  files[`recipes/${id}.json`] = json(recipe);
  if (icon) files[recipe.icon] = icon;
  rows.push(["Recipe", `\`recipes/${id}.json\``]);
  return { problems: checkWith(root, files), notes: [], rows, files, title: `Recipe ${id}: ${f.action.toLowerCase()}` };
};

// An issue → the check: { ok, form, comment, files, branch, title, message, body }.
export const proposal = (root, issue) => {
  const labels = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l?.name));
  const form = Object.keys(FORMS).find((k) => labels.includes(k)) ?? null;
  const src = loadSource(root);
  const run = { "new-asset": newAsset, "asset-change": assetChange, recipe: recipeChange }[form];
  const r = run ? run(root, src, parseForm(issue.body, FORMS[form].fields), issue) : { problems: ["the issue is made from none of the proposal forms"], notes: [], rows: [], files: {} };
  const ok = r.problems.length === 0;
  const lines = [
    MARK,
    ok && form === "new-asset"
      ? "**The check passed.** A draft pull request carries the entry as a draft; a maintainer reviews it, lists it and merges, and the next release publishes it."
      : ok
        ? "**The check passed.** A draft pull request carries the change; a maintainer reviews and merges it, and the next release publishes it."
        : `**The check found ${r.problems.length === 1 ? "a problem" : `${r.problems.length} problems`}.** Edit the issue: the check runs again on every edit.`,
    "",
    ...(r.rows.length ? ["| | |", "|---|---|", ...r.rows.map(([k, v]) => `| ${k} | ${v} |`), ""] : []),
    // One rule broken can be said by every entry it touches: the first lines here, all in the log.
    ...r.problems.slice(0, SHOWN).map((p) => `- ${p}`),
    ...(r.problems.length > SHOWN ? [`- … and ${r.problems.length - SHOWN} more in the check's log`] : []),
    ...(r.problems.length ? [""] : []),
    ...r.notes,
    ...(r.notes.length ? [""] : []),
    "<sub>Checked by scripts/proposal.mjs with the rules of a pull request (CONTRIBUTING.md). Nothing is listed or merged automatically.</sub>",
  ];
  // A mention in user text never pings anyone.
  const comment = `${lines.join("\n").replace(/@(?=\w)/g, "@​")}\n`;
  const title = (r.title ?? "").replace(/[\n\r]/g, " ").slice(0, 100);
  return {
    ok, form, comment, problems: r.problems, files: ok ? r.files : {}, branch: `proposal/${issue.number}`, title,
    message: `${title}\n\nFrom issue #${issue.number}; checked by scripts/proposal.mjs.\n`,
    body: `${comment}\nCloses #${issue.number}\n`,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [eventPath, out] = process.argv.slice(2);
  if (!eventPath || !out) {
    console.error("usage: node scripts/proposal.mjs <event.json> <out>");
    process.exit(2);
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  const r = proposal(root, JSON.parse(readFileSync(eventPath, "utf8")).issue);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "comment.md"), r.comment);
  writeFileSync(join(out, "result.json"), json({ ok: r.ok, form: r.form, branch: r.branch, title: r.title, files: Object.keys(r.files) }));
  if (r.ok) {
    for (const [path, text] of Object.entries(r.files)) {
      mkdirSync(dirname(join(out, "files", path)), { recursive: true });
      writeFileSync(join(out, "files", path), text);
    }
    writeFileSync(join(out, "message.txt"), r.message);
    writeFileSync(join(out, "body.md"), r.body);
  }
  console.log(`${r.form ?? "no form"}: ${r.ok ? "ok" : `${r.problems.length} problems`}`);
  for (const p of r.problems) console.log(`  ${p}`);
}
