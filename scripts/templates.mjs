// The template of a family (RECIPES.md §6): one rule, not 288 files. For every family that no
// open code covers completely, the catalog derives a recipe from the family itself — the subject
// in words, the unit of the amount and the place and time terms of its section — so that an asset
// of any kind is described in one shape and two agents writing the same words get the same ref.
// Derived at load time from families.json; checked and published like any other recipe.

// Families whose own recipes cover every asset of them: no template.
export const COVERED = new Set([
  "money.bank-transfer", "money.cash",
  "crypto.coin", "crypto.token", "crypto.stablecoin", "crypto.backed-token", "crypto.pool-share", "crypto.wrapped", "crypto.nft", "crypto.multi-token",
  "equity.common", "equity.preferred", "equity.etf", "equity.reit", "equity.receipt",
  "debt.t-bill", "debt.gov-bond", "debt.corp-bond", "debt.muni-bond",
  "machines.vehicle", "machines.vessel", "machines.container", "compute.domain-name",
]);
// The unit choices a family's unit hint allows (units.json ids).
const UNIT_NAMES = {
  g: "gram", kg: "kilogram", t: "tonne", l: "litre", m3: "cubic metre", kWh: "kilowatt-hour", MWh: "megawatt-hour",
  item: "item", hour: "hour", m2: "square metre", ha: "hectare",
};
const COUNTS = ["piece", "1", "item", "kit", "animal", "batch", "slot", "package", "unit", "share", "contract", "receipt", "test", "operation",
  "set", "roll", "interest", "right", "warrant", "claim", "issue", "system", "program", "pallet-day", "container"];
const unitsFor = (hint) => {
  const out = new Set();
  for (const w of (hint ?? "undefined").split(/[/ ]/)) {
    if (w === "mass") ["g", "kg", "t"].forEach((u) => out.add(u));
    else if (w === "volume") ["l", "m3"].forEach((u) => out.add(u));
    else if (w === "energy") ["kWh", "MWh"].forEach((u) => out.add(u));
    else if (w === "area") ["m2", "ha"].forEach((u) => out.add(u));
    else if (COUNTS.includes(w)) out.add("item");
  }
  if (!out.size) ["item", "kg", "t", "l", "m3", "kWh", "hour", "m2"].forEach((u) => out.add(u));
  return [...out].map((u) => ({ id: u, name: UNIT_NAMES[u], unit: u }));
};
// Each section's sign and the terms its template asks for (place and time only: the rest is in the subject).
const SECTION = {
  money: { icon: "bank", terms: [], example: "Term deposit, 12 months, fixed rate" },
  equity: { icon: "share", terms: [], example: "Class A interest, 1% of the company" },
  debt: { icon: "bond", terms: [], example: "Invoice 2026-118 of the obligor" },
  contingent: { icon: "option", terms: ["period"], example: "Policy 77-12345, claim of 2026-10-02" },
  metals: { icon: "base-metal", terms: ["place", "period"], example: "EN 10025 S355JR plate, 20 mm" },
  chem: { icon: "chemical", terms: ["place", "period"], example: "PET bottle grade resin, IV 0.80" },
  agro: { icon: "grain", terms: ["place", "period"], example: "Hass avocados, class I, 4 kg cartons" },
  bio: { icon: "timber", terms: ["place"], example: "Pine sawn timber, 50x150 mm, kiln dried" },
  parts: { icon: "steel", terms: ["place"], example: "Steel casting to drawing 1234 rev B" },
  machines: { icon: "car", terms: [], example: "CNC lathe, model and configuration as listed" },
  goods: { icon: "barcode", terms: [], example: "Original oil painting with certificate" },
  realty: { icon: "house", terms: ["place"], example: "Office lease, 120 m2, floor 5" },
  infra: { icon: "container", terms: ["place", "period"], example: "Cold store space, -18 C, pallet positions" },
  energy: { icon: "power", terms: ["place", "period"], example: "Battery storage capacity, 2 h duration" },
  nuclear: { icon: "atom", terms: ["place"], example: "Licensed handling service as specified" },
  eco: { icon: "carbon-credit", terms: [], example: "Water right, 1000 m3 from the named basin" },
  logistics: { icon: "truck", terms: ["route", "window"], example: "Customs clearance, one import declaration" },
  capacity: { icon: "lab", terms: ["place", "period"], example: "Tensile test to ISO 6892-1" },
  services: { icon: "service", terms: ["deadline"], example: "Web application to the agreed brief" },
  compute: { icon: "gpu", terms: ["period"], example: "Pro plan seat, monthly" },
  data: { icon: "dataset", terms: [], example: "Market data feed, end-of-day prices" },
  ip: { icon: "patent", terms: [], example: "Know-how package for process X" },
  access: { icon: "ticket", terms: ["place", "period"], example: "Concert ticket, stalls row 5 seat 12" },
  other: { icon: "form", terms: [], example: "Kit of 12 listed items" },
};
const REGULATED = new Set(["equity", "debt", "contingent", "nuclear"]);
const REGULATED_FAMILIES = new Set(["access.spectrum"]);
const SYMBOLS = {
  "machine-tool": "MTOOL", "tokenized-deposit": "TDEPOSIT", "custody-claim": "CUSTODY", "local-credit": "LCREDIT", "portfolio-share": "PORTF",
  "insurance-claim": "INSCLAIM", "industrial-gas": "INDGAS", "natural-sample": "SAMPLE", "cutting-tool": "TOOL", "decommissioning": "DECOM",
  "fuel-assembly": "FUELASSY", "fuel-material": "FUELMAT", "energy-certificate": "EAC", "recycling-credit": "RECYCLE", "nature-credit": "NATURE",
  "fishing-quota": "FISHQ", "water-right": "WATER", "machine-time": "MTIME", "space-slot": "SPACE", "network-resource": "NETRES",
  "training-job": "TRAINING", "digital-twin": "TWIN", "exclusive-license": "EXCLLIC", "gift-points": "POINTS", "trade-quota": "QUOTA",
  "warehouse-receipt": "WRECEIPT", "transport-doc": "BL", "temporary-use": "USE", "contract-position": "POSITION", "space-product": "SPACEPRD",
  "rent-claim": "RENT", "gas-supply": "GAS", "hydrogen-supply": "H2", "deposit-claim": "DEPOSIT", "pulp-paper": "PULP", "oil-product": "OIL",
  "game-item": "GAMEITEM", "know-how": "KNOWHOW", "lab-test": "LABTEST", "feed-food": "FOOD", "meat-fish": "MEATFISH", "e-money": "EMONEY",
};
const symbolOf = (f) => {
  const tail = f.id.split(".")[1];
  return SYMBOLS[tail] ?? tail.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 8);
};

