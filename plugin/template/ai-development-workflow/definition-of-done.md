---
product: <id>
page: definition-of-done
status: draft
updated: YYYY-MM-DD
---

# <Name> – Definition of Done

One checklist for every <Name> change. Name <Name>'s commands; the rules behind each line stay where they are defined (linked).

## Checklist

_What goes here:_ replace `<…>` with <Name>'s commands and add product-only lines; remove a line only with a reason.

- [ ] **Tests per the repository's testing rules:** unit tests plus at least one end-to-end, property or differential check, named in the feature doc's "How it is verified". Command: `<npx nx test …>`.
- [ ] **Product docs in the same PR** ([documentation rules](documentation-rules.md)): the feature file, the catalog row, the hub [changelog](../README.md#changelog), the roadmap and an ADR when they changed.
- [ ] **`canon check <id>` is green.**
- [ ] **Release gate** before any deploy: <the repository's release check>.
- [ ] **The repository's pre-PR checks are green** before the PR.
