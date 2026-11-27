# Health checks – completeness and drift

The check turns "are the docs up to date?" into a count and a list of rows to fix. The source in code is `healthOf()`, `completeness()` and `HEALTH_CHECKS` in `src/index.ts`.

## Completeness

**Completeness = required and triggered pages that exist and have no open finding ÷ all required and triggered pages** at the product's stage.

- A missing required page stays in the denominator.
- Optional and not-yet-due pages never count.
- A page with an open finding exists but is not complete (state `review`).
- An unknown stage (paused, retired, typo) → "not assessed", never 0 %.

Completeness says the files exist and agree with each other – not that every claim is true.

## Findings

| Kind | Finding |
|---|---|
| missing | A page the current stage requires does not exist. |
| missing | Some, but not all four, AI & development workflow pages exist. |
| review | A page is still marked `status: draft`, or – the hub README and feature pages, whose `status` is a stage or feature status – `draft: true`. |
| review | A feature page changed after the hub README – the index may be stale. |
| review | An experiment whose `revisit-by` date is before today with no recorded result (`experiment-overdue`; today is passed in – the CLI uses the real date, `--today` overrides it). |
| inconsistent | A feature status outside the allowed list, or feature front matter that does not parse. |
| inconsistent | The feature catalog and the feature page disagree on status. |
| inconsistent | A feature page without a catalog row, a catalog row or a candidate that links a missing page, or two rows for one page. |
| inconsistent | A feature page that names another product. |
| inconsistent | A decision record with an unknown status. |
| inconsistent | A one-sided or dangling supersession link between decision records. |
| inconsistent | The hub names a business plan that does not exist. |
| inconsistent | The hub README names another product, an unknown status or front matter that does not parse. |
| inconsistent | A launch task in the roadmap whose status is not open, in progress or done. |

## Two steps: script, then an agent's read

1. **Mechanical check** (fast, deterministic): structure, required pages for the stage, front matter, relative links, catalog vs feature pages, decision index, app tags. Command: `canon check <id>|--all`; `--json` prints the problems and the hub model as one versioned report.
2. **Semantic read** (an agent skill): an agent reads the pages together and reports contradictions a script cannot see – gates vs decisions, release status vs merged pull requests, `built` features vs code, go-to-market vs the release scope, overview vs value proposition, changelog vs recent pull requests. In Claude Code: the plugin's skill `hub-check`.

Both run before every pull request that changes a product, and before a release.

## Worked example – a reversed decision

Decision 0005 said "the free check runs offline in release 1, the engine later". Decision 0006 replaced it: "every rule runs offline". If record 0006 lists `supersedes: [5]` but 0005 does not name its successor:

- the script reports: *"ADR-0006 supersedes ADR-0005, but ADR-0005 does not name it as successor."* – decision records drop from `ok` to `review`.
- the agent's read then finds the other pages that still describe the old plan – on the first run in the first adopter's repository, 7 stale facts in 3 product folders.
