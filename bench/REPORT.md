# Benchmark Comparison Report

**Baseline:** baseline-v1-equivalent-v0.3.0 (2026-09-25T16:18:29.068Z)  
**Candidate:** candidate-v0.3.0-compact (2026-09-25T16:18:33.266Z)  
**Repository State Match:** ✓ Yes  
**Response mode:** toon → toon  
**Toolset:** core / core  

## Ship Gate Status

✅ **PASS** - All criteria met, ready to ship

## Tool List Overhead

- Delta: ↑ 0 tokens (0.0%)

## Per-Scenario Comparison

| Scenario | Baseline | Candidate | Delta | % | Wire text (B/C) | Structured (B/C) | Capability |
|----------|----------|-----------|-------|---|-----------------|------------------|------------|
| w1-architecture-overview | 65 | 65 | = 0 | 0.0% | 29 / 29 | 0 / 0 | ✓ |
| w2-symbol-lookup | 186 | 186 | = 0 | 0.0% | 64 / 64 | 86 / 86 | ✓ |
| w3-caller-scan | 374 | 374 | = 0 | 0.0% | 152 / 152 | 185 / 185 | ✓ |
| w4-impact-radius | 354 | 354 | = 0 | 0.0% | 144 / 144 | 170 / 170 | ✓ |
| w5-conceptual-search | 367 | 207 | ↓ 160 | -43.6% | 331 / 171 | 0 / 0 | ✓ |
| w6-literal-search | 396 | 265 | ↓ 131 | -33.1% | 154 / 92 | 199 / 137 | ✓ |
| w7-hybrid-search | 175 | 79 | ↓ 96 | -54.9% | 139 / 43 | 0 / 0 | ✓ |
| w8-path-between-functions | 313 | 313 | = 0 | 0.0% | 130 / 130 | 146 / 146 | ✓ |
| w9-dead-code-sweep | 1696 | 872 | ↓ 824 | -48.6% | 574 / 282 | 1067 / 545 | ✓ |
| w10-complexity-hotspots | 1981 | 1019 | ↓ 962 | -48.6% | 732 / 368 | 1175 / 597 | ✓ |

## Aggregate

- **Baseline total:** 5907 tokens
- **Candidate total:** 3734 tokens
- **Delta:** ↓ 2173 tokens (-36.8%)
