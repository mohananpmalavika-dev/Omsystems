#!/usr/bin/env tsx
/**
 * TypeScript Coverage Checker
 * 
 * Reports on type-checking status and tracks technical debt metrics:
 * - Total type errors
 * - 'as any' usage
 * - Missing return types
 * - Files excluded from strict checks
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { glob } from 'glob';

interface CoverageMetrics {
  typeErrors: number;
  asAnyCount: number;
  missingReturnTypes: number;
  excludedFiles: number;
  strictMode: boolean;
  noUncheckedIndexedAccess: boolean;
}

async function main() {
  console.log('='.repeat(70));
  console.log('TypeScript Coverage Report');
  console.log('='.repeat(70));
  console.log();

  const metrics: CoverageMetrics = {
    typeErrors: 0,
    asAnyCount: 0,
    missingReturnTypes: 0,
    excludedFiles: 0,
    strictMode: false,
    noUncheckedIndexedAccess: false,
  };

  // Check tsconfig.json settings
  console.log('📋 Checking TypeScript Configuration...');
  try {
    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'));
    metrics.strictMode = tsconfig.compilerOptions?.strict === true;
    metrics.noUncheckedIndexedAccess = tsconfig.compilerOptions?.noUncheckedIndexedAccess === true;
    
    if (tsconfig.exclude) {
      metrics.excludedFiles = tsconfig.exclude.filter((pattern: string) => 
        !pattern.includes('node_modules') && 
        !pattern.includes('dist') &&
        !pattern.includes('test') &&
        !pattern.endsWith('.test.ts')
      ).length;
    }
    
    console.log(`  strict: ${metrics.strictMode ? '✅' : '❌'}`);
    console.log(`  noUncheckedIndexedAccess: ${metrics.noUncheckedIndexedAccess ? '✅' : '❌'}`);
    console.log(`  Excluded production files: ${metrics.excludedFiles}`);
    console.log();
  } catch (error) {
    console.error('  ❌ Failed to read tsconfig.json');
    console.log();
  }

  // Count type errors
  console.log('🔍 Running Type Check...');
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe', encoding: 'utf-8' });
    console.log('  ✅ No type errors found!');
  } catch (error: any) {
    const output = error.stdout || '';
    const errorLines = output.split('\n').filter((line: string) => 
      line.includes('error TS')
    );
    metrics.typeErrors = errorLines.length;
    
    if (metrics.typeErrors > 0) {
      console.log(`  ❌ Found ${metrics.typeErrors} type errors`);
      console.log();
      console.log('  First 10 errors:');
      errorLines.slice(0, 10).forEach((line: string) => {
        console.log(`    ${line.trim()}`);
      });
      if (metrics.typeErrors > 10) {
        console.log(`    ... and ${metrics.typeErrors - 10} more`);
      }
    }
  }
  console.log();

  // Count 'as any' usage
  console.log('🔎 Checking for "as any" usage...');
  try {
    const files = await glob('src/**/*.ts', { ignore: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'] });
    let totalAsAny = 0;
    const filesWithAsAny: string[] = [];
    
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const matches = content.match(/\bas any\b/g);
      if (matches) {
        totalAsAny += matches.length;
        filesWithAsAny.push(file);
      }
    }
    
    metrics.asAnyCount = totalAsAny;
    console.log(`  Found ${totalAsAny} occurrences of "as any" in ${filesWithAsAny.length} files`);
    
    if (filesWithAsAny.length > 0 && filesWithAsAny.length <= 10) {
      console.log('  Files:');
      filesWithAsAny.forEach(file => console.log(`    - ${file}`));
    } else if (filesWithAsAny.length > 10) {
      console.log(`  Top 10 files:`);
      filesWithAsAny.slice(0, 10).forEach(file => console.log(`    - ${file}`));
    }
  } catch (error) {
    console.error('  ❌ Failed to check "as any" usage');
  }
  console.log();

  // Count missing return types
  console.log('📝 Checking for missing return types...');
  try {
    const files = await glob('src/**/*.ts', { ignore: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'] });
    let totalMissing = 0;
    
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Simple heuristic: function without ': Type' before '{'
      const matches = content.match(/function \w+\([^)]*\)\s*{/g);
      if (matches) {
        totalMissing += matches.length;
      }
    }
    
    metrics.missingReturnTypes = totalMissing;
    console.log(`  Found approximately ${totalMissing} functions without explicit return types`);
  } catch (error) {
    console.error('  ❌ Failed to check return types');
  }
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log();
  
  const score = calculateScore(metrics);
  console.log(`Overall Type Safety Score: ${score}/100`);
  console.log();
  
  console.log('Metrics:');
  console.log(`  Type Errors: ${metrics.typeErrors} (target: 0)`);
  console.log(`  "as any" Usage: ${metrics.asAnyCount} (target: < 50)`);
  console.log(`  Missing Return Types: ${metrics.missingReturnTypes} (target: < 100)`);
  console.log(`  Excluded Production Files: ${metrics.excludedFiles} (target: 0)`);
  console.log(`  Strict Mode: ${metrics.strictMode ? 'Enabled ✅' : 'Disabled ❌'}`);
  console.log(`  noUncheckedIndexedAccess: ${metrics.noUncheckedIndexedAccess ? 'Enabled ✅' : 'Disabled ❌'}`);
  console.log();

  if (score < 80) {
    console.log('⚠️  Type safety is below recommended threshold (80/100)');
    console.log('   Consider addressing type issues before adding new features.');
    process.exit(1);
  } else if (score < 95) {
    console.log('✅ Type safety is acceptable, but can be improved.');
  } else {
    console.log('🎉 Excellent type safety!');
  }
}

function calculateScore(metrics: CoverageMetrics): number {
  let score = 100;
  
  // Type errors: -2 points each
  score -= Math.min(metrics.typeErrors * 2, 40);
  
  // 'as any' usage: -0.1 points each
  score -= Math.min(metrics.asAnyCount * 0.1, 20);
  
  // Missing return types: -0.05 points each
  score -= Math.min(metrics.missingReturnTypes * 0.05, 15);
  
  // Excluded files: -5 points each
  score -= Math.min(metrics.excludedFiles * 5, 15);
  
  // Strict mode not enabled: -10 points
  if (!metrics.strictMode) score -= 10;
  
  // noUncheckedIndexedAccess not enabled: -5 points
  if (!metrics.noUncheckedIndexedAccess) score -= 5;
  
  return Math.max(0, Math.round(score));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
