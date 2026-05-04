/**
 * Benchmark runner for Context-Simplo MCP server
 * 
 * Runs a suite of scenarios against the live server, measures token cost
 * and capability, writes results to bench/<label>.json and bench/<label>.md
 * 
 * Usage: pnpm tsx scripts/benchmark.ts --label baseline-v0.1.0
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { SCENARIOS, AUTO_REPO_ID } from './benchmark-scenarios.js';

/**
 * Recursively replace AUTO_REPO_ID sentinel with the live repositoryId
 * inside a scenario request. Avoids drift when the indexed codebase changes
 * (the repo ID hash changes with the file set).
 */
function substituteRepoId<T>(input: T, liveRepoId: string): T {
  if (typeof input === 'string') {
    return (input === AUTO_REPO_ID ? liveRepoId : input) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => substituteRepoId(item, liveRepoId)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = substituteRepoId(v, liveRepoId);
    }
    return out as T;
  }
  return input;
}

type BenchmarkProfile = 'default' | 'v1-full';

/**
 * Simulate v0.1.0 wire shape on a v0.2.0 server: pass explicit `limit: 20`
 * and `includeSnippets: true` to recover the prior tool surface so a baseline
 * benchmark can be re-recorded for apples-to-apples comparison even after
 * defaults flip. Tools without those parameters are unaffected.
 */
function applyProfile(
  args: Record<string, unknown>,
  toolName: string,
  profile: BenchmarkProfile
): Record<string, unknown> {
  if (profile === 'default') return args;

  const out = { ...args };
  const tools_with_limit = new Set([
    'find_symbol', 'find_callers', 'find_callees',
    'exact_search', 'semantic_search', 'hybrid_search',
    'find_dead_code', 'find_complex_functions',
  ]);
  if (tools_with_limit.has(toolName) && out['limit'] === undefined) {
    out['limit'] = 20;
  }

  const search_tools = new Set(['exact_search', 'semantic_search', 'hybrid_search']);
  if (search_tools.has(toolName) && out['includeSnippets'] === undefined) {
    out['includeSnippets'] = true;
  }

  return out;
}

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

const MCP_URL = process.env.MCP_URL || 'http://localhost:3001/mcp';

async function callMCP(method: string, params: unknown): Promise<{ responseText: string; latencyMs: number }> {
  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });

  const startTime = Date.now();
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  const latencyMs = Date.now() - startTime;

  return { responseText, latencyMs };
}

function parseSSEResponse(text: string): unknown {
  // MCP returns server-sent events format
  // event: message
  // data: {...}
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataText = line.slice(6);
      return JSON.parse(dataText);
    }
  }
  throw new Error('No data field in SSE response');
}

function extractTopKIdentities(result: unknown, limit: number = 10): string[] {
  if (typeof result !== 'object' || result === null) return [];

  const obj = result as Record<string, unknown>;

  // Try every known top-level array key (full + compact). Fall back to first array field.
  const candidateKeys = [
    'results', 'r',                          // generic search/query
    'callers', 'callees',                    // call graph (full mode)
    'affectedNodes', 'nodes',                // impact radius / find_path (compact 'nodes')
    'affectedFiles', 'files',                // impact radius file list
    'entryPoints', 'entry',                  // architecture
    'modules', 'mods',                       // architecture
    'repositories',                           // list_repositories (kept verbatim)
  ];
  let resultsArray: unknown = undefined;
  for (const key of candidateKeys) {
    if (Array.isArray(obj[key])) {
      resultsArray = obj[key];
      break;
    }
  }
  if (!Array.isArray(resultsArray)) {
    // Last resort: first array-valued property
    const firstArrayValue = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(firstArrayValue)) resultsArray = firstArrayValue;
  }
  if (!Array.isArray(resultsArray)) return [];

  return (resultsArray as unknown[]).slice(0, limit).map((item: unknown) => {
    if (typeof item === 'string') return item;
    if (typeof item !== 'object' || item === null) return '';
    const i = item as Record<string, unknown>;

    const qn = i.qualifiedName || i.qn;
    const name = i.name || i.n;
    const filePath = i.filePath || i.fp;
    const lineStart = i.lineStart || i.ls;

    if (qn) return String(qn);
    if (name && filePath) return `${name}@${filePath}:${lineStart || '?'}`;
    if (name) return String(name);
    if (filePath) return `${filePath}:${lineStart || '?'}`;
    return '';
  }).filter(Boolean);
}

