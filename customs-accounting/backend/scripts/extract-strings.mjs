// Extract every user-facing Arabic string from the backend so they can be
// translated once (ar -> fr). Output: backend/src/i18n/strings.json
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');
const files = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'i18n') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
})(srcDir);

const ARABIC = /[\u0600-\u06FF]/;
const strings = new Set();

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  // single-quoted, double-quoted and backtick strings
  for (const re of [/'([^'\\\n]*)'/g, /"([^"\\\n]*)"/g, /`([^`\\]*)`/g]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const value = m[1];
      if (!ARABIC.test(value)) continue;
      if (value.includes('${')) {
        // keep static template strings, mark interpolations
        strings.add(value);
      } else {
        strings.add(value);
      }
    }
  }
}

const sorted = [...strings].sort();
const outDir = path.join(srcDir, 'i18n');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'strings.json'), JSON.stringify(sorted, null, 2), 'utf8');
console.log(`${files.length} fichiers, ${sorted.length} chaînes arabes -> src/i18n/strings.json`);
