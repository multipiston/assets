# @multipiston/catalog

Use the asset SDK to choose a catalog entry, fill in a recipe or prepare your own asset for an API request. It returns the `definition` and `{ chain, token }` reference you send to MultiPiston.

Install `multipiston-catalog-<version>.tgz` from a catalog release. On the catalog website, browser modules are available at `/catalog/engine/index.js`.

## Choose an asset

```js
import { loadCatalog } from "@multipiston/catalog";

const catalog = loadCatalog(await (await fetch("https://<site>/catalog/catalog.json")).json());
if (catalog.dropped.length) throw new Error("Reload the catalog before publishing");

const asset = catalog.assets.find((entry) => entry.id === "usdc" && entry.status === "listed");
if (!asset) throw new Error("Choose a listed asset");
const { definition, ref } = asset;
```

Choose crypto assets by network as well as name. Copy an entry's `definition` and `ref` together. For a retired entry, use its `replaced_by` entry when available.

## Fill in a recipe

```js
const built = catalog.build("money.cash.banknotes", { currency: "EUR", city: "DEBER" });
if (!built.ok) throw new Error(`Check these parameters: ${built.invalid.join(", ")}`);
const { definition, ref } = built;
```

Each recipe lists its parameters, accepted values, unit and an example. Use its family template if no specific recipe fits. You can also fill in a recipe at `/catalog/build.html`.

## Prepare your own asset

```js
import { deriveAsset, sortTerms } from "@multipiston/catalog";

const definition = {
  version: 1,
  domain: "other.custom",
  instrument: "widget-7",
  source: "spec:acme",
  kind: "Fungible",
  unit: "item",
  terms: sortTerms([{ key: "colour", value: "red" }]),
};
const ref = deriveAsset(definition);
```

Use the family's domain when one fits. `source` names the standard (`spec:`), issuer (`issuer:`) or registry (`registry:`). `Fungible` is counted by amount; `Unique` is one specific item with amount `"1"`. Term keys must be unique; use `sortTerms` before `deriveAsset`.

Keep the price, amount, payment details and secrets out of the definition. Describe only the asset's fixed properties. Required place, route, period and capacity fields are listed at `/catalog/describe.html`.

`deriveAsset` throws when a definition needs correction. `DEFINITION_ERRORS[error.message]` explains the field rule to fix. Correct it before publishing.

## Prepare an amount

Amounts are positive whole numbers of the asset's `unit`, sent as strings. Display decimals do not change that unit.

```js
import { toAtoms, fromAtoms } from "@multipiston/catalog";

toAtoms("12.5", 3);     // "12500"
toAtoms("12.5004", 3);  // null: choose an amount in whole units
fromAtoms("12500", 3); // "12.5"
```

## Send to MultiPiston

Use `ref.chain` and `ref.token` in the intent's `have`, `want` or `want_any_of`. Include each referenced asset's definition once in `asset_definitions`, and a receive route for each asset you accept. Follow `/agents.html#publishing` for `prepare`, `commit` and recovery with `reconcile`.
