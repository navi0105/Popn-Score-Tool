# popn-score-tool

A client-side bookmarklet that scrapes your pop'n music scores from the official e-amusement site and exports them as a self-contained offline HTML viewer.

**Supported versions:** [Jam&Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) and [High Cheers!!](https://p.eagate.573.jp/game/popn/popn29/index.html). The bookmarklet auto-detects which version you're logged in to.

## Features

- **Score Scraping** — Fetches scores by level (Lv 1~50) to get score, medal, and rank for every chart
- **Pop'n Class** — Calculates the legacy Top 50 Pop'n Class rating with tier display. On High Cheers, the official Pop'n Class scraped from the status page is also shown side-by-side (the official per-chart formula isn't public yet, so the legacy calculation stays for cross-reference).
- **High Cheers extras** — でっかポップ君 / LIGHT charts are scraped from `mu_top.html` and shown as experimental data (LIGHT maps to the legacy `easy` slot since it replaces EASY; でっかポップ君 has no level info and is opt-in in the score browser).
- **Export HTML** — Download a self-contained offline viewer with:
  - Dual Pop'n Class card (calculated + official) + Top 50 table
  - Sortable & filterable score browser
  - Clear lamp stats per level
  - Rank stats per level (incl. new B+ / A+ / AA+ ranks)
- **Export Image** — Download your Pop'n Class Top 50 as a shareable PNG

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

The community hasn't yet worked out High Cheers' new per-chart Pop'n Class formula. As a stand-in:

- The **Official** Pop'n Class value is scraped directly from the status page, so the real current-version number is always shown.
- The **Calculated (legacy)** Top 50 value carried over from earlier versions is still computed and displayed alongside it. It uses the old per-chart formula on NORMAL/HYPER/EX charts that have a level, so it diverges from the official number — but stays useful as a relative reference until the new formula is figured out.

I'm trying to reverse-engineer the new formula, but it really needs score data from more players to be tractable. **If you'd like to help, feel free to DM me and share your score table HTML** — more data points across different player profiles is exactly what's missing right now.

## Future Works

### History Tracking

I don't intend to provide a centralized server for long-term score tracking like [iidx.me](https://iidx.me) or other score management services. That said, helping players see their growth over time is still a goal worth pursuing. One idea is to build an offline score management site similar to [Lampghost](https://github.com/Catizard/lampghost), which would allow long-term record keeping without requiring a server.

## License

MIT

## Acknowledgements

1. [iidx.me](https://iidx.me): Its elegant IIDX score tracker and client-side scraping approach were a major inspiration for this tool
2. [Claude Code](https://claude.ai/claude-code)
