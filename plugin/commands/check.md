---
description: Check this repository's Crafthall Canon offline – problems, then what is missing, stale or inconsistent per product (the same findings as canon check)
argument-hint: "[<id>|--all] [--json]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

## Crafthall Canon output

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/hub.mjs" check $ARGUMENTS 2>&1; echo "crafthall-canon exit code: $?"`

## Your task

Arguments the user typed: $ARGUMENTS

The output above comes from the `hub` command line bundled in this plugin (`scripts/hub.mjs`, the Crafthall Product
Hub core): it read the product hubs under `docs/product-hub/` (or `--hub-dir`) of this repository on this machine;
nothing was sent and no account is used. No product id means `--all`. This command is `/crafthall-canon:check`;
use that name when you tell the user to run it again.

1. Exit code 2 is a usage error and 3 an internal error (a bug or an unreadable file): show the error line as printed
   and stop.
2. Otherwise show the first line (the verdict) exactly as printed, then:
   - **Problems** (exit code 1): every problem line as printed – each one fails the check; group them by product
     folder when there are more than ten, never drop one.
   - **Products**: each product line as printed (stage and completeness), then its findings, highest first –
     `inconsistent`, then `missing`, then `stale` – with the file as `path` so the user can open it. Findings do not
     fail the check; drafts (`status: draft`, `draft: true`) stay findings until a person confirms the page.
   - With `--json`, do not print the JSON: summarise it the same way (verdict, problems, products with findings).
3. End with one line on what to do next: fix the problems first (the first one, with its file), else the first
   finding; offer to make that fix and make it only after the user says yes. For a semantic read (pages that
   contradict each other or the code), point to the skill `crafthall-canon:check`. If there is no hub, point
   to the skill `crafthall-canon:project-init`.

Never edit a file without the user's yes, never weaken or skip a check, and do not run anything else to "confirm"
the result – the output above is the result.
