---
name: bootstrap
description: Draft a product hub for a repository that has code but no product description – read the code, README, docs, tests and git history, then write the hub folder (overview, value proposition, business plan, feature catalog with one page per feature, architecture pages, decision records) where every factual sentence cites a source file or commit or is marked (hypothesis), every page is a draft, and a "Confirm these" list tells the person what to check. Use when someone asks to bootstrap, draft, reverse-engineer or "write the current state" of a product hub from an existing repository.
---

# Bootstrap a product hub from a repository

You write the **first draft** of a product's hub from what the repository shows. A person confirms it afterwards. Your value is three things: the hub layout, a source for every claim, and an honest list of what you could not know. A fluent page with an invented fact is worse than a short page with a hypothesis.

Inputs you get: the product id (`<id>`), today's date, the repository (working directory). History is either `git log` (if you can run commands) or a text file with one commit per line (`<sha> <date> <subject>`, often `git-log.txt` at the root). Output: the folder `docs/crafthall/canon/<id>/` (or the hub folder the person names), nothing else. Never edit files outside that folder.

The page formats, front matter and headings are in [reference/pages.md](reference/pages.md). Read it before you write.

## The one rule: source or hypothesis, sentence by sentence

Every sentence that states something about the product, its code, users, market or history ends with **one** of these markers, before the full stop:

- `(source: <path>)` – a repository-relative path you have opened or seen in a listing, optionally with `:<line>` or `:<from>-<to>`; several ranges of one file go after one colon, comma-separated: `apps/web/README.md:3,11-14`. Several: `(source: apps/web/src/cart.ts; apps/web/tests/cart.test.ts)`.
- `(source: commit <sha>)` – a commit from the history you were given (copy the sha exactly).
- `(hypothesis: <the question the person must answer>)` – anything the repository does not show: prices, audience, revenue, market size, competitors, intent behind a decision, the stage.

Rules for markers:
- **Per sentence, not per paragraph.** Two sentences, two markers. Keep sentences short so each has one clear source.
- **Table rows** that state something carry the marker inside the row (add a `Source` column).
- **The source must carry every detail the sentence claims.** A qualifier is a claim of its own: how something happens ("atomically", "every night", "password-protected"), a number, a limit, a name. If you learned that detail from another file, cite that file too (`(source: a.ts; b.md)`), or split the sentence so each part has its own source. Never cite the file that names the thing for a detail you read elsewhere.
- **Never cite a path you have not seen.** A mistyped or invented path counts as unsourced. Prefer the most specific file (the test or entry point), not a folder, when one exists.
- A plain Markdown link to a code file is **not** a source; use the marker. Do not write relative links to code at all (they break when the hub moves); links go only to other hub pages.
- Business facts (price, audience, revenue, channels, competitors) are never invented. If the repository holds them (a README, a docs page, a config), cite that file; otherwise write the sentence as a hypothesis with the question.
- No boilerplate prose. Do not copy template guidance sentences ("What goes here", "This page describes …"); every sentence you write is either sourced, a hypothesis, a question, a lead-in ending in ":" or a pointer to another hub page written exactly as `See [<page>](<page>.md).` (optionally with "for <topic>").
- Never copy secrets, tokens, account ids, e-mail addresses or personal data into the hub, even when the repository has them.

## Steps

### 1. Read, in this order (stop reading a folder once you know what it does)
1. Root and app/package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, project configs): names, scripts, binaries, dependencies, workspace tags.
2. READMEs and docs folders: stated purpose, audience, status, plans, "not built yet" notes, decisions.
3. **Entry points** – what a user reaches: web routes and pages (`src/pages`, `app/`, routers), **the shared layout every page renders inside** (`layouts/`, `components/layout/`, root layout, `_app`, header, footer and their client scripts), CLI command routers and `bin`, public exports of libraries, scheduled jobs and scripts named in manifests, infrastructure and deploy files (`infra/`, CloudFormation/Terraform, CI deploy scripts).
4. **Tests** – their file names and `describe`/`it` titles say what is built and checked; a test is the best source for `built`.
5. The history: subjects of commits name features when they landed ("Add …", "Ship …"), and decisions ("Switch to …", "Move … because …").
6. Large folders (generated data, vendored code, a shared design system): list them, read only their README or entry file, and say so under "Not read" in the hub README.

