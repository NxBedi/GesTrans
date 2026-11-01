// Dev utility: verify every t('key') used in src exists in both dictionaries.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const leaves = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const at = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') leaves(v, at, out);
    else out.push(at);
  }
  return out;
};

const ar = new Set(leaves(read('src/i18n/ar.json')));
const fr = new Set(leaves(read('src/i18n/fr.json')));

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(p);
  }
})(path.join(root, 'src'));

const patterns = [/\bt\(\s*'([A-Za-z0-9_.]+)'/g, /\btranslate\(\s*'([A-Za-z0-9_.]+)'/g, /\btr\(\s*'([A-Za-z0-9_.]+)'/g];
const used = new Map();
const missing = new Set();

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const key = m[1];
      used.set(key, (used.get(key) || 0) + 1);
      if (!ar.has(key) || !fr.has(key)) {
        missing.add(`${key}  (${path.relative(root, file).replace(/\\/g, '/')})`);
      }
    }
  }
}

console.log(`clés utilisées: ${used.size}`);
console.log(missing.size ? `MANQUANTES (${missing.size}):\n${[...missing].join('\n')}` : 'aucune clé manquante');
const unused = [...ar].filter((k) => !used.has(k));
console.log(`clés déclarées mais non utilisées: ${unused.length}`);
if (unused.length) console.log(unused.slice(0, 40).join(', '));
process.exitCode = missing.size ? 1 : 0;
