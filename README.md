# multipiston-catalog

The Multipiston asset catalog: exact asset definitions, recipes that describe every asset of a kind in one shape, 200 families and the rules for agents and programs. In English only. This repository is the source of truth; the site, the cabinet and agents read only signed releases.

**The catalog is a dictionary, not a permission.** The market accepts any valid asset definition. The catalog exists so that everyone describes one item the same way, and so that the item has a name and an icon. The runtime does not read the catalog.

## What is here

| Path | What it is |
|---|---|
| `entries/<id>.json` | One file, one asset: status, family, symbol, English name, `ref` and definition |
| `recipes/<family>.<name>.json` | One recipe: every asset of a kind from open codes, closed lists and periods (`RECIPES.md`); a family no code covers gets its template, derived by `scripts/templates.mjs` |
| `units.json` | Units of amounts: every amount is a whole number of one; ladders of powers of ten for display |
| `RECIPES.md` | Recipes: whole-number amounts, units, code checks, periods, the file format, templates |
| `families.json` | 25 sections and 200 families: the template's domain, kinds, `source` prefixes, typed terms `mp.*` |
| `networks.json` | The networks of on-chain assets: CAIP-2 id → English name; published as `networks`, each asset's `network` |
| `release.json` | Number and date of the current release |
| `icons/<id>.svg` | The asset's own icon (optional) |
| `icons/recipes/<sign>.svg` | The catalog's own signs of recipes and templates (energy, metals, grain, GPU, ships, shares, …) |
| `vectors/runtime-codec.json` | A reference definition and its ref, for the SDK tests |
| `schema/catalog.schema.json` | JSON Schema of the published file |
| `site/agents.html`, `openapi.json`, `llms.txt` | Rules for agents (the body of their page), the API and the index → `/agents.html`, `/openapi.json`, `/llms.txt` |
| `CONTRIBUTING.md` | How to describe an asset, same asset or a new one, how to propose |
| `engine/` | `@multipiston/catalog` — the rules as code: the definition codec, open codes, periods, recipes, amounts, a verified catalog (`engine/README.md`). The checks, the cabinet and the SDK are this one package |
| `scripts/` | `verify` — checks, `build` — publishing (`publication` — the views and the manual), `proposal` — the check of a proposal issue, `vendor-engine` — the engine into a consumer's tree, `icon-disc` — an open-set logo onto the catalog disc, `check-sources` — networks and native coins against chainlist, SLIP-0044 and the CAIP namespaces (`network-evidence` — the reviewed records of networks the registries cannot settle), `issuers` — issuer domains, `iso4217` — the ISO 4217 code list, `recipes` / `templates` — the authoring rules of recipes |
| `.github/` | The issue forms (a new asset, a change, a recipe) and the workflows: `verify`, `proposal`, `release` |

## How it works

1. A proposal — an issue form, or a pull request with `entries/<id>.json` (`draft`) or `recipes/<id>.json`. A bot checks each proposal issue by the rules of a pull request, answers on the issue and opens a draft pull request when it is clean.
2. CI: tests, every source rule, a comparison with the previous release, issuer domains. Nothing is merged automatically.
3. Maintainers check the meaning (CONTRIBUTING.md, section 8), list the entry and merge.
4. A release is a signed tag `vN`: a repeatable build → minisign signature after the owner approves → GitHub Release with the catalog and the SDK tarball → a pull request into the site repository with the public files and the vendored engine.
5. The site serves `/catalog/catalog.json` and the same file at the fixed address `/catalog/vN/catalog.json`, the views and the manual; the cabinet embeds the catalog in its build and computes with the same engine.

## Public files

| Address | What |
|---|---|
| `/catalog/catalog.json` | The current release: sections, families, units, recipes (each with a worked example), `listed` and `retired` assets |
| `/catalog/vN/catalog.json` | The same release at an address that never changes |
| `/catalog/catalog.json.sha256`, `.minisig` | Hash and signature |
| `/catalog/icons/<id>-<hash>.svg` | Icons at content addresses: a new icon is a new address |
| `/catalog/catalog.schema.json` | JSON Schema |
| `/catalog/latest.json` | The current version, its fixed address and sha256 — where a program starts |
| `/catalog/index.json` | Sections → families → recipes, the units, the address of every file |
| `/catalog/entries.json`, `/catalog/entries/<id>.json` | Every entry in one line; one entry whole |
| `/catalog/recipes/<id>.json`, `.md` | One recipe as data and as a card for a reader with little context |
| `/catalog/vectors.json` | Conformance: the codec, its refusals, open codes, periods, amounts, every recipe example |
| `/catalog/changes.json`, `/catalog/changes/vN.json` | What a version changed |
| `/catalog/index.html`, `describe.html`, `sections/`, `recipes/<id>.html` | The manual for people: static pages, no script; `sitemap.xml` when built with `--site` |
| `/catalog/build.html`, `/catalog/build.js`, `/catalog/engine/` | Build an asset: a recipe's values or any definition → its exact ref, in the browser — the one interactive page, over the engine published beside it (with the files it imports and their licences) |
| `/agents.html`, `/openapi.json`, `/llms.txt` | Rules for agents, the API, the map for language models |

Earlier versions and icons are never deleted: an old link keeps working.

## How to check a release

1. The signature `catalog.json.minisig` — with the Multipiston public key: it is given here and in `/agents.html` (the owner creates the key; until then releases are unsigned).
2. `version` is not lower than the one already known.
3. Every `ref` is recomputed from its `definition` (`engine/definition.js`).
4. Repeatability: `node scripts/build.mjs <dir>` on the tag gives the same bytes.

## Commands

```
npm ci
npm test                                # refs as the market derives them, rules, icons, releases, schema
npm run verify                          # the source
node scripts/verify.mjs --base <catalog.json>   # and what a change does to the previous release
node scripts/build.mjs <dir> [--site <https origin>]   # the public files, the views and the manual
node scripts/proposal.mjs <event.json> <out>          # the check of a proposal issue (the bot runs it)
node scripts/vendor-engine.mjs <dir>                  # the engine with VERSION.json into another tree
```

In the cabinet, `npm run catalog:sync` builds the files straight into `frontend/public` and vendors the engine into `src/vendor/multipiston-catalog`.

## Licenses

Icons of open sets are copied unmodified, and each entry's `note` names its file: crypto assets — [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) 0.18.1 (CC0-1.0) and [web3icons](https://github.com/0xa3k5/web3icons) 4.0.58 (MIT); national currencies — [circle-flags](https://github.com/HatScripts/circle-flags) 2.8.3 (MIT). The signs of recipes and a few currencies and stablecoins are drawn for this catalog. The catalog's own data, signs and engine are licensed under the Apache License 2.0 (`LICENSE`).
