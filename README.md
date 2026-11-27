# @crafthall/canon – Crafthall Canon

> One folder per product that agents and people keep current: what the product is, how it earns, how it is built and how agents work on it – with a check that finds stale pages.

This repository is the **framework**: the core package (page layout, lifecycle stages, documentation matrix, health checks, completeness, the readers that build a product from a hub folder, the structure check, the scaffold and the versioned `--json` report – pure TypeScript with no runtime dependencies), the `canon` CLI, the page template, the Claude Code plugin with its skills, the framework docs and a worked example. Every file read goes through one `HubSource`; the disk source is the separate entry `@crafthall/canon/node`, so the main entry runs anywhere.

**Status (2026-11-27): 0.3.0, public, MIT.** Renamed from Crafthall Product Hub (`@crafthall/product-hub`, CLI `hub`) in 0.2.0. Since 0.3.0 the hub lives in `docs/crafthall/canon/` (was `docs/product-hub/`, still read; see [docs/layout.md](docs/layout.md)). Installed as a git dependency pinned to a release tag (no registry); each tag carries a built `dist/` (see [CONTRIBUTING.md](CONTRIBUTING.md) "Releases").

## Install

```bash
npm install --save-dev "git+https://github.com/crafthall/canon.git#v0.3.0"
npx canon new my-product --stage validation --name "My Product" --pitch "One line"
npx canon check --all
```

The tag's commit carries the built `dist/` and no install script runs, so the install is a plain git fetch (cached by npm like any package). `npm run test:clean-install` in this repository runs exactly this path in a fresh temp folder with an empty npm cache and prints the command count and the time.

## The idea in four lines

1. **Agents do not remember conversations, they remember files.** A product's current state must live in files the next agent reads first.
2. **One folder per product, fixed layout.** Three sections – Business & Product, Architecture & Engineering, AI & Development Workflow – one topic per page, four front matter keys on every page.
3. **The stage decides what must exist.** Eight lifecycle stages (Idea → Operate); a matrix says which page is required, triggered, optional or not yet due at each one. No empty placeholders.
4. **Staleness is found, not remembered.** A health check counts completeness and lists pages in draft, catalog rows that disagree with feature pages and one-sided decision supersessions.

## Documentation

