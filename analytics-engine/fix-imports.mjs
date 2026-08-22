#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getAllTsFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
        getAllTsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

function fixImports(content) {
  // Fix relative imports without .js extension
  // Pattern: from './path' or from "../path" or from './path/file'
  const importPattern = /(from\s+['"])(\.\.[\/\\][^'"]+|\.\/[^'"]+)(['"])/g;
  
  return content.replace(importPattern, (match, prefix, path, suffix) => {
    // Skip if already has .js extension or is importing from node_modules or has no extension
    if (path.endsWith('.js') || 
        path.endsWith('.json') ||
        !path.includes('/') && !path.includes('\\') ||
        path.startsWith('.') && !path.includes('/') && !path.includes('\\')) {
      return match;
    }
    
    // Add .js extension
    return `${prefix}${path}.js${suffix}`;
  });
}

const srcDir = join(__dirname, 'src');
const files = getAllTsFiles(srcDir);

let fixedCount = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const fixed = fixImports(content);
  
  if (content !== fixed) {
    writeFileSync(file, fixed, 'utf8');
    fixedCount++;
    console.log(`Fixed: ${file}`);
  }
}

console.log(`\nFixed ${fixedCount} files`);