const text = (id, name, max, to, example) => ({ id, name, type: "text", max, case: "keep", to, example });
const place = (id, name, to, example) => ({ id, name, type: "place", authority: "unlocode", to, example });
const period = (id, name, grains, to, example) => ({ id, name, type: "period", clock: "UTC", day_start: 0, grains, to, example });

const termParams = (section) => SECTION[section].terms.flatMap((g) =>
  g === "place" ? [place("place", "Place (UN/LOCODE)", "place", "NLRTM")]
    : g === "period" ? [period("period", "Period (UTC)", ["day", "week", "month", "quarter", "year"], "period", "2026-12")]
      : g === "route" ? [place("from", "From (UN/LOCODE)", "origin", "CNSHA"), place("to", "To (UN/LOCODE)", "destination", "NLRTM")]
        : g === "window" ? [period("window", "Start window (UTC)", ["day", "week"], "window", "2026-W49")]
          : [{ id: "deadline", name: "Complete by (UTC day)", type: "date", clock: "UTC", day_start: 0, to: "deadline", example: "2026-12-31" }]);

// families.json → the template recipes (ids <family>.form and <family>.form-item).
export const familyTemplates = (families) => families.flatMap((f) => {
  if (COVERED.has(f.id) || !SECTION[f.section]) return [];
  const s = SECTION[f.section];
  const subject = text("subject", "What exactly, in the family's terms", 160, "instrument", s.example);
  return f.kinds.map((kind) => {
    const unique = kind === "Unique";
    const units = unitsFor(f.unit);
    return {
      id: `${f.id}.${unique ? "form-item" : "form"}`,
      __file: `families.json template ${f.id} ${kind}`,
      __template: true,
      family: f.id,
      name: unique && f.kinds.length > 1 ? `${f.name}: one item`.slice(0, 64) : f.name,
      symbol: symbolOf(f),
      icon: `icons/recipes/${s.icon}.svg`,
      kind,
      source: unique ? "spec:form-item" : "spec:form",
      ...(unique ? { unit: "item" } : {}),
      instrument: "{subject}",
      params: unique
        ? [subject, ...termParams(f.section), text("object", "Identifier of the single item", 128, "object", "Registry or serial number")]
        : [subject, { id: "unit", name: "Unit of the amount", type: "choice", options: units, to: "unit", example: units[0].id }, ...termParams(f.section)],
      ...(REGULATED.has(f.section) || REGULATED_FAMILIES.has(f.id) ? { regulated: true } : {}),
      note: "The family's template (RECIPES.md §6): the subject alone says which item it is, in the terms of the family's identity; the amount is a whole number of the chosen unit.",
    };
  });
});