function detectResponseShape(result: unknown): 'full' | 'compact' | 'unknown' {
  if (typeof result !== 'object' || result === null) return 'unknown';
  
  const obj = result as Record<string, unknown>;
  const resultsArray = obj.results || obj.r || [];
  if (!Array.isArray(resultsArray) || resultsArray.length === 0) return 'unknown';
  
  const firstItem = resultsArray[0] as Record<string, unknown>;
  if (firstItem.qualifiedName !== undefined) return 'full';
  if (firstItem.qn !== undefined) return 'compact';
  return 'unknown';
}

function estimateTokens(bytes: number): number {
  // Standard heuristic: 1 token ≈ 4 bytes
  return Math.ceil(bytes / 4);
}

async function runBenchmark(label: string, profile: BenchmarkProfile = 'default'): Promise<void> {
  console.log(`Starting benchmark: ${label} (profile: ${profile})`);
  console.log(`MCP URL: ${MCP_URL}\n`);

  // First, get tool list to measure per-turn overhead
  console.log('Measuring tool list overhead...');
  const toolListCall = await callMCP('tools/list', {});
  const toolListParsed = parseSSEResponse(toolListCall.responseText);
  const toolListBytes = Buffer.byteLength(toolListCall.responseText, 'utf8');
  const toolListTokens = estimateTokens(toolListBytes);
  console.log(`Tool list: ${toolListBytes} bytes, ~${toolListTokens} tokens\n`);

  // Get repository state for reproducibility
  let repositoryState: BenchmarkRun['repositoryState'];
  try {
    const listReposCall = await callMCP('tools/call', {
      name: 'list_repositories',
      arguments: {},
    });
    const listReposParsed = parseSSEResponse(listReposCall.responseText) as any;
    const repoResult = listReposParsed.result?.content?.[0]?.text;
    if (repoResult) {
      const repoData = JSON.parse(repoResult);
      // Compact mode renames repositories array preservation but key inside repo
      // is now `repositoryId` (mapped to `rid`) instead of `id`.
      const repos = repoData.repositories || repoData.r || [];
      const repo = repos.find((r: any) => r.path === '/workspace') || repos[0];
      if (repo) {
        const id = repo.repositoryId || repo.rid || repo.id;
        repositoryState = {
          repositoryId: id,
          fileCount: repo.fileCount ?? repo.fc ?? 0,
          nodeCount: repo.nodeCount ?? repo.nc ?? 0,
          edgeCount: repo.edgeCount ?? repo.ec ?? 0,
        };
        console.log(`Repository state: ${id} — ${repositoryState.nodeCount} nodes, ${repositoryState.edgeCount} edges\n`);
      }
    }
  } catch (error) {
    console.warn('Failed to capture repository state:', (error as Error).message);
  }

  // Run each scenario
  const results: BenchmarkResult[] = [];
  let totalBytes = 0;
  let totalTokens = 0;

  const liveRepoId = repositoryState?.repositoryId;
  if (!liveRepoId) {
    console.warn('No live repositoryId discovered; scenarios using AUTO_REPO_ID will fail.');
  }

  for (const scenario of SCENARIOS) {
    console.log(`Running: ${scenario.name}...`);

    try {
      const baseParams = liveRepoId
        ? substituteRepoId(scenario.request.params, liveRepoId)
        : scenario.request.params;
      const params = {
        ...baseParams,
        arguments: applyProfile(baseParams.arguments, baseParams.name, profile),
      };
      const call = await callMCP(scenario.request.method, params);
      const parsed = parseSSEResponse(call.responseText) as any;
      const resultContent = parsed.result?.content?.[0]?.text;
      
      if (!resultContent) {
        throw new Error('No result content in response');
      }

      const resultObj = JSON.parse(resultContent);
      const requestBytes = Buffer.byteLength(
        JSON.stringify({ method: scenario.request.method, params }),
        'utf8'
      );
      const responseBytes = Buffer.byteLength(call.responseText, 'utf8');
      const approxTokens = estimateTokens(responseBytes);
      const topKIdentities = extractTopKIdentities(resultObj, 10);
      const responseShape = detectResponseShape(resultObj);

      results.push({
        scenario: scenario.id,
        requestBytes,
        responseBytes,
        approxTokens,
        latencyMs: call.latencyMs,
        topKIdentities,
        responseShape,
      });

      totalBytes += responseBytes;
      totalTokens += approxTokens;

      console.log(`  ✓ ${responseBytes} bytes, ~${approxTokens} tokens, ${call.latencyMs}ms`);
    } catch (error) {
      console.error(`  ✗ Failed: ${(error as Error).message}`);
      results.push({
        scenario: scenario.id,
        requestBytes: 0,
        responseBytes: 0,
        approxTokens: 0,
        latencyMs: 0,
        topKIdentities: [],
        responseShape: 'unknown',
        error: (error as Error).message,
      });
    }
  }

  // Build run data
  const run: BenchmarkRun = {
    label,
    timestamp: new Date().toISOString(),
    mcpUrl: MCP_URL,
    toolListBytes,
    toolListTokens,
    scenarios: results,
    totalBytes,
    totalTokens,
    repositoryState,
  };

  // Write JSON (for programmatic comparison)
  const jsonPath = resolve('bench', `${label}.json`);
  writeFileSync(jsonPath, JSON.stringify(run, null, 2));
  console.log(`\nWrote: ${jsonPath}`);

  // Write markdown summary (for human review)
  const md = generateMarkdownSummary(run);
  const mdPath = resolve('bench', `${label}.md`);
  writeFileSync(mdPath, md);
  console.log(`Wrote: ${mdPath}`);

  // Print summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Tool list overhead: ${toolListTokens} tokens`);
  console.log(`Total scenario cost: ${totalTokens} tokens`);
  console.log(`Aggregate (with tool list): ${toolListTokens + totalTokens} tokens`);
  console.log(`Failed scenarios: ${results.filter(r => r.error).length}/${results.length}`);
}

