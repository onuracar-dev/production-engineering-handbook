import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const componentPath = path.resolve(__dirname, '../src/TrendChart.tsx');
// Normalize CRLF so a Windows checkout (core.autocrlf=true) measures the same bytes as the LF blob in git
const content = fs.readFileSync(componentPath, 'utf8').replace(/\r\n/g, '\n');

const rawBytes = Buffer.byteLength(content, 'utf8');
const gzipped = zlib.gzipSync(content, { level: 9 });
const gzipBytes = gzipped.length;
const lineCount = content.trim().split('\n').length;

console.log('--- Zero-Dependency SVG Sparkline Size Measurement ---');
console.log(`File: src/TrendChart.tsx`);
console.log(`Lines: ${lineCount} lines`);
console.log(`Raw Size: ${rawBytes} bytes (${(rawBytes / 1024).toFixed(2)} KB)`);
console.log(`Gzip Size (level 9): ${gzipBytes} bytes (${(gzipBytes / 1024).toFixed(2)} KB)`);

