// Deterministic breaking edits of one hub's in-memory sources (exported as `@crafthall/canon/testing/mutations`).
// tests/fixtures.test.ts applies them to the fixture hubs (a property: every breaking edit is reported); a host can
// apply the same edits to its own hubs and compare the readers' output with a golden file it recorded earlier. Each edit takes and returns a source object in the
// readHubProduct shape (texts null when a file is missing) and never mutates its input.

/** Replaces the value of a top-level front matter key (adds the key when missing). */
export function setFront(text, key, value) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return `---\n${key}: ${value}\n---\n${text}`;
  const lines = m[1].split('\n');
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i >= 0) lines[i] = `${key}: ${value}`;
  else lines.push(`${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${String(text).slice(m[0].length)}`;
}

const editFirst = (list, fn) => (list.length ? [fn(list[0]), ...list.slice(1)] : list);

export const MUTATIONS = {
  'readme-bad-status-and-product': (s) => ({ ...s, readme: setFront(setFront(s.readme, 'status', 'bogus'), 'product', 'other-product') }),
  'readme-broken-yaml': (s) => ({ ...s, readme: setFront(s.readme, 'name', 'a: b') }),
  'readme-unknown-plan': (s) => ({ ...s, readme: setFront(s.readme, 'plan', 'no-such-plan') }),
  'readme-paused': (s) => ({ ...s, readme: setFront(s.readme, 'status', 'paused') }),
  'readme-old-updated': (s) => ({ ...s, readme: setFront(s.readme, 'updated', '2000-01-01') }),
  'feature-bad-status': (s) => ({ ...s, features: editFirst(s.features, (f) => ({ ...f, text: setFront(f.text, 'status', 'shipped') })) }),
  'feature-foreign-product': (s) => ({ ...s, features: editFirst(s.features, (f) => ({ ...f, text: setFront(f.text, 'product', 'someone-else') })) }),
  'feature-file-removed': (s) => ({ ...s, features: s.features.slice(1) }),
  'feature-not-in-catalog': (s) => ({ ...s, features: [...s.features, { file: `${s.dir}/business-product/features/zz-orphan.md`, text: '---\nproduct: x\npage: feature\nstatus: built\nupdated: 2026-01-01\n---\n\n# Orphan\n\nText.\n' }] }),
  'feature-broken-yaml': (s) => ({ ...s, features: editFirst(s.features, (f) => ({ ...f, text: setFront(f.text, 'group', '[unterminated') })) }),
  'catalog-duplicate-row': (s) => {
    const row = (String(s.featuresIndex || '').split('\n').find((l) => /^\|.*\]\((?:\.\/)?[a-z0-9-]+\.md/.test(l) && !/candidates|readme/i.test(l)));
    return row ? { ...s, featuresIndex: `${s.featuresIndex}\n${row}\n` } : s;
  },
  'catalog-status-mismatch': (s) => {
    const f = s.features[0];
    if (!f) return s;
    const slug = f.file.split('/').pop().replace(/\.md$/, '');
    const cur = (f.text.match(/^status:\s*(\S+)/m) || [])[1];
    const other = cur === 'later' ? 'built' : 'later';
    return { ...s, featuresIndex: `${s.featuresIndex || ''}\n\n| Mismatch row | ${other} | [${slug}](${slug}.md) |\n|---|---|---|\n` };
  },
  'adr-bad-status': (s) => ({ ...s, adrs: editFirst(s.adrs, (a) => ({ ...a, text: setFront(a.text, 'status', 'maybe') })) }),
  'adr-superseded-without-successor': (s) => ({ ...s, adrs: editFirst(s.adrs, (a) => ({ ...a, text: setFront(setFront(a.text, 'status', 'superseded'), 'superseded-by', '[]') })) }),
  'adr-dangling-supersedes': (s) => ({ ...s, adrs: editFirst(s.adrs, (a) => ({ ...a, text: setFront(setFront(a.text, 'supersedes', '[9999]'), 'superseded-by', '[9998]') })) }),
  'overview-draft': (s) => ({ ...s, overview: s.overview ? setFront(s.overview, 'status', 'draft') : s.overview }),
  'overview-missing': (s) => ({ ...s, overview: null }),
  'workflow-one-missing': (s) => ({ ...s, workflow: { ...s.workflow, 'definition-of-done': null } }),
  'architecture-missing': (s) => ({ ...s, architecture: null, components: null }),
  'launch-task-bad-status': (s) => ({ ...s, roadmap: `${s.roadmap || '---\nproduct: x\npage: roadmap\nstatus: current\nupdated: 2026-01-01\n---\n\n# Roadmap\n'}\n\n## Launch tasks\n\n| Task | Needed for | Status | Owner | Issue |\n|---|---|---|---|---|\n| Ship it | launch | blocked | yes | #1 |\n` }),
  'candidate-dangling': (s) => ({ ...s, candidates: '---\nproduct: x\npage: candidates\nstatus: current\nupdated: 2026-01-01\n---\n\n# Candidates\n\n| Candidate | What it would add | Gate | Related feature | Source |\n|---|---|---|---|---|\n| Ghost | more | later | [ghost](ghost.md) | idea |\n' }),
};

