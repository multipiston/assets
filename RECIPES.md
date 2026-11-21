# Recipes: every asset of a kind in one shape

An entry names one asset (`USD`, `USDC on Base`). A **recipe** names every asset of a kind: «electricity in a European bidding zone for a period», «a share by its ISIN», «a 40 ft container slot between two ports in a week». The values come from open codes, closed lists and the calendar — never from someone's wording — so two agents that mean the same thing build the same definition and get the same ref, and their intents meet. Nobody invents an asset; everybody fills in a recipe.

The catalog publishes its recipes in `catalog.json` (`recipes`), each with a worked example (values, the definition they build and its ref). The cabinet's catalog page («Для агентов → Каталог активов») is the constructor: pick a recipe, fill it in, take the exact definition and ref.

## 1. Amounts are whole numbers

The runtime counts every amount as a whole number of the definition's `unit` (`u128`): no fractions, no floats, no rounding anywhere.

- The `unit` is fixed by the recipe (or by the option chosen, e.g. a currency's minor unit). It is part of the definition: `kWh` and `MWh` are two different assets, so a recipe never leaves the unit open, except a template's explicit unit choice.
- The unit is the smallest step anyone trades: watt-hours become `kWh` (1 MWh = 1000), gold `milli-troy-ounce` (0.001 oz), grain and metals `kg`, chemicals `mg`. A smaller step than the market uses costs nothing (`u128` holds 3.4·10³⁸); a larger one makes a real amount unwritable.
- `decimals` and `display` are presentation only: the cabinet shows `50000` kWh as `50` MWh by moving the decimal comma. `display` must be the unit times 10^`decimals` on the same ladder of `units.json` — the check refuses anything else.
- Prices are not amounts: an intent gives so many atoms of one asset for so many atoms of another; the ratio is exact, never a decimal price.

## 2. Units (`units.json`)

A closed vocabulary: `id → { symbol, name, quantity, base, exp }`. `symbol` is how an amount is marked wherever it is shown — `MWh`, `t`, `troy oz` — one English spelling for every reader; programs and the dashboard show it as it is. Units of one `base` form a ladder of powers of ten (`g`, `kg`, `t`; `Wh`, `kWh`, `MWh`, `GWh`). `atom` (the network's own) and `minor-unit` (the currency's own) have no ladder: their decimals belong to the asset. A new unit is a reviewed edit.

## 3. Open codes (`engine/codes.js`)

A code parameter takes what is typed and returns the one canonical spelling, or refuses it: spaces and case do not matter, the check digit does.

| Check | Standard | Canonical form |
|---|---|---|
| `isin` | ISO 6166, Luhn check digit | `US0378331005` |
| `lei` | ISO 17442, mod 97 | `HWUPKR0MPOU8FGXBT394` |
| `vin` | ISO 3779 | `1HGCM82633A004352` |
| `imo` | IMO ship number, check digit | `9074729` |
| `iso6346` | container number, check digit | `CSQU3054383` |
| `iso3166` | country, alpha-2 (249 codes) | `DE` |
| `unlocode` | UN/LOCODE (country + 3) | `NLRTM` |
| `eic` | ENTSO-E energy identification code, check character | `10Y1001A1001A82H` |
| `mic` | ISO 10383 market identifier | `XCME` |
| `doi` | DOI, lower case | `10.5281/zenodo.3243233` |
| `domain` | DNS name, ASCII (xn--) form | `example.com` |
| `sha256` | content hash, lower-case hex | `e3b0…b855` |
| `inchikey` | IUPAC InChIKey | `LFQSCWFLJHTTHZ-UHFFFAOYSA-N` |
| `gtin` | GS1 GTIN, written as GTIN-14 | `04006381333931` |
| `isbn`, `iswc`, `isrc` | ISO 2108, 15707, 3901 | `9780306406157` |
| `patent` | WIPO ST.3 office + number + ST.16 kind | `US10000000B2` |
| `caip19`, `caip19item` | CAIP-19 (EVM address in lower case) | `eip155:1/erc20:0x…` |
| `iso11784` | animal identification | `643000123456789` |

Only open codes. Licensed registries (CUSIP, CAS, GS1 product data, price-reporting specifications) are not used; their names never come into the catalog. A code's existence is not checked (that would need the registries): the parties answer for it; the format and the check digit are.

## 4. Periods (`engine/periods.js`)

A period becomes the typed terms `mp.start_us`/`mp.end_us` (or the start window, or a deadline): UTC POSIX microseconds, `[start, end)`. Labels:

`2026` · `2026-Q4` · `2026-12` · `2026-W49` (ISO week) · `2026-12-01` · `2026-12-01T13Z` (a UTC hour)

A recipe fixes the **clock** and the hour its **day starts**: European power — `CET` from 00:00 (the coupled market day, Great Britain and Ireland included); EU and UK gas — `CET` from 06:00 (the gas day, the same instant as 05:00 UK time); Henry Hub — `CT` from 09:00; US power — the hub's prevailing local time (`ET`, `CT`, `PT`; MISO `EST`); everything else — `UTC`. Clocks: `UTC`, `WET`, `CET`, `EET` (EU summer time), `ET`, `CT`, `PT` (US summer time), `EST` (Eastern Standard Time all year: the MISO market day). So «December 2026 at TTF» is one pair of numbers for everyone, the 25-hour day included.

## 5. A recipe file (`recipes/<family>.<name>.json`)

```json
{
  "family": "energy.power",
  "name": "Electricity in a European bidding zone",
  "symbol": "POWER",
  "icon": "icons/recipes/power.svg",
  "kind": "Fungible",
  "source": "spec:entsoe-eic",
  "unit": "kWh", "decimals": 3, "display": "MWh",
  "instrument": "{zone}",
  "params": [
    { "id": "zone", "name": "Bidding zone", "type": "choice", "options": [{ "id": "10Y1001A1001A82H", "name": "Germany-Luxembourg", "short": "DE-LU" }], "to": "instrument", "example": "10Y1001A1001A82H" },
    { "id": "period", "name": "Delivery period", "type": "period", "clock": "CET", "day_start": 0, "grains": ["hour", "day", "week", "month", "quarter", "year"], "to": "period", "example": "2026-12" }
  ],
  "note": "Sources …"
}
```

- `type`: `choice` (closed `options`), `code` (`check`), `place` (`authority`: `unlocode`, `iso3166`, `eic`), `text` (`max`, `case`), `period` (`clock`, `day_start`, `grains`), `date`.
- `to`: the `instrument` (a `{param}` in its template), a typed term group — `period`, `window`, `deadline`, `place`, `origin`, `destination`, `object`, `configuration`, `resource`, `meter`, `package` — an opaque term `term:<key>`, or `unit` (a choice whose options are units).
- Fixed `terms` may be given; terms are sorted by key bytes.
- `source` is `spec:` or `registry:` — an issuer's obligation is an entry with its domain's proof, never a recipe. One recipe per domain and source, so a definition reads back to exactly one recipe.
- `regulated: true` marks securities, derivatives and other instruments not everyone may trade; the cabinet says so.
- Every parameter has an `example`; the check builds the example, derives its ref and reads it back to the same values. A published recipe never changes what it builds: only new options may be added at the end of a list (`verify --base`).

## 6. Templates

A family no open code covers completely gets its **template**, derived from the family (`scripts/templates.mjs`), not written by hand: the subject in words (`instrument`), the unit chosen from the family's kind of quantity, and the place and time terms of its section (UN/LOCODE place, UTC period, route, start window, deadline); a family that admits unique items also gets `<family>.form-item` with the item's identifier. Templates are recipes like any other (`template: true`): the same words in the same shape give the same ref. Prefer a family's own recipe; the template is for what no list or code reaches.

## 7. Where the lists come from

Closed lists (bidding zones, gas hubs, crude grades, metal grades, agricultural standard grades, allowance schemes, certificate schemes, GPU models, container types, IP offices, SPDX licences) are taken from the operators, standards bodies and exchanges that define them; each recipe's `note` cites them. A list grows by a reviewed edit that adds options at the end.
