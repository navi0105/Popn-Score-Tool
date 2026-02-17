/**
 * Embed scraped JSON data into viewer-template.html to generate an offline viewer page.
 *
 * Usage: node build-viewer.js [path-to-scores.json]
 *        Defaults to the latest popn_scores_*.json in results/
 */
const fs = require('fs');
const path = require('path');

// Find JSON file
let jsonPath = process.argv[2];

if (!jsonPath) {
    // Auto-find latest popn_scores_*.json in results/
    const resultsDir = path.join(__dirname, 'results');
    if (fs.existsSync(resultsDir)) {
        const files = fs.readdirSync(resultsDir)
            .filter(f => f.startsWith('popn_scores_') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(resultsDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
            jsonPath = path.join(resultsDir, files[0].name);
        }
    }
}

if (!jsonPath || !fs.existsSync(jsonPath)) {
    console.error('Usage: node build-viewer.js [path-to-scores.json]');
    console.error('No scores JSON found.');
    process.exit(1);
}

console.log('Reading:', jsonPath);
const jsonData = fs.readFileSync(jsonPath, 'utf8');

// Read template
const templatePath = path.join(__dirname, 'viewer-template.html');
const template = fs.readFileSync(templatePath, 'utf8');

// Embed data
const output = template.replace('{{DATA_PLACEHOLDER}}', jsonData);

// Output
const outPath = path.join(__dirname, 'viewer.html');
fs.writeFileSync(outPath, output);

console.log('Generated:', outPath);
console.log('Size:', (output.length / 1024).toFixed(1) + ' KB');

// Validate JSON
const data = JSON.parse(jsonData);
console.log('Songs:', data.scores ? data.scores.length : 0);
console.log('Player:', data.player ? data.player['プレーヤー名'] : 'N/A');
