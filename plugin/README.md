# Crafthall Canon – Claude Code plugin

`crafthall-canon` (release form 2 of ADR-0002, see [CONTRIBUTING.md](../CONTRIBUTING.md)) puts the Crafthall Canon into Claude Code: one documentation folder per product, `docs/product-hub/<id>/`. Everything runs on this machine – no network, no account – and it works without Crafthall HQ.

- **`/crafthall-canon:check [<id>|--all] [--json]`** – the hub check: structure problems (each fails), then every product's stage, completeness and findings (missing, stale, inconsistent pages). No id = `--all`. Same arguments, exit codes (0 no problem, 1 problems, 2 usage error, 3 internal error) and findings as `canon check`; `--json` prints the `canon check --json` report (`schemaVersion: 1`, [schema](../schema/hub-check.schema.json)).
- **Skills** (`skills/`, invoked as `/crafthall-canon:<name>` or picked by Claude from their descriptions):
  - `project-init` – start a repository as a Crafthall project: `canon init` (hub folder, agent-rules snippet, Crafthall HQ team check when HQ is installed – skipped otherwise, summary), then the bootstrap when the repository has code;
  - `bootstrap` – draft a hub from the repository, every sentence with a source or marked as a hypothesis;
  - `everything-as-code` – in every change, update the hub pages the change made untrue and the changelog;
  - `hub-check` – the check, then a semantic read of the pages against each other and the code.
- **Runner** `scripts/hub.mjs` – the `hub` command line (`check`, `new`, `init`) for Node ≥ 20 with no dependencies: a launcher for `scripts/hub-core.mjs`, the core bundled from `src/` (`src/plugin-runner.ts` and `src/cli.ts`). `template/` is the page template `canon new` and `canon init` use in a repository without its own `docs/product-hub/_template/`.

## Source and build

This folder is the plugin. `skills/`, `commands/`, `.claude-plugin/plugin.json` and `scripts/hub.mjs` are edited here; `scripts/hub-core.mjs` and `template/` are generated – run `npm run build:plugin` after a change to `src/` or `template/`, and commit the result (`tests/plugin.test.ts` fails when they are stale). The plugin holds only regular files: Claude Code drops symbolic links that point out of an installed plugin.

`plugin.json` `metadata` lists the skills and commands; the test holds it to the folders. Claude Code finds them in the default `skills/` and `commands/` folders (an explicit `commands` path would be resolved through a marketplace link and refused).

## Install (local marketplace, not published)

This repository is a development marketplace: `.claude-plugin/marketplace.json` (`crafthall-canon-dev`) lists this folder as `./plugin`. With the `claude` CLI: `claude plugin marketplace add <path-to-this-repository>`, then `claude plugin install crafthall-canon@crafthall-canon-dev`; in a session, the same through `/plugin`. Nothing is downloaded: the marketplace and the plugin are local folders.

A repository that installs the package can list the plugin in its own marketplace: Claude Code accepts only plugin sources inside the marketplace folder (`./…`), so point a symbolic link in that folder at `node_modules/@crafthall/canon/plugin`; installing copies the real files.

Then run `/crafthall-canon:check` in a repository with a hub, or ask Claude to start one (skill `project-init`). Tests: `npm test` (layout, arguments, differential on the shared fixture hubs) and `npm run test:plugin-install` (a real install with the `claude` CLI in an isolated config, no model call, no network).

Licence, icon and the public `crafthall` marketplace listing are not decided yet (R2).
