// An open-set logo without its own circle → the catalog's disc icon (CONTRIBUTING.md §4): the
// logo's shapes, untouched, over a slate disc that fills the square viewBox, so the dashboard can
// draw every icon as the whole round mark. A logo that is itself a circle centred in the viewBox
// is scaled to fill the disc; any other sits at 90%, well inside it. Running it again changes nothing.
// Usage: node scripts/icon-disc.mjs <icon.svg>…   (each file is rewritten in place)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DISC = "#39434b";
const number = (n) => String(Number(n.toFixed(4)));

// The radius of a circle drawn first and centred at (c, c): <circle> or the two-arc path of one.
const centredCircle = (body, c) => {
  const first = /<(circle|path)\b([^>]*)>/.exec(body);
  if (!first) return null;
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(first[2])?.[1];
  if (first[1] === "circle") return Number(attr("cx")) === c && Number(attr("cy")) === c ? Number(attr("r")) || null : null;
  const arc = /^M\s*([\d.]+)[ ,]([\d.]+)\s*a\s*([\d.]+)[ ,]\3\s+0\s+1\s+0\s+0-([\d.]+)\s+\3[ ,]\3\s+0\s+0\s+0\s+0\s+\4\s*z?$/i.exec(attr("d") ?? "");
  if (!arc) return null;
  const [, x, y, r, d] = arc.map(Number);
  return x === c && y === c + r && d === 2 * r ? r : null;
};

export const onDisc = (svg) => {
  const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg);
  const box = m && /\sviewBox="0 0 ([\d.]+) \1"/.exec(m[1]);
  if (!box) throw new Error("an <svg> with a square viewBox from 0 0");
  const side = Number(box[1]), c = side / 2;
  const disc = `<circle cx="${number(c)}" cy="${number(c)}" r="${number(c)}" fill="${DISC}"/>`;
  if (m[2].trim().startsWith(disc)) return svg;
  const r = centredCircle(m[2], c);
  const scale = r ? c / r : 0.9;
  return `<svg${m[1]}>\n    ${disc}\n    <g transform="translate(${number(c - c * scale)} ${number(c - c * scale)}) scale(${number(scale)})">\n    ${m[2].trim()}\n    </g>\n</svg>\n`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("usage: node scripts/icon-disc.mjs <icon.svg>…");
  for (const file of files) {
    const before = readFileSync(file, "utf8"), after = onDisc(before);
    if (after !== before) writeFileSync(file, after);
    console.log(`${after === before ? "already a disc" : "on the disc"}: ${file}`);
  }
}
