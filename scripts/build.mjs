// Builds the public files of one release from the checked source (verify runs first):
//   <out>/catalog/catalog.json (+ .sha256)        — the current release
//   <out>/catalog/v<N>/catalog.json (+ .sha256)   — the same bytes at an address that never changes
//   <out>/catalog/icons/<id>-<hash>.svg           — icons under content addresses, never overwritten
//   <out>/catalog/catalog.schema.json             — JSON Schema of the published file
//   <out>/catalog/{latest,index,entries,changes}.json, entries/, recipes/ — the views for
//       programs and agents; *.html and sitemap.xml — the public manual (scripts/publication.mjs)
//   <out>/catalog/engine/ — the engine for a browser (and the BLAKE3 files it imports, with their
//       licence), <out>/catalog/build.js — the script of the one interactive page
//   <out>/agents.html, <out>/openapi.json, <out>/llms.txt — rules for agents, the API, where to find them
// Earlier versions and icons stay: an old link keeps working.
// Usage: node scripts/build.mjs <out-dir> [--base <previous catalog.json>] [--site <https origin>]
//   --site names the origin the files are served from: the sitemap needs absolute addresses.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataViews, manualPages } from "./publication.mjs";
import { loadSource, publish } from "./source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/build.mjs <out-dir> [--base <catalog.json>] [--site <origin>]");
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
const basePath = option("--base"), site = option("--site");
if (site !== null && !/^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/.test(site)) throw new Error("--site: an https origin without a path");
execFileSync(process.execPath, [join(root, "scripts/verify.mjs"), ...(basePath ? ["--base", basePath] : [])], { stdio: "inherit" });

const { catalog, text, icons } = publish(loadSource(root));
const sum = (t) => `${createHash("sha256").update(t).digest("hex")}  catalog.json\n`;
const dir = join(out, "catalog"), pinned = join(dir, `v${catalog.version}`);
mkdirSync(join(dir, "icons"), { recursive: true });
mkdirSync(pinned, { recursive: true });
const once = (file, bytes) => {
  if (existsSync(file) && !readFileSync(file).equals(Buffer.from(bytes))) throw new Error(`${file} is already published with other bytes`);
  writeFileSync(file, bytes);
};
once(join(pinned, "catalog.json"), text);
once(join(pinned, "catalog.json.sha256"), sum(text));
writeFileSync(join(dir, "catalog.json"), text);
writeFileSync(join(dir, "catalog.json.sha256"), sum(text));
for (const icon of icons) once(join(dir, icon.to), readFileSync(icon.from));
copyFileSync(join(root, "schema/catalog.schema.json"), join(dir, "catalog.schema.json"));
copyFileSync(join(root, "openapi.json"), join(out, "openapi.json"));
copyFileSync(join(root, "llms.txt"), join(out, "llms.txt"));
// The engine as the browser imports it (site/build.js), and the module graph of its one import:
// @noble/hashes/blake3 and what it imports, from the pinned package, untouched, with its licence.
const engine = join(dir, "engine"), noble = join(engine, "noble-hashes");
mkdirSync(noble, { recursive: true });
for (const f of readdirSync(join(root, "engine")).filter((f) => f.endsWith(".js") || f === "index.d.ts" || f === "README.md"))
  copyFileSync(join(root, "engine", f), join(engine, f));
const nobleRoot = join(root, "node_modules/@noble/hashes");
for (const f of ["blake3.js", "blake2.js", "_blake.js", "_md.js", "_u64.js", "utils.js", "crypto.js"])
  copyFileSync(join(nobleRoot, "esm", f), join(noble, f));
copyFileSync(join(nobleRoot, "LICENSE"), join(noble, "LICENSE"));
copyFileSync(join(root, "site/build.js"), join(dir, "build.js"));
// This implementation reference is no longer part of the public agent guide.
rmSync(join(dir, "vectors.json"), { force: true });
// The views of this release: written fresh each time (only versioned files and icons are kept once).
const views = {
  ...dataViews(catalog, {
    sha256: sum(text).split(" ")[0],
    base: basePath ? JSON.parse(readFileSync(basePath, "utf8")) : null,
  }),
  ...manualPages(catalog, readFileSync(join(root, "site/agents.html"), "utf8"), site),
};
for (const [path, content] of Object.entries(views)) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  if (/\/changes\/v[0-9]+\.json$/.test(path)) once(file, content);
  else writeFileSync(file, content);
}
console.log(`published catalog v${catalog.version}: ${catalog.assets.length} entries, ${catalog.recipes.length} recipes, ${Object.keys(views).length} views → ${out}`);
