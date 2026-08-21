# HC Pop'n Class formula + Viewer redesign

Plan: C:\Users\Navi\.claude\plans\sorted-snacking-pike.md

## Step 1 — Formula core (offline-verifiable)
- [x] A1: MEDAL_MAP + viewer medal maps gain `assist_clear` (meda_l), text fallback for missing sprite
- [x] A2: formula module (floorTo/roundTo/hcMedalBonus/calcHcChartPoint/inferVersionMedal/effectiveHcMedal/calcHcClass)
- [x] A4: parseDetailPage dispatcher + parseDetailPageHC
- [x] A6: test harness coverage; `node tasks/test-harness/test-parsers.js` green

## Step 2 — Scraper wiring
- [x] A3: Phase D new-chart tagging (mu_lv version=29 sweep)
- [x] A3: Phase E version-score resolution (mu_detail candidates + cutoff)
- [x] A3: progress re-weighting + stop guards + deep-mode integration
- [x] A5: finish()/openViewer hcClass wiring
- [x] A5: PNG export HC layout (Top20 new + Top40 old)
- [ ] rebuild + **user live-verification on HC** (+ Jam&Fizz regression) ← PENDING USER

## Step 3 — Viewer redesign
- [x] Theme tokens + dark mode (auto + manual toggle)
- [x] Sticky header + segmented tabs
- [x] Pop'n Class panel: 3 cards + EASY toggle + Top20/Top40 tables + legacy in details
- [x] Score browser mobile card layout + chip filters
- [x] Lamp/Rank sticky first column + overflow
- [x] Backward compat (DATA without hcClass)

## Step 4 — Builds & docs
- [x] build-bookmarklet.js rebuild (minifier survival check: node --check on output, tests green)
- [x] examples/viewer.html regenerated with new template (no synthetic hcClass — data is a real
      pre-HC scrape; decided against fabricating HC values in a showcased example. Regenerate
      from a real HC scrape after live verification to showcase the new panel.)
- [x] README.md / README.ja.md Known Limitations rewritten + acknowledgements
- [x] docs/index.html refreshed (High Cheers mention, feature list)
- [x] tasks/lessons.md updated

## Review

- HC formula replicated bit-for-bit from ssdh233/popn-class index-hc.js (rounding chain
  verified by golden-value tests). EASY-clear toggle fully implemented (both variants
  precomputed; viewer recomputes Top 40 client-side from oldResolved).
- Scraper gains Phase D (version=29 sweep, ~50-60 req) and Phase E (mu_detail best-first
  with proven top-40 early stop, typically 40-80 req). Stop guards + partial flag wired.
- Viewer fully redesigned: dark mode (auto+manual), sticky appbar, 3-card class grid,
  HC breakdown tables, mobile card rows, sticky matrix columns. Verified with Playwright
  at 1280/375px, light+dark, plus old-format DATA (graceful degradation) and both PNG
  export layouts.
- Outstanding (needs the user's e-amusement session):
  1. Live HC quick scrape — check log request counts, hcClass vs official value
  2. Stop mid-Phase-D and mid-Phase-E — verify partial flag
  3. Jam&Fizz regression scrape
  4. Dump a PLAYED song's mu_detail (VERSION table with values) to harden the parser fixture
  5. Regenerate examples/viewer.html + examples PNG from a real HC scrape
