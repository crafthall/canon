// Types of mutations.mjs (shared with the golden generator, which is plain Node).
export function setFront(text: string, key: string, value: string): string;
/** Each edit takes and returns a hub source object (readHubProduct shape) without mutating it. */
export const MUTATIONS: Record<string, <T>(source: T) => T>;
/** Inserts a bad-status row into the roadmap's existing Launch tasks table (or appends the section). */
export function insertLaunchTask(roadmap: string | null | undefined, row?: string): string;
/** Inserts an experiment due 2000-01-01 with no result into the Experiments table (or adds the page). */
export function insertExperiment(experiments: string | null | undefined, row?: string): string;
/** Edits outside the golden file (oracle: clean findings plus one). */
export const SHARP_MUTATIONS: Record<string, <T>(source: T) => T>;
