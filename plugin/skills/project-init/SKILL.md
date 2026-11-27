---
name: project-init
description: Start a new or existing repository as a Crafthall project in one go – create its product hub, add the agent-rules snippet, run the Crafthall HQ team check offline, note the Optimize baseline, draft the hub from the code when the repository already has some (bootstrap), and show one summary with what to confirm. Use when someone asks to init, start, set up or "make this a Crafthall project", to add a Product Hub to a repository, or to start a new product on Crafthall.
---

# Start a project as a Crafthall project

You run one command, `canon init`, and – only when it says so – the bootstrap skill, then show the person the summary. The command is deterministic and offline; the only step a model does is the bootstrap, and you do it in this session.

Inputs: a product id (lowercase kebab-case, e.g. `bike-gear-calc`), a stage (`idea` by default; `validation`, `building`, `live` – `building` and `live` need a business plan, `--plan <id>`), optionally a display name and a one-line pitch. Ask for the id and the name if the person did not give them; never invent a pitch or a stage beyond `idea`.

## Steps

1. **Dry run first.** Run the init with `--dry-run` and show the person what it would create:
   - in a repository with the package: `canon init <id> --name "<Name>" [--stage <stage>] [--pitch "<one line>"] --dry-run`
   - from the Claude Code plugin `crafthall-canon` (no package needed): the same arguments after `node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" init`; its check is `node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" check <id>`
   - in a repository that wraps it in its own npm script (e.g. `npm run product:init -- <id> …`): that script, with the same arguments and `--dry-run`

   A refusal (exit 1: the hub folder exists, an invalid id, an app of another product) writes nothing; tell the person why and stop. `canon init` never overwrites a hub – to change an existing hub, edit it.
2. **Run it** without `--dry-run`. Add `--json` if you want to read the steps; otherwise read the text summary. It runs, in order:
   1. **scaffold** – the hub folder (`docs/product-hub/<id>/`) with the pages the stage requires, as drafts;
   2. **bootstrap** – `pending` when the repository (or, when the host limits it, the `--app` folders) has code; `skipped` otherwise;
   3. **agent-rules** – the Canon agent rules appended to `CLAUDE.md` (or `AGENTS.md` when only that exists; created when neither exists); a block already there is left as it is. A host whose agent instructions already hold the rule skips it;
   4. **hq-check** – the Crafthall HQ team check on this machine (offline, nothing sent). Skipped with a message when HQ is not installed or the repository has no Claude Code agent team;
   5. **optimize-baseline** – skipped with a note while Crafthall Optimize has no free, offline baseline;
   6. **summary** – the HQ result written into the hub README (a `Crafthall HQ team check` row under Status and a Changelog line), then the closing canon check.

   Exit 0 = initialised; 1 = refused or a step failed (read the step lines); 2 = usage error.
3. **Bootstrap, only when step 2 says `pending`.** Follow the bootstrap skill ([../bootstrap/SKILL.md](../bootstrap/SKILL.md)) for the same id, on the folder the init just created: you replace its draft pages with sourced drafts. Keep the README's `Crafthall HQ team check` Status row and the init's Changelog lines exactly as they are; add your own Changelog line. Do not raise the stage beyond what the bootstrap rules allow. Then run `canon check <id>` (or the repository's wrapper script) and fix every problem.
4. **Show the summary.** Print, in this order: the HQ verdict line as HQ printed it (or why it was skipped), the top HQ hints with `file:line`, the hub check result and completeness, and the "To confirm" list from the command (plus the bootstrap's "Confirm these" list when you ran it). If HQ was skipped because it is not installed, say once how to get it (the Claude Code plugin `crafthall-hq`, then `/crafthall-hq:open`); do not install anything yourself.
5. **Hand over.** The person reviews and commits the hub folder and the agent-rules file (usually in the pull request that starts the product). Nothing is published, pushed or sent by this skill.

## Rules

- Never run `canon init` twice to "fix" a hub, never delete a hub folder to re-run it, and never edit files outside the hub folder and the agent-rules file.
- HQ runs offline only: do not pass an engine, a key or `--store` to it, and do not sign in for the person.
- Do not run Crafthall Optimize measurements here: they make paid model runs and need the person's go.
- The user path on a clean repository is at most 10 commands (dry run, init, check, commit); if you need more, say what blocked you.
