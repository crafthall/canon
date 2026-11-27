---
name: hub-check
description: Check a Crafthall Canon (docs/crafthall/canon/<id>/) for consistency – run the mechanical canon check (structure, lifecycle pages, links, feature catalog, decision index, app tags, one topic per page, plus each product's missing, stale and inconsistent findings), then read the hub pages together and report contradictions and stale facts (roadmap vs decisions, built features vs code, overview vs value proposition, changelog vs recent commits). Use before handing over any change to a product, before a release, and whenever someone asks whether a product's docs are consistent or up to date.
---

# Canon check (consistency)

A hub that is complete but contradicts itself – a gate marked open that was closed, a feature `built` with no code, a price on two pages that disagree – is worse than a missing page, because it looks trustworthy. The command catches what is mechanical; you catch what needs reading.

Input: one product id or all products (one folder each in the hub folder, `docs/crafthall/canon` by default). Everything runs on this machine; nothing is sent.

## 1. Mechanical check

Run the hub check and read its output:

- from the Claude Code plugin `crafthall-canon`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" check <id>` (or `--all`); the user can run the same as `/crafthall-canon:check`;
- in a repository with the package: `canon check <id>|--all` (add `--json` for the full report); a repository may wrap it in its own script – use the wrapper when its agent rules say so.

Exit 0 = no problem, 1 = problems (each fails), 2 = usage error, 3 = internal error. Fix every problem before §2, and never weaken the check to make it pass. Findings (`missing`, `stale`, `inconsistent`) do not fail the check; drafts stay findings until a person confirms the page.

## 2. Semantic read

Read the hub README, every `business-product/` page, `architecture-engineering/overview.md`, the feature pages and the decision index together, and compare each pair with evidence from outside the hub (files, `git log`, issue or decision records the repository keeps) – never from memory:

| # | Compare | Evidence |
|---|---|---|
| S1 | Gates and decisions in `roadmap.md` | the decision records and the repository's decision log |
| S2 | Release status in `roadmap.md` | merged commits on the product's code (`git log --oneline -- <paths>`) |
| S3 | A feature with `status: built` or `partial` | its code paths exist and its "How it is verified" names tests that exist |
| S4 | `go-to-market.md` and `monetization.md` | the current release scope in `roadmap.md` and the latest decision records |
| S5 | `overview.md` (what, for whom, stage) | `value-proposition.md` and the README status |
| S6 | The newest README changelog line | `git log --since=<that date> --oneline -- <the product's paths>` |
| S7 | A number or date on two pages | the page that owns the topic (one topic, one page) |

A finding is a concrete conflict between two sources, never a style remark: **where** (`docs/crafthall/canon/<id>/<page>.md:<line>`), **conflict** (quote both sides with their source), **severity** (high: a wrong status, gate, scope, price or claim a reader would act on; medium: a stale fact or broken cross-reference; low: misleading wording), **fix** (the edit, and who decides).

## 3. Output

First line, exactly one of: `Canon consistent – <id>` or `<N> inconsistencies – <id>` (§1 problems + §2 findings). Then the findings by severity, then "Fixed" (with evidence) and "Left for a person".

## Rules

- Fix in the same change only clear, sourced staleness (a status the evidence settles). A decision, gate, price or scope change goes to the person who owns it – never decide it in the docs.
- Say which sources you did not check ("Not verified"); §1 checks form, not truth.