### 2. Inventory – the capabilities
Write down every capability a user or an operator can **name and use**, with its source. A feature is something a user can do or see, or a capability other features depend on. Look for, in every product:
- each distinct page family, screen or route group with its own purpose (variants of one page – per region, per language, per item – are one feature, with the variants in its page);
- **the site or app shell** – the layout and UI every page shares, even though no route carries its name: header and navigation, language or region switch, theme (light/dark) menu, print view or print styles, settings remembered between visits (local storage, cookies), search, footer. Read the layout components and their scripts; together they are usually **one** feature (for example "Site shell: navigation, language, theme, print, remembered settings"), with the home page in it when the home page only routes users on;
- each command or sub-command family of a CLI, each public API or SDK surface;
- each calculation, rules or domain engine kept in its own library or module (it is a feature: other features depend on it);
- each data pipeline, import, sync or scheduled job that keeps the product's data current;
- content and publishing systems (articles, guides, methodology pages, content guards);
- trust, legal and compliance surfaces (legal pages, consent, privacy guards, disclaimers) when they are built as their own pages or components;
- monetization surfaces (ads, affiliate links, paywalls, licence checks), even when switched off;
- operations: hosting, deploy, environments, monitoring, when the repository holds their scripts or templates;
- planned capabilities the README or docs name as not built yet, or for a later release.
**Catalog what users name, not how it is built.** Each feature is a capability a user or an operator would name and use. Do not list internals (helpers, config, lint, build tooling, test fixtures, SEO plumbing such as sitemaps, meta tags and structured data) or single buttons – they go to the architecture pages, not the catalog. A **guard** is not an internal: a check that stops a wrong, unfinished or unsafe page, number or file from reaching users (a publication or content guard, a privacy guard, a launch guard) is a feature, because users rely on what it keeps out. An engine or library is part of the feature that uses it; it is a feature of its own only when several features share it or someone uses it directly (an API, a published package). Merge items that serve one purpose (a page and its comparison table, a calculator and its presets, ads and affiliate links of one monetization surface); split items a user would name separately. Typical products have 4–15 features; list what is there, not a target number. Above 15, re-read the list and merge or drop each item a user would not name on their own.

**Status of each feature** (front matter `status`), from evidence only:
- `built` – an entry point, route or command exists **and** you cite it or a test for it;
- `partial` – it exists but the repository says it is incomplete, behind a flag, switched off or waiting on something;
- `building` – code exists but is not reachable yet (not wired into a route or the command router);
- `specified` – described in docs or README, no code;
- `later` – docs place it in a later release.

### 3. Choose the stage
Set the hub README `status` to the earliest stage whose **required** pages you can draft from sources – usually `validation` (needs overview, value proposition and product metrics). Do **not** claim `building` or `live` just because code exists: those stages require a business plan with a scenario model that a person must provide. Write the stage the code suggests (for example "the code is past an MVP") as a hypothesis in the README and in "Confirm these".

### 4. Write the pages (formats in reference/pages.md)
Write, in this order:
1. `business-product/features/<slug>.md` – one per inventory item, then `business-product/features/README.md` (the catalog, one row per page).
2. `business-product/overview.md`, `business-product/value-proposition.md`.
3. `business-product/business-plan.md` – what the repository says about how it earns; everything else a hypothesis with the question. Write `business-model.json` **only** if the repository holds the numbers (a model, a pricing config); otherwise leave it out and say so in "Confirm these".
4. `business-product/roadmap.md` and `business-product/monetization.md` – only if the repository names releases, plans, prices, ads or licences.
5. `architecture-engineering/overview.md`, `components-and-data-flows.md`, `technology-stack.md`, `technical/testing.md` (how it is tested: test folders, runners, commands).
6. `architecture-engineering/decisions/NNNN-<slug>.md` for each material decision you can trace to a doc or a commit (one per decision, `status: proposed`), plus `decisions/README.md`. None traceable → no decisions folder.
7. `README.md` – the hub index, last, so it links only pages that exist.
Skip the `ai-development-workflow/` pages unless the repository has agent or contributor instructions (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`); then write all four or none.

### 5. Check and hand over
- Every page has the four front matter keys `product`, `page`, `status`, `updated` – decision records and feature pages too. Draft status: ordinary pages `status: draft`; feature pages the inferred feature status **plus** `draft: true` (their `status` must stay a feature status); decision records `status: proposed`; the README the stage **plus** `draft: true`. The hub check reports every `status: draft` and every `draft: true` page as "requires review" – these are the expected findings until a person confirms the page and removes the mark.
- Reread every sentence with a qualifier (how, how often, how much, which): does the cited file say that part too? If not, add the file that does, or split the sentence.
- Every relative link points to a hub page that exists. No `## ` heading appears as a main section in two pages (except `Changelog`, `Sources`, `History`) – one topic, one page.
- Reread each page sentence by sentence: marker present, path seen, no invented number.
- If you can run commands, run the hub check (`canon check <id>`; from the Claude Code plugin `node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" check <id>`; or the repository's wrapper) and fix every structure problem; drafts are expected findings.
- Reply with the "Confirm these" list (the same as in the README) and the "Not read" list. Nothing else.
