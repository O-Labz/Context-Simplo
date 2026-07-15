import { resolve } from 'path';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { SqliteStorageProvider } from './src/store/sqlite.js';
import { CodeGraph } from './src/core/graph.js';
import { Indexer } from './src/core/indexer.js';
import { parseFile } from './src/core/parser.js';

const TEST_WORKSPACE = resolve('./test-debug');
const TEST_DB = resolve(TEST_WORKSPACE, 'test.db');

async function main() {
  rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  mkdirSync(TEST_WORKSPACE, { recursive: true });

  writeFileSync(
    resolve(TEST_WORKSPACE, 'index.ts'),
    `
export function hello(name: string): string {
  return greet(name);
}

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
    `.trim()
  );

  // First, let's see what the parser produces
  console.log('=== Parsing file ===');
  const parsed = await parseFile('index.ts', 'test-repo', TEST_WORKSPACE);
  console.log('Nodes:', parsed.nodes.map(n => ({ id: n.id, name: n.name, kind: n.kind, lineStart: n.lineStart, lineEnd: n.lineEnd })));
  console.log('Calls:', parsed.calls);
  console.log('Imports:', parsed.imports);
  console.log('Inheritance:', parsed.inheritance);

  const storage = new SqliteStorageProvider(TEST_DB);
  await storage.initialize();

  const graph = new CodeGraph();
  const indexer = new Indexer(storage, graph, TEST_WORKSPACE);

  console.log('\n=== Before indexing ===');
  console.log('Graph stats:', graph.getStats());

  const job = await indexer.indexRepository(TEST_WORKSPACE, {
    incremental: false,
    respectIgnore: false,
  });

  console.log('\n=== After indexing ===');
  console.log('Job:', job);
  const stats = graph.getStats();
  console.log('Graph stats:', stats);
  console.log('All nodes:', graph.getAllNodes().map(n => ({ id: n.id, name: n.name, kind: n.kind })));
  console.log('All edges:', graph.getAllEdges().map(e => ({ id: e.id, source: e.sourceId, target: e.targetId, kind: e.kind })));

  const helloNodes = graph.findByName('hello');
  console.log('\n=== Finding hello ===');
  console.log('Hello nodes:', helloNodes.map(n => ({ id: n.id, name: n.name })));

  if (helloNodes.length > 0) {
    const callees = graph.getCallees(helloNodes[0].id);
    console.log('Callees of hello:', callees.map(n => ({ id: n.id, name: n.name })));
  }

  storage.close();
  rmSync(TEST_WORKSPACE, { recursive: true, force: true });
}

main().catch(console.error);
