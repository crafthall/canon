# Use with – MADR, spec-kit, OpenSpec and BMAD

Canon does one job that none of the tools below does for a whole product: it says which product pages must exist at each lifecycle stage (the [lifecycle matrix](lifecycle.md)) and runs a [health check](health-checks.md) that finds the pages that are missing, still in draft or contradict each other. Everything else it holds can come from tools you may already use. Keep MADR as the format of your decision records, spec-kit or OpenSpec for the spec of one change, and BMAD for producing documents, then let the hub hold the results in one folder per product and check them.

This page says, for each tool, what it does well, where its files go in the [hub layout](layout.md) and what the hub adds. Claims about the tools come from the product hub's competitive index (an internal, scored comparison of seven tools, sources opened 2026-11-26) or from the tool's own page, linked with the date it was opened.

## At a glance

| Tool | Strong at | Where it goes in the hub | What the hub adds |
|---|---|---|---|
| MADR | one decision per file, with options and consequences | `architecture-engineering/decisions/NNNN-<slug>.md` | the business, features and gates around the decisions; two-sided supersession links checked |
| spec-kit | the spec, plan and tasks of one change, with agent commands | linked from the feature page it changes, `business-product/features/<slug>.md` | the product above single changes: catalog, roadmap, monetization, decisions |
| OpenSpec | the current behaviour of a system, one spec per capability, plus changes in flight | specs behind `business-product/features/<slug>.md`; proposals linked from the feature page | business layer, decision status, roadmap and gates; required pages per stage |
| BMAD | producing many documents with agent personas, including business ones | each output in its fixed hub page (table in the BMAD section) | one fixed folder per product, a stage matrix and a product-level health check |

## MADR – decision records

