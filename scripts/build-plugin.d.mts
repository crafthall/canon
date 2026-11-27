// Types of build-plugin.mjs for the tests (tests/plugin.test.ts).
export declare const LIB: string;
export declare const PLUGIN: string;
export declare const PLUGIN_BUNDLE: string;
export declare const TEMPLATE: string;
export declare const PLUGIN_TEMPLATE: string;
export declare function buildPluginBundle(outfile?: string): Promise<{ inputs: Record<string, unknown> }>;
export declare function buildPlugin(dir?: string): Promise<{ inputs: Record<string, unknown> }>;
