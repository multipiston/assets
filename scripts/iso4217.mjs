// ISO 4217 currencies and their minor-unit exponent, from ISO 4217 List One as published
// by the maintenance agency (SIX Financial Information) on 2026-09-17:
// https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// Kept: every code with a numeric minor unit. Left out: fund codes (IsFund) and codes whose
// minor unit is N.A. (precious metals, SDR, testing, "no currency"). A new list → a reviewed edit here.
const BY_EXPONENT = [
  [0, "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX VND VUV XAF XOF XPF"],
  [2, "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BRL " +
    "BSD BTN BWP BYN BZD CAD CDF CHF CNY COP CRC CUP CVE CZK DKK DOP " +
    "DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL " +
    "HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR " +
    "LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN " +
    "NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB " +
    "SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB " +
    "TJS TMT TOP TRY TTD TWD TZS UAH USD UYU UZS VED VES WST XCD XCG " +
    "YER ZAR ZMW ZWG"],
  [3, "BHD IQD JOD KWD LYD OMR TND"],
];

// code → exponent: the amount in minor units is the amount in the currency × 10^exponent.
export const ISO4217 = new Map(BY_EXPONENT.flatMap(([exponent, codes]) => codes.split(" ").map((code) => [code, exponent])));
export const ISO4217_PUBLISHED = "2026-09-17";
