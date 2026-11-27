# Worked example: a pricing decision is reversed

Supperwick is a fictional weekly meal planner (`supperwick.example`). Its hub is in two states: [`before/`](before/docs/product-hub/supperwick/README.md) and [`after/`](after/docs/product-hub/supperwick/README.md). Each folder is a small repository root, so `canon check supperwick --root <folder>` runs on it as it is.

## The decision change

- **ADR-0001** (March): the free plan is capped at three weekly plans a month, and the shopping-list export is only in the paid Plus plan.
- **ADR-0002** (April): beta households stopped at the upgrade prompt, so every current feature becomes free. Plus will only add new capabilities.

The team marked ADR-0001 as superseded and linked both records both ways. They rewrote `monetization.md` and updated both feature pages. Two passages were missed:

1. The **feature catalog** (`business-product/features/README.md`) still has "Plus only (ADR-0001)" in the Plan column of the shopping-list export row, and a three-plan cap on the weekly plans row.
2. The **R1 release plan** (`business-product/releases/r1-launch.md`) still has its own "Free and paid plans" section, which promises the cap and the upgrade prompt.

## What `canon check` reports

The release plan restates a topic that `monetization.md` owns. The structure rule `topic` fails the check (exit 1) with this message:

> docs/product-hub/supperwick: topic "free and paid plans" is a main section in business-product/monetization.md and business-product/releases/r1-launch.md – keep it in one page and link from the others

The check cannot tell that the copy is out of date. It flags the duplicate, and the duplicate is where the outdated policy was hiding. Every other rule and health check passes on `before/`: the records link both ways, and the catalog's status column (`built`) matches the feature pages.

## What review caught

The catalog row is a stale passage that no rule can see. Its status is right; only the prose in the Plan column is wrong. The reviewer agent followed the hub's definition of done: after a supersession, search the hub for the old record's number. "ADR-0001" turned up in the catalog. This is the **review** finding. The `topic` finding is the **deterministic** one.

## The fix

- Catalog: the Plan column now says "Free (ADR-0002)" and "Free, no monthly cap (ADR-0002)".
- Release plan: the section now starts with "Moved to [Monetization]…". `topic` skips a section that only points to the page that owns the topic.
- Hub README: one changelog line, and `updated` set to the fix date.

On `after/`, `canon check supperwick` passes with exit 0, 0 problems and 0 findings. The replay is in [steps.md](steps.md).
