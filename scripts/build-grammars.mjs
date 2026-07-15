#!/usr/bin/env node
/**
 * Build tree-sitter grammars to WASM for web-tree-sitter.
 * 
 * This script compiles grammar.js files from npm packages to .wasm binaries
 * using tree-sitter-cli. The compiled grammars are placed in src/core/ast/grammars/
 * and should be committed to the repository.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GRAMMARS_DIR = join(ROOT, 'src/core/ast/grammars');
const NODE_MODULES = join(ROOT, 'node_modules');

// Grammar packages to build (tier 1)
const TIER_1_GRAMMARS = [
  { name: 'tree-sitter-typescript', subdir: 'typescript', output: 'tree-sitter-typescript.wasm' },
  { name: 'tree-sitter-typescript', subdir: 'tsx', output: 'tree-sitter-tsx.wasm' },
  { name: 'tree-sitter-javascript', subdir: null, output: 'tree-sitter-javascript.wasm' },
  { name: 'tree-sitter-python', subdir: null, output: 'tree-sitter-python.wasm' },
  { name: 'tree-sitter-rust', subdir: null, output: 'tree-sitter-rust.wasm' },
  { name: 'tree-sitter-go', subdir: null, output: 'tree-sitter-go.wasm' },
  { name: 'tree-sitter-java', subdir: null, output: 'tree-sitter-java.wasm' },
];

// Tier 2 grammars (added in Phase 6C)
const TIER_2_GRAMMARS = [
  { name: 'tree-sitter-c', subdir: null, output: 'tree-sitter-c.wasm' },
  { name: 'tree-sitter-cpp', subdir: null, output: 'tree-sitter-cpp.wasm' },
  { name: 'tree-sitter-c-sharp', subdir: null, output: 'tree-sitter-c-sharp.wasm' },
  { name: 'tree-sitter-ruby', subdir: null, output: 'tree-sitter-ruby.wasm' },
  { name: 'tree-sitter-php', subdir: null, output: 'tree-sitter-php.wasm' },
  { name: 'tree-sitter-swift', subdir: null, output: 'tree-sitter-swift.wasm' },
  { name: 'tree-sitter-kotlin', subdir: null, output: 'tree-sitter-kotlin.wasm' },
  { name: 'tree-sitter-dart', subdir: null, output: 'tree-sitter-dart.wasm' },
];

// Ensure output directory exists
if (!existsSync(GRAMMARS_DIR)) {
  mkdirSync(GRAMMARS_DIR, { recursive: true });
}

function buildGrammar(grammar) {
  const { name, subdir, output } = grammar;
  const packagePath = join(NODE_MODULES, name);
  
  if (!existsSync(packagePath)) {
    console.warn(`⚠️  Package ${name} not found, skipping`);
    return false;
  }

  const grammarDir = subdir ? join(packagePath, subdir) : packagePath;
  const grammarFile = join(grammarDir, 'grammar.js');
  
  if (!existsSync(grammarFile)) {
    console.warn(`⚠️  grammar.js not found in ${grammarDir}, skipping`);
    return false;
  }

  console.log(`\n🔨 Building ${name}${subdir ? `/${subdir}` : ''}...`);
  
  try {
    // Run tree-sitter build --wasm in the grammar directory
    execSync('npx tree-sitter build --wasm', {
      cwd: grammarDir,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    // Find the generated .wasm file
    const wasmFile = readdirSync(grammarDir).find(f => f.endsWith('.wasm'));
    if (!wasmFile) {
      console.error(`❌ No .wasm file generated for ${name}`);
      return false;
    }

    // Copy to grammars directory with standardized name
    const srcPath = join(grammarDir, wasmFile);
    const destPath = join(GRAMMARS_DIR, output);
    copyFileSync(srcPath, destPath);
    
    console.log(`✅ ${output} built successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to build ${name}:`, error.message);
    return false;
  }
}

function getPackageVersion(packageName) {
  try {
    const pkgJson = JSON.parse(
      readFileSync(join(NODE_MODULES, packageName, 'package.json'), 'utf-8')
    );
    return pkgJson.version;
  } catch {
    return 'unknown';
  }
}

function writeVersionLock(grammars) {
  const lock = {
    generatedAt: new Date().toISOString(),
    treeSitterCli: getPackageVersion('tree-sitter-cli'),
    webTreeSitter: getPackageVersion('web-tree-sitter'),
    grammars: {},
  };

  for (const grammar of grammars) {
    const { name, output } = grammar;
    if (existsSync(join(GRAMMARS_DIR, output))) {
      lock.grammars[output] = {
        package: name,
        version: getPackageVersion(name),
      };
    }
  }

  const lockPath = join(ROOT, 'ast-grammars.lock.json');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`\n📝 Version lock written to ast-grammars.lock.json`);
}

// Main execution
console.log('🚀 Building tree-sitter WASM grammars...\n');

// Determine which grammars to build
const allGrammars = [...TIER_1_GRAMMARS, ...TIER_2_GRAMMARS];
const grammarsToBuild = process.argv.includes('--all') 
  ? allGrammars 
  : TIER_1_GRAMMARS;

let successCount = 0;
let failCount = 0;

for (const grammar of grammarsToBuild) {
  const success = buildGrammar(grammar);
  if (success) {
    successCount++;
  } else {
    failCount++;
  }
}

// Write version lock file
writeVersionLock(grammarsToBuild);

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Built ${successCount} grammars successfully`);
if (failCount > 0) {
  console.log(`❌ Failed to build ${failCount} grammars`);
}
console.log(`${'='.repeat(60)}\n`);

process.exit(failCount > 0 ? 1 : 0);
