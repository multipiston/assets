// Delivery periods as the typed terms the runtime reads: [mp.start_us, mp.end_us) in UTC POSIX
// microseconds. A recipe names its clock and the hour its day starts, so «December 2026 at TTF» is
// one pair of numbers for everyone, the 25-hour day of a clock change included (RECIPES.md §4).
//   rule = { clock, dayStart, grains }; labels: 2026 · 2026-Q4 · 2026-12 · 2026-W49 · 2026-12-01 ·
//   2026-12-01T13Z (a UTC hour). Clocks: UTC; WET, CET, EET (EU summer time); ET, CT, PT (US summer
//   time); EST (Eastern Standard Time all year, the MISO market day).
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const CLOCKS = {
  UTC: { offset: 0, rule: null },
  WET: { offset: 0, rule: "eu" },
  CET: { offset: 60, rule: "eu" },
  EET: { offset: 120, rule: "eu" },
  ET: { offset: -300, rule: "us" },
  EST: { offset: -300, rule: null },
  CT: { offset: -360, rule: "us" },
  PT: { offset: -480, rule: "us" },
};
const sunday = (year, month, n) => {
  if (n > 0) {
    const first = Date.UTC(year, month, 1),
      dow = new Date(first).getUTCDay();
    return first + (((7 - dow) % 7) + (n - 1) * 7) * DAY;
  }
  const last = Date.UTC(year, month + 1, 0),
    dow = new Date(last).getUTCDay();
  return last - dow * DAY;
};
const offsetAt = (clock, ms) => {
  const c = CLOCKS[clock];
  if (!c.rule) return c.offset;
  const year = new Date(ms).getUTCFullYear();
  const [from, to] =
    c.rule === "eu"
      ? [sunday(year, 2, -1) + HOUR, sunday(year, 9, -1) + HOUR]
      : [sunday(year, 2, 2) + 2 * HOUR - c.offset * 60_000, sunday(year, 10, 1) + 2 * HOUR - (c.offset + 60) * 60_000];
  return ms >= from && ms < to ? c.offset + 60 : c.offset;
};
const toUtc = (clock, wall) => {
  const guess = wall - offsetAt(clock, wall - CLOCKS[clock].offset * 60_000) * 60_000;
  return wall - offsetAt(clock, guess) * 60_000;
};
const toWall = (clock, utc) => utc + offsetAt(clock, utc) * 60_000;
const pad = (n) => String(n).padStart(2, "0");
const isoWeekOne = (year) => {
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
};
const weeksIn = (year) => Math.round((isoWeekOne(year + 1) - isoWeekOne(year)) / (7 * DAY));
const parsePeriod = (label) => {
  let m;
  if ((m = /^([0-9]{4})$/.exec(label))) return { grain: "year", from: Date.UTC(+m[1], 0, 1), to: Date.UTC(+m[1] + 1, 0, 1) };
  if ((m = /^([0-9]{4})-Q([1-4])$/.exec(label))) {
    const q = (+m[2] - 1) * 3;
    return { grain: "quarter", from: Date.UTC(+m[1], q, 1), to: Date.UTC(+m[1], q + 3, 1) };
  }
  if ((m = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(label)))
    return { grain: "month", from: Date.UTC(+m[1], +m[2] - 1, 1), to: Date.UTC(+m[1], +m[2], 1) };
  if ((m = /^([0-9]{4})-W(0[1-9]|[1-4][0-9]|5[0-3])$/.exec(label))) {
    if (+m[2] > weeksIn(+m[1])) return null;
    const from = isoWeekOne(+m[1]) + (+m[2] - 1) * 7 * DAY;
    return { grain: "week", from, to: from + 7 * DAY };
  }
  if ((m = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.exec(label))) {
    const from = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (new Date(from).getUTCDate() !== +m[3]) return null;
    return { grain: "day", from, to: from + DAY };
  }
  if ((m = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3])Z$/.exec(label))) {
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (new Date(day).getUTCDate() !== +m[3]) return null;
    return { grain: "hour", from: day + +m[4] * HOUR, to: day + (+m[4] + 1) * HOUR, utc: true };
  }
  return null;
};
export const periodBounds = (label, rule) => {
  const p = typeof label === "string" ? parsePeriod(label.trim()) : null;
  if (!p || !rule.grains.includes(p.grain) || p.from < Date.UTC(1970, 0, 2) || !CLOCKS[rule.clock]) return null;
  const at = (day) => (p.utc ? day : toUtc(rule.clock, day + rule.dayStart * HOUR));
  return { start_us: `${at(p.from)}000`, end_us: `${at(p.to)}000` };
};
export const periodLabel = (startUs, endUs, rule) => {
  if (!/^[1-9][0-9]{0,15}000$/.test(startUs) || !/^[1-9][0-9]{0,15}000$/.test(endUs) || !CLOCKS[rule.clock]) return null;
  const start = Number(startUs.slice(0, -3));
  const candidates = [];
  if (rule.grains.includes("hour") && start % HOUR === 0) {
    const d = new Date(start);
    candidates.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}Z`);
  }
  const day = toWall(rule.clock, start) - rule.dayStart * HOUR;
  if (day % DAY === 0) {
    const d = new Date(day),
      y = d.getUTCFullYear(),
      mo = d.getUTCMonth(),
      dd = d.getUTCDate();
    candidates.push(`${y}-${pad(mo + 1)}-${pad(dd)}`);
    if (d.getUTCDay() === 1) {
      const weekYear = new Date(day + 3 * DAY).getUTCFullYear();
      candidates.push(`${weekYear}-W${pad((day - isoWeekOne(weekYear)) / (7 * DAY) + 1)}`);
    }
    if (dd === 1) {
      candidates.push(`${y}-${pad(mo + 1)}`);
      if (mo % 3 === 0) candidates.push(`${y}-Q${mo / 3 + 1}`);
      if (mo === 0) candidates.push(`${y}`);
    }
  }
  return (
    candidates.find((label) => {
      const b = periodBounds(label, rule);
      return b !== null && b.start_us === startUs && b.end_us === endUs;
    }) ?? null
  );
};
export const GRAINS = ["hour", "day", "week", "month", "quarter", "year"];
