# Getting started

The package's `hub` command does steps 1 and 5 in any git repository. It is not published to a registry; install it from its git repository, pinned to a release tag, and run the bin:

```bash
npm install --save-dev "git+https://github.com/<owner>/crafthall-canon.git#v0.1.1"
npx canon check --all
```

A repository can wrap the commands in its own npm scripts (labels, allowed teams, a plans folder) through `runNew` / `runCheck` / `runInit` of `@crafthall/canon/cli`.

## 1. Start the folder for the product's stage

```bash
canon new <id> --name "<Name>" --pitch "<one line>" --stage validation
```

The scaffold creates the hub README and the pages the stage requires, each in `status: draft` with a short "what goes here" guide. It takes each page from the repository's `docs/product-hub/_template/` when that folder has it, else from the package's own template – keep only the pages you change there. Without the command: copy the template to `docs/product-hub/<id>/` and delete the pages that are not due yet.

## 2. Fill the pages the stage asks for

Overview and value proposition first. The business plan, feature catalog, roadmap and monetization when the [matrix](lifecycle.md) requires them. Switch each page from `draft` to `current` when it is written.

## 3. Record each material decision

One numbered record per decision in `architecture-engineering/decisions/`, with status and – when it replaces an earlier one – a link in both directions (`supersedes` / `superseded-by`). The format can follow MADR.

## 4. Change the product and its pages in the same pull request

Every pull request that adds or changes a feature:

- updates the feature page and its catalog row,
- adds one line to the hub changelog,
- updates every page the change made untrue,
- or states "no product doc change: <reason>".

## 5. Run the check before the pull request

```bash
canon check <id>            # exit 0 clean, 1 problems, 2 usage error; --all for every hub
canon check <id> --json     # the versioned report (schemaVersion 1) for tools
```

Fix the findings, then let an agent read the pages together (skill `hub-check` of the Claude Code plugin). `canon check` prints each product's completeness and health findings; `--json` gives them to a dashboard.

## 6. Use other tools inside it

- A change spec from spec-kit or OpenSpec sits inside the feature page it changes.
- Decision records in MADR style go into `decisions/`.
- Issues stay in your tracker; the hub links to them.
