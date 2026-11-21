// @multipiston/catalog — types of the Multipiston asset rules (index.js).

export type AssetTerm = { readonly key: string; readonly value: string };
// An inline asset: its identity is the exact ref of these fields.
export type AssetDefinition = {
  readonly version: 1;
  readonly domain: string;
  readonly instrument: string;
  readonly source: string;
  readonly kind: "Fungible" | "Unique";
  readonly unit: string;
  readonly terms: readonly AssetTerm[];
};
export type AssetRef = { readonly chain: string; readonly token: string };

// A definition validation error.
export type DefinitionError =
  | "invalid_definition"
  | "invalid_utf8"
  | "empty_term_key"
  | "noncanonical_terms"
  | "incomplete_terms"
  | "empty_term"
  | "invalid_term"
  | "invalid_interval"
  | "invalid_window"
  | "invalid_deadline"
  | "definition_too_large";
// Each code → the rule it stands for, in English.
export declare const DEFINITION_ERRORS: { readonly [code in DefinitionError]: string };
export declare const TYPED_TERMS: readonly string[];
export declare const U128_MAX: bigint;
// Asset serialization; throws a DefinitionError for invalid fields.
export declare function definitionBytes(definition: AssetDefinition): Uint8Array;
// Prepare the asset reference, or throw a DefinitionError for invalid fields.
export declare function deriveAsset(definition: AssetDefinition): AssetRef;
export declare function validateTypedTerms(terms: readonly AssetTerm[]): void;
export declare function sortTerms<T extends AssetTerm>(terms: readonly T[]): T[];
export declare function isInlineToken(token: string): boolean;
export declare function refKey(ref: AssetRef): string;

// Accepted code values, or null for an invalid value.
export declare const CODES: { readonly [check: string]: (raw: string) => string | null };
export declare const ISO3166: ReadonlySet<string>;

export type PeriodRule = { readonly clock: string; readonly dayStart: number; readonly grains: readonly string[] };
export declare const CLOCKS: { readonly [clock: string]: { readonly offset: number; readonly rule: "eu" | "us" | null } };
export declare const GRAINS: readonly string[];
export declare function periodBounds(label: string, rule: PeriodRule): { readonly start_us: string; readonly end_us: string } | null;
export declare function periodLabel(startUs: string, endUs: string, rule: PeriodRule): string | null;

export type RecipeOption = {
  readonly id: string;
  readonly name: string;
  readonly short?: string;
  readonly unit?: string;
  readonly decimals?: number;
  readonly display?: string;
};
export type RecipeParam = {
  readonly id: string;
  readonly name: string;
  readonly type: "choice" | "code" | "place" | "text" | "period" | "date";
  readonly to: string;
  readonly example: string;
  readonly options?: readonly RecipeOption[];
  readonly check?: string;
  readonly authority?: string;
  readonly max?: number;
  readonly case?: "keep" | "upper" | "lower";
  readonly clock?: string;
  readonly day_start?: number;
  readonly grains?: readonly string[];
};
// What building and reading need of a published recipe.
export type RecipeRule = {
  readonly domain: string;
  readonly source: string;
  readonly kind: "Fungible" | "Unique";
  readonly instrument: string;
  readonly terms?: readonly AssetTerm[];
  readonly params: readonly RecipeParam[];
  readonly unit?: string | null;
  readonly decimals?: number;
  readonly display?: string | null;
};
export type RecipeValues = { readonly [param: string]: string };
export type BuildResult =
  | { readonly ok: true; readonly definition: AssetDefinition; readonly values: RecipeValues }
  | { readonly ok: false; readonly invalid: readonly string[] };
export type RecipeMatch<R extends RecipeRule = RecipeRule> = { readonly recipe: R; readonly values: RecipeValues };
// A definition without its version (a verified label of one) reads back as well.
export type DefinitionLike = Omit<AssetDefinition, "version">;

export declare const TARGETS: { readonly [target: string]: readonly string[] };
export declare function periodRule(param: RecipeParam): PeriodRule;
export declare function canonicalValue(param: RecipeParam, raw: string): string | null;
export declare function recipeUnits(recipe: RecipeRule, values?: RecipeValues): { readonly unit: string; readonly decimals: number; readonly display: string };
export declare function buildDefinition(recipe: RecipeRule, values: RecipeValues): BuildResult;
export declare function readDefinition<R extends RecipeRule>(recipes: readonly R[], definition: DefinitionLike): RecipeMatch<R> | null;

export declare const MAX_AMOUNT: string;
export declare function isAmount(atoms: string): boolean;
export declare function toAtoms(display: string, decimals: number): string | null;
export declare function fromAtoms(atoms: string, decimals: number): string | null;

export declare const CATALOG_SCHEMA: "multipiston.catalog/3";
export type PublishedRecipe = RecipeRule & {
  readonly id: string;
  readonly family: string;
  readonly name: string;
  readonly symbol: string;
  readonly icon: string | null;
  readonly regulated: boolean;
  readonly template: boolean;
  readonly note: string;
  readonly example: { readonly values: RecipeValues; readonly definition?: AssetDefinition; readonly ref: AssetRef };
};
export type PublishedAsset = {
  readonly id: string;
  readonly status: "listed" | "retired";
  readonly family: string;
  readonly kind: "Fungible" | "Unique";
  readonly symbol: string;
  readonly aliases: readonly string[];
  readonly name: string;
  readonly network: string | null;
  readonly decimals: number;
  readonly icon: string | null;
  readonly ref: AssetRef;
  readonly definition: AssetDefinition;
  readonly replaced_by: AssetRef | null;
};
export type LoadedCatalog = {
  readonly version: number;
  readonly updated: string;
  readonly repository: string | null;
  readonly sections: readonly { readonly id: string; readonly name: string }[];
  readonly families: readonly { readonly id: string; readonly section: string; readonly name: string; readonly domain?: string }[];
  readonly networks: readonly { readonly id: string; readonly name: string }[];
  readonly units: readonly { readonly id: string; readonly symbol: string; readonly name: string; readonly quantity: string; readonly base?: string; readonly exp?: number }[];
  readonly assets: readonly PublishedAsset[];
  readonly recipes: readonly PublishedRecipe[];
  readonly dropped: readonly (string | undefined)[];
  entry(ref: AssetRef): PublishedAsset | null;
  recipe(id: string): PublishedRecipe | null;
  recipesOf(family: string): readonly PublishedRecipe[];
  build(recipe: PublishedRecipe | string, values: RecipeValues):
    | { readonly ok: true; readonly definition: AssetDefinition; readonly values: RecipeValues; readonly ref: AssetRef }
    | { readonly ok: false; readonly invalid: readonly string[] };
  read(definition: DefinitionLike): RecipeMatch<PublishedRecipe> | null;
};
export declare function loadCatalog(json: unknown): LoadedCatalog;
