// Packs Monster Mash into one HTML file (monster-mash.html in the repo root) that opens straight in a browser.
//   node monster-mash/build.js                 -> monster-mash.html, everything inside (works offline)
//   node monster-mash/build.js --page out.html -> page body only, three.js from a CDN (for hosting as a web page)
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const pageIdx = process.argv.indexOf('--page');
const pageMode = pageIdx !== -1;

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`);
html = html.replace(/<script src="([\w.]+)"><\/script>/g, (_, file) => {
  if (file === 'three.min.js' && pageMode) return '<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>';
  return `<script>\n${read(file)}</script>`;
});

if (pageMode) {
  // the host adds its own <html>, <head> and <body>
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const out = process.argv[pageIdx + 1];
  fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
  console.log('Wrote', out);
} else {
  const out = path.join(dir, '..', 'monster-mash.html');
  fs.writeFileSync(out, html);
  console.log('Wrote', out);
}