/**
 * Inserts one row with a bad status into the roadmap's existing "## Launch tasks" table (right after its separator
 * line), or appends that section when the roadmap has none (a test review). Sharper than
 * `launch-task-bad-status` above, which always appends a second "## Launch tasks" section – the readers read only the
 * first one, so on a hub that already has the table that edit is invisible. Kept out of MUTATIONS: the golden file
 * predates it and is never regenerated; its oracle is "the clean hub's findings plus exactly this one"
 * (tests/differential.test.ts).
 */
export function insertLaunchTask(roadmap, row = '| Ship it | launch | blocked | yes | #1 |') {
  const text = String(roadmap || '---\nproduct: x\npage: roadmap\nstatus: current\nupdated: 2026-01-01\n---\n\n# Roadmap\n');
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^##\s+launch tasks\b/i.test(l));
  if (at >= 0) {
    for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]) && /^\s*\|/.test(lines[i - 1] || '')) {
        lines.splice(i + 1, 0, row);
        return lines.join('\n');
      }
    }
  }
  return `${text}\n\n## Launch tasks\n\n| Task | Needed for | Status | Owner | Issue |\n|---|---|---|---|---|\n${row}\n`;
}

/**
 * Adds one experiment due 2000-01-01 with no result: into the existing "## Experiments" table (right after its
 * separator line), or as a new experiments page when the hub has none. Overdue for any today after 2000-01-01 – only
 * when the readers get a `today` (no clock in the core). Kept out of MUTATIONS for the same reason as insertLaunchTask.
 */
export function insertExperiment(experiments, row = '| X1 | An overdue bet | a number | ≥ 1 | 0 | someone | 2000-01-01 | |') {
  const header = '| ID | Hypothesis | Metric | Go | Kill | Owner | Revisit by | Result |\n|---|---|---|---|---|---|---|---|';
  const text = experiments == null ? null : String(experiments);
  const lines = text ? text.split('\n') : [];
  const at = lines.findIndex((l) => /^##\s+experiments\b/i.test(l));
  if (at >= 0) {
    for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]) && /^\s*\|/.test(lines[i - 1] || '')) {
        lines.splice(i + 1, 0, row);
        return lines.join('\n');
      }
    }
  }
  return `${text || '---\nproduct: x\npage: experiments\nstatus: current\nupdated: 2026-01-01\n---\n\n# Experiments\n'}\n\n## Experiments\n\n${header}\n${row}\n`;
}

export const SHARP_MUTATIONS = {
  'launch-task-bad-status-in-table': (s) => ({ ...s, roadmap: insertLaunchTask(s.roadmap) }),
  'experiment-overdue': (s) => ({ ...s, experiments: insertExperiment(s.experiments) }),
};
