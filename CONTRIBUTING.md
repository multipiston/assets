# How to describe an asset and add it to the catalog

The catalog is a shared dictionary, not a permission. The Multipiston market accepts **any** valid asset definition, in the catalog or not. The catalog exists so that everyone describes the same item the same way (then the intents of different participants meet), and so that the item has a name, a symbol and an icon.

The catalog is **English only**: every section, family and entry has one English `name`, and every description is English. The cabinet translates its own words (such as section titles); asset names and symbols are shown as the catalog gives them.

**An asset's identity is only its ref** (`chain` + `token`). Name, symbol, icon, decimals and note are presentation: they may change and the asset stays the same.

## 1. Described assets only

Every catalog asset is a **definition** of the seven fields of AssetDefinition1; its ref is `chain` = `domain`, `token` = `af1:` (fungible) or `au1:` (unique) followed by an identifier of the definition that the SDK computes (`deriveAsset`). There is no other kind of settled asset: a receiving route and a ticket leg accept only `af1:`/`au1:` tokens. Network references like `native:eth` or `erc20:0x…` (chain `evm:<id>` only) are accepted in an intent, but a deal on them will not settle; that is why crypto assets in the catalog are described too (section 2, "Crypto assets").

## 2. How to write a definition

Seven fields. The SDK derives the ref exactly as the market does; the tests check it against a reference vector (`vectors/runtime-codec.json`).

| Field | Catalog rule |
|---|---|
| `version` | `1` |
| `domain` | **the family's domain** from `families.json`: its `domain`, else its `id` — for example `parts.cutting-tool` |
| `instrument` | What exactly: model, part number, class, kind of right. Lower-case Latin letters, digits and hyphens: `gpu-hour`, `rpg-22-16`, `wheat-class-3`. An item defined by an outside standard is written the way that standard writes it: a CAIP-19 id, an ISO 4217 code |
| `source` | Who gives the item its meaning — one of the three prefixes below |
| `kind` | `Fungible` — the receiver accepts any two units as the same. `Unique` — a specific item, amount 1 |
| `unit` | The smallest unit of delivery: `g`, `mL`, `Wh`, `W`, `piece`, `set`, `hour`, `request`, `gb-month`, `seat` |
| `terms` | Only essential fixed properties. `key`/`value` pairs, keys distinct and in ascending byte order |

Why `domain` = the family's domain: two agents describing one item must get one ref, and `domain` is part of the ref. The template sets `domain` in advance, so nobody has to guess it. For most families the domain is their `id`. Several families share one domain when that is less ambiguous: stablecoins, wrapped tokens and pool shares are `crypto.token`, because by the on-chain standard they are just tokens. `domain` is chosen by the meaning of the item.

### `source` — three prefixes

| Prefix | When | Example |
|---|---|---|
| `spec:<who>` | A standard item: anyone can deliver it to that specification | `spec:iso4217`, `spec:caip19`, `spec:gost-18877-73`, `spec:multipiston` (the meaning is set by this catalog entry) |
| `issuer:<domain>` | An obligation of a specific issuer or obligor: a deposit, a voucher, service credits, a bond | `issuer:example-bank.com` |
| `registry:<registry>` | A right or object recorded in an external registry: land, quotas, patents | `registry:eu-ets`, `registry:rosreestr` |

Nobody may pass off their own obligation as someone else's: an entry with `issuer:circle.com` is added to the catalog only by Circle (section 6).

### Crypto assets

