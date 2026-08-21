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

## Build minifier: never write `/*` inside a line comment

`build-bookmarklet.js` strips block comments with the naïve regex `/\/\*[\s\S]*?\*\//g`, which scans the whole source without distinguishing string contents or other line comments. If a `//` line comment in `bookmarklet.js` contains the two-char substring slash-star (e.g. a path like `medals/N.png` written with a wildcard), the next regex pass treats it as the opening of a block comment and eats everything up to the next star-slash — typically the closing of an unrelated docstring several functions later. Symptoms: the minified bookmarklet is mysteriously smaller than expected, a chunk of code (often a recently-added var) goes silently missing, and the runtime fails with an undefined identifier.

Workaround: never write `slash-star` inside any comment. Rephrase wildcards (e.g. `medals/N.png` instead of `medals/*.png`). A proper fix would be a comment stripper that respects string boundaries and other comments — out of scope for now; flag if `build-bookmarklet.js`'s comment regex is touched again.

## URL gotcha: mu_lv `version=0` ≠ "ALL" on High Cheers

In Jam&Fizz, `mu_lv.html?version=0` means "ALL versions" (the catalog-wide scrape we want). In High Cheers, `value="0"` in the version select is **"pop'n 家庭用"** (a ~100-song home-console subset). The actual ALL option is `value="-1"`. Using `version=0` against High Cheers silently returned only that subset and made it look like the user had played far fewer charts than they had.

Lesson: when adopting a query string from one site that has version-form-derived parameters, **don't assume parameter values are stable across releases**. Inspect the actual `<select>` HTML on each release to derive the right value, and encode it per-version in config (e.g. `SUPPORTED_VERSIONS[v].verAll`).

## mu_detail in High Cheers shows per-version scores (implemented 2026-08)

`mu_detail.html` in High Cheers displays both lifetime ("歴代") and current-version scores per difficulty. `parseDetailPageHC` now parses both tables (`section > table[0]` = 歴代, `table[1]` = VERSION); version scores are stored as separate chart fields (`versionScore` / `versionMedal` / `hcResolved`) and must never pass through `mergeEntry` (its "first real score wins" rule would corrupt lifetime data). The HC Pop'n Class formula (Top 20 new + Top 40 old, ssdh233/popn-class replica) consumes them.

Caveats recorded during implementation:
- The VERSION table has **no medal image** — the medal is inferred from クリア/FC/PERFECT counters (a / b / e / h tiers only). Fine-grained ◆/★ steps are approximated by keeping the lifetime medal when bonus tiers match.
- Early-stop bound: candidates are fetched best-first by lifetime point, stopping when the 40th resolved point >= next candidate's lifetime point. A lifetime `easy_clear` (6250) whose version medal infers to `normal_clear` (12500) can make the version point slightly exceed the lifetime "upper bound" — same behavior as the reference; error magnitude is negligible (≲0.03 display points).
- `meda_l` (assist clear, bonus 10000) exists in the medal alphabet but has no local sprite — text-chip fallback in viewer and canvas exports.

## Viewer CSS: sticky table columns die under border-collapse + specificity traps

Two hard-won facts from the 2026-08 viewer redesign:
- `position: sticky` on `th`/`td` silently fails in Chromium when the table has `border-collapse: collapse` **or** any ancestor (including the table itself, e.g. `border-radius` + `overflow: hidden`) establishes overflow clipping. Fix: `border-collapse: separate; border-spacing: 0; overflow: visible` on the table inside the scrolling wrapper.
- Single-class rules defined later in the stylesheet beat earlier equal-specificity rules: `.diff-ex { color: var(--ex) }` (text-color helper) silently overrode `.diff-chip { color: #fff }`, producing red-on-red chips. When one class styles text and another styles a chip background, give the chip rule higher specificity (`span.diff-chip`).
