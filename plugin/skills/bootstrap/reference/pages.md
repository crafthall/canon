# Page formats for a drafted hub

Folder: `docs/product-hub/<id>/`. File and folder names are fixed and lowercase kebab-case; a file not listed here fails the hub check. `<Name>` is the product's display name (from the manifest or README – cite it); `<date>` is today (YYYY-MM-DD).

## Front matter (every Markdown page)

```markdown
---
product: <id>
page: <page key, see each page below>
status: draft
updated: <date>
---
```

All four keys `product`, `page`, `status`, `updated` are on **every** page, exceptions included. Exceptions change `status` and add keys: the hub README (`page: hub`, `status:` = product stage, plus `name`, `app`, `draft: true`), feature pages (`status:` = feature status, plus `feature`, `summary`, `draft: true`), decision records (`status: proposed`, plus `adr`, `title`, `date` – full block below). Front matter values are plain one-line text: no `: ` or ` #` inside a value; quote a value that needs them with double quotes.

## README.md – the hub index (write it last)

```markdown
---
product: <id>
page: hub
name: <Name>
status: validation
app: apps/<primary app folder>
draft: true
updated: <date>
---

# <Name> – product hub

> <one-line pitch> (source: <path>)

## Status

| | | Source |
|---|---|---|
| Stage | **Validation** (`status: validation`) – drafted from the repository | (hypothesis: the code suggests <stage>; confirm the stage) |
| Primary app | `apps/<app>` | (source: apps/<app>/package.json) |

## Pages

**Business & Product**
- [Overview](business-product/overview.md) · [Value proposition](business-product/value-proposition.md) · [Features](business-product/features/README.md)

**Architecture & Engineering**
- [Overview](architecture-engineering/overview.md) · [Components](architecture-engineering/components-and-data-flows.md) · [Stack](architecture-engineering/technology-stack.md) · [Testing](architecture-engineering/technical/testing.md)

## Product metrics

| Metric | Target | Last reading | Source |
|---|---|---|---|
| <a metric the repository measures or tracks> | (hypothesis: target?) | – | (source: <path>) |

## Confirm these

- <each hypothesis the person must answer, as a short question>

## Not read

- `<folder>` – <why: generated data, vendored, design system>

## Changelog

- <date> – Drafted from the repository by the bootstrap skill; every page is a draft until a person confirms it.
```

`app` is the primary app folder (it must exist), or `none yet`. Link only pages you wrote. "Confirm these", "Not read" and "Changelog" appear **only** in the README.

## business-product/features/<slug>.md – one per feature

```markdown
---
feature: <slug>
product: <id>
page: feature
status: built
draft: true
updated: <date>
summary: <one sentence, what a user can do with it – plain text, no markers>
---

# <Feature title>

## What it does (user's view)

<2-4 short sentences, each with a marker.>

## How it works

- <entry point, inputs, steps, outputs – one marker per item>

## Status evidence

- <why this status: the entry point and the test that show it, or the doc that says it is planned> (source: <path>)

## Limits and edge cases

- <only what the code or docs show; otherwise leave the section out>
```

`status` is the feature status (the enum in SKILL.md); `draft: true` marks the page as unconfirmed – the hub check lists it under "requires review" until a person removes it. `<slug>` = lowercase kebab-case, the same as the catalog link. `summary` is the catalog's short description (front matter is not scored for markers, the body is).

## business-product/features/README.md – the catalog

```markdown
---
product: <id>
page: feature-catalog
status: draft
updated: <date>
---

# <Name> – feature catalog

## Features

| Feature | Status | Doc |
|---|---|---|
| <Feature title> | built | [<slug>](<slug>.md) |
```

One row per feature page, the row's status equals the page's `status`. No other rows; no page without a row.

## Other pages: `page` key and main sections (`## ` headings)

| File | `page:` | Sections |
|---|---|---|
| `business-product/overview.md` | `overview` | What it is · Who it is for · How a user uses it (main flow, step by step) |
| `business-product/value-proposition.md` | `value-proposition` | Customer · Problem · Value · Alternatives |
| `business-product/business-plan.md` | `business-plan` | Executive summary · Revenue model · Costs · Assumptions to confirm |
| `business-product/monetization.md` | `monetization` | Offer · Pricing · Free and paid entitlements |
| `business-product/roadmap.md` | `roadmap` | Releases (table: Order, Release, Capabilities, Status, Source) · Gates |
| `architecture-engineering/overview.md` | `architecture-overview` | Runtime paths · Environments |
| `architecture-engineering/components-and-data-flows.md` | `components-and-data-flows` | Components · Data flows · Data, privacy and security |
| `architecture-engineering/technology-stack.md` | `technology-stack` | Stack (table: Layer, Technology, Why, Source) |
| `architecture-engineering/technical/testing.md` | `testing` | Test layers · How to run |
| `architecture-engineering/decisions/README.md` | `decisions` | Records (table: ADR, Title, Status – each ADR cell a link `[0001](0001-<slug>.md)`) |
| `architecture-engineering/decisions/NNNN-<slug>.md` | `adr` | Context · Decision · Consequences |

Decision record front matter (all of it):

```markdown
---
product: <id>
page: adr
status: proposed
updated: <date>
adr: 1
title: <decision title>
date: <date of the commit or doc it comes from>
---
```

Each page: front matter, `# <Name> – <page title>`, the sections above (leave a section out rather than fill it with guesses; a hypothesis with its question is fine), every sentence with a marker. Use only these section names in these pages so no topic appears in two pages.

## Marker examples

- Good: `The CLI has three commands: fixture, compare and report (source: apps/cli/src/router.ts).`
- Good: `It was split into its own library when the second app needed it (source: commit 3f2a9c1).`
- Good: `| Hosting | static files on a CDN | (source: infra/site.yaml) |`
- Good: `Buyers are likely small shops (hypothesis: who is the buyer, and how do they find the product?).`
- Bad (no marker): `The tool is fast and easy to use.`
- Bad (one marker for two sentences): `It parses CSV. It also exports PDF (source: src/export.ts).`
- Good (pointer to another hub page, no marker needed): `See the [feature catalog](features/README.md).` – any other phrasing ("Features are listed in …") is a factual sentence and needs a marker.
- Bad (a detail the cited file does not carry): `The import replaces the year folder atomically (source: scripts/import.ts).` when the atomic swap is in `scripts/write-year.ts`.
- Good (cite both, or split): `The import replaces the year folder (source: scripts/import.ts). The swap is atomic (source: scripts/write-year.ts).`
- Bad (path not seen): `(source: src/utils/helpers.ts)` when that file does not exist.