One spelling per asset — its [CAIP-19](https://chainagnostic.org/CAIPs/caip-19) id, for any chain and without runtime rules:

| What | `domain` (family) | `instrument` |
|---|---|---|
| A chain's native coin | `crypto.coin` | `eip155:1/slip44:60` (ETH), `bip122:000000000019d6689c085ae165831e93/slip44:0` (BTC) |
| Token | `crypto.token` (families `crypto.token`, `crypto.stablecoin`, `crypto.backed-token`, `crypto.pool-share`, `crypto.wrapped`) | `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| NFT | `crypto.nft` | `eip155:1/erc721:0x…/<id>` |
| Multi-token | `crypto.multi-token` | `eip155:1/erc1155:0x…/<id>` |

Always `source` = `spec:caip19`, `unit` = `atom` (the chain's smallest unit: wei, satoshi), `terms` = `[]`; an EVM address in lower case, a token id in decimal. `decimals` in the entry is for display. The check (`scripts/source.mjs`) lets no other spelling through, and `spec:caip19` only in the crypto section.

Where the identifiers come from: the chain id from the [ChainAgnostic namespace](https://namespaces.chainagnostic.org/) of the chain (`bip122`, `eip155` with the [ethereum-lists/chains](https://github.com/ethereum-lists/chains) registry, `solana`, `tron`, `xrpl`, `stellar`, …); a native coin by its [SLIP-0044](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) coin type (CAIP-20); a token's contract or mint address **only from the issuer's own documentation**. Write the source URL into the entry's `note`. If a chain's namespace defines no asset namespace for its tokens (Tron TRC-20 today), its tokens wait.

**A network's native coin** is `<CAIP-2 id>/slip44:<coin type>`, family `crypto.coin`, one per network. The coin type is the native coin's own SLIP-0044 entry — its symbol, or a former one kept in `aliases` (`POL` with `MATIC`, `GRAM` with `TON`, `AVAX` with `AVAXC`); a coin with no SLIP-0044 entry (or a one-letter ticker) waits. A rollup whose native coin is ETH over its canonical bridge lists `ETH` / `Ether` on its own network, coin type 60. `decimals`: for an EVM chain as ethereum-lists/chains gives them (or its record in `scripts/network-evidence.mjs`); otherwise from the network's own documentation, cited in `note`. A network is added to `networks.json` only as its mainnet (the namespace documents list test networks too — check which is which), and leaves with its coin when the network closes.

**Reconciliation with the sources.** `node scripts/check-sources.mjs <registries-dir>` checks every network and native coin against the sources as downloaded (ethereum-lists/chains `chains.json`, SLIP-0044 `slip-0044.md`, the ChainAgnostic namespaces): the chain exists and is not deprecated, the coin type exists and names this symbol or a former one, an EVM coin's decimals and symbol agree. A network the registries cannot settle — its id held by a test network in ethereum-lists/chains (HyperEVM `eip155:999`), or a Cosmos chain the namespace documents do not list (dYdX Chain) — stands on its reviewed record in `scripts/network-evidence.mjs`: the network's own answer to the check its namespace defines (`eth_chainId`; the Cosmos `node_info` network), its operators' documentation and its native coin. The record also names what the registry says today, so a change there fails the check until the record is reviewed. Run it before every release; the reviewer still confirms mainnet ids by eye.

**One token on several networks** is a separate asset on each network — its own entry and ref; they never meet or stand in for each other. The entries share the icon, the `symbol` and the `name` (`USDC`, `USD Coin`); the published `network` (the CAIP-2 part of the CAIP-19 id, named in `networks.json`) tells them apart. Add a network to `networks.json` before its first asset. A symbol or a name used on another network must be the same token's — the same symbol, name and family; a bridged or wrapped issue is another token (`crypto.wrapped`) with a symbol of its own (`USDC.e` → `USDCE`). A token id is decimal without leading zeros; an ERC-1155 id is `Fungible`.

### National currencies (ISO 4217)

A national currency has exactly one definition, so that every agent paying or wanting dollars gets the same ref:

| Field | Value |
|---|---|
| family | `money.bank-transfer` — money paid to the receiver's details from the ticket's receive route; the details never make a new currency |
| `domain` | `money.bank-transfer` (the family's) |
| `instrument` | the ISO 4217 alphabetic code, in capitals: `USD`, `EUR`, `JPY` |
| `source` | `spec:iso4217` |
| `kind` | `Fungible` |
| `unit` | `minor-unit` — the currency's ISO 4217 minor unit: a cent, a penny, a kopeck; for a currency whose minor unit is 0 (`JPY`, `KRW`) the yen or won itself |
| `terms` | `[]` |
| `decimals` | the ISO 4217 minor unit (exponent) of the code: `2` for USD, `0` for JPY, `3` for KWD |
| `symbol`, `name` | the code; the [Unicode CLDR](https://cldr.unicode.org/) English name of the code (`US Dollar`, `Japanese Yen`, `Afghan Afghani`; `new Intl.DisplayNames(["en"], { type: "currency" })`), its case corrected where CLDR has only a draft (`Caribbean Guilder`) and a letter outside Latin script spelt plainly (`Tongan Pa'anga`). `note` keeps the ISO 4217 name and the CLDR version |

```json
{"version":1,"domain":"money.bank-transfer","instrument":"USD","source":"spec:iso4217","kind":"Fungible","unit":"minor-unit","terms":[]}
```

So `"12345"` USD is 123.45 dollars. Every code of the list is in the catalog. The codes and exponents are those of ISO 4217 List One (`scripts/iso4217.mjs`, with its publication date); fund codes (`USN`, `CHE`, …) and codes without a minor unit (`XAU`, `XDR`, …) are not currencies here. The check refuses any other spelling, unit, family, terms or decimals. Cash as a physical item (`money.cash`), e-money, deposits and other claims on a specific issuer are other assets with their own sources — not `spec:iso4217`.

### Units and amounts

- An intent's amount is a whole number of `unit`s, without fractions: 1.5 kg with `unit` = `g` is `1500`.
- Different `unit`s are different assets: "gram of copper" and "kilogram of copper" will not meet. Choose the smallest unit actually delivered.
- `decimals` in the catalog is display only: `USDC` with `decimals: 6` shows `1000000` as `1`.
- "Fungible" does not mean "divisible": a bolt is `Fungible` in pieces, there is no half bolt.

### Typed terms (`mp.*`)

The runtime understands and checks these keys: place, route, period, start window and capacity are filled in whole or not at all; the deadline and each exact identifier stand alone. Ids and units are never empty. Time is UTC POSIX microseconds — whole decimal numbers without leading zeros, at most 2^63 − 1 — with start < end, the start window inside the period (from < to), the deadline ≥ end and > the window's start; `mp.concurrent_units` > 0. A definition that breaks them is refused (`asset_terms`).

| Group | Keys | For |
|---|---|---|
| Place | `mp.place_authority`, `mp.place_id` | a warehouse, a delivery point, a network node, a site |
| Route | `mp.origin_authority`, `mp.origin_id`, `mp.destination_authority`, `mp.destination_id` | transport |
| Period | `mp.start_us`, `mp.end_us` | [start, end): energy delivery, a rental, a slot |
| Start window | `mp.start_window_from_us`, `mp.start_window_to_us` | when work or a trip may start |
| Deadline | `mp.provision_complete_by_us` | by when the result is due |
| Capacity | `mp.capacity_unit`, `mp.concurrent_units` | how many units at once: cores, MW, racks |
| Object, each key alone | `mp.object_id`, `mp.object_version` | a serial, cadastral or registry number; its version |
| Configuration, resource, meter, package — each alone | `mp.configuration_id`, `mp.resource_id`, `mp.meter_id`, `mp.package_id` | an exact configuration, a machine/cluster, a metering point, a kit |

These are stated conditions, not checks: the runtime does not look at clocks, warehouses or registries. Your own keys are lower-case Latin, digits and `_` (`gpu`, `drawing_revision`, `grade`); their values are compared byte for byte. `mp.` is Multipiston's prefix: a key under it that is not in this table is refused by the catalog check.

### What a definition never holds

The price, the offered amount, the current seller of a standard good, a publication date, random numbers, a session id, keys, the receiver's payment details. Price and amount go in the intent, payment details in `receive_routes`.

### Recipes before entries

Most assets are not entries but recipes (`RECIPES.md`): electricity in a bidding zone for a period, a share by ISIN, a container slot between two ports. Before proposing an entry, look for the family's recipe; a new kind of asset that many will trade the same way is a new recipe (`recipes/<family>.<name>.json`), a new item of an existing list is a new option at the end of its list. A recipe's every parameter has an `example`; the check builds it, derives its ref and reads it back. Recipe signs live in `icons/recipes/` (the catalog's own set: a coloured circle, the white sign drawn with stroked paths).

## 3. Same asset or a new one

| Situation | Decision |
|---|---|
| Another seller of the same standard good | **The same** asset (`source: spec:…`) |
| Another drawing revision, material, tolerance, grade | A new asset |
| An obligation of a specific company (deposit, voucher, service credits) | `issuer:<domain>`: each issuer has its own asset |
| A specific thing: a watch with a serial number, a machine, a plot | `Unique`, `mp.object_id` (an on-chain NFT: its CAIP-19 id, no terms) |
| A share of a thing | A separate share asset (`Fungible`), not a fraction of a `Unique` |
| Equipment time, a slot, capacity | `mp.resource_id` + a period or window; each window is its own asset |
| Transport | route + start window |
| A standard kit | `other.kit` + `mp.package_id`; a composite unique lot — `other.lot` |
| Any of several variants will do | Not a new asset: list the variants in the intent's `want_any_of` (up to 64) |
| Nothing fits | `other.custom` |
| The same token on another network | A new asset with the same symbol and name, its own network (section 2, "Crypto assets") |
| A new price, icon, name | **Not** a new asset |

A definition issues, mints and reserves nothing by itself. It says **what** is transferred; the participants transfer it outside Multipiston, by the ticket.

## 4. Asset icons

The cabinet shows an asset's icon in this order:
1. The catalog entry's own icon.
2. The section icon of the entry's family (25 icons, in the cabinet).
3. An asset **not in the catalog**: the section icon for its `domain` (when that is a domain from `families.json`), otherwise the kind icon — "fungible" or "unique" — in a muted colour, with the author's own words as the label: the cabinet does not pass them off as a checked name.

An own icon:
- SVG with a square `viewBox`, up to 16 KB;
- shapes only: `path`, `circle`, `rect`, `g`, gradients, masks; no text, `class`, `style`, scripts, images or external references (`scripts/svg.mjs`) — a file that fails is simplified, the check is never loosened;
- a round face: a disc that fills the square `viewBox` — the dashboard draws the icon as the whole round mark, 26 px in a row and 40 px in a ticket, on the dark background `#0B1215`, and must read at 26 px;
- crypto assets, the first that has one: the open [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) set (CC0-1.0, `svg/color/<symbol>.svg`); the open [web3icons](https://github.com/0xa3k5/web3icons) set (MIT, `tokens/branded/<SYMBOL>.svg`); for a native coin, its network's icon in web3icons (`networks/branded/<network>.svg`). Shapes are copied unmodified; only the `class` and `style` attributes go (the one style is `mask-type:luminance`, the default). A logo without its own full circle (every web3icons token so far) is put on the catalog disc by `node scripts/icon-disc.mjs icons/<id>.svg`: the shapes stay as they are, over a slate disc (`#39434b`) at 90%; a logo that is itself a centred circle is scaled to fill it. One token on several chains uses the same icon;
- national currencies — the round flag of the country the code begins with (ISO 4217 codes start with the ISO 3166 country code; `EUR` — the flag of the European Union) from the open [circle-flags](https://github.com/HatScripts/circle-flags) set (MIT, `flags/<country>.svg`, unmodified);
- the catalog's own sign when no open set has the asset: a currency of a union without a flag (`XAF`, `XOF`, `XPF` — the franc sign; `XCD` — the dollar sign; `XCG` — the guilder sign) and a stablecoin without an open icon (`RLUSD`, `USDG`, `USDP`, `USDS` — the dollar sign): a coloured circle with the white sign drawn as stroked paths, `viewBox="0 0 32 32"`, stroke width 2.5;
- any other brand logo — only from the brand owner or with its permission. No permission — the section icon.

The source of every icon (set, version, path) is written into the entry's `note`.

## 5. Statuses and what never changes

| Status | Published | Allowed |
|---|---|---|
| `draft` | no | change anything, delete |
| `listed` | yes | change `name`, `icon`; `symbol` only by moving the old one to `aliases`; retire |
| `retired` | yes, forever | nothing but presentation; `replaced_by` — the replacement |

Once published, `ref`, `definition`, `kind` and `decimals` never change. An entry cannot be deleted, and a symbol (including former ones) cannot be given to another token: within a network it names one asset, across networks one token. A retired asset stays in the file so that old tickets are shown with a name. CI checks every change against the previous release (`verify --base`).

## 6. Issuers

An entry with `source: issuer:<domain>` is published only if the domain serves `https://<domain>/.well-known/multipiston-assets.json`:

```json
{ "tokens": ["af1:…"] }
```

CI checks this (`scripts/issuers.mjs`). It proves control of the domain for the **catalog entry**. It does not give or replace the right to issue the asset in the market.

## 7. How to propose

- **An issue form** on GitHub — if you do not write code: *Propose an asset* (a new entry), *Change or retire an asset*, *Propose a recipe* (a new recipe or new options of one). The catalog's [Build an asset](/catalog/build.html) page opens the first one with the definition filled in.
- **A pull request** — the file `entries/<id>.json` with status `draft` (+ `icons/<id>.svg`), or `recipes/<id>.json`. `ref` can be anything: the check prints the right one.

A bot checks every proposal issue on each open and edit (`.github/workflows/proposal.yml`, `scripts/proposal.mjs`): it turns the form into the files it would change, applies them to a copy of the source and runs the rules of a pull request — the source checks and the comparison with the catalog as it stands. It keeps one comment on the issue with the exact ref and every problem. A clean proposal gets a draft pull request from the branch `proposal/<issue>`: a new entry in it is a `draft`. The bot never lists or merges anything — the reviewer does (§8). The issue text is only ever data: it becomes the files above, under the paths the rules allow, and never reaches a shell.

```
npm ci
npm test
npm run verify
```

## 8. Reviewer checklist

1. Not a duplicate: no entry with the same meaning in other words (`gpu-hour` / `gpu_hour`, `hour` / `hr`). The main manual check.
2. `domain` is the family's, `source` has the right prefix, `terms` hold only what is essential.
3. The symbol and name do not mislead and do not imitate someone else's brand; the name is plain English.
4. The icon is a disc filling its square and reads at 26 px, its rights are confirmed.
5. For an issuer — the file on the domain.
6. Identifiers from outside standards (CAIP-19, ISO 4217) are checked against their sources, and the source URL is in the `note`; `scripts/check-sources.mjs` passes on freshly downloaded registries, and a network id is its mainnet.
7. `draft` → `listed` only with an answer to "who will trade this". Drafts nobody came for are deleted.
