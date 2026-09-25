/**
 * Benchmark runner for Context-Simplo MCP server
 * 
 * Runs a suite of scenarios against the live server, measures token cost
 * (gpt-tokenizer / cl100k_base on MCP wire text) and capability, writes
 * results to bench/<label>.json and bench/<label>.md
 * 
 * Usage: pnpm tsx scripts/benchmark.ts --label baseline-v0.1.0
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { encode } from 'gpt-tokenizer';
import { SCENARIOS, AUTO_REPO_ID } from './benchmark-scenarios.js';

/** Token counts use gpt-tokenizer (cl100k_base) on the raw MCP wire text. */
function countTokens(text: string): number {
  return encode(text).length;
}

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
    'find_symbol', 'find_references',
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
  /** Whole MCP wire response (SSE framing included). */
  approxTokens: number;
  wireTextTokens?: number;
  structuredTokens?: number;
  latencyMs: number;
  topKIdentities: string[];
  responseShape: 'full' | 'compact' | 'unknown';
  error?: string;
}

interface BenchmarkRun {
  label: string;
  timestamp: string;
  mcpUrl: string;
  /** How response/tool-list token counts were computed (for reproducibility). */
  tokenCounter: 'gpt-tokenizer/cl100k_base';
  responseMode?: 'compact' | 'toon' | 'full' | 'unknown';
  toolset?: string;
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

interface RepositoryEntry {
  repositoryId: string;
  path?: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
}

const MCP_URL = process.env.MCP_URL || 'http://localhost:3001/mcp';

async function callMCP(method: string, params: unknown): Promise<{ responseText: string; latencyMs: number }> {
  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (process.env.MCP_TOKEN) {
    headers.Authorization = `Bearer ${process.env.MCP_TOKEN}`;
  }

  const startTime = Date.now();
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('MCP call unauthorized: set MCP_TOKEN');
    }
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
    'callers', 'callees',                    // find_references / call graph
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

function detectResponseModeFromWireText(wireText: string): 'compact' | 'toon' | 'full' | 'unknown' {
  const trimmed = wireText.trim();
  if (!trimmed.startsWith('{')) {
    return 'toon';
  }
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const resultsArray = (obj.results || obj.r) as unknown[] | undefined;
    if (Array.isArray(resultsArray) && resultsArray.length > 0) {
      const firstItem = resultsArray[0] as Record<string, unknown>;
      if (firstItem.qualifiedName !== undefined) return 'full';
      if (firstItem.qn !== undefined || firstItem.n !== undefined) return 'compact';
    }
    const serialized = JSON.stringify(obj);
    if (serialized.includes('"qualifiedName"')) return 'full';
    if (serialized.includes('"qn"') || serialized.includes('"n"')) return 'compact';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function selectRepository(repos: RepositoryEntry[]): RepositoryEntry | undefined {
  if (repos.length === 0) return undefined;

  const benchRepoPath = process.env.BENCH_REPO_PATH;
  if (benchRepoPath) {
    const match = repos.find((r) => r.path === benchRepoPath);
    if (match) return match;
    console.warn(`BENCH_REPO_PATH ${benchRepoPath} not found in indexed repositories`);
  }

  const workspace = repos.find((r) => r.path === '/workspace');
  if (workspace) return workspace;

  const chosen = repos[0]!;
  console.warn(`Using repository path ${chosen.path ?? '(unknown)'} (${chosen.repositoryId})`);
  return chosen;
}

function parseRepositoryList(structuredContent: unknown): RepositoryEntry[] {
  if (typeof structuredContent !== 'object' || structuredContent === null) return [];
  const reposRaw = (structuredContent as Record<string, unknown>).repositories;
  if (!Array.isArray(reposRaw)) return [];

  return reposRaw
    .map((entry): RepositoryEntry | null => {
      if (typeof entry !== 'object' || entry === null) return null;
      const r = entry as Record<string, unknown>;
      const repositoryId = r.repositoryId;
      if (typeof repositoryId !== 'string') return null;
      return {
        repositoryId,
        path: typeof r.path === 'string' ? r.path : undefined,
        fileCount: typeof r.fileCount === 'number' ? r.fileCount : 0,
        nodeCount: typeof r.nodeCount === 'number' ? r.nodeCount : 0,
        edgeCount: typeof r.edgeCount === 'number' ? r.edgeCount : 0,
      };
    })
    .filter((r): r is RepositoryEntry => r !== null);
}

async function runBenchmark(label: string, profile: BenchmarkProfile = 'default'): Promise<void> {
  console.log(`Starting benchmark: ${label} (profile: ${profile})`);
  console.log(`MCP URL: ${MCP_URL}\n`);

  // First, get tool list to measure per-turn overhead
  console.log('Measuring tool list overhead...');
  const toolListCall = await callMCP('tools/list', {});
  const toolListParsed = parseSSEResponse(toolListCall.responseText);
  const toolListBytes = Buffer.byteLength(toolListCall.responseText, 'utf8');
  const toolListTokens = countTokens(toolListCall.responseText);
  console.log(`Tool list: ${toolListBytes} bytes, ${toolListTokens} tokens\n`);

  // Get repository state for reproducibility
  let repositoryState: BenchmarkRun['repositoryState'];
  try {
    const listReposCall = await callMCP('tools/call', {
      name: 'list_repositories',
      arguments: {},
    });
    const listReposParsed = parseSSEResponse(listReposCall.responseText) as {
      result?: { structuredContent?: unknown };
    };
    const repos = parseRepositoryList(listReposParsed.result?.structuredContent);
    const repo = selectRepository(repos);
    if (repo) {
      repositoryState = {
        repositoryId: repo.repositoryId,
        fileCount: repo.fileCount,
        nodeCount: repo.nodeCount,
        edgeCount: repo.edgeCount,
      };
      console.log(
        `Repository state: ${repo.repositoryId} — ${repositoryState.nodeCount} nodes, ${repositoryState.edgeCount} edges\n`
      );
    }
  } catch (error) {
    console.warn('Failed to capture repository state:', (error as Error).message);
  }

  // Run each scenario
  const results: BenchmarkResult[] = [];
  let totalBytes = 0;
  let totalTokens = 0;
  let detectedResponseMode: BenchmarkRun['responseMode'];

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
      const parsed = parseSSEResponse(call.responseText) as {
        result?: {
          content?: Array<{ type: string; text?: string }>;
          structuredContent?: unknown;
        };
      };
      const wireText = parsed.result?.content?.[0]?.text ?? '';
      const structuredContent = parsed.result?.structuredContent;

      if (structuredContent === undefined && !wireText) {
        throw new Error('No result content in response');
      }

      const resultObj = structuredContent ?? {};
      const requestBytes = Buffer.byteLength(
        JSON.stringify({ method: scenario.request.method, params }),
        'utf8'
      );
      const responseBytes = Buffer.byteLength(call.responseText, 'utf8');
      const approxTokens = countTokens(call.responseText);
      const wireTextTokens = wireText ? countTokens(wireText) : 0;
      const structuredTokens =
        structuredContent !== undefined ? countTokens(JSON.stringify(structuredContent)) : 0;
      const topKIdentities = extractTopKIdentities(resultObj, 10);
      const responseShape = detectResponseShape(resultObj);

      if (detectedResponseMode === undefined && wireText) {
        detectedResponseMode = detectResponseModeFromWireText(wireText);
      }

      results.push({
        scenario: scenario.id,
        requestBytes,
        responseBytes,
        approxTokens,
        wireTextTokens,
        structuredTokens,
        latencyMs: call.latencyMs,
        topKIdentities,
        responseShape,
      });

      totalBytes += responseBytes;
      totalTokens += approxTokens;

      console.log(
        `  ✓ ${responseBytes} bytes, ${approxTokens} wire / ${wireTextTokens} text / ${structuredTokens} structured tokens, ${call.latencyMs}ms`
      );
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
    tokenCounter: 'gpt-tokenizer/cl100k_base',
    responseMode: detectedResponseMode ?? 'unknown',
    toolset: process.env.CONTEXT_SIMPLO_TOOLSET ?? 'core',
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
  if (run.responseMode !== undefined) {
    md += `**Response mode:** ${run.responseMode}  \n`;
  }
  if (run.toolset !== undefined) {
    md += `**Toolset:** ${run.toolset}  \n`;
  }

  if (run.repositoryState) {
    md += `\n## Repository State\n\n`;
    md += `- Repository ID: \`${run.repositoryState.repositoryId}\`\n`;
    md += `- Files: ${run.repositoryState.fileCount}\n`;
    md += `- Nodes: ${run.repositoryState.nodeCount}\n`;
    md += `- Edges: ${run.repositoryState.edgeCount}\n`;
  }

  md += `\n## Tool List Overhead\n\n`;
  md += `- Bytes: ${run.toolListBytes}\n`;
  md += `- Tokens: ${run.toolListTokens} (${run.tokenCounter})\n`;

  md += `\n## Scenario Results\n\n`;
  md += `| Scenario | Bytes | Wire (full) | Wire text | Structured | Latency (ms) | Shape |\n`;
  md += `|----------|-------|-------------|-----------|------------|--------------|-------|\n`;

  for (const result of run.scenarios) {
    const scenario = SCENARIOS.find(s => s.id === result.scenario);
    const name = scenario?.name || result.scenario;
    const shape = result.responseShape;
    
    if (result.error) {
      md += `| ${name} | - | - | - | - | - | ERROR |\n`;
    } else {
      md += `| ${name} | ${result.responseBytes} | ${result.approxTokens} | ${result.wireTextTokens ?? '-'} | ${result.structuredTokens ?? '-'} | ${result.latencyMs} | ${shape} |\n`;
    }
  }

  md += `\n## Aggregate\n\n`;
  md += `- Total scenario bytes: ${run.totalBytes}\n`;
  md += `- Total scenario tokens: ${run.totalTokens}\n`;
  md += `- With tool list: ${run.toolListTokens + run.totalTokens} tokens\n`;

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
