# Replay steps

The replay script [`replay.mjs`](replay.mjs) builds a throwaway git repository from these folders and checks every expected result below. Two commits tell the story. Run it from the repository root with Node 24 and git:

```sh
node examples/pricing-reversal/replay.mjs          # prints the transcript, exit 0 = every step as expected
node examples/pricing-reversal/replay.mjs --keep   # also keeps the temporary repository for a look
```

The script runs `canon check` with `--today 2026-04-25`, the date of the story, so freshness findings do not depend on the day you run it. The end-to-end test `tests/example-replay.e2e.test.ts` runs it in `npm test`.

1. **Commit 1 – the reversal, half applied.** Copy `before/` to the repository root. Run `canon check supperwick`. Expected: exit 1, one problem (rule `topic`, the message is in [README.md](README.md)). `canon check supperwick --json` gives `ok: false`, `counts.problems: 1` and `counts.findings: 0`.
2. **Review.** Search the hub for the superseded record: `grep -rn "ADR-0001" docs/product-hub/supperwick`. Expected hits: the two decision records, the history sentence on the shopping-list export page and the hub README changelog, which are all correct. The other hits are the two Plan cells in the feature catalog, which are stale: that is the review finding. The release plan never names ADR-0001, so this search cannot find it; the `topic` rule did.
3. **Commit 2 – the fix.** Replace the hub with `after/`. Exactly three files change:
   - `business-product/features/README.md` – the Plan column and `updated`
   - `business-product/releases/r1-launch.md` – the "Free and paid plans" section becomes a "Moved to" pointer, and `updated` changes
   - `README.md` – one changelog line and `updated`
4. **Rerun.** `canon check supperwick` exits 0. The `--json` report gives `ok: true`, 0 problems and 0 findings.
