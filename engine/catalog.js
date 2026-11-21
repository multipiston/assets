// A published catalog (catalog.json) as a program uses it: every entry's ref and every recipe's worked
// example re-derived here, the rest dropped and reported — a name or a recipe is never taken on trust.
// Pure: the caller fetches the file (and checks its sha256 or signature) however it likes.
import { deriveAsset, refKey } from "./definition.js";
import { buildDefinition, readDefinition } from "./recipes.js";

export const CATALOG_SCHEMA = "multipiston.catalog/3";

const sameRef = (a, b) => a.chain === b.chain && a.token === b.token;
const derivesTo = (definition, ref) => {
  try {
    return sameRef(deriveAsset(definition), ref);
  } catch {
    return false;
  }
};

export const loadCatalog = (json) => {
  if (json?.schema !== CATALOG_SCHEMA) throw new Error("unsupported_catalog_schema");
  const assets = [], recipes = [], dropped = [];
  for (const a of json.assets ?? []) {
    if (a?.ref && derivesTo(a.definition, a.ref)) assets.push(a);
    else dropped.push(a?.id);
  }
  for (const r of json.recipes ?? []) {
    const built = r?.example ? buildDefinition(r, r.example.values) : { ok: false };
    if (built.ok && derivesTo(built.definition, r.example.ref)) recipes.push(r);
    else dropped.push(r?.id);
  }
  const byRef = new Map(assets.map((a) => [refKey(a.ref), a]));
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return {
    version: json.version,
    updated: json.updated,
    repository: json.repository ?? null,
    sections: json.sections ?? [],
    families: json.families ?? [],
    networks: json.networks ?? [],
    units: json.units ?? [],
    assets,
    recipes,
    // Entries and recipes whose ref did not re-derive: not used.
    dropped,
    // The entry that names this exact ref, or null.
    entry: (ref) => byRef.get(refKey(ref)) ?? null,
    recipe: (id) => byId.get(id) ?? null,
    recipesOf: (family) => recipes.filter((r) => r.family === family),
    // A recipe (or its id) and values → { ok, definition, values, ref } or { ok: false, invalid }.
    build: (recipe, values) => {
      const r = typeof recipe === "string" ? byId.get(recipe) : recipe;
      if (!r) return { ok: false, invalid: ["recipe"] };
      const built = buildDefinition(r, values);
      return built.ok ? { ...built, ref: deriveAsset(built.definition) } : built;
    },
    // A definition → { recipe, values } if one recipe made it exactly, else null.
    read: (definition) => readDefinition(recipes, definition),
  };
};
