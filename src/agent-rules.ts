/**
 * The agent-rules snippet (feature everything-as-code): a short block for a repository's `CLAUDE.md` or
 * `AGENTS.md` that tells any coding agent where the hub lives, which change needs which page, the changelog line, the
 * `no product doc change: <reason>` escape and the check command. `canon init` adds it once per repository. Pure: it
 * reads through a `HubSource` and returns what to write; the caller writes it. Never rewrites what is there: a file
 * that already holds the block is left as it is, any other file only gets the block appended.
 */
import { HUB_DIR } from './model.ts';
import type { HubSource } from './source.ts';

/** First and last line of the block; the version in the first line rises when the wording changes materially. */
export const AGENT_RULES_START = '<!-- crafthall-canon:agent-rules v1 -->';
export const AGENT_RULES_END = '<!-- /crafthall-canon:agent-rules -->';
/** Start of the block written by 0.1.x, when the package was @crafthall/product-hub. */
export const LEGACY_AGENT_RULES_PREFIX = '<!-- crafthall-product-hub:agent-rules';
/** Files the block goes into, in order of preference; the first one is created when none exists. */
export const AGENT_RULES_FILES = ['CLAUDE.md', 'AGENTS.md'] as const;

export interface AgentRulesOptions {
  hubDir?: string;
  /** The command that checks every hub in this repository (default `canon check --all`). */
  checkCommand?: string;
}

/** The block itself, ending with a newline. */
export function agentRulesSnippet({ hubDir = HUB_DIR, checkCommand = 'canon check --all' }: AgentRulesOptions = {}): string {
  return [
    AGENT_RULES_START,
    '## Product docs (Crafthall Canon)',
    '',
    `- Everything that describes a product lives in one folder, \`${hubDir}/<id>/\` – business, product, architecture and the AI workflow, one topic per page. Read the hub README before you change the product.`,
    '- Every change updates its docs **in the same change**: a new or changed feature updates `business-product/features/<slug>.md` and its row in `business-product/features/README.md`; a price, channel, gate or decision updates its page (`monetization.md`, `go-to-market.md`, `roadmap.md`, a decision record); any page the change made untrue is fixed.',
    '- Every change adds one line to the hub README "Changelog": `- YYYY-MM-DD – what changed – <issue or PR>`.',
    '- A change with no product impact (a refactor, tooling) says `no product doc change: <reason>` in the commit message or the pull request body instead.',
    `- Before you hand over, run \`${checkCommand}\`; fix every problem it reports. New pages stay \`status: draft\` until a person confirms them.`,
    AGENT_RULES_END,
    '',
  ].join('\n');
}

export interface AgentRulesPlan {
  /** Repo-relative file the block goes into. */
  file: string;
  /** `create` = new file, `append` = added at the end of an existing file, `present` = the block is already there. */
  action: 'create' | 'append' | 'present';
  /** The full new file text (`present`: the file as it is). */
  text: string;
}

/** Where and how the block is added: `CLAUDE.md` (or `AGENTS.md` when only that exists); a block already there wins. */
export function planAgentRules(source: HubSource, o: AgentRulesOptions = {}): AgentRulesPlan {
  const block = agentRulesSnippet(o);
  const existing = AGENT_RULES_FILES.map((file) => ({ file, text: source.read(file) })).filter((f): f is { file: (typeof AGENT_RULES_FILES)[number]; text: string } => f.text != null);
  // A block written before the rename to Canon (0.1.x) still counts as present.
  const holder = existing.find((f) => f.text.includes(AGENT_RULES_START.replace(/ v\d+ -->$/, '')) || f.text.includes(LEGACY_AGENT_RULES_PREFIX));
  if (holder) return { file: holder.file, action: 'present', text: holder.text };
  const target = existing[0];
  if (!target) return { file: AGENT_RULES_FILES[0], action: 'create', text: block };
  const sep = target.text === '' ? '' : target.text.endsWith('\n\n') ? '' : target.text.endsWith('\n') ? '\n' : '\n\n';
  return { file: target.file, action: 'append', text: `${target.text}${sep}${block}` };
}
