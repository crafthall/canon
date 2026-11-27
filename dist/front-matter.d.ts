/**
 * Front matter and sections of a hub page (moved from Spark Hall's lib/team-work.mjs and
 * business-plans.mjs so the readers run without Spark Hall). A small YAML subset (YAML 1.2 compatible): `key: value`,
 * nested maps by indentation, block lists (`- item`, `- key: value` maps), flow lists `[a, b]`, double-quoted (JSON
 * escapes) and single-quoted strings, literal (`|`) and folded (`>`) blocks, numbers, true/false/null, full-line `#`
 * comments. Rejected with a message: anchors, tags, flow maps, plain strings containing ": " or " #", tabs.
 * Pure – no file reads.
 */
export type YamlValue = string | number | boolean | null | YamlValue[] | {
    [key: string]: YamlValue;
};
export type Meta = Record<string, YamlValue>;
/** Splits `---` front matter from the body. `yaml` is null when there is none. */
export declare function splitFrontMatter(text: string): {
    yaml: string | null;
    body: string;
};
/** One scalar or flow list. Throws Error(`${where}…`) on unsupported input. */
export declare function parseScalar(raw: string, where?: string): YamlValue;
/** Parses the YAML subset into plain objects. Throws Error("line N: …") on unsupported or invalid input. */
export declare function parseYaml(src: string | null | undefined): Meta;
export interface ParsedDoc {
    meta: Meta;
    body: string;
    /** The parse error, or null; `meta` is {} when there is no front matter or it does not parse. */
    error: string | null;
}
/** Parses front matter + body; `meta` is {} when there is none or it does not parse (the error is returned). */
export declare function parseDoc(text: string): ParsedDoc;
export interface DocSection {
    title: string;
    body: string;
}
/** Splits a Markdown body into its `##` sections: [{ title, body }] (text before the first `##` is dropped). */
export declare function splitSections(body: string): DocSection[];
