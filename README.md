# popn-score-tool

English | [日本語](README.ja.md)

A client-side bookmarklet that scrapes your pop'n music scores from the official e-amusement site and exports them as a self-contained offline HTML viewer.

**Supported versions:** [Jam&Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) and [High Cheers!!](https://p.eagate.573.jp/game/popn/popn29/index.html). The bookmarklet auto-detects which version you're logged in to.

## Features

- **Score Scraping** — Fetches scores by level (Lv 1~50) to get score, medal, and rank for every chart
- **Pop'n Class** — On High Cheers, calculates the current official formula (Top 20 new songs + Top 40 old songs, with old songs scored on their current-version score fetched from `mu_detail.html`) and shows it next to the official value scraped from the status page. The legacy Top-50 calculation is also kept for cross-reference (and remains the main calculation on Jam&Fizz).
- **High Cheers extras** — でっかポップ君 / LIGHT charts are scraped from `mu_top.html` and shown as experimental data (LIGHT maps to the legacy `easy` slot since it replaces EASY; でっかポップ君 has no level info and is opt-in in the score browser).
- **Export HTML** — Download a self-contained offline viewer with:
  - Pop'n Class summary cards (official + HC-formula calc + legacy) with the New Top 20 / Old Top 40 breakdown and an「EASYクリアの歴代メダルを参照」toggle
  - Sortable & filterable score browser (card layout on phones)
  - Clear lamp stats per level
  - Rank stats per level (incl. new B+ / A+ / AA+ ranks)
  - Dark mode (follows your system, with a manual toggle)
- **Export Image** — Download a shareable PNG: New Top 20 + Old Top 40 on High Cheers, legacy Top 50 on Jam&Fizz

## Usage

### Quick Install

Visit the **[installation page](https://navi0105.github.io/Popn-Score-Tool/)** and drag the button to your Bookmarks Bar. That's it!

### Run

1. Log in to the playdata page on e-amusement for your version of choice ([Jam&Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) or [High Cheers](https://p.eagate.573.jp/game/popn/popn29/index.html)) — requires Basic Course
2. Click **Pop'n Score Tool** in your bookmarks bar — the UI shows which version was detected
3. Click **Scrape** to start fetching your scores
4. When finished, click **View Results** to open the offline viewer, or **Export Image** to get a shareable PNG

### Manual Install

If you prefer not to use the hosted loader:

1. Run `node build-bookmarklet.js` (or use the pre-built `bookmarklet.min.txt`)
2. Copy the contents of `bookmarklet.min.txt`
3. Create a new bookmark in your browser and paste it as the URL

## Files

| File | Description |
|---|---|
| `bookmarklet.js` | Main bookmarklet source |
| `viewer-template.html` | HTML viewer template (embedded into bookmarklet at build time) |
| `build-bookmarklet.js` | Build script: minifies bookmarklet + embeds viewer template |
| `build-viewer.js` | Dev tool: embeds a JSON file into the viewer template for local testing |
| `docs/index.html` | GitHub Pages installation page |
| `docs/bookmarklet.min.js` | Built JS loaded by the hosted bookmarklet (auto-generated) |

## Known Limitations

### Pop'n Class formula on High Cheers

The tool implements the community-derived High Cheers formula (see [ssdh233/popn-class](https://github.com/ssdh233/popn-class)): per chart, `floor(floor(level × (3750 × level + medal_bonus + (score − 50000)) / 3881250, 8dp) × 60, 2dp)` for scores of 50000+, summed over the **Top 20 new songs + Top 40 old songs** and divided by 60. Remaining caveats:

- **Old songs use current-version scores**, which only appear on `mu_detail.html`. The scraper fetches details for the top candidate charts (best-first, stopping once the Top 40 is mathematically settled — typically 40–80 extra requests), so a quick scrape stays reasonably fast. Stopping mid-scrape yields a value marked *partial*.
- The current-version **medal is inferred from the clear/FC/PERFECT counters** (the VERSION table shows no medal image), so fine-grained medal steps (◆/★ variants) may differ from the game's internal state; this only matters in rare bonus-tier edge cases.
- Scope is **NORMAL/HYPER/EX** charts with a level — LIGHT and でっかポップ君 are outside the formula, matching the reference implementation.
- The calculated value can still diverge from the official one by a small margin (rounding-boundary cases, stale official value between plays).

## License

MIT

## Acknowledgements

1. [iidx.me](https://iidx.me): Its elegant IIDX score tracker and client-side scraping approach were a major inspiration for this tool
2. [ssdh233/popn-class](https://github.com/ssdh233/popn-class): The reference implementation of the High Cheers Pop'n Class formula that this tool replicates
3. [Claude Code](https://claude.ai/claude-code)
