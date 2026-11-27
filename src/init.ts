/**
 * `canon init` – start a repository as a Crafthall project (feature crafthall-project-init). One run, in this
 * order: scaffold the hub (`canon new`) → bootstrap (the repository has content: left to the bootstrap skill in the
 * user's own session, the command only says so) → the agent-rules snippet in CLAUDE.md / AGENTS.md → the Crafthall
 * HQ team check (offline) → the Crafthall Optimize baseline (skipped with a note while Optimize has no free, offline
 * baseline) → summary: the HQ verdict recorded in the hub README (Status row + Changelog line), the closing hub
 * check, and what the person confirms.
 * Pure: every outside step (scaffold, file list, writes, HQ, Optimize, the closing check) is a port in `InitPorts`,
 * so unit tests cover the order and every "not available" path; `@crafthall/canon/cli` wires the Node ports.
 * Nothing is published or sent: HQ is run offline by its runner, Optimize is never run by a model or a paid call.
 */
import { planAgentRules, type AgentRulesOptions } from './agent-rules.ts';
import { HUB_DIR } from './model.ts';
import type { ScaffoldSummary } from './scaffold.ts';
import type { HubSource } from './source.ts';

export const INIT_SUMMARY_SCHEMA_VERSION = 1;
/** The steps of `canon init`, in the order they run. */
export const INIT_STEPS = ['scaffold', 'bootstrap', 'agent-rules', 'hq-check', 'optimize-baseline', 'summary'] as const;
export type InitStepId = (typeof INIT_STEPS)[number];
/**
 * done = ran and wrote or checked; skipped = not applicable or not available, with the reason; pending = left to the
 * user's session (the bootstrap skill); dry-run = what would happen; refused / failed = the run stops (exit 1);
 * not-run = an earlier step stopped the run.
 */
export type InitStepStatus = 'done' | 'skipped' | 'pending' | 'dry-run' | 'refused' | 'failed' | 'not-run';

export interface InitStep {
  id: InitStepId;
  status: InitStepStatus;
  /** One line for the person. */
  message: string;
  /** Further lines (the scaffold's own output, HQ hints). */
  lines?: string[];
}

/** What the HQ runner found. */
export type HqOutcome =
  /** HQ is not installed (no `--hq`, no Claude Code plugin `crafthall-hq`, no `crafthall-hq` on PATH) or turned off. */
  | { kind: 'missing'; message: string }
  /** HQ ran but found no Claude Code agent team to check (its exit code 3), e.g. only AGENTS.md or nothing at all. */
  | { kind: 'nothing-checked'; message: string }
  /** HQ checked the team on this machine: exit 0 = OK, 1 = things to improve. */
  | { kind: 'checked'; exitCode: 0 | 1; verdict: string; version: string | null; rulesBuild: string | null; agents: number | null; hints: string[] }
  /** HQ could not run or did not run offline: nothing is recorded. */
  | { kind: 'failed'; message: string };

/** What the Optimize runner found. */
export type OptimizeOutcome = { kind: 'missing'; note: string } | { kind: 'recorded'; message: string };

export interface ScaffoldOutcome {
  /** The `canon new` exit code: 0 created (or dry run), 1 refused or its check failed, 2 usage error. */
  code: number;
  summary: ScaffoldSummary | null;
  /** Everything `canon new` printed (stdout and stderr, in order). */
  lines: string[];
}

export interface InitPorts {
  /** Runs `canon new` with the init's arguments. */
  scaffold: () => ScaffoldOutcome;
  /** Repo-relative files of the repository (tracked and untracked, not ignored), after the scaffold. */
  files: () => readonly string[];
  /** Reads the repository (after the scaffold). */
  source: () => HubSource;
  /** Writes one repo-relative file (creates folders). */
  write: (path: string, text: string) => void;
  /** Runs the Crafthall HQ team check, offline. */
  hq: () => HqOutcome;
  /** Records the Crafthall Optimize baseline, or says why not. */
  optimize: () => OptimizeOutcome;
  /** The closing canon check of the new product: structure problems and the hub model's completeness and findings. */
  check: (id: string) => { problems: string[]; completeness: number | null; findings: string[] };
}

