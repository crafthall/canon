---
product: <id>
page: release
status: draft
updated: YYYY-MM-DD
---

# <Name> – <release name>

The plan of one release. Copy this file to `releases/<release>.md` (lowercase kebab-case, the release's name in the [roadmap](../roadmap.md)) once the release is planned. Its order, gate and status stay in the roadmap table – this page holds the detail.

## Scope

_What goes here:_ the capabilities this release brings, each with its feature page (`features/<slug>.md`) and the tier it ships in.

## Not in this release

_What goes here:_ what was considered and left out, and where it went (a later release, `features/candidates.md`, dropped).

## Dependencies

_What goes here:_ what must be done before the release can start or ship – another release, an app, a decision record, an owner step – each with its link.

## Exit evidence

_What goes here:_ what has to be true to call the release done – tests, metrics, owner sign-off – matching the gate in the roadmap.

## Work items

_What goes here:_ the issues and pull requests that build the release, with their state.

## Changelog

- YYYY-MM-DD – Release plan created.
