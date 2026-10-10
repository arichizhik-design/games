// Packs Blocky Rivals into one HTML file (../blocky-rivals.html) that runs without a server or internet.
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`);
html = html.replace(/<script src="([\w.]+)"><\/script>/g, (_, file) => `<script>\n${read(file)}</script>`);

fs.writeFileSync(path.join(__dirname, '..', 'blocky-rivals.html'), html);
console.log('Wrote blocky-rivals.html');
