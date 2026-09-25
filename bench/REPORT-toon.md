# Benchmark Comparison Report

**Baseline:** candidate-v0.3.0-compact (2026-09-25T16:18:33.266Z)  
**Candidate:** variant-v0.3.0-toon (2026-09-25T16:18:45.430Z)  
**Repository State Match:** ✓ Yes  
**Response mode:** toon → toon  
**Toolset:** core / core  

## Ship Gate Status

❌ **FAIL** - Cannot ship, 6 failure(s):

1. Aggregate token savings 6.1% is less than required 30%
2. Scenario w3-caller-scan got MORE expensive (+12 tokens, +3.2%)
3. Scenario w4-impact-radius got MORE expensive (+17 tokens, +4.8%)
4. Scenario w8-path-between-functions got MORE expensive (+29 tokens, +9.3%)
5. Scenario w9-dead-code-sweep got MORE expensive (+72 tokens, +8.3%)
6. Scenario w10-complexity-hotspots got MORE expensive (+104 tokens, +10.2%)

## Tool List Overhead

- Delta: ↑ 0 tokens (0.0%)

## Per-Scenario Comparison

| Scenario | Baseline | Candidate | Delta | % | Wire text (B/C) | Structured (B/C) | Capability |
|----------|----------|-----------|-------|---|-----------------|------------------|------------|
| w1-architecture-overview | 65 | 65 | = 0 | 0.0% | 29 / 29 | 0 / 0 | ✓ |
| w2-symbol-lookup | 186 | 183 | ↓ 3 | -1.6% | 64 / 62 | 86 / 86 | ✓ |
| w3-caller-scan | 374 | 386 | ↑ 12 | 3.2% | 152 / 163 | 185 / 185 | ✓ |
| w4-impact-radius | 354 | 371 | ↑ 17 | 4.8% | 144 / 159 | 170 / 170 | ✓ |
| w5-conceptual-search | 207 | 207 | = 0 | 0.0% | 171 / 171 | 0 / 0 | ✓ |
| w6-literal-search | 265 | 261 | ↓ 4 | -1.5% | 92 / 89 | 137 / 137 | ✓ |
| w7-hybrid-search | 79 | 79 | = 0 | 0.0% | 43 / 43 | 0 / 0 | ✓ |
| w8-path-between-functions | 313 | 342 | ↑ 29 | 9.3% | 130 / 159 | 146 / 146 | ✓ |
| w9-dead-code-sweep | 872 | 944 | ↑ 72 | 8.3% | 282 / 363 | 545 / 545 | ✓ |
| w10-complexity-hotspots | 1019 | 1123 | ↑ 104 | 10.2% | 368 / 490 | 597 / 597 | ✓ |

## Aggregate

- **Baseline total:** 3734 tokens
- **Candidate total:** 3961 tokens
- **Delta:** ↑ 227 tokens (6.1%)