**What it does well.** MADR is the reference template for an architecture decision record: status, date, context, options, outcome, consequences and an optional "Confirmation" section on how compliance is checked (competitive index, MADR evidence). Adoption is a copy: "Copy it into `docs/decisions`. For each ADR, copy the template to `nnnn-title.md` and adapt" ([adr/madr README](https://github.com/adr/madr), opened 2026-11-26). It is dual-licensed MIT and CC0 (same page). It covers one job of the hub – decision records – and the index rates it a complement (overlap verdict).

**How to use it with the hub.**

- Write each record from the MADR template, but save it as `architecture-engineering/decisions/NNNN-<slug>.md` in the product's folder instead of `docs/decisions/`, and list it in `decisions/README.md`.
- Add the four hub front matter keys (`product`, `page`, `status`, `updated`) next to MADR's own.
- Use the hub's decision statuses: `proposed`, `accepted`, `superseded`, `rejected`. MADR also allows `deprecated` and writes the successor into the status text (competitive index, MADR evidence); in the hub, a decision that no longer holds gets a new record, the old one gets `status: superseded` and `superseded-by: [N]`, and the new one `supersedes: [M]`. A status outside the list is a finding.

**What the hub adds.** The check verifies that supersession links point both ways and to records that exist ([health checks](health-checks.md)); MADR itself ships a markdownlint configuration and no check of links between records (competitive index, MADR evidence). Around the records, the hub keeps what a decision is about: features, roadmap gates, monetization and go-to-market, and the agent's semantic read finds the other pages that still describe a reversed decision.

## spec-kit – one change, spec first

**What it does well.** spec-kit runs a spec-driven flow for a change with agent slash commands – `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement` and `/speckit-converge` ([github/spec-kit README](https://github.com/github/spec-kit), opened 2026-11-26). Its `analyze` and `converge` commands check that spec, plan and tasks agree and loop until they converge, and it integrates with many AI agents; the index rates its agent integration above the hub's and its consistency check just below, because it works on one change, not the product (competitive index, spec-kit evidence). Which specs persist after delivery is left to the team (same section).

**How to use it with the hub.**

- Keep spec-kit's files where spec-kit puts them. A change belongs to a feature: link its spec from the feature page `business-product/features/<slug>.md`, and set the feature status (`specified`, `building`, `built` …) as the change moves.
- When the change ships, update the feature page, the catalog row in `features/README.md` and the hub changelog in the same pull request – that is the hub's rule; the spec stays the record of how the change was made.
- spec-kit's constitution holds project principles; product-only rules for agents go in `ai-development-workflow/agent-instructions.md` and can link to it.
- A spec-kit decision that should outlive the change becomes a decision record in `architecture-engineering/decisions/`; the index found no decision-record concept in spec-kit (competitive index, spec-kit evidence).

**What the hub adds.** spec-kit checks one change; the hub checks the product: the feature catalog against the feature pages, required pages for the current stage, decisions and the hub index. It also holds what no single change owns – value proposition, monetization, go-to-market and the roadmap with its gates. The index rates spec-kit a complement that specs a change inside a hub feature (overlap verdict).

## OpenSpec – current behaviour and changes in flight

**What it does well.** OpenSpec keeps the live specs of a system in `openspec/specs` and each change in a folder under `openspec/changes/` with `proposal.md`, `design.md`, `tasks.md` and spec updates written as requirements with WHEN/THEN scenarios; a finished change is archived under a dated folder and the archive step updates the specs ([Fission-AI/OpenSpec README](https://github.com/Fission-AI/OpenSpec), opened 2026-11-26). It is MIT-licensed (same page). The index credits it with a catalog of current behaviour by capability, an `openspec validate` command and skills for many AI assistants, and finds no business content in it (competitive index, OpenSpec evidence). It is the closest of the spec tools to the hub (partial overlap, at the upper edge of the band) and still a complement (overlap verdict).

**How to use it with the hub.**

- Let OpenSpec's specs be the behaviour behind a feature. The feature page `business-product/features/<slug>.md` keeps the feature's status and a short description of what the user can do, and links to the capability spec in `openspec/specs` instead of repeating its requirements.
- Link a change in flight from the feature page while its status is `building`; when OpenSpec archives the change, set the feature to `built` and add the hub changelog line in the same pull request.
- A change's `proposal.md` says why one change is made; a choice that binds later changes goes into a decision record with a status, because OpenSpec has no status or supersession model (competitive index, OpenSpec evidence).
- Run both checks: `openspec validate` for the specs, the hub check for the product folder.

**What the hub adds.** The business layer (value proposition, business plan, monetization, go-to-market), decision records with status, a roadmap with gates, and a matrix of which of these must exist at the product's stage. OpenSpec calls its own artifact flow "fluid not rigid – no phase gates" (competitive index, OpenSpec evidence); the hub's stages are about the product, not the change, so the two do not compete.

## BMAD – agent personas that produce the documents

**What it does well.** BMAD says it "covers the whole effort, not only the code", with specialised agent perspectives for product, architecture, UX, development and testing, and a Founder Advisor that "coaches the business side of a startup, from idea and pricing to fundraising" ([bmad-code-org/BMAD-METHOD README](https://github.com/bmad-code-org/BMAD-METHOD), opened 2026-11-26). It ships templates for decision records, lean canvas, pricing, positioning, launch plan, a ninety-day plan and validation experiments with dates and a pass mark set first (competitive index, BMAD evidence). It is free, open source and MIT-licensed (README above).

BMAD is the one tool that overlaps substantially with the hub: for a team already on BMAD with its Founder module it is a partial substitute for the business, decision and planning pages. The index rates it ahead of the hub on experiments with review dates and on agent integration (overlap verdict, where the hub wins and loses). Use it for what it does well and let the hub keep and check what it produces.

**How to use it with the hub.** Let BMAD's agents write the documents; save or move each finished one into its hub page, so the next agent finds it at a fixed path:

| BMAD output | Hub page |
|---|---|
| product brief, positioning, ideal customer, lean canvas | `business-product/overview.md`, `business-product/value-proposition.md` |
| pricing | `business-product/monetization.md` |
| launch plan | `business-product/go-to-market.md`, and `business-product/releases/<release>.md` for the release it launches |
| ninety-day plan | `business-product/roadmap.md` (goals and gates in one table) |
| PRD, epics and stories | `business-product/features/<slug>.md` per feature; stories stay in your tracker |
| architecture | `architecture-engineering/overview.md`, `components-and-data-flows.md`, `technology-stack.md` |
| decision record | `architecture-engineering/decisions/NNNN-<slug>.md` with the hub's statuses (see MADR above) |
| validation experiment | no hub page yet – keep the hypothesis in the roadmap's "confirmed vs hypothesis" column and the experiment where BMAD wrote it, linked from the roadmap |

**What the hub adds.** BMAD chooses a planning path by the size of the change and has no per-stage list of required documents; its checks cover agent context, a data-room list and a ticket tree, not a product's whole document set (competitive index, BMAD evidence). The hub adds the fixed folder per product, the [lifecycle matrix](lifecycle.md) and the [health check](health-checks.md) – the two jobs the index found no BMAD counterpart for.

## What the hub does not do

- It is not a spec format for one change; use spec-kit or OpenSpec ([concept](concept.md)).
- Its experiments page (`business-product/experiments.md`: hypothesis, metric, go and kill thresholds, owner, `revisit-by`, result) is new: the check flags a row whose date has passed with no result, but it does not judge the result itself – the gap where BMAD was strongest (competitive index).
- The comparison covers seven tools; "no other tool has a lifecycle matrix and a product-level health check" holds for those seven, and a wider search is still open (competitive index, positioning).

## Trademarks

BMad Method is a trademark of BMad Code, LLC; GitHub and spec-kit are trademarks of GitHub, Inc.; Backstage is a trademark of the Linux Foundation. Crafthall Canon has no affiliation with, or endorsement from, any of them.
