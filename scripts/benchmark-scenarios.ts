/**
 * Benchmark scenarios encoding real engineer workflows
 *
 * Each scenario captures:
 * - id: unique identifier
 * - name: human-readable description
 * - workflow: which day-to-day task this represents
 * - request: the MCP tool call to make
 * - accuracyAssertion: what makes this answer "correct"
 *
 * Sentinel `AUTO_REPO_ID` is replaced at runtime by the benchmark runner
 * with the live repositoryId returned by `list_repositories`. Avoids
 * hardcoding hashes that drift whenever the indexed codebase changes.
 */

export const AUTO_REPO_ID = '__AUTO_REPO_ID__';

export interface BenchmarkScenario {
  id: string;
  name: string;
  workflow: string;
  request: {
    method: 'tools/call';
    params: {
      name: string;
      arguments: Record<string, unknown>;
    };
  };
  accuracyAssertion: string;
}

export const SCENARIOS: BenchmarkScenario[] = [
  {
    id: 'w1-architecture-overview',
    name: 'Onboarding: architecture overview',
    workflow: 'W1. Onboarding to an unfamiliar module',
    request: {
      method: 'tools/call',
      params: {
        name: 'explain_architecture',
        arguments: {
          repositoryId: AUTO_REPO_ID,
          detailLevel: 1,
        },
      },
    },
    accuracyAssertion: 'Response includes entryPoints, modules, and keyAbstractions with non-empty arrays',
  },
  {
    id: 'w2-symbol-lookup',
    name: 'Symbol lookup: find compactResponse',
    workflow: 'W2. Symbol lookup before edit',
    request: {
      method: 'tools/call',
      params: {
        name: 'find_symbol',
        arguments: {
          name: 'compactResponse',
        },
      },
    },
    accuracyAssertion: 'Top result is the compactResponse function in src/mcp/formatter.ts',
  },
  {
    id: 'w3-caller-scan',
    name: 'Pre-refactor: who calls formatMCPResponse',
    workflow: 'W3. Pre-refactor caller scan',
    request: {
      method: 'tools/call',
      params: {
        name: 'find_callers',
        arguments: {
          symbolName: 'formatMCPResponse',
        },
      },
    },
    accuracyAssertion: 'Results include MCPServer.handleToolCall (the known caller in src/mcp/server.ts)',
  },
  {
    id: 'w4-impact-radius',
    name: 'Refactor blast radius: handleToolCall',
    workflow: 'W4. Refactor blast radius',
    request: {
      method: 'tools/call',
      params: {
        name: 'get_impact_radius',
        arguments: {
          symbolName: 'handleToolCall',
          maxDepth: 10,
        },
      },
    },
    accuracyAssertion: 'affectedNodes includes MCPServer and related handler functions',
  },
  {
    id: 'w5-conceptual-search',
    name: 'Conceptual: where do we handle contextignore',
    workflow: 'W5. Conceptual exploration',
    request: {
      method: 'tools/call',
      params: {
        name: 'semantic_search',
        arguments: {
          query: 'ignore files contextignore',
          repositoryId: AUTO_REPO_ID,
        },
      },
    },
    accuracyAssertion: 'Top results include references to .contextignore or ignore-related code',
  },
  {
    id: 'w6-literal-search',
    name: 'Literal: find extractSnippetsBatch',
    workflow: 'W6. Literal name search',
    request: {
      method: 'tools/call',
      params: {
        name: 'exact_search',
        arguments: {
          query: 'extractSnippetsBatch',
        },
      },
    },
    accuracyAssertion: 'Results include extractSnippetsBatch function definition and its call sites',
  },
  {
    id: 'w7-hybrid-search',
    name: 'Hybrid: anything related to embedding queue',
    workflow: 'W7. Hybrid exploratory search',
    request: {
      method: 'tools/call',
      params: {
        name: 'hybrid_search',
        arguments: {
          query: 'embedding queue',
          repositoryId: AUTO_REPO_ID,
        },
      },
    },
    accuracyAssertion: 'Results include EmbeddingQueue class and related queue management code',
  },
  {
    id: 'w8-path-between-functions',
    name: 'Path: indexRepository to addNode',
    workflow: 'W8. Path between two functions',
    request: {
      method: 'tools/call',
      params: {
        name: 'find_path',
        arguments: {
          fromSymbol: 'indexRepository',
          toSymbol: 'addNode',
        },
      },
    },
    accuracyAssertion: 'Path exists showing the call chain from indexRepository to graph.addNode',
  },
  {
    id: 'w9-dead-code-sweep',
    name: 'Pre-release: find dead code',
    workflow: 'W9. Pre-release dead-code sweep',
    request: {
      method: 'tools/call',
      params: {
        name: 'find_dead_code',
        arguments: {
          repositoryId: AUTO_REPO_ID,
        },
      },
    },
    accuracyAssertion: 'Returns a list of unreferenced symbols (may be empty if no dead code)',
  },
  {
    id: 'w10-complexity-hotspots',
    name: 'Complexity: find hotspots',
    workflow: 'W10. Complexity hotspot scan',
    request: {
      method: 'tools/call',
      params: {
        name: 'find_complex_functions',
        arguments: {
          repositoryId: AUTO_REPO_ID,
        },
      },
    },
    accuracyAssertion: 'Returns functions ranked by cyclomatic complexity, highest first',
  },
];
