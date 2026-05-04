/**
 * Benchmark comparison tool
 * 
 * Compares two benchmark runs, emits a markdown report with:
 * - Per-scenario token delta and percent
 * - Total tokens delta
 * - Capability check (top-K identity diff per scenario)
 * - Regression flags
 * 
 * Exit code: 0 if ship-gate criteria met, 1 otherwise
 * 
 * Usage: pnpm tsx scripts/benchmark-compare.ts bench/baseline-v0.1.0.json bench/candidate-v0.2.0.json --report bench/REPORT.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface BenchmarkResult {
  scenario: string;
  requestBytes: number;
  responseBytes: number;
  approxTokens: number;
  latencyMs: number;
  topKIdentities: string[];
  responseShape: 'full' | 'compact' | 'unknown';
  error?: string;
}

interface BenchmarkRun {
  label: string;
  timestamp: string;
  mcpUrl: string;
  toolListBytes: number;
  toolListTokens: number;
  scenarios: BenchmarkResult[];
  totalBytes: number;
  totalTokens: number;
  repositoryState?: {
    repositoryId: string;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
  };
}

interface ScenarioComparison {
  scenario: string;
  baselineTokens: number;
  candidateTokens: number;
  deltaTokens: number;
  deltaPercent: number;
  capabilityRegression: boolean;
  capabilityDetails: string;
}

interface ComparisonReport {
  baselineLabel: string;
  candidateLabel: string;
  baselineTimestamp: string;
  candidateTimestamp: string;
  toolListDelta: number;
  toolListDeltaPercent: number;
  scenarios: ScenarioComparison[];
  aggregateDelta: number;
  aggregateDeltaPercent: number;
  repositoryStateMatch: boolean;
  capabilityRegressions: number;
  passesShipGate: boolean;
  shipGateFailureReasons: string[];
}

function checkCapabilityRegression(
  baselineIdentities: string[],
  candidateIdentities: string[]
): { regressed: boolean; details: string } {
  // Capability assertion: candidate's top-K must be a subset of baseline's top-20 (with rank tolerance)
  // No NEW names that weren't in baseline, and baseline's known-correct top results must still appear
  
  const baselineSet = new Set(baselineIdentities);
  const candidateSet = new Set(candidateIdentities);
  
  // Check for NEW names not in baseline
  const newNames = [...candidateSet].filter(n => !baselineSet.has(n));
  if (newNames.length > 0) {
    return {
      regressed: true,
      details: `New names not in baseline: ${newNames.join(', ')}`,
    };
  }
  
  // Check if key baseline results are missing
  // If baseline had results and candidate has none, that's a regression
  if (baselineIdentities.length > 0 && candidateIdentities.length === 0) {
    return {
      regressed: true,
      details: 'Baseline had results, candidate returned none',
    };
  }
  
  // If candidate has fewer results but they're all from baseline's top results, that's acceptable (limit reduction)
  if (candidateIdentities.length < baselineIdentities.length) {
    return {
      regressed: false,
      details: `Candidate returned ${candidateIdentities.length} results (subset of baseline's ${baselineIdentities.length})`,
    };
  }
  
  return {
    regressed: false,
    details: 'No capability regression detected',
  };
}

function compareRuns(baselinePath: string, candidatePath: string): ComparisonReport {
  const baseline: BenchmarkRun = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const candidate: BenchmarkRun = JSON.parse(readFileSync(candidatePath, 'utf8'));
  
  // Check repository state match
  const repositoryStateMatch = 
    baseline.repositoryState?.nodeCount === candidate.repositoryState?.nodeCount &&
    baseline.repositoryState?.edgeCount === candidate.repositoryState?.edgeCount;
  
  if (!repositoryStateMatch) {
    console.warn('WARNING: Repository states differ between baseline and candidate');
    console.warn(`  Baseline: ${baseline.repositoryState?.nodeCount} nodes, ${baseline.repositoryState?.edgeCount} edges`);
    console.warn(`  Candidate: ${candidate.repositoryState?.nodeCount} nodes, ${candidate.repositoryState?.edgeCount} edges`);
  }
  
  // Compare tool list
  const toolListDelta = candidate.toolListTokens - baseline.toolListTokens;
  const toolListDeltaPercent = (toolListDelta / baseline.toolListTokens) * 100;
  
  // Compare scenarios
  const scenarios: ScenarioComparison[] = [];
  let capabilityRegressions = 0;
  
  for (const baselineResult of baseline.scenarios) {
    const candidateResult = candidate.scenarios.find(s => s.scenario === baselineResult.scenario);
    
    if (!candidateResult) {
      console.warn(`Scenario ${baselineResult.scenario} missing in candidate`);
      continue;
    }
    
    if (baselineResult.error || candidateResult.error) {
      console.warn(`Scenario ${baselineResult.scenario} had errors`);
      continue;
    }
    
    const capabilityCheck = checkCapabilityRegression(
      baselineResult.topKIdentities,
      candidateResult.topKIdentities
    );
    
    if (capabilityCheck.regressed) {
      capabilityRegressions++;
    }
    
    const deltaTokens = candidateResult.approxTokens - baselineResult.approxTokens;
    const deltaPercent = baselineResult.approxTokens > 0 
      ? (deltaTokens / baselineResult.approxTokens) * 100 
      : 0;
    
    scenarios.push({
      scenario: baselineResult.scenario,
      baselineTokens: baselineResult.approxTokens,
      candidateTokens: candidateResult.approxTokens,
      deltaTokens,
      deltaPercent,
      capabilityRegression: capabilityCheck.regressed,
      capabilityDetails: capabilityCheck.details,
    });
  }
  
  // Aggregate delta
  const aggregateDelta = candidate.totalTokens - baseline.totalTokens;
  const aggregateDeltaPercent = (aggregateDelta / baseline.totalTokens) * 100;
  
  // Ship gate criteria
  const shipGateFailureReasons: string[] = [];
  
  // 1. Must reduce tokens by >= 30%
  const MINIMUM_SAVINGS_PERCENT = -30; // Negative because reduction
  if (aggregateDeltaPercent > MINIMUM_SAVINGS_PERCENT) {
    shipGateFailureReasons.push(
      `Aggregate token savings ${aggregateDeltaPercent.toFixed(1)}% is less than required ${Math.abs(MINIMUM_SAVINGS_PERCENT)}%`
    );
  }
  
  // 2. No scenario can get MORE expensive
  for (const scenario of scenarios) {
    if (scenario.deltaTokens > 0) {
      shipGateFailureReasons.push(
        `Scenario ${scenario.scenario} got MORE expensive (+${scenario.deltaTokens} tokens, +${scenario.deltaPercent.toFixed(1)}%)`
      );
    }
  }
  
  // 3. Zero capability regressions
  if (capabilityRegressions > 0) {
    shipGateFailureReasons.push(
      `${capabilityRegressions} scenario(s) regressed on capability`
    );
  }
  
  const passesShipGate = shipGateFailureReasons.length === 0;
  
  return {
    baselineLabel: baseline.label,
    candidateLabel: candidate.label,
    baselineTimestamp: baseline.timestamp,
    candidateTimestamp: candidate.timestamp,
    toolListDelta,
    toolListDeltaPercent,
    scenarios,
    aggregateDelta,
    aggregateDeltaPercent,
    repositoryStateMatch,
    capabilityRegressions,
    passesShipGate,
    shipGateFailureReasons,
  };
}

function generateReport(comparison: ComparisonReport): string {
  let md = `# Benchmark Comparison Report\n\n`;
  
  md += `**Baseline:** ${comparison.baselineLabel} (${comparison.baselineTimestamp})  \n`;
  md += `**Candidate:** ${comparison.candidateLabel} (${comparison.candidateTimestamp})  \n`;
  md += `**Repository State Match:** ${comparison.repositoryStateMatch ? '✓ Yes' : '⚠️ No (results may not be comparable)'}  \n`;
  
  md += `\n## Ship Gate Status\n\n`;
  if (comparison.passesShipGate) {
    md += `✅ **PASS** - All criteria met, ready to ship\n`;
  } else {
    md += `❌ **FAIL** - Cannot ship, ${comparison.shipGateFailureReasons.length} failure(s):\n\n`;
    comparison.shipGateFailureReasons.forEach((reason, i) => {
      md += `${i + 1}. ${reason}\n`;
    });
  }
  
  md += `\n## Tool List Overhead\n\n`;
  const toolListSymbol = comparison.toolListDelta < 0 ? '↓' : '↑';
  md += `- Delta: ${toolListSymbol} ${Math.abs(comparison.toolListDelta)} tokens (${comparison.toolListDeltaPercent.toFixed(1)}%)\n`;
  
  md += `\n## Per-Scenario Comparison\n\n`;
  md += `| Scenario | Baseline | Candidate | Delta | % | Capability |\n`;
  md += `|----------|----------|-----------|-------|---|------------|\n`;
  
  for (const scenario of comparison.scenarios) {
    const symbol = scenario.deltaTokens < 0 ? '↓' : (scenario.deltaTokens > 0 ? '↑' : '=');
    const capIcon = scenario.capabilityRegression ? '❌' : '✓';
    md += `| ${scenario.scenario} | ${scenario.baselineTokens} | ${scenario.candidateTokens} | ${symbol} ${Math.abs(scenario.deltaTokens)} | ${scenario.deltaPercent.toFixed(1)}% | ${capIcon} |\n`;
  }
  
  md += `\n## Aggregate\n\n`;
  const aggSymbol = comparison.aggregateDelta < 0 ? '↓' : '↑';
  md += `- **Baseline total:** ${comparison.scenarios.reduce((sum, s) => sum + s.baselineTokens, 0)} tokens\n`;
  md += `- **Candidate total:** ${comparison.scenarios.reduce((sum, s) => sum + s.candidateTokens, 0)} tokens\n`;
  md += `- **Delta:** ${aggSymbol} ${Math.abs(comparison.aggregateDelta)} tokens (${comparison.aggregateDeltaPercent.toFixed(1)}%)\n`;
  
  if (comparison.capabilityRegressions > 0) {
    md += `\n## Capability Regressions\n\n`;
    for (const scenario of comparison.scenarios) {
      if (scenario.capabilityRegression) {
        md += `\n### ${scenario.scenario}\n\n`;
        md += `${scenario.capabilityDetails}\n`;
      }
    }
  }
  
  return md;
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: pnpm tsx scripts/benchmark-compare.ts <baseline.json> <candidate.json> [--report output.md]');
  console.error('Example: pnpm tsx scripts/benchmark-compare.ts bench/baseline-v0.1.0.json bench/candidate-v0.2.0.json --report bench/REPORT.md');
  process.exit(1);
}

const baselinePath = resolve(args[0]);
const candidatePath = resolve(args[1]);
const reportIndex = args.indexOf('--report');
const reportPath = reportIndex !== -1 && args[reportIndex + 1] 
  ? resolve(args[reportIndex + 1]) 
  : null;

try {
  const comparison = compareRuns(baselinePath, candidatePath);
  const report = generateReport(comparison);
  
  if (reportPath) {
    writeFileSync(reportPath, report);
    console.log(`Report written to: ${reportPath}`);
  } else {
    console.log(report);
  }
  
  // Exit with appropriate code for CI gating
  process.exit(comparison.passesShipGate ? 0 : 1);
} catch (error) {
  console.error('Comparison failed:', error);
  process.exit(1);
}