export interface InitOptions extends AgentRulesOptions {
  today: string;
  dryRun?: boolean;
  /** Agent-rules snippet: true = add it; a string = skip it with that reason (host or `--no-agent-rules`). */
  agentRules?: true | string;
  /** Bootstrap: `repo` = the repository has content outside the hub and agent files; `apps` = only the `--app` folders count; a string = skip with that reason. */
  bootstrap?: 'repo' | 'apps' | { skip: string };
  /** Command the person runs for the bootstrap (named in the summary). */
  bootstrapHint?: string;
  /** Command that re-runs the HQ check (named in the summary). */
  hqCommand?: string;
  /** Prefix of the printed lines (default `canon init`). */
  label?: string;
}

export interface InitSummary {
  schemaVersion: number;
  tool: 'hub';
  command: 'init';
  /** True when no step was refused or failed (exit code 0). */
  ok: boolean;
  id: string | null;
  name: string | null;
  dir: string | null;
  stage: string | null;
  dryRun: boolean;
  steps: InitStep[];
  hq: Extract<HqOutcome, { kind: 'checked' }> | null;
  hub: { problems: string[]; completeness: number | null; findings: string[] } | null;
  /** What the person confirms or does next, in order. */
  confirm: string[];
}

/** Files that do not make a repository "have content" for the bootstrap: the hub, agent files, git metadata. */
export function contentFiles(files: readonly string[], { hubDir = HUB_DIR, apps = null }: { hubDir?: string; apps?: readonly string[] | null } = {}): string[] {
  const agentFile = (f: string) => /^(CLAUDE|AGENTS)\.md$/.test(f) || f.startsWith('.claude/') || /^\.git(ignore|attributes|modules)?$/.test(f) || f.startsWith('.git/');
  const inHub = (f: string) => f === hubDir || f.startsWith(`${hubDir}/`);
  const keep = files.filter((f) => f && !agentFile(f) && !inHub(f));
  if (apps == null) return keep;
  return keep.filter((f) => apps.some((d) => f.startsWith(`${d}/`) && f !== `${d}/package.json`));
}

/** Escapes a value for one Markdown table cell. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

/** The README Status row that records the HQ result (the hub's record of the team check). */
export function hqStatusRow(hq: HqOutcome, today: string): string {
  if (hq.kind === 'checked') {
    const by = [hq.version && `Crafthall HQ ${hq.version}`, hq.rulesBuild && `rules ${hq.rulesBuild}`].filter(Boolean).join(', ');
    return `| Crafthall HQ team check | ${cell(hq.verdict)} – ${today}${by ? `, ${cell(by)}` : ''} |`;
  }
  return `| Crafthall HQ team check | not run – ${cell(hq.kind === 'failed' ? `failed: ${hq.message}` : hq.message)} (${today}) |`;
}

/** The README Changelog line of the init. */
export function initChangelogLine(hq: HqOutcome, optimize: OptimizeOutcome, today: string): string {
  const hqPart = hq.kind === 'checked' ? `Crafthall HQ team check ${hq.exitCode === 0 ? 'OK' : 'found things to improve'} (offline)` : 'Crafthall HQ team check not run (see Status)';
  const optPart = optimize.kind === 'recorded' ? 'Optimize baseline recorded' : 'Optimize baseline skipped (no offline baseline yet)';
  return `- ${today} – Started as a Crafthall project (\`canon init\`): ${hqPart}; ${optPart}.`;
}

