// Copies the static app into dist/ (Capacitor's webDir). GitHub Pages keeps serving the repo root as is.
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist');
const FILES = ['index.html', 'sw.js', 'manifest.json', 'css', 'js', 'icons', 'data', 'privacy.html'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, f), { recursive: true });
}
console.log(`web assets copied to ${path.relative(root, out)}/`);
