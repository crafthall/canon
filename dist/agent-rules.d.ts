import type { HubSource } from './source.js';
/** First and last line of the block; the version in the first line rises when the wording changes materially. */
export declare const AGENT_RULES_START = "<!-- crafthall-canon:agent-rules v1 -->";
export declare const AGENT_RULES_END = "<!-- /crafthall-canon:agent-rules -->";
/** Start of the block written by 0.1.x, when the package was @crafthall/product-hub. */
export declare const LEGACY_AGENT_RULES_PREFIX = "<!-- crafthall-product-hub:agent-rules";
/** Files the block goes into, in order of preference; the first one is created when none exists. */
export declare const AGENT_RULES_FILES: readonly ["CLAUDE.md", "AGENTS.md"];
export interface AgentRulesOptions {
    hubDir?: string;
    /** The command that checks every hub in this repository (default `canon check --all`). */
    checkCommand?: string;
}
/** The block itself, ending with a newline. */
export declare function agentRulesSnippet({ hubDir, checkCommand }?: AgentRulesOptions): string;
export interface AgentRulesPlan {
    /** Repo-relative file the block goes into. */
    file: string;
    /** `create` = new file, `append` = added at the end of an existing file, `present` = the block is already there. */
    action: 'create' | 'append' | 'present';
    /** The full new file text (`present`: the file as it is). */
    text: string;
}
/** Where and how the block is added: `CLAUDE.md` (or `AGENTS.md` when only that exists); a block already there wins. */
export declare function planAgentRules(source: HubSource, o?: AgentRulesOptions): AgentRulesPlan;
