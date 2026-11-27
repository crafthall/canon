/**
 * Feature recall of a drafted hub against a curated feature catalog (feature bootstrap-from-repo, R0-exit (2)).
 * `readCatalog` reads a hub's catalog (features/README.md rows + each feature file's title and `summary`, else the
 * first paragraph of its "What it does" section);
 * `matchFeatures` makes an automatic first-pass match (curated → drafted) and `matchingSheet` prints it for a reviewer,
 * who makes the final call (`applyReview`). recall = matched curated features / curated features; precision
 * = drafted features matched to at least one curated feature / drafted features – a lower bound, because the curated
 * catalog is not exhaustive: an unmatched draft may be a real feature the catalog lacks, or a split or an internal.
 *
 * Automatic match: each feature becomes a set of content words (title and slug words count twice, summary once;
 * lower case, stop words dropped, a light suffix strip so "calculators" = "calculator"). The score of a pair is the
 * larger of the Dice coefficient on title+slug words and on all words. Pairs at or above `threshold` are assigned
 * greedily, highest score first, one drafted feature per curated feature (conservative: a drafted feature that
 * covers two curated ones matches only one until the reviewer says otherwise). Pure – reads go through a HubSource.
 */
import { parseDoc, type Meta } from './front-matter.ts';
import { cellText, featureSummary, featureTableRows } from './readers.ts';
import { joinPath, type HubSource } from './source.ts';

export interface CatalogFeature {
  slug: string;
  title: string;
  summary: string;
  status: string;
}

export interface MatchCandidate {
  slug: string;
  title: string;
  score: number;
}

export interface MatchRow {
  curated: CatalogFeature;
  /** Best drafted candidates, highest score first (at most 3). */
  candidates: MatchCandidate[];
  /** Drafted slug the automatic pass assigned, or null. */
  auto: string | null;
  autoScore: number;
}

export interface MatchResult {
  rows: MatchRow[];
  drafted: CatalogFeature[];
  /** Drafted features no curated feature was matched to (automatic pass). */
  unmatchedDrafted: string[];
  matched: number;
  total: number;
  /** matched / total, or null when the curated catalog is empty. */
  recall: number | null;
  /** Drafted features the automatic pass matched / drafted features, or null when nothing was drafted. */
  precision: number | null;
  threshold: number;
}

