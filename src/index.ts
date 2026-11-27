/**
 * @crafthall/canon – Crafthall Canon framework core (docs/concept.md). The model (layout, stages, matrix, health, completeness: model.ts), the
 * front matter parser (front-matter.ts), the readers that build a product from a hub folder (readers.ts), the
 * structure check (check.ts), the scaffold plan (scaffold.ts), the `--json` report (report.ts) and the file source
 * they read through (source.ts). The `canon` CLI is `@crafthall/canon/cli` (cli.ts). No file reads here: the disk source is `@crafthall/canon/node`.
 * Imports carry the .ts extension so plain Node (type stripping) runs the sources in this repository; an installed copy
 * runs the build in dist/ (scripts/build.mjs rewrites the extensions).
 */
export * from './model.ts';
export * from './front-matter.ts';
export * from './source.ts';
export * from './readers.ts';
export * from './check.ts';
export * from './scaffold.ts';
export * from './report.ts';
export * from './citations.ts';
export * from './recall.ts';
export * from './change-coupled.ts';
export * from './agent-rules.ts';
export * from './init.ts';
