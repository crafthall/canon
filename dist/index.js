/**
 * @crafthall/canon – Crafthall Canon framework core (docs/concept.md). The model (layout, stages, matrix, health, completeness: model.ts), the
 * front matter parser (front-matter.ts), the readers that build a product from a hub folder (readers.ts), the
 * structure check (check.ts), the scaffold plan (scaffold.ts), the `--json` report (report.ts) and the file source
 * they read through (source.ts). The `canon` CLI is `@crafthall/canon/cli` (cli.ts). No file reads here: the disk source is `@crafthall/canon/node`.
 * Imports carry the .ts extension so plain Node (type stripping) runs the sources in this repository; an installed copy
 * runs the build in dist/ (scripts/build.mjs rewrites the extensions).
 */
export * from "./model.js";
export * from "./front-matter.js";
export * from "./source.js";
export * from "./readers.js";
export * from "./check.js";
export * from "./scaffold.js";
export * from "./report.js";
export * from "./citations.js";
export * from "./recall.js";
export * from "./change-coupled.js";
export * from "./agent-rules.js";
export * from "./init.js";
