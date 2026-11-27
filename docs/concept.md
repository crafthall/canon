# Concept – why a product hub

## The problem

Agents and people do not remember conversations, they remember files. A product that is built by AI coding agents over many sessions keeps its knowledge in chat histories, issues, pull requests and a README that nobody updates. When a decision is reversed, the pages that still describe the old state go stale – and the next agent builds on them.

Measured in the first repository that adopted it: the first consistency read of its product folders found **7 stale facts in 3 hubs** after one architecture decision was replaced by another.

Existing tools each hold one slice:

| Tool | Holds | Misses |
|---|---|---|
| README, wiki, issues | anything | no required pages, no check, drift unseen |
| Decision records (MADR, arc42) | one decision per file | the business, features and gates around it |
| Spec-driven tools (spec-kit, OpenSpec) | the spec of one change | the product above single changes |
| Agent methods (BMAD) | templates for many artefacts | a fixed per-product layout with a stage matrix and an automated health check |

## The idea

**One folder per product, with a fixed layout, required pages per stage, and a check that finds what went stale.**

- **One current answer** to "what is this product today, how does it earn, how is it built, how do we work on it" – readable by the next agent without reading code, issues and chat.
- **The stage decides what must exist.** An idea needs one page; a live product needs the full set. Nothing is written before it is due.
- **Docs change in the same pull request as the product.** The feature page, the changelog line and every page the change made untrue.
- **A check, not a promise.** A script counts completeness and finds mechanical drift; an agent then reads the pages together and reports contradictions.
- **Fits what teams already use.** Decision records can follow MADR; a change spec from spec-kit or OpenSpec sits inside a feature.

## Who it is for

1. **Solo builders and small teams running several products with AI agents** – the next session must find the current state in files. The first adopter is this case: six product hubs kept this way.
2. **Teams on spec-driven tools** that lack a product layer above feature specs: roadmap, monetization, go-to-market and decisions next to the specs.
3. **Teams that keep decision records** and want a product-level frame around them.

## What it is not

- Not a project-management tool: no tasks, sprints or assignees. Issues stay in the tracker.
- Not a hosted service: plain Markdown and JSON in your repository. No account.
- Not a spec format for a single change – use spec-kit or OpenSpec for that, inside a feature page.
- Not a guarantee that every claim is true: completeness says the pages exist and agree with each other. Truth is the reviewer's job.
