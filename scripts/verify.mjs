// Checks every change before it is published. Exit code 1 on any problem.
//   node scripts/verify.mjs                     — the source alone
//   node scripts/verify.mjs --base <catalog.json> — and what it does to the previous release
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkSource, compareReleases, loadSource, publish } from "./source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const src = loadSource(root);
const problems = checkSource(src);
let summary = "";
if (!problems.length) {
  const { catalog } = publish(src);
  if (baseAt !== -1) problems.push(...compareReleases(JSON.parse(readFileSync(args[baseAt + 1], "utf8")), catalog));
  const count = (s) => catalog.assets.filter((a) => a.status === s).length;
  summary = `catalog v${catalog.version}: ${catalog.sections.length} sections, ${catalog.families.length} families, ` +
    `${src.entries.length} entries (${count("listed")} listed, ${count("retired")} retired)`;
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${summary} — ok`);