function generateMarkdownSummary(run: BenchmarkRun): string {
  let md = `# Benchmark: ${run.label}\n\n`;
  md += `**Timestamp:** ${run.timestamp}  \n`;
  md += `**MCP URL:** ${run.mcpUrl}  \n`;
  
  if (run.repositoryState) {
    md += `\n## Repository State\n\n`;
    md += `- Repository ID: \`${run.repositoryState.repositoryId}\`\n`;
    md += `- Files: ${run.repositoryState.fileCount}\n`;
    md += `- Nodes: ${run.repositoryState.nodeCount}\n`;
    md += `- Edges: ${run.repositoryState.edgeCount}\n`;
  }

  md += `\n## Tool List Overhead\n\n`;
  md += `- Bytes: ${run.toolListBytes}\n`;
  md += `- Tokens: ~${run.toolListTokens}\n`;

  md += `\n## Scenario Results\n\n`;
  md += `| Scenario | Bytes | Tokens | Latency (ms) | Shape |\n`;
  md += `|----------|-------|--------|--------------|-------|\n`;

  for (const result of run.scenarios) {
    const scenario = SCENARIOS.find(s => s.id === result.scenario);
    const name = scenario?.name || result.scenario;
    const shape = result.responseShape;
    
    if (result.error) {
      md += `| ${name} | - | - | - | ERROR |\n`;
    } else {
      md += `| ${name} | ${result.responseBytes} | ~${result.approxTokens} | ${result.latencyMs} | ${shape} |\n`;
    }
  }

  md += `\n## Aggregate\n\n`;
  md += `- Total scenario bytes: ${run.totalBytes}\n`;
  md += `- Total scenario tokens: ~${run.totalTokens}\n`;
  md += `- With tool list: ~${run.toolListTokens + run.totalTokens} tokens\n`;

  md += `\n## Top-K Identities (for capability comparison)\n\n`;
  for (const result of run.scenarios) {
    if (result.error) continue;
    const scenario = SCENARIOS.find(s => s.id === result.scenario);
    md += `\n### ${scenario?.name || result.scenario}\n\n`;
    if (result.topKIdentities.length === 0) {
      md += `*(no results)*\n`;
    } else {
      result.topKIdentities.forEach((id, i) => {
        md += `${i + 1}. ${id}\n`;
      });
    }
  }

  return md;
}

// CLI entry point
const args = process.argv.slice(2);
const labelIndex = args.indexOf('--label');
if (labelIndex === -1 || !args[labelIndex + 1]) {
  console.error('Usage: pnpm tsx scripts/benchmark.ts --label <label> [--profile default|v1-full]');
  console.error('Example: pnpm tsx scripts/benchmark.ts --label baseline-v0.1.0 --profile v1-full');
  process.exit(1);
}

const label = args[labelIndex + 1];
const profileIndex = args.indexOf('--profile');
const profileRaw = profileIndex !== -1 ? args[profileIndex + 1] : 'default';
if (profileRaw !== 'default' && profileRaw !== 'v1-full') {
  console.error(`Invalid profile: ${profileRaw}. Must be 'default' or 'v1-full'.`);
  process.exit(1);
}
const profile = profileRaw as BenchmarkProfile;

runBenchmark(label!, profile).catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
