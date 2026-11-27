# Shared fixture hubs

Small fictional repository roots for the Canon contract tests (#1048, ADR-0002). Every release form – the `canon` CLI, the standalone Claude Code plugin (#1059) and the HQ module (#1060) – runs `canon check --all --json --root <fixture>` (or its own equivalent) on each folder here and must report exactly what `<fixture>.expected.json` says: the exit code and the contract view of the report (problems, and per product the stage, completeness, done/total and findings). The list of fixtures, `contractView` and the finding branches are exported by [`../index.ts`](../index.ts); the test that holds the core and the CLI to the expectations is `tests/fixtures.test.ts`.

**Today.** The experiments rule compares `revisit-by` with a date the caller passes (no clock in the core). The tests pass `FIXTURE_TODAY` (2026-11-26); every today from 2026-01-16 to 2099-12-31 gives the same report, so `canon check` with the real date matches.

All names are invented ("Acme …"); nothing links outside a fixture. The expectations were produced by the engine at the commit that added them and checked line by line against the defects below; regenerate one only together with the change that is meant to alter it, and say so in the PR.

| Fixture | Content | Exit | Expected result |
|---|---|---|---|
| `complete` | `acme-ledger` at Development (`status: building`), every page `current`, catalog matches the feature files, one ADR, a tagged app, a valid experiments page (one experiment past its date with a result, one due 2099-12-31) | 0 | 0 problems, 0 findings, completeness 16/16 = 100 % |
| `early` | `acme-sprout` at Idea: the hub README and `business-product/overview.md` only | 0 | 0 problems, 0 findings, completeness 1/1 = 100 % (counted against Idea only) |
| `empty` | no `docs/product-hub/` folder | **0** | 0 products, 0 problems. The plan said exit 1 "no hub"; `canon check --all` exits 0 today ("OK (0 product folder(s))"). The Lead kept exit 0 (2026-11-26, #1048): an empty repository is a valid state, and the HQ module shows its empty state from `products: []` |
| `drifted` | `acme-ledger` with a pricing reversal, plus `acme-orbit`, `framework/`, a stray file, an untagged, a tag-only and a broken project | 1 | every structure rule (`CHECK_RULES`, 14) exactly once and every health check that is a finding (`HEALTH_CHECKS` but `missing-page`, 13) exactly once; completeness 8/15 |
| `drifted-variants` | `acme-kappa` and `acme-lambda`: the finding branches and problem wordings `drifted` cannot hold without repeating a kind | 1 | 14 problems, 13 findings, every remaining finding branch |

## `drifted`: one defect per line

The pricing reversal: ADR-0004 (paid plans only) supersedes ADR-0001 (free tier), but ADR-0001 was not updated, the catalog still lists the free tier as built and the R2 release plan is a draft that still promises it.

| Defect | Structure rule | Health check (finding) |
|---|---|---|
| `features/exports.md` says `product: acme-orbit` | `front-matter` | `foreign-feature` |
| `overview.md` links `pricing.md`, which does not exist | `link` | – |
| `business-product/pricing-notes.txt` | `layout` | – |
| `ai-development-workflow/documentation-skills.md` missing | `lifecycle` | `workflow-incomplete` |
| `acme-orbit` README `status: beta` | `status` | `readme-meta` |
| `features/team-seats.md` `status: shipped` | `feature` | `feature-status` |
| `features/audit-log.md` has no catalog row | `catalog` | `catalog-orphan` |
| ADR-0003 not linked from the decisions index | `adr-index` | – |
| README `app: apps/acme-ledger-web`, which has no `product:acme-ledger` tag | `app` | – |
| "## Pricing" in `monetization.md` and `go-to-market.md` | `topic` | – |
| `libs/acme-sync` tagged `product:acme-sync`, no hub | `tagged-without-hub` | – |
| `docs/product-hub/framework/` | `reserved-id` | – |
| `docs/product-hub/notes.md` | `hub-folder` | – |
| `apps/acme-broken/package.json` is not valid JSON (no hub README names it) | `package-json` | – |
| `features/free-tier.md` is `removed`, the catalog row says `built` | – | `catalog-mismatch` |
| `features/free-tier.md` updated 2026-03-10, README 2026-03-01 | – | `feature-newer` |
| ADR-0002 `status: approved` | – | `adr-status` |
| ADR-0004 supersedes ADR-0001, which names no successor | – | `adr-supersession` |
| README `plan: acme-ledger-2025` does not exist | – | `plan-missing` |
| launch task "Announce the free tier" is `blocked` | – | `launch-task-status` |
| `releases/r2-launch.md` is `status: draft` | – | `draft-page` |
| `experiments.md`: E2 was due 2026-01-15 and has no result (E1 has a result, E3 has no date yet – neither is a finding) | – | `experiment-overdue` |

`missing-page` is a health row state, not a finding: `drifted` shows it as the rows `business-plan` (the named plan is missing) and `ai-workflow` (one page missing) in state `missing`.

## `drifted-variants`

`acme-kappa`: README front matter that does not parse (finding `readme-parse`; not assessed). `acme-lambda` (Idea): README names another product (`front-matter` + `readme-product`) and an app that does not exist (`app`); an unknown folder (`layout`, reported once through the folder); a page without front matter, one without `updated`, one with a non-date `updated` (`front-matter` ×3); a catalog row without a file (`catalog` + `link` + `catalog-row-without-file`); a duplicate catalog row; a feature whose front matter does not parse (`feature-parse` and, since its status then reads as none, `feature-status`); a candidate linking a missing feature (`link` + `candidate-dangling`); four ADRs without a decisions index (`adr-index` ×4) covering the four other supersession wordings; the README links `apps/acme-lambda-web/`, whose `package.json` is not valid JSON (`package-json`, reported once although both the app rule and the project scan meet it). The README and `features/alpha.md` carry `draft: true` (`draft-flag-readme`, `draft-flag-feature`, health check `draft-page`; #1146 – the mark the bootstrap skill writes on pages whose `status` is a stage or feature status). Completeness 1/3 at Idea.

## Finding branches without a fixture or a health check

- `rule-grades` (Rule grades: …) needs the host's rules hook, which `canon check` never passes; no release form can report it. It is the only branch with `check: null` in `../index.ts` (the test allows `null` only for a branch in `UNREACHABLE_BRANCHES`).
- `feature-parse` belongs to the health check `feature-status` and `candidate-dangling` to `catalog-orphan` (#1127): both rows were widened to name them, like `readme-meta` already names a README whose front matter does not parse. They are reached in `drifted-variants`, so `drifted` still holds every health check exactly once.
