# Lifecycle – which pages each stage needs

The hub README `status` sets the stage: `idea` → Idea, `validation` → Validation, `building` → Development, `live` → Operate. `paused` and `retired` products are not assessed. The source in code is `STAGES`, `STAGE_OF_STATUS` and `REQUIREMENTS` in `src/index.ts`; a differential test keeps this table equal to the code.

## The eight stages

| # | Stage | Goal |
|---:|---|---|
| 1 | Idea | Say what the product is and for whom, in one page. |
| 2 | Validation | Show there is a customer, a problem and a reason to beat the alternatives. |
| 3 | Business plan | Show how it earns, with a model you can recompute. |
| 4 | MVP scope | Fix the first release: features, gates and architecture. |
| 5 | Development | Build it with the docs changing in the same pull request as the code. |
| 6 | Launch / GTM | Go public: channels, funnel, brand and launch steps. |
| 7 | Monetize | Switch revenue on at the gates the plan names. |
| 8 | Operate | Run it: metrics, releases and decisions stay current. |

## The matrix

**R** required to leave the stage · **C** required once triggered (a material decision, an external channel, a feasibility question) · **O** optional draft · **–** not yet due.

| Document | Idea | Validation | Business plan | MVP scope | Development | Launch / GTM | Monetize | Operate |
|---|---|---|---|---|---|---|---|---|
| Overview and pitch | R | R | R | R | R | R | R | R |
| Value proposition and target market | O | R | R | R | R | R | R | R |
| Business plan and model | – | O | R | R | R | R | R | R |
| Feature catalog | – | O | O | R | R | R | R | R |
| Roadmap and gates | – | O | O | R | R | R | R | R |
| Experiments | C | C | C | C | C | C | C | C |
| Go-to-market and marketing | – | C | O | O | C | R | R | R |
| Monetization and entitlements | – | O | R | R | R | R | R | R |
| Brand identity | – | C | C | C | C | R | R | R |
| Architecture overview | – | C | C | R | R | R | R | R |
| Components and data flows | – | C | C | R | R | R | R | R |
| Technology stack | – | C | C | R | R | R | R | R |
| Decision records | C | C | C | C | C | C | C | C |
| Detailed technical documentation | C | C | C | C | C | C | C | C |
| Quality and product metrics | O | R | R | R | R | R | R | R |
| AI and development workflow | – | – | – | O | R | R | R | R |

## How to read it

- **Moving to the next stage** means every R in the current column exists and has no open finding.
- **A C row joins the count once it exists** – write the first decision record and decision records become part of completeness.
- **Optional and not-yet-due rows never count**, in either direction: writing a business plan at Idea does not raise completeness, and not writing it does not lower it.
- Once a row turns R it stays R at every later stage.
- **Experiments are conditional at every stage** – a hypothesis can be tested from Idea (a desk test) to Operate (a pricing change). The page is never required; once a product keeps one, it counts toward completeness, and a row past its `revisit-by` date with no result blocks it until the result or a new date is written.
