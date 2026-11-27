# Layout – one folder, three sections

Every product gets one folder, `docs/crafthall/canon/<id>/`, where `<id>` is one logical product (not an app: a product can span several apps). The source of this layout in code is `SECTIONS` and `HUB_PATHS` in `src/index.ts`.

## Where Crafthall writes: `docs/crafthall/`

Everything a Crafthall product writes into a repository, and that belongs in version control, lives under `docs/crafthall/`, one folder per product: `docs/crafthall/canon/` for the Canon hub, `docs/crafthall/hq/` for what Crafthall HQ adds to the agent team (teams, team names, agent icons). Local, private state that is never committed stays in `.crafthall/<product>/` at the repository root (for example the Crafthall Optimize store), with its own `.gitignore`.

Up to 0.2.x the hub lived in `docs/product-hub/`. A repository that has only that folder still works: `canon check`, `canon new` and `canon init` read and write it and print a note with the move command:

```bash
mkdir -p docs/crafthall && git mv docs/product-hub docs/crafthall/canon
```

A link from a hub README to an app climbs one more level after the move (`../../../../apps/<app>/` instead of `../../../apps/<app>/`); `canon check` reports every link the move broke. `--hub-dir <dir>` still picks any other folder.

```
docs/crafthall/canon/<id>/
  README.md                         # hub index: status (= stage), apps, links to every page, metrics, changelog
  business-product/
    overview.md                     # what it is, who it is for, the main flow
    value-proposition.md            # customer, problem, value, alternatives
    competitive-index.md            # optional: scored comparison with alternatives
    business-plan.md                # executive summary first, full plan below
    business-model.json             # scenario model the plan's numbers come from
    competition-landscape.md        # optional: appendix of the plan – competitors and where the product stands
    monetization.md                 # offer, pricing, entitlements, revenue gates
    go-to-market.md                 # segments, channels, funnel, launch steps
    marketing.md                    # only once marketing runs
    brand.md                        # name, logo, palette, type, voice
    roadmap.md                      # releases in order + every gate in one table
    experiments.md                  # optional: hypotheses with metric, go/kill, owner, revisit-by, result
    releases/<release>.md           # the plan of one release
    features/
      README.md                     # feature catalog: one row per feature page
      <slug>.md                     # one page per feature
      candidates.md                 # ideas, not counted as features
  architecture-engineering/
    overview.md                     # runtime paths, environments
    components-and-data-flows.md    # what talks to what; data, privacy, security
    technology-stack.md             # stack and why
    decisions/
      README.md                     # decision index
      NNNN-<slug>.md                # one record per material decision
    technical/*.md                  # testing, limits, risks, user guide …
  ai-development-workflow/
    agent-instructions.md           # which agents work here, product-only rules
    documentation-rules.md          # product-only additions to the framework rules
    definition-of-done.md           # one checklist: tests, docs, design, release gate
    documentation-skills.md         # which skills keep these pages current
```

## The three sections

| Section | Answers | Pages |
|---|---|---|
| **Business & Product** | What is it, who is it for and how does it earn? | overview, value proposition, business plan, monetization, go-to-market, brand, roadmap, feature catalog |
| **Architecture & Engineering** | How is it built and why that way? | architecture overview, components and data flows, technology stack, decision records, technical documentation |
| **AI & Development Workflow** | How do agents and people work on it? | agent instructions, documentation rules, definition of done, documentation skills |

## Page rules

- **Front matter on every Markdown page:** `product`, `page`, `status`, `updated` (YYYY-MM-DD). `status` is the page's own: `current | draft | historical`; the hub README uses the product status (`idea | validation | building | live | paused | retired`), feature pages the feature status (`specified | building | built | partial | later | removed`), decision records the decision status (`proposed | accepted | superseded | rejected`).
- **Fixed names**, lowercase kebab-case, one topic per file. A topic lives in one file; others link to it.
- **Optional pages** (`competitive-index.md`, `competition-landscape.md`, `experiments.md`) are allowed at every stage and never required by their name alone. `competitive-index.md` is the scored comparison the hub view shows next to the value proposition; `competition-landscape.md` is an appendix of the business plan (who competes and where the product stands; `canon new --plan` moves it from the plan folder along with the plan) – the check accepts it, the hub view does not render it as a card, and it is never read as the competitive index.
- **Pages appear when the stage requires them** ([lifecycle](lifecycle.md)) – no empty placeholders. The hub README lists the missing ones as "not due yet".
- **A feature** is something a user can do or see, or a capability other features depend on. Group tiny items; no page per button.
- **Global rules stay global.** The workflow pages hold only product-specific additions and link to the shared rules.

## App tags

The hub README names the product's code folders (`app:` in its front matter and the "Primary app" row). Each named project in `apps/` or `libs/` carries the tag `product:<id>` in its `package.json` (`"nx": { "tags": ["product:<id>"] }`), and a project with that tag needs the hub `docs/crafthall/canon/<id>/`. `canon check` reports a named folder that does not exist, a named project without the tag (rule `app`), a tagged project without a hub (`tagged-without-hub`) and a `package.json` that is not valid JSON (`package-json`). The change-coupled check uses the same tags to find which product a code change belongs to.

## Example front matter

```markdown
---
product: acme-ledger
page: feature
status: built
updated: 2026-11-26
---

# Invoice import
```
