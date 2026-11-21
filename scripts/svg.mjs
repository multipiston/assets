// Icon check by allow-list: the file is read as a strict subset of XML; any element,
// attribute, reference or construct outside the lists below is refused.
const ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "title"]);
const ATTRIBUTES = new Set(["xmlns", "viewBox", "width", "height", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1",
  "x2", "y2", "fx", "fy", "points", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "opacity", "transform", "id", "clip-path", "clip-rule",
  "mask", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod",
  "clipPathUnits", "maskUnits", "maskContentUnits"]);
const MAX_BYTES = 16384;
const NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
// A value may reference only an element of the same file: url(#id).
const VALUE = /^[^<>&"]*$/;
const urlRefs = (v) => [...v.matchAll(/url\(([^)]*)\)/gi)].map((m) => m[1].trim());

export const checkSvg = (bytes) => {
  const problems = [];
  if (bytes.length > MAX_BYTES) problems.push(`at most ${MAX_BYTES} bytes`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return ["UTF-8 only"];
  }
  text = text.replace(/^﻿/, "").replace(/^<\?xml[^?]*\?>/, "").trim();
  if (/<!|<\?|\]\]>/.test(text)) problems.push("no DOCTYPE, entities, comments, CDATA or processing instructions");
  const stack = [];
  let rootSeen = false, at = 0, viewBox = null;
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[A-Za-z][A-Za-z0-9:-]*\s*=\s*"[^"]*")*)\s*(\/?)>/y;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    const between = text.slice(at, lt === -1 ? text.length : lt);
    if (between.trim() && stack.at(-1) !== "title") problems.push("text is allowed only inside <title>");
    if (lt === -1) break;
    tag.lastIndex = lt;
    const m = tag.exec(text);
    if (!m) { problems.push(`malformed markup at ${lt}`); break; }
    const [, closing, name, attrs, selfClosing] = m;
    at = tag.lastIndex;
    if (!ELEMENTS.has(name)) problems.push(`element <${name}> is not allowed`);
    if (closing) {
      if (stack.pop() !== name) problems.push(`unbalanced </${name}>`);
      continue;
    }
    if (!rootSeen) {
      rootSeen = true;
      if (name !== "svg") problems.push("the root element is <svg>");
    } else if (!stack.length) problems.push("one root element");
    for (const a of attrs.matchAll(/([A-Za-z][A-Za-z0-9:-]*)\s*=\s*"([^"]*)"/g)) {
      const [, key, value] = a;
      if (!ATTRIBUTES.has(key)) problems.push(`attribute ${key} is not allowed`);
      if (!VALUE.test(value)) problems.push(`attribute ${key}: no markup or entities`);
      for (const ref of urlRefs(value)) if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(ref)) problems.push(`attribute ${key}: only url(#id)`);
      if (key !== "xmlns" && /javascript:|data:|https?:/i.test(value)) problems.push(`attribute ${key}: no external or script references`);
      if (key === "xmlns" && (name !== "svg" || value !== "http://www.w3.org/2000/svg")) problems.push("xmlns: the SVG namespace, on <svg> only");
      if (name === "svg" && key === "viewBox") viewBox = value;
    }
    if (!NAME.test(name)) problems.push(`element name ${name}`);
    if (!selfClosing) stack.push(name);
  }
  if (!rootSeen) problems.push("a bare <svg> document");
  if (stack.length) problems.push(`unclosed <${stack.at(-1)}>`);
  const box = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || box.some((n) => !Number.isFinite(n)) || box[2] <= 0 || box[2] !== box[3])
    problems.push("a square viewBox, e.g. 0 0 64 64");
  return [...new Set(problems)];
};