/** Adds the Status row (replacing an older HQ row) and the Changelog line (newest first) to a hub README. */
export function recordInReadme(readme: string, row: string, line: string): string {
  const lines = readme.split('\n');
  const status = lines.findIndex((l) => /^## Status\s*$/.test(l));
  if (status < 0) throw new Error('hub README has no "## Status" section');
  const old = lines.findIndex((l, i) => i > status && l.startsWith('| Crafthall HQ team check |'));
  if (old >= 0) lines[old] = row;
  else {
    let end = status + 1;
    while (end < lines.length && !lines[end].startsWith('|')) end++;
    while (end < lines.length && lines[end].startsWith('|')) end++;
    lines.splice(end, 0, row);
  }
  const log = lines.findIndex((l) => /^## Changelog\s*$/.test(l));
  if (log < 0) throw new Error('hub README has no "## Changelog" section');
  let first = log + 1;
  while (first < lines.length && lines[first].trim() === '') first++;
  lines.splice(first, 0, line);
  return lines.join('\n');
}

/** Runs the init steps in order. Never throws for an expected outcome; an unexpected exception is the caller's (exit 3). */
export function initProject(ports: InitPorts, o: InitOptions): InitSummary {
  const { today, dryRun = false, agentRules = true, bootstrap = 'repo', bootstrapHint = 'the bootstrap skill', hqCommand = 'crafthall-hq', hubDir = HUB_DIR } = o;
  const steps: InitStep[] = [];
  const confirm: string[] = [];
  const summary: InitSummary = { schemaVersion: INIT_SUMMARY_SCHEMA_VERSION, tool: 'hub', command: 'init', ok: false, id: null, name: null, dir: null, stage: null, dryRun, steps, hq: null, hub: null, confirm };
  const stop = (from: number) => {
    for (const id of INIT_STEPS.slice(from)) steps.push({ id, status: 'not-run', message: 'an earlier step stopped the init' });
    return summary;
  };

  // 1. Scaffold.
  const sc = ports.scaffold();
  if (sc.code !== 0 || !sc.summary) {
    steps.push({ id: 'scaffold', status: sc.code === 2 ? 'failed' : 'refused', message: sc.code === 2 ? 'usage error – nothing written' : 'refused or its check failed – see the lines below', lines: sc.lines });
    return stop(1);
  }
  const s = sc.summary;
  Object.assign(summary, { id: s.id, name: s.name, dir: s.dir, stage: s.stageLabel });
  steps.push({ id: 'scaffold', status: dryRun ? 'dry-run' : 'done', message: `${dryRun ? 'would create' : 'created'} ${s.dir}/ at ${s.stageLabel} (${s.pages.length} page(s), drafts)`, lines: sc.lines });

  // 2. Bootstrap: decided here, run by the skill in the user's session (a model writes it; never this command).
  if (typeof bootstrap === 'object') steps.push({ id: 'bootstrap', status: 'skipped', message: bootstrap.skip });
  else {
    const apps = bootstrap === 'apps' ? s.apps.map((a) => a.dir) : null;
    const content = apps && !apps.length ? [] : contentFiles(ports.files(), { hubDir, apps });
    if (!content.length) steps.push({ id: 'bootstrap', status: 'skipped', message: apps ? 'no --app folder with code yet, nothing to read' : 'the repository has no content besides the hub and agent files' });
    else {
      steps.push({ id: 'bootstrap', status: 'pending', message: `${content.length} file(s) to read${apps ? ` in ${apps.join(', ')}` : ''}: run ${bootstrapHint} for ${s.id} in your session; it drafts the pages from the code (every sentence sourced or a hypothesis)` });
      confirm.push(`Run ${bootstrapHint} for ${s.id}, then answer its "Confirm these" list.`);
    }
  }

  // 3. Agent-rules snippet.
  if (agentRules !== true) steps.push({ id: 'agent-rules', status: 'skipped', message: agentRules });
  else {
    const plan = planAgentRules(ports.source(), o);
    if (plan.action === 'present') steps.push({ id: 'agent-rules', status: 'done', message: `already in ${plan.file} – left as it is` });
    else {
      if (!dryRun) ports.write(plan.file, plan.text);
      const what = plan.action === 'create' ? [`create ${plan.file} with`, `created ${plan.file} with`] : [`append to ${plan.file}`, `appended to ${plan.file}`];
      steps.push({ id: 'agent-rules', status: dryRun ? 'dry-run' : 'done', message: `${dryRun ? `would ${what[0]}` : what[1]} the Canon agent rules` });
      confirm.push(`Read the agent rules in ${plan.file} and commit them with the hub.`);
    }
  }

  // 4. Crafthall HQ team check (offline).
  let hq: HqOutcome;
  if (dryRun) {
    hq = { kind: 'missing', message: 'dry run' };
    steps.push({ id: 'hq-check', status: 'dry-run', message: 'would run the Crafthall HQ team check offline (when HQ is installed)' });
  } else {
    hq = ports.hq();
    if (hq.kind === 'checked') {
      summary.hq = hq;
      steps.push({ id: 'hq-check', status: 'done', message: hq.verdict, lines: hq.hints });
      if (hq.exitCode === 1) confirm.push(`Fix or record the Crafthall HQ hints above (re-run: ${hqCommand}).`);
    } else if (hq.kind === 'failed') {
      steps.push({ id: 'hq-check', status: 'failed', message: `${hq.message}; nothing recorded` });
      confirm.push(`Re-run the team check by hand: ${hqCommand}.`);
    } else {
      steps.push({ id: 'hq-check', status: 'skipped', message: hq.message });
      confirm.push(hq.kind === 'missing' ? `Check the agent team with Crafthall HQ once it is installed (${hqCommand}).` : `Add the agent team (.claude/agents/*.md) and check it with ${hqCommand}.`);
    }
  }

  // 5. Crafthall Optimize baseline.
  const opt = dryRun ? ({ kind: 'missing', note: 'dry run' } as OptimizeOutcome) : ports.optimize();
  if (opt.kind === 'recorded') steps.push({ id: 'optimize-baseline', status: 'done', message: opt.message });
  else steps.push({ id: 'optimize-baseline', status: dryRun ? 'dry-run' : 'skipped', message: dryRun ? 'would record the Optimize baseline (skipped while Optimize has none)' : opt.note });

  // 6. Summary: record the HQ result in the hub, then the closing check.
  if (dryRun) {
    steps.push({ id: 'summary', status: 'dry-run', message: `would record the HQ result in ${s.dir}/README.md (Status, Changelog) and run canon check ${s.id}` });
    summary.ok = true;
    return summary;
  }
  const readmePath = `${s.dir}/README.md`;
  const readme = ports.source().read(readmePath);
  if (readme == null) {
    steps.push({ id: 'summary', status: 'failed', message: `${readmePath} is missing after the scaffold` });
    return summary;
  }
  ports.write(readmePath, recordInReadme(readme, hqStatusRow(hq, today), initChangelogLine(hq, opt, today)));
  const hub = ports.check(s.id);
  summary.hub = hub;
  const pct = hub.completeness == null ? 'not assessed' : `${Math.round(hub.completeness * 100)} %`;
  if (hub.problems.length) {
    steps.push({ id: 'summary', status: 'failed', message: `canon check ${s.id} – ${hub.problems.length} problem(s)`, lines: hub.problems });
    return summary;
  }
  steps.push({ id: 'summary', status: 'done', message: `HQ result recorded in ${readmePath} (Status, Changelog); canon check ${s.id} – OK, completeness ${pct}, ${hub.findings.length} finding(s) (drafts are expected)` });
  confirm.push(`Write the draft pages and set status: current once confirmed (${s.pages.length} page(s) in ${s.dir}/).`);
  summary.ok = true;
  return summary;
}

/** The text form of the summary, as `canon init` prints it. */
export function formatInitSummary(sum: InitSummary, label = 'canon init'): string {
  const out: string[] = [];
  out.push(sum.id ? `${label} – ${sum.name} (${sum.id})${sum.dryRun ? ' – dry run, nothing written' : ''}:` : `${label} – nothing created:`);
  sum.steps.forEach((st, i) => {
    out.push(`  ${i + 1}. ${st.id.padEnd(17)} ${st.status.padEnd(8)} ${st.message}`);
    for (const l of st.lines || []) out.push(`       ${l}`);
  });
  if (sum.confirm.length) {
    out.push('To confirm:');
    for (const c of sum.confirm) out.push(`  - ${c}`);
  }
  out.push(sum.ok ? `${label} – ${sum.dryRun ? 'dry run OK' : 'OK'}.` : `${label} – stopped (exit 1).`);
  return out.join('\n');
}
