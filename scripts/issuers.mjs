// An entry with source issuer:<domain> is published only if that domain lists its token in
// https://<domain>/.well-known/multipiston-assets.json — { "tokens": ["af1:…", …] }.
// This proves control of the domain for the catalog entry, not the right to issue the asset.
// The only check that uses the network; CI runs it next to verify.
import { fileURLToPath } from "node:url";
import { loadSource } from "./source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const problems = [];
for (const e of loadSource(root).entries) {
  const source = e.definition?.source ?? "";
  if (e.status === "draft" || !source.startsWith("issuer:")) continue;
  const domain = source.slice("issuer:".length).split("/")[0];
  if (!DOMAIN.test(domain)) { problems.push(`${e.__file}: issuer:<domain> — a lower-case DNS name`); continue; }
  try {
    const res = await fetch(`https://${domain}/.well-known/multipiston-assets.json`, { redirect: "error", signal: AbortSignal.timeout(10000) });
    const body = res.ok ? await res.json() : null;
    if (!Array.isArray(body?.tokens) || !body.tokens.includes(e.ref.token)) problems.push(`${e.__file}: ${domain} does not list ${e.ref.token}`);
  } catch (err) {
    problems.push(`${e.__file}: ${domain}: ${err.message}`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("issuer domains — ok");
