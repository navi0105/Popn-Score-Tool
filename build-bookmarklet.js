/**
 * Minify bookmarklet.js into a javascript: URI for use as a browser bookmark.
 * Also embeds viewer-template.html into the bookmarklet.
 *
 * Usage: node build-bookmarklet.js
 */
const fs = require('fs');
const path = require('path');

let source = fs.readFileSync(path.join(__dirname, 'bookmarklet.js'), 'utf8').replace(/\r\n/g, '\n');

// Minify bookmarklet source first (VIEWER_TEMPLATE is still a placeholder)
let minified = source
    // Strip block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Strip line comments (avoid removing // in URLs)
    .replace(/(?<![:'"])\/\/.*$/gm, '')
    // Collapse whitespace
    .replace(/\n\s*\n/g, '\n')
    .replace(/^\s+/gm, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Embed medal sprites (assets/medals/1.png ~ 11.png, fetched once via
// tools/fetch-medals.js) as base64 data URLs so the bookmarklet has them at
// runtime — no cross-origin fetch needed, and the resulting viewer is fully
// offline-capable.
const medalsDir = path.join(__dirname, 'assets', 'medals');
const medalImages = {};
for (let n = 1; n <= 11; n++) {
    const p = path.join(medalsDir, `${n}.png`);
    if (fs.existsSync(p)) {
        medalImages[n] = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    }
}
const medalCount = Object.keys(medalImages).length;
if (medalCount > 0) {
    minified = minified.replace("'{{MEDAL_IMAGES}}'", JSON.stringify(medalImages));
    console.log(`Medal sprites: ${medalCount}/11 embedded`);
} else {
    console.warn('WARNING: medals/ is empty. Run `node tools/fetch-medals.js` first.');
    minified = minified.replace("'{{MEDAL_IMAGES}}'", '{}');
}

// Embed viewer-template.html AFTER minification (to avoid minifier corrupting template content)
const templatePath = path.join(__dirname, 'viewer-template.html');
if (fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf8').replace(/\r\n/g, '\n');
    // Minify HTML: strip extra whitespace but preserve structure
    const minTemplate = template
        .replace(/\n\s*/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
    // Escape for JS string literal (\ and ')
    const escaped = minTemplate
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n');
    minified = minified.replace("'{{VIEWER_TEMPLATE}}'", "'" + escaped + "'");
    console.log(`Viewer template: ${template.length} -> ${minTemplate.length} chars`);
} else {
    console.warn('WARNING: viewer-template.html not found, Export HTML will not work');
}

const bookmarklet = 'javascript:' + encodeURIComponent(minified);

console.log('\n=== Stats ===');
console.log(`Original: ${source.length} chars`);
console.log(`Minified: ${minified.length} chars`);
console.log(`URI:      ${bookmarklet.length} chars`);

// Write self-contained bookmarklet URI (for manual installation)
fs.writeFileSync(path.join(__dirname, 'bookmarklet.min.txt'), bookmarklet);
console.log('\nSaved to bookmarklet.min.txt');

// Write decoded JS (for hosted loader via GitHub Pages)
const docsDir = path.join(__dirname, 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
fs.writeFileSync(path.join(docsDir, 'bookmarklet.min.js'), minified);
console.log('Saved to docs/bookmarklet.min.js');