| Page | What it covers |
|---|---|
| [docs/concept.md](docs/concept.md) | The problem, the idea, who it is for and what it is not |
| [docs/layout.md](docs/layout.md) | The folder layout, the three sections, every page and its front matter |
| [docs/lifecycle.md](docs/lifecycle.md) | The eight stages and the documentation matrix |
| [docs/health-checks.md](docs/health-checks.md) | Completeness, health findings and the two-step check (script, then an agent's read) |
| [docs/getting-started.md](docs/getting-started.md) | Start a hub for a product and keep it current in every pull request |
| [docs/use-with.md](docs/use-with.md) | Use it with MADR, spec-kit, OpenSpec and BMAD: where their files go and what the hub adds |

## API

```ts
import { SECTIONS, STAGES, REQUIREMENTS, HEALTH_CHECKS, healthOf, completeness, requirementsAt, stageOfStatus } from '@crafthall/canon';

const stage = stageOfStatus('validation');            // 'validation'
requirementsAt('validation').map((r) => r.label);     // pages required to leave Validation
const h = healthOf({ stage, present: { overview: true, value: true }, findings: [] });
completeness(h);                                      // 0.666… (metrics still missing)
```

| Export | What it is |
|---|---|
| `SECTIONS` | the three sections with their pages (path, title, what goes there, matrix row) |
| `STAGES`, `STAGE_OF_STATUS`, `stageOfStatus()` | the eight stages; hub README `status` → stage |
| `REQUIREMENTS`, `LEVEL_LABEL`, `levelAt()`, `requirementsAt()` | the documentation matrix |
| `HEALTH_CHECKS`, `healthOf()`, `completeness()` | what the check reports and how completeness is counted |
| `HUB_PATHS`, `WORKFLOW_PAGES`, `FRONT_MATTER_KEYS`, `PRODUCT_STATUSES`, `FEATURE_STATUSES`, `ADR_STATUSES`, `RESERVED_IDS`, `HUB_DIR` | layout and vocabularies |
| `splitFrontMatter()`, `parseYaml()`, `parseDoc()`, `splitSections()` | the front matter parser (a YAML subset that rejects what it cannot read) and `##` sections |
| `loadProductDocs(source, opts)`, `productIds()`, `readHubProduct()`, `buildProduct()` | read every hub (or one) and build each product: documents, features, decision records, candidates, launch tasks, findings, health |
| `featureFindings()`, `adrFindings()`, `featureTableRows()`, `featureCounts()`, `markdownTable()` | the finding rules and table readers on their own |
| `checkHub(source, { hubDir, only })`, `checkProduct()`, `checkConsistency()`, `LAYOUT`, `REQUIREMENT_FILES`, `CHECK_RULES` | the structure check: layout, front matter, links, lifecycle files, catalog, ADR index, app tags, one topic per page; each problem is `{ rule, file, message }` |
| `planNew(source, opts, options)`, `parseNewArgs()`, `rebaseLinks()`, `STAGE_STATUS`; `applyPlan(root, actions)` from `/node` | the scaffold: plan the new hub folder as actions, then write them |
| `hubReport(source, options)`, `HUB_REPORT_SCHEMA_VERSION` | the `--json` report |
| `HubSource`, `memorySource()`, `overlaySource()`; `nodeSource(root)` from `@crafthall/canon/node` | where files come from: tests use memory, Node uses the disk; an overlay reads one source over another |

```ts
import { completeness, loadProductDocs } from '@crafthall/canon';
import { nodeSource } from '@crafthall/canon/node';

const { products } = loadProductDocs(nodeSource(process.cwd()));   // docs/crafthall/canon/<id>/ for every id
for (const p of products) console.log(p.id, p.stage, completeness(p.health), p.findings.length);
```

Options: `plans` (business plans the host loaded), `render(md, file)` (Markdown → HTML; default keeps Markdown), `rules` + `ruleFiles` (a host hook for a rule-pipeline page). Imports inside the sources carry the `.ts` extension, so Node 24 runs `src/` directly in this repository; an installed copy runs the build in `dist/` (Node does not strip types inside `node_modules`).

**Who uses it:** the first adopter's dashboard (the readers, plus its own rendering and rule-grades hook), its npm scripts (thin wrappers over `runNew` / `runCheck` / `runInit` that pass its labels and options), its repository check and a hidden preview page about the framework. Change the matrix here and in [docs/lifecycle.md](docs/lifecycle.md) together – a differential test fails otherwise.

## CLI

The package's bin `canon` (`src/cli.ts`, also importable as `@crafthall/canon/cli`):

```bash
canon new <id> --stage idea|validation|building|live [--name "<Name>"] [--pitch "<one line>"] [--team <id>] \
        [--app <nx-project>[:<role>]]... [--plan <business-plan-id>] [--issue <N>] [--dry-run] [--root <dir>]
canon check <id>|--all [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>]
canon init <id> [the canon new options] [--json] [--hq <file>] [--no-hq] [--no-agent-rules] [--no-bootstrap]
```

- Exit codes: **0** OK (created, or no problem), **1** refused or problems found, **2** usage error, **3** internal error – an exception the command did not expect (a bug, a file it cannot read): one `… – internal error: …` line on stderr and no report on stdout, so it never reads as "problems found". A project `package.json` in `apps/` or `libs/` that is not valid JSON is not an internal error but a problem (rule `package-json`, exit 1), because the check can name the file and the fix.
- `canon new` takes each template page from the repository's `<hubDir>/_template/` when it has that page, else from the bundled `template/` (`overlaySource`) – a repository keeps only the pages it changes; it never overwrites and ends with `canon check <id>`.
- `canon check --json` prints one report (`src/report.ts`, `hubReport()`): `schemaVersion` (1), `ok`, `counts`, `problems` (`{ rule, file, message }`, rule ids in `CHECK_RULES`) and `products` – the hub model of each product (stage, completeness, health rows, features, decision records, launch tasks, health findings). Schema: [`schema/hub-check.schema.json`](schema/hub-check.schema.json). It is the contract for the Claude Code plugin and the HQ module (ADR-0002); `schemaVersion` rises on a breaking change only. The schema is strict (no unknown fields at any level) because it is the producer's test – it catches a field added to the report without the schema; readers do not validate against it and ignore fields they do not know. Health findings never fail the check; problems do.
- `--today` (default: the real date, UTC) is the date the experiments rule compares each `revisit-by` with: a row before it with no result is the finding `experiment-overdue` (kind `stale`, area `experiments`). The core has no clock – `hubReport()`, `loadProductDocs()` and `buildProduct()` take `today` as an option and, without it, report no experiment as overdue.
- `canon init` (`src/init.ts` with the Node ports in `src/init-node.ts`; feature `crafthall-project-init`) starts a repository as a Crafthall project, in this order: **scaffold** (`canon new` with the same options; a refusal stops everything, nothing written) → **bootstrap** (`pending` when the repository has files besides the hub, agent files and git metadata – the skill [`plugin/skills/project-init/`](plugin/skills/project-init/SKILL.md) then runs [`plugin/skills/bootstrap/`](plugin/skills/bootstrap/SKILL.md) in the user's session; the command never runs a model) → **agent-rules** (the snippet of `src/agent-rules.ts` appended to `CLAUDE.md`, else `AGENTS.md`, else a new `CLAUDE.md`; a block already there is kept) → **hq-check** (Crafthall HQ from `--hq <file>`, the installed Claude Code plugin `crafthall-hq` or `crafthall-hq` on PATH, run as `<hq> <repo> --json` offline: every `CRAFTHALL_HQ_*` / `ATHENA_*` setting removed, a fresh empty config folder, a result without `offline: true` refused; missing or no agent team → skipped with the message) → **optimize-baseline** (skipped with a note: Optimize has no free, offline baseline) → **summary** (a `Crafthall HQ team check` row in the hub README Status table and a Changelog line, then the closing check, completeness and the "To confirm" list). `--json` prints the `InitSummary` (`schemaVersion` 1: `ok`, `steps[{ id, status, message, lines }]`, `hq`, `hub`, `confirm`). Exit codes as above (0 initialised or dry run, 1 refused or a step failed). A host sets `agentRules` (skip with a reason), `bootstrap` (`apps` = only the `--app` folders count), `hq` (its own HQ file) and replaces ports through `runInit()`.
- A host passes its own options through `runNew()` / `runCheck()` / `runInit()` (labels, allowed teams, a moved-paths map, a plans folder).

## Tests

`npm test` (vitest, with a load-scaled hang guard in `test-kit/`):

- **Unit** – the model; the parser and every finding kind both ways (`tests/readers.test.ts`); every structure rule both ways (`tests/check.test.ts`); the scaffold plan and path helpers (`tests/scaffold.test.ts`); `canon init` with fake ports (`tests/init.test.ts`); the citation and recall scorers; the change-coupled rule.
- **Property** (fast-check) – completeness, the experiments overdue rule, path helpers against `node:path`, the agent-rules snippet, the change-coupled rule, plugin exit codes, any sequence of breaking edits on a fixture hub.
- **Differential** – the matrix in [docs/lifecycle.md](docs/lifecycle.md) equals `REQUIREMENTS`; the committed plugin equals `canon check` on every fixture hub; the `--json` report of every fixture validates against the schema (ajv).
- **End to end** – `tests/cli.e2e.test.ts` (`canon new` + `canon check` in a clean git repository; drifted hub exit 1; unreadable page exit 3; usage errors exit 2), `tests/init.e2e.test.ts` (the clean `canon init` path, counted), `tests/example-replay.e2e.test.ts` (the [worked example](examples/pricing-reversal/README.md)).

Outside `npm test`: `npm run test:plugin-install` (a real `claude plugin install` from this repository's development marketplace in an isolated Claude Code, no network; needs `claude`) and `npm run test:clean-install` (the package installed from a release tag into a fresh fixture repository; needs git access to this repository).

**Standalone Claude Code plugin.** [`plugin/`](plugin/README.md) is the plugin `crafthall-canon` (development marketplace `crafthall-canon-dev` in `.claude-plugin/`): the command `/crafthall-canon:check` (`src/plugin-runner.ts` over `runCheck --json`), the skills (`plugin/skills/` is their only copy) and the core bundled into `plugin/scripts/hub-core.mjs` by `npm run build:plugin` (committed; regenerate after a change to `src/` or `template/`). `tests/plugin.test.ts` (in `npm test`): manifest, arguments (+ property), freshness of the bundle and template, plugin = CLI on the five fixtures in a temp folder; `tests/plugin-install.claude.test.ts` (`npm run test:plugin-install`, needs `claude`): a real install in an isolated Claude Code, no network.

**Contract-test kit (`@crafthall/canon/testing`).** Five fictional fixture hubs in `tests/fixtures/hubs/` (`complete`, `early`, `empty`, `drifted`, `drifted-variants`) with checked-in expectations; `tests/fixtures.test.ts` asserts the core and the CLI give exactly those. Every other release form (the standalone plugin, the HQ module) imports `fixtures()` and `contractView()` from `@crafthall/canon/testing` and asserts its own output equals the CLI's on each fixture – no copies. The same entry has the plugin test helpers (`PLUGIN_DIR`, `walk`, `runPluginCommand`); `@crafthall/canon/testing/mutations` has the deterministic breaking edits. The kit imports no test runner.

## Not here yet

- No registry publication, no licence (`UNLICENSED`, private), no public marketplace listing – decided separately, after the repository moves to the `crafthall` organization.

## Trademarks

BMad Method is a trademark of BMad Code, LLC; GitHub and spec-kit are trademarks of GitHub, Inc.; Backstage is a trademark of the Linux Foundation. Crafthall Canon has no affiliation with, or endorsement from, any of them.

## Licence

MIT – see [LICENSE](LICENSE).
