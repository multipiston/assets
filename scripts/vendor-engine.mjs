// Copies the engine (@multipiston/catalog) into a consumer's source tree, such as the cabinet's
// src/vendor/multipiston-catalog: the same files as the release, untouched, and VERSION.json naming
// the package version, the catalog release and each file's sha256 — so a vendored copy is checkable.
// Usage: node scripts/vendor-engine.mjs <dir>
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: node scripts/vendor-engine.mjs <dir>");
const engine = join(root, "engine");
const files = readdirSync(engine).filter((f) => /\.(js|d\.ts)$/.test(f) || f === "README.md").sort();
// The copy is replaced whole: a file the engine dropped does not linger.
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const sums = {};
for (const f of files) {
  copyFileSync(join(engine, f), join(dir, f));
  sums[f] = createHash("sha256").update(readFileSync(join(engine, f))).digest("hex");
}
const pkg = JSON.parse(readFileSync(join(engine, "package.json"), "utf8"));
const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8"));
writeFileSync(join(dir, "VERSION.json"), `${JSON.stringify({ package: pkg.name, version: pkg.version, catalog: release.version, files: sums }, null, 2)}\n`);
console.log(`${pkg.name} ${pkg.version} (catalog v${release.version}) → ${dir}`);