/** The feature catalog of a product folder (`dir`, repo-relative, e.g. docs/product-hub/acme): rows with a page. */
export function readCatalog(source: HubSource, dir: string): CatalogFeature[] {
  const index = source.read(joinPath(dir, 'business-product/features/README.md'));
  if (index == null) return [];
  const out: CatalogFeature[] = [];
  const seen = new Set<string>();
  for (const row of featureTableRows(index, { sameFolder: true })) {
    for (const slug of row.docs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const text = source.read(joinPath(dir, `business-product/features/${slug}.md`));
      const { meta, body }: { meta: Meta; body: string } = text == null ? { meta: {}, body: '' } : parseDoc(text);
      const h1 = (body.match(/^#\s+(.+)$/m) || [])[1];
      const summary = typeof meta.summary === 'string' && meta.summary ? meta.summary : text == null ? '' : featureSummary(body);
      out.push({ slug, title: cellText(row.label) || cellText(h1) || slug, summary: cellText(summary), status: String(meta.status ?? row.status ?? '') });
    }
  }
  return out;
}

const STOP = new Set(
  'a an and are as at be by for from has have in into is it its of on or per the their this to with without one each all any page pages feature features tool user users via plus not no only that which when where who what how can'.split(' '),
);

/** Light suffix strip so plural and verb forms meet. */
export function stemWord(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ies', 'es', 'ed', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return suf === 'ies' ? `${w.slice(0, -3)}y` : w.slice(0, -suf.length);
  }
  return w;
}

/** Content words of a text. */
export function featureWords(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[`*_()[\]{}"'.,:;!?/\\|<>=+#–—-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stemWord);
}

const dice = (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
};

const head = (f: CatalogFeature) => new Set([...featureWords(f.title), ...featureWords(f.slug)]);
const all = (f: CatalogFeature) => new Set([...featureWords(f.title), ...featureWords(f.slug), ...featureWords(f.summary)]);

/** Similarity of two features in [0, 1]. */
export function similarity(a: CatalogFeature, b: CatalogFeature): number {
  return Math.max(dice(head(a), head(b)), dice(all(a), all(b)));
}

export const DEFAULT_THRESHOLD = 0.3;

/** Automatic first-pass match of curated features to drafted ones. */
export function matchFeatures(curated: readonly CatalogFeature[], drafted: readonly CatalogFeature[], { threshold = DEFAULT_THRESHOLD } = {}): MatchResult {
  const pairs: { c: number; d: number; score: number }[] = [];
  curated.forEach((c, ci) => drafted.forEach((d, di) => pairs.push({ c: ci, d: di, score: similarity(c, d) })));
  pairs.sort((x, y) => y.score - x.score || x.c - y.c || x.d - y.d);
  const autoOf = new Map<number, { d: number; score: number }>();
  const usedD = new Set<number>();
  for (const p of pairs) {
    if (p.score < threshold) break;
    if (autoOf.has(p.c) || usedD.has(p.d)) continue;
    autoOf.set(p.c, { d: p.d, score: p.score });
    usedD.add(p.d);
  }
  const rows: MatchRow[] = curated.map((c, ci) => {
    const candidates = pairs
      .filter((p) => p.c === ci && p.score > 0)
      .slice(0, 3)
      .map((p) => ({ slug: drafted[p.d].slug, title: drafted[p.d].title, score: Math.round(p.score * 100) / 100 }));
    const a = autoOf.get(ci);
    return { curated: c, candidates, auto: a ? drafted[a.d].slug : null, autoScore: a ? Math.round(a.score * 100) / 100 : 0 };
  });
  const matched = rows.filter((r) => r.auto).length;
  return {
    rows,
    drafted: [...drafted],
    unmatchedDrafted: drafted.filter((_, di) => !usedD.has(di)).map((d) => d.slug),
    matched,
    total: curated.length,
    recall: curated.length ? matched / curated.length : null,
    precision: drafted.length ? usedD.size / drafted.length : null,
    threshold,
  };
}

/** A reviewer's decisions: curated slug → drafted slug(s) that cover it, or null/[] for "not found". */
export type Review = Readonly<Record<string, string | readonly string[] | null>>;

/** Recall after the reviewer's calls; curated features the review does not name keep the automatic match. */
export function applyReview(result: MatchResult, review: Review): { matched: number; total: number; recall: number | null; reviewed: number; draftedMatched: number; drafted: number; precision: number | null } {
  let matched = 0;
  let reviewed = 0;
  const used = new Set<string>();
  for (const r of result.rows) {
    if (Object.prototype.hasOwnProperty.call(review, r.curated.slug)) {
      reviewed++;
      const v = review[r.curated.slug];
      const slugs = v == null ? [] : typeof v === 'string' ? [v] : [...v];
      if (slugs.length) matched++;
      for (const s of slugs) used.add(s);
    } else if (r.auto) {
      matched++;
      used.add(r.auto);
    }
  }
  const draftedMatched = result.drafted.filter((d) => used.has(d.slug)).length;
  const drafted = result.drafted.length;
  return { matched, total: result.total, recall: result.total ? matched / result.total : null, reviewed, draftedMatched, drafted, precision: drafted ? draftedMatched / drafted : null };
}

const esc = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The matching sheet (Markdown) for a reviewer. */
export function matchingSheet(result: MatchResult, { title = 'Matching sheet' } = {}): string {
  const pct = result.recall == null ? 'n/a' : `${Math.round(result.recall * 100)} %`;
  const lines = [
    `# ${title}`,
    '',
    `Automatic first pass (threshold ${result.threshold}): ${result.matched} of ${result.total} curated features matched – recall ${pct}; ${result.drafted.length - result.unmatchedDrafted.length} of ${result.drafted.length} drafted features matched – precision ${result.precision == null ? 'n/a' : `${Math.round(result.precision * 100)} %`}. The reviewer confirms or overrides each row in review.json (curated slug → drafted slug, a list of slugs, or null).`,
    '',
    '| Curated feature | Curated summary | Auto match | Score | Other candidates |',
    '|---|---|---|---|---|',
    ...result.rows.map((r) => {
      const others = r.candidates.filter((c) => c.slug !== r.auto).map((c) => `${c.slug} (${c.score})`);
      const auto = r.auto ? `${r.auto} – ${esc(result.drafted.find((d) => d.slug === r.auto)?.title ?? '')}` : '–';
      return `| ${esc(r.curated.title)} (\`${r.curated.slug}\`, ${esc(r.curated.status)}) | ${esc(r.curated.summary)} | ${auto} | ${r.autoScore || '–'} | ${others.join(', ') || '–'} |`;
    }),
    '',
    '## Drafted features',
    '',
    '| Drafted feature | Summary | Status | Auto-matched |',
    '|---|---|---|---|',
    ...result.drafted.map((d) => `| ${esc(d.title)} (\`${d.slug}\`) | ${esc(d.summary)} | ${esc(d.status)} | ${result.unmatchedDrafted.includes(d.slug) ? 'no' : 'yes'} |`),
    '',
  ];
  return lines.join('\n');
}
