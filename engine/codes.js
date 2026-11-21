// Open identifier codes a recipe takes: each check turns what a person or a program typed into
// the one canonical spelling of the code, or null when it is not a valid code. Same input, same
// spelling, same asset (RECIPES.md §3).

// ISO 3166-1 alpha-2: the 249 officially assigned country codes (ISO 3166 Maintenance Agency),
// without the reserved, deleted and user-assigned ones (EU, UK, XK, …). A change is a reviewed edit.
export const ISO3166 = new Set(
  ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI " +
    "CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP " +
    "GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK " +
    "LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA " +
    "PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF " +
    "TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" "),
);
const compact = (raw) => raw.normalize("NFKC").replace(/[\s-]+/g, "").toUpperCase();
const alnum = (c) => (c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 55);
const luhnOk = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};
const mod97 = (text) => {
  let r = 0;
  for (const c of text) for (const d of String(alnum(c))) r = (r * 10 + (d.charCodeAt(0) - 48)) % 97;
  return r;
};
const gs1Ok = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) sum += (digits.charCodeAt(digits.length - 2 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(digits.length - 1) - 48;
};
export const CODES = {
  isin: (raw) => {
    const c = compact(raw);
    return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(c) && luhnOk([...c].map(alnum).join("")) ? c : null;
  },
  lei: (raw) => {
    const c = compact(raw);
    return /^[A-Z0-9]{18}[0-9]{2}$/.test(c) && mod97(c) === 1 ? c : null;
  },
  vin: (raw) => {
    const c = compact(raw);
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(c) ? c : null;
  },
  imo: (raw) => {
    const c = compact(raw).replace(/^IMO/, "");
    if (!/^[0-9]{7}$/.test(c)) return null;
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += (c.charCodeAt(i) - 48) * (7 - i);
    return sum % 10 === c.charCodeAt(6) - 48 ? c : null;
  },
  iso6346: (raw) => {
    const c = compact(raw);
    if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(c)) return null;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let v = alnum(c[i]);
      if (i < 4) v = v + Math.floor((v - 1) / 10);
      sum += v * 2 ** i;
    }
    return (sum % 11) % 10 === c.charCodeAt(10) - 48 ? c : null;
  },
  iso3166: (raw) => {
    const c = compact(raw);
    return ISO3166.has(c) ? c : null;
  },
  unlocode: (raw) => {
    const c = compact(raw);
    return /^[A-Z]{2}[A-Z2-9]{3}$/.test(c) && ISO3166.has(c.slice(0, 2)) ? c : null;
  },
  eic: (raw) => {
    const c = raw.normalize("NFKC").trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z0-9-]{14}$/.test(c)) return null;
    const value = (x) => (x === "-" ? 36 : alnum(x));
    let sum = 0;
    for (let i = 0; i < 15; i++) sum += value(c[i]) * (16 - i);
    const check = 36 - ((sum - 1) % 37);
    const char = check === 36 ? "-" : check < 10 ? String(check) : String.fromCharCode(check + 55);
    return char === c[15] ? c : null;
  },
  mic: (raw) => {
    const c = compact(raw);
    return /^[A-Z0-9]{4}$/.test(c) ? c : null;
  },
  doi: (raw) => {
    const c = raw.normalize("NFKC").trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, "").toLowerCase();
    return /^10\.[0-9]{4,9}\/\S{1,200}$/.test(c) ? c : null;
  },
  domain: (raw) => {
    const c = raw.normalize("NFKC").trim().toLowerCase().replace(/\.$/, "");
    if (c.length > 253) return null;
    const labels = c.split(".");
    if (labels.length < 2) return null;
    const ok = labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l));
    return ok && /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1]) ? c : null;
  },
  sha256: (raw) => {
    const c = raw.trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(c) ? c : null;
  },
  inchikey: (raw) => {
    const c = raw.trim().toUpperCase();
    return /^[A-Z]{14}-[A-Z]{8}[SN]A-[A-Z]$/.test(c) ? c : null;
  },
  gtin: (raw) => {
    const c = compact(raw);
    if (!/^([0-9]{8}|[0-9]{12,14})$/.test(c)) return null;
    const g = c.padStart(14, "0");
    return gs1Ok(g) ? g : null;
  },
  isbn: (raw) => {
    const c = compact(raw);
    let g = null;
    if (/^[0-9]{9}[0-9X]$/.test(c)) {
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += (c[i] === "X" ? 10 : c.charCodeAt(i) - 48) * (10 - i);
      if (sum % 11 !== 0) return null;
      const base = `978${c.slice(0, 9)}`;
      let s = 0;
      for (let i = 0; i < 12; i++) s += (base.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
      g = `${base}${(10 - (s % 10)) % 10}`;
    } else if (/^97[89][0-9]{10}$/.test(c)) g = c;
    return g && gs1Ok(g) ? g : null;
  },
  isrc: (raw) => {
    const c = compact(raw);
    return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(c) && ISO3166.has(c.slice(0, 2)) ? c : null;
  },
  iswc: (raw) => {
    const c = compact(raw).replace(/\./g, "");
    if (!/^T[0-9]{10}$/.test(c)) return null;
    let sum = 1;
    for (let i = 0; i < 9; i++) sum += (c.charCodeAt(1 + i) - 48) * (i + 1);
    return (10 - (sum % 10)) % 10 === c.charCodeAt(10) - 48 ? c : null;
  },
  patent: (raw) => {
    const c = compact(raw).replace(/[,./]/g, "");
    return /^[A-Z]{2}[0-9]{4,12}[A-Z][0-9]?$/.test(c) ? c : null;
  },
  caip19: (raw) => {
    const c = raw.normalize("NFKC").trim();
    if (!/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/.test(c)) return null;
    return /^eip155:[0-9]+\/(erc20|erc721|erc1155):0x[0-9a-fA-F]{40}$/.test(c) ? c.toLowerCase() : c;
  },
  caip19item: (raw) => {
    const c = raw.normalize("NFKC").trim();
    const m = /^([-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128})\/(0|[1-9][0-9]{0,77})$/.exec(c);
    if (!m) return null;
    return /^eip155:[0-9]+\/(erc721|erc1155):0x[0-9a-fA-F]{40}$/.test(m[1]) ? `${m[1].toLowerCase()}/${m[2]}` : c;
  },
  iso11784: (raw) => {
    const c = compact(raw);
    return /^[0-9]{15}$/.test(c) ? c : null;
  },
};
