# popn-score-tool

A client-side bookmarklet that scrapes your [pop'n music Jam&Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) scores from the official e-amusement site and exports them as a self-contained offline HTML viewer.

## Features

- **Score Scraping** — Fetches scores by level (Lv 1~50) to get score, medal, and rank for every chart
- **Pop'n Class** — Calculates your Pop'n Class rating (Top 50 chart average) with tier display
- **Export HTML** — Download a self-contained offline viewer with:
  - Pop'n Class card + Top 50 table
  - Sortable & filterable score browser
  - Clear lamp stats per level
  - Rank stats per level
- **Export Image** — Download your Pop'n Class Top 50 as a shareable PNG

## Usage

### Quick Install

Visit the **[installation page](https://navi0105.github.io/popn-score-tool/)** and drag the button to your Bookmarks Bar. That's it!

### Run

1. Log in to the [Jam&Fizz page on e-amusement](https://p.eagate.573.jp/game/popn/jamfizz/index.html) (requires Basic Course)
2. Click **Pop'n Score Tool** in your bookmarks bar
3. Click **Scrape** to start fetching your scores
4. When finished, click **Export HTML** to get your offline viewer, or **Export Image** to get a shareable PNG

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

## Future Works

### High Cheers Support

Since I don't live in Japan, and all testing has been done with my own account, I currently have no High Cheers play data for testing. However, I'm planning a trip to Japan soon, and overseas High Cheers cabinets also seem to be launching in the near future -- so stay tuned.

### History Tracking

I don't intend to provide a centralized server for long-term score tracking like [iidx.me](https://iidx.me) or other score management services. That said, helping players see their growth over time is still a goal worth pursuing. One idea is to build an offline score management site similar to [Lampghost](https://github.com/Catizard/lampghost), which would allow long-term record keeping without requiring a server.

## License

MIT

## Acknowledgements

1. [iidx.me](https://iidx.me): Its elegant IIDX score tracker and client-side scraping approach were a major inspiration for this tool
2. [Claude Code](https://claude.ai/claude-code)
