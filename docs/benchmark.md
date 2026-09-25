# Token Benchmark: Context-Simplo MCP wire cost

> **Headline (v0.3.0, 2026-09-25):** On 10 engineering workflows against an indexed
> Context-Simplo repo, **compact v0.3.0** responses used **~37% fewer MCP wire tokens**
> than the same tools with a **v0.1.0-equivalent profile** (limit 20 + snippets),
> with **zero capability regressions**. Full report: [`bench/REPORT.md`](../bench/REPORT.md).

This document explains *what* we measure, *how* to reproduce it, and the numbers
we record. Runs are produced by scripts in [`scripts/`](../scripts) against a live
server.

## Why this matters

An AI coding assistant has a fixed context budget. Every token spent on tool *responses*
and tool *schemas* is a token not spent reasoning. Context-Simplo answers structural
questions with compact JSON (plus optional `structuredContent`) instead of dumping files.

## What we measure

Token cost is measured on the **raw MCP wire text** (SSE `data:` payload and framing)
using [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) (`encode()`, **cl100k_base**).
See `countTokens` in [`scripts/benchmark.ts`](../scripts/benchmark.ts). The harness also
records **wire text** (`content[0].text`) and **structuredContent** token counts separately.

- **Tool-list overhead** — full `tools/list` response on the wire.
- **Per-scenario wire tokens** — each workflow's MCP response.
- **Top-K identities** — symbols returned, for capability regression checks.

### The 10 workflows

From [`scripts/benchmark-scenarios.ts`](../scripts/benchmark-scenarios.ts):

| ID  | Workflow                              | Tool                     |
|-----|---------------------------------------|--------------------------|
| W1  | Onboarding: architecture overview     | `explain_architecture`   |
| W2  | Symbol lookup before an edit          | `find_symbol`            |
| W3  | Pre-refactor caller scan              | `find_references` (`in`) |
| W4  | Refactor blast radius                 | `get_impact_radius`      |
| W5  | Conceptual exploration                | `semantic_search`        |
| W6  | Literal name search                   | `exact_search`           |
| W7  | Hybrid exploratory search             | `hybrid_search`          |
| W8  | Path between two functions            | `find_path`              |
| W9  | Pre-release dead-code sweep           | `find_dead_code`         |
| W10 | Complexity hotspot scan               | `find_complex_functions` |

## Results

### A. v0.3.0 compact vs v1-full profile (recorded 2026-09-25)

Runs: `bench/baseline-v1-equivalent-v0.3.0.md` vs `bench/candidate-v0.3.0-compact.md`.
Comparison: [`bench/REPORT.md`](../bench/REPORT.md) — **ship gate PASS** (≥30% aggregate savings, no scenario regressions).

| Metric | v1-full profile | v0.3.0 compact | Change |
|--------|-----------------|----------------|--------|
| Scenario wire tokens (10 workflows) | 5,907 | 3,734 | **−36.8%** |
| Tool-list wire tokens (one call) | 5,845 | 5,845 | 0% |

Per-scenario deltas are in `bench/REPORT.md`. Largest wins in this run: W10 (−48.6%), W9 (−48.6%), W7 (−54.9%).

Historical note: older `bench/baseline-v0.1.0.md` vs `bench/candidate-v0.2.0.md` used a
byte heuristic at record time; re-run with the current harness for tokenizer-based absolutes.

### B. TOON mode (`CONTEXT_SIMPLO_RESPONSE_MODE=toon`)

Run: `bench/variant-v0.3.0-toon.md` compared to compact in [`bench/REPORT-toon.md`](../bench/REPORT-toon.md).

**Verdict: did not clear the 30% ship gate** vs compact (aggregate **+6.1%** wire tokens; several scenarios more expensive). TOON remains **experimental**; default stays **compact**.

### C. Unreproduced observation (May 2026, manual agent traversal)

In an informal head-to-head, an assistant reportedly used ~42,000 tokens with glob/read/grep
vs ~6,000 via MCP on this repository. **This harness does not reproduce that experiment.**
It is kept as anecdote only — not a headline claim.

## Reproduce it

**Prerequisites:** running server at `http://localhost:3001/mcp`, one repository indexed,
`npm install` (includes `gpt-tokenizer`). If `AUTH_TOKEN` is set, export `MCP_TOKEN`.

```bash
# 1. Record a run (writes bench/<label>.json and bench/<label>.md)
export MCP_TOKEN=...   # if AUTH_TOKEN is enabled
export BENCH_REPO_PATH=/absolute/path/to/indexed/repo
npx tsx scripts/benchmark.ts --label my-run

# 2. Baseline with v0.1.0-equivalent limits/snippets on the same server
npx tsx scripts/benchmark.ts --label my-baseline --profile v1-full

# 3. Compare (exits non-zero if ship gate fails)
npx tsx scripts/benchmark-compare.ts \
  bench/my-baseline.json bench/my-run.json \
  --report bench/REPORT.md
```

Point at another URL with `MCP_URL=http://host:port/mcp`.

### Ship-gate criteria

`benchmark-compare.ts` enforces:

1. Aggregate token savings **≥ 30%** (baseline → candidate).
2. **No** individual scenario gets more expensive.
3. **Zero** capability regressions (top-K identity checks).

## Methodology notes

- **Absolutes** use **cl100k_base** on MCP wire text; your model's billing tokenizer may differ slightly.
- **Ratios** between two harness runs on the same repo state are the stable headline.
- Each run stores `repositoryState` (file/node/edge counts) for apples-to-apples checks.
