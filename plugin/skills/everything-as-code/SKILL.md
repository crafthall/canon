---
name: everything-as-code
description: Keep a Crafthall Canon current in the same change – given the change (a diff, a branch or a description of a feature, price, campaign, gate or decision), list the hub pages it made untrue, update them, add the changelog line, and run the hub check; or state "no product doc change - <reason>" for a change with no product impact. Use before handing over or committing any change to a product that has a hub under docs/crafthall/canon/.
---

# Every product change lands in the hub

The repository is the single record of the whole product – code, features, prices, channels, gates, decisions. A change that leaves its hub page untrue makes the hub look current while it is not. You update the hub **in the same change**, before you hand it over.

Input: the change (`git diff` against the base branch, or the files you changed in this session) and the product it belongs to (the hub README names the product's code folders). Output: edits inside `docs/crafthall/canon/<id>/` only.

## Steps

1. **Find the product.** Read `docs/crafthall/canon/<id>/README.md` for the product whose code or topic the change touches. No hub: say so and point to the skill `project-init`; do not create one unasked.
2. **List the pages the change made untrue** – one line each, `page – what is now wrong`:
   - a new or changed feature → `business-product/features/<slug>.md` (what it does, how it works, limits, how it is verified, history) and its row in `business-product/features/README.md`;
   - a price or plan → `business-product/monetization.md`; a channel or campaign → `go-to-market.md` or `marketing.md`; a gate, release or scope → `roadmap.md`; a decision → a decision record in `architecture-engineering/decisions/` and its index;
   - architecture, data flow or a dependency → the `architecture-engineering/` page that describes it;
   - any other page whose sentence the change contradicts (search the hub for the names the change touched).
3. **Update them.** Change only what the change settles; a new page or section stays `status: draft` until a person confirms it. Never invent a business fact (price, audience, revenue) – write it as an open question for the person instead.
4. **Changelog.** Add one line at the top of the hub README "Changelog": `- YYYY-MM-DD – what changed – <issue or PR>`.
5. **No product impact** (a refactor, tooling, tests only): write `no product doc change: <reason>` in the commit message or the pull request body instead of steps 2–4.
6. **Check.** Run the hub check (plugin: `node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" check <id>`; with the package: `canon check <id>`) and fix every problem it reports. Then show the list from step 2 with what you changed.

## Rules

- Edit only inside the product's hub folder; never weaken the check.
- One topic, one page: link to the page that owns a topic instead of repeating it.
- A changed decision, gate, price or scope that the change itself does not settle goes to the person who owns it.
