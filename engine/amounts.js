// Amounts are whole numbers of an asset's unit, as decimal strings: no fractions, no floats, no
// rounding anywhere (RECIPES.md §1). These turn what a person reads — «50» MWh, «12.5» t — into the
// whole number the runtime counts, and back, by moving the decimal point only.
import { U128_MAX } from "./definition.js";

export const MAX_AMOUNT = U128_MAX.toString();

// A runtime amount: digits only, no leading zero, greater than zero, at most 2^128 − 1.
export const isAmount = (atoms) => typeof atoms === "string" && /^[1-9][0-9]{0,38}$/.test(atoms) && BigInt(atoms) <= U128_MAX;

// «12.5» with decimals 3 → «12500». Refused (null): a sign, grouping, an exponent, or a fraction finer
// than the unit (12.5004 with decimals 3) — an amount is never rounded.
export const toAtoms = (display, decimals) => {
  if (typeof display !== "string" || !Number.isInteger(decimals) || decimals < 0) return null;
  const m = /^([0-9]+)(?:\.([0-9]+))?$/.exec(display.trim());
  if (!m) return null;
  const fraction = (m[2] ?? "").replace(/0+$/, "");
  if (fraction.length > decimals) return null;
  const atoms = `${m[1]}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=[0-9])/, "");
  return isAmount(atoms) ? atoms : null;
};

// «12500» with decimals 3 → «12.5»: exact, trailing zeros of the fraction dropped.
export const fromAtoms = (atoms, decimals) => {
  if (typeof atoms !== "string" || !/^[0-9]+$/.test(atoms) || !Number.isInteger(decimals) || decimals < 0) return null;
  const padded = atoms.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=[0-9])/, "");
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
};
