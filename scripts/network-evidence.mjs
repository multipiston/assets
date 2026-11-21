// Networks the downloaded registries cannot settle, with what settles them: the network's own
// answer to the check its CAIP namespace defines, and its operators' documentation. A reviewed
// edit here, like a new ISO 4217 list; check-sources.mjs reads it in place of the registry.
//   chainlist — what ethereum-lists/chains says of this id today (a test network holding the
//               number); if the registry changes, the check fails until this record is reviewed
//   native    — the native coin as the network documents it (symbol, decimals)
//   evidence  — where the id and the coin were confirmed
export const NETWORK_EVIDENCE = {
  "eip155:999": {
    chainlist: "Wanchain Testnet",
    native: { symbol: "HYPE", decimals: 18 },
    evidence: [
      "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm — Mainnet, Chain ID: 999; HYPE is the native gas token, 18 decimals",
      "eth_chainId via https://rpc.hyperliquid.xyz/evm returned 0x3e7 on 2026-11-01",
      "https://developers.circle.com/stablecoins/usdc-contract-addresses — HyperEVM",
    ],
  },
  "cosmos:dydx-mainnet-1": {
    chainlist: null,
    native: { symbol: "DYDX", decimals: 18 },
    evidence: [
      "node_info network = dydx-mainnet-1 via https://dydx-rest.publicnode.com on 2026-11-01 (the check of namespaces cosmos/caip2.md)",
      "denom metadata adydx: exponent 0 adydx, exponent 18 dydx, on the same node",
    ],
  },
};
