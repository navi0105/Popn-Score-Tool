# Lessons

## Naming: "Version" not "Game"

Each pop'n music release (Jam&Fizz, High Cheers, …) is a **Version** of the same game. Identifiers distinguishing between releases must use that word.

- ✅ `SUPPORTED_VERSIONS`, `VERSION_BASE`, `detectVersion()`, `versionSlug`, `VERSION.label`
- ❌ `SUPPORTED_GAMES`, `GAME_BASE`, `detectGame()`, `gameSlug`

Exception: konami's URL path `/game/popn/<slug>/` is theirs — leave the literal string untouched.

## Build: normalize CRLF before embedding files into JS strings

`build-bookmarklet.js` embeds `viewer-template.html` as a JS string literal. The escape pass only handled `\n`, so on Windows where the working tree had CRLF endings the lone `\r` survived, terminated each JS string at the first line break, and produced an `Invalid or unexpected token` SyntaxError when the bookmarklet ran.

Fix: read both `bookmarklet.js` and `viewer-template.html` with `.replace(/\r\n/g, '\n')` immediately after `readFileSync`. Do not assume git's `core.autocrlf` will keep templates LF — it converts on checkout. Any future "embed file as JS string" should normalize line endings up front.

## Domain: pop'n music version differences (Jam&Fizz → High Cheers)

- Difficulty count changed from 4 to 5: Jam&Fizz had EASY/NORMAL/HYPER/EX; High Cheers has でっかポップ君/LIGHT/NORMAL/HYPER/EX. **LIGHT is equivalent to the old EASY** — map LIGHT → `easy` in the data model. **でっかポップ君 is a new beginner mode** and should be stored as an experimental separate slot (no level info, not part of legacy Pop'n Class).
- `mu_lv.html?lv=1~50` filter only returns NORMAL/HYPER/EX in High Cheers. でっかポップ君 and LIGHT are accessible only via `mu_top.html`, which is a flat full-song listing with all 5 difficulty columns but **no level info**.
- Status page structure changed: Jam&Fizz uses `div.st_box > div.item + div.item_st` pairs; High Cheers uses `div.st_box > ul > li > p + div`. The new official Pop'n Class shows in `#popnclass` (value text + tier image `popclass[N].png`).
- mu_lv table class also differs: Jam&Fizz `mu_list_table`, High Cheers `mu_list_lv_table`. Row cells in High Cheers are unclassed plain `<div>`s (Jam&Fizz had `col_music_lv` / `col_normal_lv` / `col_hyper_lv` / `col_ex_lv`).

## URL gotcha: mu_lv `version=0` ≠ "ALL" on High Cheers

In Jam&Fizz, `mu_lv.html?version=0` means "ALL versions" (the catalog-wide scrape we want). In High Cheers, `value="0"` in the version select is **"pop'n 家庭用"** (a ~100-song home-console subset). The actual ALL option is `value="-1"`. Using `version=0` against High Cheers silently returned only that subset and made it look like the user had played far fewer charts than they had.

Lesson: when adopting a query string from one site that has version-form-derived parameters, **don't assume parameter values are stable across releases**. Inspect the actual `<select>` HTML on each release to derive the right value, and encode it per-version in config (e.g. `SUPPORTED_VERSIONS[v].verAll`).

## Future: mu_detail in High Cheers shows per-version scores

User noted that `mu_detail.html` in High Cheers displays both lifetime ("歴代") scores and current-version scores per difficulty. Whenever Deep Scrape (currently dev-only) is brought back, the detail parser must distinguish these two and store them separately — using only the version-current score for legacy class calc, and exposing the lifetime score for display.
