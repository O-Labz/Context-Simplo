# Benchmark Comparison Report

**Baseline:** baseline-v1-equivalent (2026-05-04T16:22:42.263Z)  
**Candidate:** candidate-v0.2.0 (2026-05-04T16:23:07.519Z)  
**Repository State Match:** ✓ Yes  

## Ship Gate Status

✅ **PASS** - All criteria met, ready to ship

## Tool List Overhead

- Delta: ↓ 163 tokens (-9.1%)

## Per-Scenario Comparison

| Scenario | Baseline | Candidate | Delta | % | Capability |
|----------|----------|-----------|-------|---|------------|
| w1-architecture-overview | 1300 | 835 | ↓ 465 | -35.8% | ✓ |
| w2-symbol-lookup | 145 | 80 | ↓ 65 | -44.8% | ✓ |
| w3-caller-scan | 238 | 126 | ↓ 112 | -47.1% | ✓ |
| w4-impact-radius | 2448 | 1285 | ↓ 1163 | -47.5% | ✓ |
| w5-conceptual-search | 119 | 96 | ↓ 23 | -19.3% | ✓ |
| w6-literal-search | 237 | 100 | ↓ 137 | -57.8% | ✓ |
| w7-hybrid-search | 1368 | 656 | ↓ 712 | -52.0% | ✓ |
| w8-path-between-functions | 264 | 149 | ↓ 115 | -43.6% | ✓ |
| w9-dead-code-sweep | 49 | 32 | ↓ 17 | -34.7% | ✓ |
| w10-complexity-hotspots | 49 | 32 | ↓ 17 | -34.7% | ✓ |

## Aggregate

- **Baseline total:** 6217 tokens
- **Candidate total:** 3391 tokens
- **Delta:** ↓ 2826 tokens (-45.5%)
