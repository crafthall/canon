# Contributing to Crafthall Canon

This repository is the single source of the Crafthall Canon framework: the `@crafthall/canon` package
(`src/`), the `canon` CLI, the page template (`template/`), the report schema (`schema/`), the Claude Code plugin with its
skills (`plugin/`), the framework docs (`docs/`) and the worked example (`examples/`). Repositories that use it install
it as a git dependency pinned to a release tag; they never copy its files.

Private repository, no outside collaborators, nothing published. Write everything in English.

## Set up

```bash
npm ci            # Node 24 (the sources run with Node's type stripping); installed copies need Node >= 20.11
npm run build     # dist/: JS + .d.ts for the exports and the `canon` bin
npm test          # unit, property, differential and end-to-end tests
npm run typecheck
```

Run the CLI from source: `node src/cli.ts check --all --root <repo>`.

## Rules

- **Core stays pure.** `src/index.ts` and everything it exports read no files and import no package; file access goes
  through a `HubSource`. Node-only code goes to `src/node.ts` / `src/init-node.ts`, the CLI to `src/cli.ts`.
- **Test by default.** Every change comes with unit tests and at least one property (fast-check), differential or
  end-to-end check, run before the pull request. No skipped or retried tests; a slow machine is handled by the hang
  guard in `test-kit/`, never by a longer fixed timeout.
- **The report is a contract.** A change to the `canon check --json` report changes `schema/hub-check.schema.json` in the
  same commit; a breaking change raises `HUB_REPORT_SCHEMA_VERSION`. The fixture hubs in `tests/fixtures/hubs/` are
  fictional; their expectations (`*.expected.json`) change only with a stated reason.
- **The plugin is generated in part.** After a change to `src/` or `template/`, run `npm run build:plugin` and commit
  `plugin/scripts/hub-core.mjs` and `plugin/template/` (`tests/plugin.test.ts` fails when they are stale). The plugin
  holds only regular files.
- **Docs move with the code.** A change to the matrix, the layout or a rule updates `docs/` and `README.md` in the same
  commit (`tests/model.test.ts` compares the matrix in `docs/lifecycle.md` with the code).
- **No host data.** Nothing from a user's repository (product names, business numbers, people, issue links) goes into
  this repository; examples and fixtures are fictional.

## Releases

`dist/` is not committed on `main`. A release is a tag whose commit carries the build, so a git dependency installs with
no build step and no install script:

```bash
npm run release -- 0.1.1      # clean tree on main: test, build, version bump commit on main, then a release
                              # commit with dist/ on top of it (not on main), tag v0.2.1 on that commit
git push origin main v0.2.1   # push main and the tag
npm run test:clean-install -- --ref v0.2.1   # the clean-install end-to-end test against the pushed tag
```

Consumers pin the tag: `"@crafthall/canon": "git+https://github.com/crafthall/canon.git#v0.2.1"`.
A tag is never moved; a fix is a new tag.

## Design records

The product decisions behind this package – ADR-0001 (core package boundary) and ADR-0002 (one core, three release
forms: framework, standalone plugin, HQ module) – live in the product's own hub in its first adopter's repository; code
comments cite them by number.
