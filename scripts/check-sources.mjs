// Checks the catalog's networks and native coins against their public sources (catalog
// phase 2, automatic reconciliation): no record stands on our word alone.
//   node scripts/check-sources.mjs <registries-dir>
// <registries-dir> holds the sources as downloaded, untouched:
//   chainlist/chains.json              — ethereum-lists/chains (chainid.network)
//   slip44/slip-0044.md                — SatoshiLabs SLIP-0044 coin types
//   namespaces/<namespace>/*.md        — ChainAgnostic namespaces (CAIP-2 / CAIP-19)
// A network the registries cannot settle stands on its reviewed record in network-evidence.mjs.
// Nothing here talks to the network; the sources are data, never run.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NETWORK_EVIDENCE } from "./network-evidence.mjs";
import { assetNetwork, loadSource } from "./source.mjs";

// SLIP-0044 table rows: | coin type | symbol | coin |
export const parseSlip44 = (text) => {
  const rows = new Map();
  for (const line of text.split("\n")) {
    const m = /^\|\s*(\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/.exec(line);
    if (m) rows.set(Number(m[1]), { symbol: m[2], coin: m[3] });
  }
  return rows;
};

const namespaceText = (dir, namespace) => {
  const at = join(dir, namespace);
  if (!existsSync(at)) return null;
  return readdirSync(at).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(at, f), "utf8")).join("\n");
};

// The problems of one catalog against the sources (empty when every record stands).
export const checkSources = (src, sources, evidence = NETWORK_EVIDENCE) => {
  const problems = [];
  const say = (where, what) => problems.push(`${where}: ${what}`);
  const chains = new Map(sources.chains.map((c) => [`eip155:${c.chainId}`, c]));
  for (const id of Object.keys(src.networks)) {
    const [namespace, reference] = id.split(":");
    const record = evidence[id];
    if (record) {
      // The registry must still say what the record was reviewed against.
      const held = namespace === "eip155" ? (chains.get(id)?.name ?? null) : null;
      if (held !== record.chainlist) say(`networks.json ${id}`, `ethereum-lists/chains now says ${held ?? "nothing"}: review network-evidence.mjs`);
    } else if (namespace === "eip155") {
      const c = chains.get(id);
      if (!c) say(`networks.json ${id}`, "not in ethereum-lists/chains");
      else if (c.status === "deprecated") say(`networks.json ${id}`, "deprecated in ethereum-lists/chains");
    } else {
      const text = sources.namespace(namespace);
      if (text === null) say(`networks.json ${id}`, `no CAIP namespace ${namespace}`);
      else if (!text.includes(id) && !text.includes(`\`${reference}\``)) say(`networks.json ${id}`, `not in the ${namespace} namespace documents`);
    }
  }
  for (const e of src.entries) {
    const native = /^(.+)\/slip44:(\d+)$/.exec(e.definition?.instrument ?? "");
    if (e.definition?.source !== "spec:caip19" || !native) continue;
    const at = e.__file, network = assetNetwork(e.definition), type = Number(native[2]);
    const symbols = [e.symbol, ...(e.aliases ?? [])].map((s) => s.toUpperCase());
    const row = sources.slip44.get(type);
    if (!row) say(at, `coin type ${type} is not in SLIP-0044`);
    else if (!symbols.includes(row.symbol.toUpperCase())) say(at, `SLIP-0044 ${type} is ${row.symbol}: not this symbol or a former one`);
    const record = evidence[network];
    if (record) {
      if (record.native.decimals !== e.decimals) say(at, `decimals ${e.decimals}, network-evidence.mjs says ${record.native.decimals}`);
      if (!symbols.includes(record.native.symbol)) say(at, `native ${record.native.symbol} in network-evidence.mjs`);
    } else if (network?.startsWith("eip155:")) {
      const c = chains.get(network);
      if (!c) continue;
      const coin = c.nativeCurrency;
      if (coin.decimals !== e.decimals) say(at, `decimals ${e.decimals}, ethereum-lists/chains says ${coin.decimals}`);
      if (!symbols.includes(String(coin.symbol).toUpperCase())) say(at, `native ${coin.symbol} in ethereum-lists/chains`);
      if (c.slip44 !== undefined && c.slip44 !== type) say(at, `ethereum-lists/chains gives coin type ${c.slip44}`);
    }
  }
  return problems;
};

export const loadSources = (dir) => ({
  chains: JSON.parse(readFileSync(join(dir, "chainlist/chains.json"), "utf8")),
  slip44: parseSlip44(readFileSync(join(dir, "slip44/slip-0044.md"), "utf8")),
  namespace: (n) => namespaceText(join(dir, "namespaces"), n),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node scripts/check-sources.mjs <registries-dir>");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const problems = checkSources(loadSource(root), loadSources(dir));
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("every network and native coin stands on its source — ok");
}
