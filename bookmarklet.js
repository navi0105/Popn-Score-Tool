/**
 * pop'n music Jam&Fizz — Client-side score scraper
 *
 * Usage:
 *   1. Log in to https://p.eagate.573.jp/game/popn/jamfizz/index.html
 *   2. Paste this script in the browser console, or run as a bookmarklet
 *
 * Scrape modes:
 *   Quick — Scrape mu_lv.html by level (lv=1~50) to get score/medal/rank
 *   Deep  — Quick + per-song mu_detail.html for detailed play data
 */
(function () {
    'use strict';

    // Auto-detect pop'n music version from current URL.
    // Jam&Fizz lives under /game/popn/jamfizz/ ; High Cheers under /game/popn/popn29/.
    // verAll = the value of the "ALL versions" option in the mu_lv/mu_top filter form.
    // Critical: it differs between releases. In Jam&Fizz the option labeled "ALL" is
    // value="0"; in High Cheers value="0" is "pop'n 家庭用" (a small home-console subset)
    // and "ALL" is value="-1". Using the wrong value silently drops ~99% of the catalog.
    var SUPPORTED_VERSIONS = {
        'jamfizz': { base: '/game/popn/jamfizz', label: 'Jam&Fizz',    hasMuTop: false, hasOfficialClass: false, verAll: '0'  },
        'popn29':  { base: '/game/popn/popn29',  label: 'High Cheers', hasMuTop: true,  hasOfficialClass: true,  verAll: '-1' },
    };
    function detectVersion() {
        var path = location.pathname || '';
        for (var key in SUPPORTED_VERSIONS) {
            if (path.indexOf('/game/popn/' + key + '/') === 0) return SUPPORTED_VERSIONS[key];
        }
        return null;
    }
    var VERSION = detectVersion();
    var VERSION_BASE = VERSION ? VERSION.base : '/game/popn/jamfizz';
    var MAX_LEVEL = 50;
    var PAGE_DELAY = 400;
    var DETAIL_DELAY = 300;

    // ========== State ==========
    var isRunning = false;
    var stopRequested = false;
    var collectedData = {
        player: null,
        scores: [],
        exportedAt: null,
    };

    // ========== Medal / Rank lookup ==========

    var MEDAL_MAP = {
        'meda_none': 'no_play',
        'meda_l': 'assist_clear',
        'meda_k': 'easy_clear',
        'meda_j': 'failed_1',
        'meda_i': 'failed_2',
        'meda_h': 'failed_3',
        'meda_g': 'normal_clear',
        'meda_f': 'normal_clear_in_20_bad',
        'meda_e': 'normal_clear_in_5_bad',
        'meda_d': 'full_combo',
        'meda_c': 'full_combo_in_20_good',
        'meda_b': 'full_combo_in_5_good',
        'meda_a': 'perfect',
    };

    var RANK_MAP = {
        'rank_none': null,
        'rank_e': 'E',
        'rank_d': 'D',
        'rank_c': 'C',
        'rank_b': 'B',
        'rank_b_plus': 'B+',
        'rank_a1': 'A',
        'rank_a1_plus': 'A+',
        'rank_a2': 'AA',
        'rank_a2_plus': 'AA+',
        'rank_a3': 'AAA',
        'rank_s': 'S',
    };

    function extractMedal(imgSrc) {
        if (!imgSrc) return null;
        var match = imgSrc.match(/medal\/(meda_[a-z_]+)\.png/);
        return match ? (MEDAL_MAP[match[1]] || match[1]) : null;
    }

    function extractRank(imgSrc) {
        if (!imgSrc) return null;
        var match = imgSrc.match(/medal\/(rank_[a-z0-9_]+)\.png/);
        return match ? (RANK_MAP[match[1]] !== undefined ? RANK_MAP[match[1]] : match[1]) : null;
    }

    function extractScore(colDiv) {
        var text = colDiv.textContent.trim();
        if (text === '-' || text === '') return null;
        var num = parseInt(text.replace(/[^0-9]/g, ''));
        return isNaN(num) ? null : num;
    }

    // ========== UI ==========

    function createUI() {
        if (document.getElementById('popnme')) {
            document.getElementById('popnme').remove();
        }

        var overlay = document.createElement('div');
        overlay.id = 'popnme';
        overlay.innerHTML = '\
        <style>\
            #popnme {\
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;\
                background: rgba(0,0,0,0.4); z-index: 99999;\
                display: flex; align-items: center; justify-content: center;\
                font-family: sans-serif; color: #3d2b1f;\
            }\
            #popnme .panel {\
                background: #fef6f0; border-radius: 12px; padding: 30px;\
                max-width: 520px; width: 90%;\
                box-shadow: 0 4px 24px rgba(0,0,0,0.15);\
            }\
            #popnme h2 { margin: 0 0 4px 0; color: #e94560; }\
            #popnme .subtitle { color: #907860; margin: 0 0 20px 0; font-size: 13px; }\
            #popnme .msg1 { font-size: 14px; color: #2e7ed6; margin: 8px 0 4px 0; }\
            #popnme .msg2 { font-size: 12px; color: #907860; margin: 0 0 8px 0; }\
            #popnme .progress-bar {\
                width: 100%; height: 6px; background: #ffe0d0;\
                border-radius: 3px; margin: 10px 0; overflow: hidden;\
            }\
            #popnme .progress-fill {\
                height: 100%; width: 0%; background: #e94560;\
                border-radius: 3px; transition: width 0.3s;\
            }\
            #popnme button {\
                padding: 8px 20px; border: none; border-radius: 6px;\
                color: #fff; cursor: pointer; margin: 3px; font-size: 13px;\
            }\
            #popnme button:hover:not(:disabled) { opacity: 0.8; }\
            #popnme button:disabled { opacity: 0.4; cursor: not-allowed; }\
            #popnme .btn-quick { background: #e94560; }\
            #popnme .btn-stop { background: #b0a090; }\
            #popnme .btn-close { background: #907860; }\
            #popnme .btn-export { background: #2ecc71; }\
            #popnme .btn-html { background: #4a8fe7; }\
            #popnme .btn-img { background: #d08a10; }\
            #popnme .btn-deep { background: #b06ce0; }\
            #popnme .btn-dump { background: #8b5cf6; }\
            #popnme .logger {\
                max-height: 180px; overflow-y: auto; font-size: 11px;\
                background: #fff0ea; border: 1px solid #f0c8b0; border-radius: 6px; padding: 10px;\
                color: #1ea868; font-family: monospace; margin-top: 12px;\
            }\
            #popnme .logger p { margin: 2px 0; }\
            #popnme .mode-desc { font-size: 11px; color: #907860; margin: 4px 0 10px 0; }\
        </style>\
        <div class="panel">\
            <h2>Pop\'n Score Tool</h2>\
            <p class="subtitle">pop\'n music score exporter</p>\
            <p class="msg1" id="popnme_msg1">Initializing...</p>\
            <p class="msg2" id="popnme_msg2"></p>\
            <div class="progress-bar"><div class="progress-fill" id="popnme_progress"></div></div>\
            <div>\
                <button class="btn-quick" id="popnme_btn_quick">Scrape</button>\
                <!-- [DEV] Deep Scrape: hidden for v1, enable for per-song detail fetching -->\
                <!-- <button class="btn-deep" id="popnme_btn_deep">Deep Scrape</button> -->\
                <!-- [DEV] Export JSON: hidden for v1, enable for raw JSON export -->\
                <!-- <button class="btn-export" id="popnme_btn_export" disabled>Export JSON</button> -->\
                <button class="btn-html" id="popnme_btn_html" disabled>View Results</button>\
                <button class="btn-img" id="popnme_btn_img" disabled>Export Image</button>\
                <!-- [DEV] Dump HTML: hidden for v1, enable for raw page HTML dump -->\
                <!-- <button class="btn-dump" id="popnme_btn_dump">Dump HTML</button> -->\
                <button class="btn-stop" id="popnme_btn_stop" disabled>Stop</button>\
                <button class="btn-close" id="popnme_btn_close">Close</button>\
            </div>\
            <div class="logger" id="popnme_logger"></div>\
        </div>';

        document.body.appendChild(overlay);

        document.getElementById('popnme_btn_quick').addEventListener('click', function() { startUpdate(false); });
        // [DEV] document.getElementById('popnme_btn_deep').addEventListener('click', function() { startUpdate(true); });
        // [DEV] document.getElementById('popnme_btn_dump').addEventListener('click', dumpHTML);
        // [DEV] document.getElementById('popnme_btn_export').addEventListener('click', exportJSON);
        document.getElementById('popnme_btn_html').addEventListener('click', openViewer);
        document.getElementById('popnme_btn_img').addEventListener('click', exportClassImage);
        document.getElementById('popnme_btn_stop').addEventListener('click', requestStop);
        document.getElementById('popnme_btn_close').addEventListener('click', function() { overlay.remove(); });
    }

    function log(msg) {
        console.log('[popnme]', msg);
        var logger = document.getElementById('popnme_logger');
        if (logger) {
            var p = document.createElement('p');
            p.textContent = msg;
            logger.insertBefore(p, logger.firstChild);
        }
    }

    function setMsg1(msg) {
        var el = document.getElementById('popnme_msg1');
        if (el) el.textContent = msg;
    }

    function setMsg2(msg) {
        var el = document.getElementById('popnme_msg2');
        if (el) el.textContent = msg;
    }

    function setProgress(ratio) {
        var el = document.getElementById('popnme_progress');
        if (el) el.style.width = (ratio * 100) + '%';
    }

    function setButtonState(phase) {
        var btnQuick = document.getElementById('popnme_btn_quick');
        var btnHtml = document.getElementById('popnme_btn_html');
        var btnImg = document.getElementById('popnme_btn_img');
        var btnStop = document.getElementById('popnme_btn_stop');
        var hasData = collectedData.scores.length > 0;
        if (phase === 'running') {
            btnQuick.disabled = true;
            btnStop.disabled = false;
            btnHtml.disabled = true;
            btnImg.disabled = true;
        } else if (phase === 'done') {
            btnQuick.disabled = false;
            btnStop.disabled = true;
            btnHtml.disabled = false;
            btnImg.disabled = false;
        } else {
            btnQuick.disabled = false;
            btnStop.disabled = true;
            btnHtml.disabled = !hasData;
            btnImg.disabled = !hasData;
        }
    }

    // ========== HTTP helpers ==========

    function fetchPage(url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onload = function () {
                if (this.responseURL && this.responseURL.indexOf('error.html') > 0) {
                    var errcode = this.responseURL.slice(-1);
                    var errors = {
                        '1': 'Need e-amusement Basic Course',
                        '2': 'Need to register game card',
                        '3': 'No play data found',
                        '4': 'e-amusement server error',
                        '5': 'Need Premium Course',
                    };
                    reject(new Error(errors[errcode] || 'Unknown eagate error'));
                    return;
                }
                if (this.status === 200) {
                    resolve(this.responseText);
                } else {
                    reject(new Error('HTTP ' + this.status));
                }
            };
            xhr.onerror = function () {
                reject(new Error('Network error'));
            };
            xhr.send();
        });
    }

    function parseHTML(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function fetchImageAsDataURL(url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.responseType = 'blob';
            xhr.onload = function () {
                if (this.status === 200) {
                    var reader = new FileReader();
                    reader.onloadend = function () { resolve(reader.result); };
                    reader.readAsDataURL(this.response);
                } else {
                    reject(new Error('HTTP ' + this.status));
                }
            };
            xhr.onerror = function () { reject(new Error('Network error')); };
            xhr.send();
        });
    }

    // srandom medal sprite numbering — kept in sync with viewer-template.html.
    // 1 is best (perfect), descending; easy_clear is bumped to 11 per srandom's
    // table convention. no_play has no sprite.
    var MEDAL_IMG_NUM = {
        perfect: 1,
        full_combo_in_5_good: 2,
        full_combo_in_20_good: 3,
        full_combo: 4,
        normal_clear_in_5_bad: 5,
        normal_clear_in_20_bad: 6,
        normal_clear: 7,
        failed_3: 8,
        failed_2: 9,
        failed_1: 10,
        easy_clear: 11,
    };

    // Medal sprites are baked in at build time from local medals/N.png files
    // (do not write the wildcard form here — the substring /\*  inside a line
    // comment confuses the build minifier's block-comment regex). No runtime
    // cross-origin fetch needed. Build script replaces this placeholder.
    var MEDAL_IMAGES = '{{MEDAL_IMAGES}}';

    // ========== URL builders ==========

    function buildMuLvURL(lv, page) {
        var verAll = (VERSION && VERSION.verAll) || '0';
        return VERSION_BASE + '/playdata/mu_lv.html?page=' + page
            + '&version=' + verAll + '&bemani=0&category=0&keyword=&lv=' + lv
            + '&sort=music&sort_type=up';
    }

    function buildMuTopURL(page) {
        var verAll = (VERSION && VERSION.verAll) || '0';
        return VERSION_BASE + '/playdata/mu_top.html?page=' + page
            + '&version=' + verAll + '&bemani=0&category=0&keyword=&sort=music&sort_type=up';
    }

    // ========== Parsers ==========

    function parseStatusPage(doc) {
        var data = {};

        // Two layouts seen in the wild:
        //   Jam&Fizz: <div class="st_box"> alternating <div class="item">label</div><div class="item_st">value</div>
        //   High Cheers: <div class="st_box"><ul><li><p>label</p><div>value</div></li>...
        var jamfizzItems = doc.querySelectorAll('div.st_box div.item');
        if (jamfizzItems.length > 0) {
            jamfizzItems.forEach(function(itemEl) {
                var label = itemEl.textContent.trim().replace(/^◆/, '');
                var valueEl = itemEl.nextElementSibling;
                if (!valueEl || !valueEl.classList.contains('item_st')) return;

                var img = valueEl.querySelector('img');
                if (img) {
                    data[label] = { text: valueEl.textContent.trim(), img: img.getAttribute('src') };
                } else {
                    data[label] = valueEl.textContent.trim();
                }
            });
        } else {
            doc.querySelectorAll('div.st_box ul li').forEach(function(li) {
                var labelEl = li.querySelector('p');
                var valueEl = li.querySelector('div');
                if (!labelEl || !valueEl) return;
                var label = labelEl.textContent.trim().replace(/^◆/, '');
                if (!label) return;
                var img = valueEl.querySelector('img');
                if (img) {
                    data[label] = { text: valueEl.textContent.trim(), img: img.getAttribute('src') };
                } else {
                    data[label] = valueEl.textContent.trim();
                }
            });
        }

        var charaEl = doc.querySelector('#chara');
        if (charaEl) {
            var charaImg = charaEl.querySelector('img');
            data['使用キャラクター'] = {
                name: charaEl.textContent.trim(),
                img: charaImg ? charaImg.getAttribute('src') : null,
            };
        }

        // Official Pop'n Class (High Cheers only) — value text + tier image
        // <div id="popnclass"><img src=".../popclass8.png" /><br />170.56</div>
        var popnclassEl = doc.querySelector('#popnclass');
        if (popnclassEl) {
            var classImg = popnclassEl.querySelector('img');
            var classText = popnclassEl.textContent.trim();
            var classValue = parseFloat(classText);
            var tierMatch = classImg ? (classImg.getAttribute('src') || '').match(/popclass(\d+)\.png/) : null;
            data['officialClass'] = {
                value: isNaN(classValue) ? null : classValue,
                tierIndex: tierMatch ? parseInt(tierMatch[1]) : null,
                tierImg: classImg ? classImg.getAttribute('src') : null,
            };
        }

        var battleCells = doc.querySelectorAll('table#net_win_table tbody tr:nth-child(2) td');
        if (battleCells.length >= 4) {
            data['battle_record'] = {
                '1st': parseInt(battleCells[0].textContent) || 0,
                '2nd': parseInt(battleCells[1].textContent) || 0,
                '3rd': parseInt(battleCells[2].textContent) || 0,
                '4th': parseInt(battleCells[3].textContent) || 0,
            };
        }

        return data;
    }

    /**
     * Parse mu_lv.html (level-filtered list page)
     *
     * Two layouts supported:
     *   Jam&Fizz   ul.mu_list_table > li, cells use col_music_lv / col_normal_lv /
     *              col_hyper_lv / col_ex_lv classes, score after <br /> in col_ex_lv.
     *   High Cheers ul.mu_list_lv_table > li, cells are unclassed plain <div>s in
     *              order [title-block, difficulty, level, medal+rank+score-in-<p>].
     *
     * Returns: one entry per row { title, detailUrl, genre, artist, difficulty, level, score, medal, rank, ... }
     */
    function parseMuLvPage(doc) {
        var entries = [];
        var jamfizzRows = doc.querySelectorAll('ul.mu_list_table > li');
        if (jamfizzRows.length > 0) {
            for (var i = 1; i < jamfizzRows.length; i++) {
                var li = jamfizzRows[i];
                var colMusic = li.querySelector('div.col_music_lv');
                if (!colMusic) continue;

                var titleLink = colMusic.querySelector('a');
                var subDivs = colMusic.querySelectorAll('div');

                var diffEl = li.querySelector('div.col_normal_lv');
                var diffText = diffEl ? diffEl.textContent.trim().toLowerCase() : '';

                var levelEl = li.querySelector('div.col_hyper_lv');
                var levelText = levelEl ? levelEl.textContent.trim() : '';

                var scoreCol = li.querySelector('div.col_ex_lv');
                var score = null, medalSrc = null, rankSrc = null;
                if (scoreCol) {
                    var imgs = scoreCol.querySelectorAll('img');
                    medalSrc = imgs[0] ? imgs[0].getAttribute('src') : null;
                    rankSrc = imgs[1] ? imgs[1].getAttribute('src') : null;
                    score = extractScore(scoreCol);
                }

                entries.push({
                    title: titleLink ? titleLink.textContent.trim() : '',
                    detailUrl: titleLink ? titleLink.getAttribute('href') : null,
                    genre: subDivs[0] ? subDivs[0].textContent.trim() : '',
                    artist: subDivs[1] ? subDivs[1].textContent.trim() : '',
                    difficulty: diffText,
                    level: parseInt(levelText) || null,
                    score: score,
                    medal: extractMedal(medalSrc),
                    rank: extractRank(rankSrc),
                    medalImg: medalSrc,
                    rankImg: rankSrc,
                });
            }
            return entries;
        }

        var hcRows = doc.querySelectorAll('ul.mu_list_lv_table > li');
        for (var j = 0; j < hcRows.length; j++) {
            var hcLi = hcRows[j];
            if (hcLi.classList.contains('st_th')) continue;
            var cells = hcLi.children;
            if (cells.length < 4) continue;

            var titleCell = cells[0];
            var hcTitleLink = titleCell.querySelector('a');
            var paras = titleCell.querySelectorAll('p');

            var hcScore = extractScore(cells[3]);
            var hcImgs = cells[3].querySelectorAll('img');
            var hcMedalSrc = hcImgs[0] ? hcImgs[0].getAttribute('src') : null;
            var hcRankSrc = hcImgs[1] ? hcImgs[1].getAttribute('src') : null;

            // Normalize the difficulty label to our internal slot keys.
            // Same convention as parseMuTopPage: High Cheers' LIGHT replaces the
            // legacy EASY slot, so it must merge with mu_top entries under 'easy'.
            var hcDiffRaw = cells[1].textContent.trim().toLowerCase();
            var hcDiff = hcDiffRaw === 'light' ? 'easy' : hcDiffRaw;

            entries.push({
                title: hcTitleLink ? hcTitleLink.textContent.trim() : '',
                detailUrl: hcTitleLink ? hcTitleLink.getAttribute('href') : null,
                genre: paras[0] ? paras[0].textContent.trim() : '',
                artist: paras[1] ? paras[1].textContent.trim() : '',
                difficulty: hcDiff,
                level: parseInt(cells[2].textContent.trim()) || null,
                score: hcScore,
                medal: extractMedal(hcMedalSrc),
                rank: extractRank(hcRankSrc),
                medalImg: hcMedalSrc,
                rankImg: hcRankSrc,
            });
        }
        return entries;
    }

    /**
     * Parse mu_top.html (High Cheers full-song flat listing)
     *
     * Each data row holds all 5 difficulty columns in order:
     *   [title-block, でっかポップ君, LIGHT, NORMAL, HYPER, EX]
     *
     * No level info on this page — we only extract score/medal/rank.
     * Difficulty mapping: でっかポップ君 → 'dekkapop' (experimental, no legacy class),
     * LIGHT → 'easy' (per game design, LIGHT replaces EASY in High Cheers).
     *
     * Cell text "-" means the chart doesn't exist for this song; "0" means it
     * exists but is unplayed. Skip the "-" cells so we don't fabricate phantom
     * chart slots (most commonly でっかポップ君, which only a subset of songs have).
     *
     * Emits one entry per existing difficulty so it merges cleanly via mergeEntry.
     */
    function parseMuTopPage(doc) {
        var muTopDiffs = ['dekkapop', 'easy', 'normal', 'hyper', 'ex'];
        var entries = [];
        var rows = doc.querySelectorAll('ul.mu_list_table > li');
        for (var i = 0; i < rows.length; i++) {
            var li = rows[i];
            if (li.classList.contains('st_th')) continue;
            var cells = li.children;
            if (cells.length < 6) continue;

            var titleCell = cells[0];
            var titleLink = titleCell.querySelector('a');
            var paras = titleCell.querySelectorAll('p');
            var base = {
                title: titleLink ? titleLink.textContent.trim() : '',
                detailUrl: titleLink ? titleLink.getAttribute('href') : null,
                genre: paras[0] ? paras[0].textContent.trim() : '',
                artist: paras[1] ? paras[1].textContent.trim() : '',
            };

            for (var d = 0; d < muTopDiffs.length; d++) {
                var cell = cells[d + 1];
                if (!cell) continue;
                var pEl = cell.querySelector('p');
                var pText = pEl ? pEl.textContent.trim() : '';
                if (pText === '-') continue;
                var imgs = cell.querySelectorAll('img');
                var medalSrc = imgs[0] ? imgs[0].getAttribute('src') : null;
                var rankSrc = imgs[1] ? imgs[1].getAttribute('src') : null;
                var score = extractScore(cell);
                entries.push({
                    title: base.title,
                    detailUrl: base.detailUrl,
                    genre: base.genre,
                    artist: base.artist,
                    difficulty: muTopDiffs[d],
                    level: null,
                    score: score,
                    medal: extractMedal(medalSrc),
                    rank: extractRank(rankSrc),
                    medalImg: medalSrc,
                    rankImg: rankSrc,
                });
            }
        }
        return entries;
    }

    /**
     * Parse song detail page (mu_detail.html)
     *
     * Structure: div.dif_tbl#easy / #normal / #hyper / #ex
     *   - div.detail_medal  background:url(meda_big_X.png) + img rank_big_X.png
     *   - table.dif_score_tbl  SCORE / COOL / GREAT / GOOD / BAD / highlight / play count / clear / FC / PERFECT
     *   - div.item_st  play options
     */
    function parseDetailPage(doc) {
        // Dispatch: High Cheers uses div.mu_detail_tb sections; Jam&Fizz div.dif_tbl.
        if (doc.querySelector('div.mu_detail_tb')) return parseDetailPageHC(doc);

        var detail = {};

        var titleEl = doc.querySelector('#title');
        if (titleEl) detail.title = titleEl.textContent.trim();

        var artistEl = doc.querySelector('#artist');
        if (artistEl) detail.artist = artistEl.textContent.trim();

        var diffs = ['easy', 'normal', 'hyper', 'ex'];
        for (var di = 0; di < diffs.length; di++) {
            var diffName = diffs[di];
            var tbl = doc.querySelector('div.dif_tbl#' + diffName);
            if (!tbl) continue;

            var chartDetail = {};

            // Medal & rank from detail_medal
            var medalDiv = tbl.querySelector('div.detail_medal');
            if (medalDiv) {
                var bgStyle = medalDiv.getAttribute('style') || '';
                var bgMatch = bgStyle.match(/meda_big_([a-z_]+)\.png/);
                if (bgMatch) {
                    var medalKey = 'meda_' + bgMatch[1];
                    chartDetail.medal = MEDAL_MAP[medalKey] || medalKey;
                }
                var rankImg = medalDiv.querySelector('img');
                if (rankImg) {
                    var rankMatch = rankImg.getAttribute('src').match(/rank_big_([a-z0-9_]+)\.png/);
                    if (rankMatch) {
                        var rankKey = 'rank_' + rankMatch[1];
                        chartDetail.rank = RANK_MAP[rankKey] !== undefined ? RANK_MAP[rankKey] : rankKey;
                    }
                }
            }

            // Score & judge from table rows
            var rows = tbl.querySelectorAll('table.dif_score_tbl tr');
            for (var ri = 0; ri < rows.length; ri++) {
                var cells = rows[ri].querySelectorAll('td');
                if (cells.length < 2) continue;
                var label = cells[0].textContent.trim();
                var val = cells[1].textContent.trim();
                if (val === '-' || val === '') continue;

                var numVal = parseInt(val.replace(/[^0-9]/g, ''));

                if (rows[ri].classList.contains('score') && !label) {
                    // Score row: first td is medal (no text label), second td is score
                    chartDetail.score = isNaN(numVal) ? null : numVal;
                } else if (label === 'COOL') {
                    chartDetail.cool = isNaN(numVal) ? null : numVal;
                } else if (label === 'GREAT') {
                    chartDetail.great = isNaN(numVal) ? null : numVal;
                } else if (label === 'GOOD') {
                    chartDetail.good = isNaN(numVal) ? null : numVal;
                } else if (label === 'BAD') {
                    chartDetail.bad = isNaN(numVal) ? null : numVal;
                } else if (label.indexOf('ハイライト') >= 0) {
                    chartDetail.highlight = isNaN(numVal) ? null : numVal;
                } else if (label.indexOf('プレー回数') >= 0) {
                    chartDetail.playCount = isNaN(numVal) ? null : numVal;
                } else if (label.indexOf('クリア回数') >= 0) {
                    chartDetail.clearCount = isNaN(numVal) ? null : numVal;
                } else if (label === 'FULL COMBO回数') {
                    chartDetail.fcCount = isNaN(numVal) ? null : numVal;
                } else if (label === 'PERFECT回数') {
                    chartDetail.perfectCount = isNaN(numVal) ? null : numVal;
                }
            }

            // Options
            var optEl = tbl.querySelector('div.item_st');
            if (optEl) {
                var optText = optEl.textContent.trim();
                if (optText && optText.indexOf('オプション未保存') < 0) {
                    chartDetail.options = optText.replace(/\s{2,}/g, ' ').trim();
                }
            }

            detail[diffName] = chartDetail;
        }

        return detail;
    }

    /**
     * Parse the High Cheers song detail page (mu_detail.html)
     *
     * Structure: div.mu_detail_tb#light / #normal / #hyper / #ex, each holding
     * TWO tables — first the lifetime record (▼歴代: score row with medal/rank
     * <img>s, judge counts, play counters), then the current-version record
     * (▼VERSION: score + play/clear/FC/PERFECT counters only, no medal image).
     * Cell values are '-' / '-回' when absent, 'N回' for counters.
     *
     * LIGHT is stored under 'easy' to match the charts data model. Each diff:
     *   { score, medal, rank, cool, great, good, bad, highlight,
     *     playCount, clearCount, fcCount, perfectCount, options,
     *     version: { score, playCount, clearCount, fcCount, perfectCount } }
     */
    function parseHcCellNum(text) {
        if (text == null) return null;
        var t = String(text).trim();
        if (t === '' || t === '-' || t === '-回') return null;
        var n = parseInt(t.replace(/[^0-9]/g, ''), 10);
        return isNaN(n) ? null : n;
    }

    function parseHcDetailTable(tbl) {
        var out = {};
        var rows = tbl.querySelectorAll('tr');
        for (var ri = 0; ri < rows.length; ri++) {
            var row = rows[ri];
            var valEl = row.querySelector('td.play_value');
            if (!valEl) continue;
            var val = parseHcCellNum(valEl.textContent);
            var label = row.firstElementChild ? row.firstElementChild.textContent.trim() : '';
            if (row.classList.contains('score')) {
                out.score = val;
            } else if (label === 'COOL') {
                out.cool = val;
            } else if (label === 'GREAT') {
                out.great = val;
            } else if (label === 'GOOD') {
                out.good = val;
            } else if (label === 'BAD') {
                out.bad = val;
            } else if (label.indexOf('ハイライト') >= 0) {
                out.highlight = val;
            } else if (label.indexOf('プレー回数') >= 0) {
                out.playCount = val;
            } else if (label.indexOf('クリア回数') >= 0) {
                out.clearCount = val;
            } else if (label === 'FULL COMBO回数') {
                out.fcCount = val;
            } else if (label === 'PERFECT回数') {
                out.perfectCount = val;
            }
        }
        return out;
    }

    function parseDetailPageHC(doc) {
        var detail = {};

        var titleEl = doc.querySelector('#title');
        if (titleEl) detail.title = titleEl.textContent.trim();

        var artistEl = doc.querySelector('#artist');
        if (artistEl) detail.artist = artistEl.textContent.trim();

        var sections = ['light', 'normal', 'hyper', 'ex'];
        for (var si = 0; si < sections.length; si++) {
            var secName = sections[si];
            var section = doc.querySelector('div.mu_detail_tb#' + secName);
            if (!section) continue;

            var chartDetail = {};
            var tables = section.querySelectorAll('table');

            if (tables[0]) {
                var lifetime = parseHcDetailTable(tables[0]);
                for (var k in lifetime) chartDetail[k] = lifetime[k];

                // Medal & rank live as plain <img>s inside the lifetime score row
                var medalTd = tables[0].querySelector('td.medal');
                if (medalTd) {
                    var imgs = medalTd.querySelectorAll('img');
                    for (var ii = 0; ii < imgs.length; ii++) {
                        var src = imgs[ii].getAttribute('src') || '';
                        var mMatch = src.match(/meda_big_([a-z_]+)\.png/);
                        if (mMatch) {
                            var medalKey = 'meda_' + mMatch[1];
                            chartDetail.medal = MEDAL_MAP[medalKey] || medalKey;
                        }
                        var rMatch = src.match(/rank_big_([a-z0-9_]+)\.png/);
                        if (rMatch) {
                            var rankKey = 'rank_' + rMatch[1];
                            chartDetail.rank = RANK_MAP[rankKey] !== undefined ? RANK_MAP[rankKey] : rankKey;
                        }
                    }
                }
            }

            if (tables[1]) {
                var ver = parseHcDetailTable(tables[1]);
                chartDetail.version = {
                    score: ver.score,
                    playCount: ver.playCount,
                    clearCount: ver.clearCount,
                    fcCount: ver.fcCount,
                    perfectCount: ver.perfectCount,
                };
            }

            var optEl = section.querySelector('div.item_st');
            if (optEl) {
                var optText = optEl.textContent.trim();
                if (optText && optText.indexOf('オプション未保存') < 0) {
                    chartDetail.options = optText.replace(/\s{2,}/g, ' ').trim();
                }
            }

            // LIGHT occupies the legacy 'easy' slot in the charts data model
            detail[secName === 'light' ? 'easy' : secName] = chartDetail;
        }

        return detail;
    }

    function getTotalPages(doc) {
        var lastOption = doc.querySelector('select#s_page option:last-child');
        if (lastOption) {
            return parseInt(lastOption.value) + 1;
        }
        return 1;
    }

    // ========== Merge logic ==========

    /**
     * Merge a single-difficulty entry from mu_lv.html into songMap
     *
     * songMap key   = detailUrl (unique song ID)
     * songMap value = {
     *   title, genre, artist, detailUrl,
     *   charts: {
     *     easy:   { level, score, medal, rank, ... },
     *     normal: { level, score, medal, rank, ... },
     *     hyper:  { level, score, medal, rank, ... },
     *     ex:     { level, score, medal, rank, ... },
     *   }
     * }
     */
    function mergeEntry(songMap, entry) {
        var key = entry.detailUrl || (entry.title + '|' + entry.genre);

        if (!songMap[key]) {
            songMap[key] = {
                title: entry.title,
                genre: entry.genre,
                artist: entry.artist,
                detailUrl: entry.detailUrl,
                charts: {},
            };
        }

        var song = songMap[key];
        var diff = entry.difficulty; // 'easy' | 'normal' | 'hyper' | 'ex' | 'dekkapop'
        if (!diff) return;

        var existing = song.charts[diff];
        if (!existing) {
            song.charts[diff] = {
                level: entry.level,
                score: entry.score,
                medal: entry.medal,
                rank: entry.rank,
                medalImg: entry.medalImg,
                rankImg: entry.rankImg,
            };
            return;
        }

        // Field-level merge so mu_top (no level) and mu_lv (with level) cooperate
        // regardless of arrival order. Score/medal/rank are upgraded only when the
        // incoming value indicates a real attempt; level fills in only if missing.
        if (existing.level == null && entry.level != null) existing.level = entry.level;
        var existingPlayed = existing.score != null && existing.score > 0;
        var incomingPlayed = entry.score != null && entry.score > 0;
        if (incomingPlayed && !existingPlayed) {
            existing.score = entry.score;
            existing.medal = entry.medal;
            existing.rank = entry.rank;
            existing.medalImg = entry.medalImg;
            existing.rankImg = entry.rankImg;
        }
    }

    // ========== Upper chart detection ==========

    /**
     * Detect Upper charts by finding duplicate title+genre+artist pairs
     * and comparing their chart levels. The version with higher total
     * levels across all difficulties is marked as Upper.
     */
    function markUpperCharts(scores) {
        var groups = {};
        for (var i = 0; i < scores.length; i++) {
            var s = scores[i];
            var key = s.title + '|' + s.genre + '|' + s.artist;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        }

        var upperCount = 0;
        for (var k in groups) {
            if (groups[k].length !== 2) continue;
            var a = groups[k][0], b = groups[k][1];

            // Sum all chart levels for each version
            var sumA = 0, sumB = 0;
            var diffs = ['easy', 'normal', 'hyper', 'ex'];
            for (var di = 0; di < diffs.length; di++) {
                var d = diffs[di];
                if (a.charts[d]) sumA += a.charts[d].level || 0;
                if (b.charts[d]) sumB += b.charts[d].level || 0;
            }

            if (sumA > sumB) {
                a.isUpper = true;
                a.title = a.title + ' [UPPER]';
                upperCount++;
            } else if (sumB > sumA) {
                b.isUpper = true;
                b.title = b.title + ' [UPPER]';
                upperCount++;
            }
        }

        if (upperCount > 0) {
            log('Detected ' + upperCount + ' Upper charts');
        }
    }

    // ========== Dump HTML ==========

    async function dumpHTML() {
        log('Dumping raw HTML from key pages...');
        setMsg1('Dumping HTML...');
        var dump = {};

        var pages = [
            { name: 'status', url: VERSION_BASE + '/playdata/index.html' },
            { name: 'mu_top', url: buildMuTopURL(0) },
            // Low levels — see whether mu_lv exposes LIGHT / でっかポップ君 entries
            // anywhere (these have their own level numbering).
            { name: 'mu_lv_1_p0',  url: buildMuLvURL(1, 0) },
            { name: 'mu_lv_5_p0',  url: buildMuLvURL(5, 0) },
            { name: 'mu_lv_10_p0', url: buildMuLvURL(10, 0) },
            { name: 'mu_lv_15_p0', url: buildMuLvURL(15, 0) },
            { name: 'mu_lv_20_p0', url: buildMuLvURL(20, 0) },
            { name: 'mu_lv_30_p0', url: buildMuLvURL(30, 0) },
            { name: 'mu_lv_43_p0', url: buildMuLvURL(43, 0) },
            { name: 'mu_lv_50_p0', url: buildMuLvURL(50, 0) },
        ];

        // Pick a sample mu_detail — first try a played song from a high level,
        // otherwise fall back to the first link on mu_top (covers any version).
        try {
            log('Looking for a played song detail link...');
            var sampleHTML = await fetchPage(buildMuLvURL(43, 0));
            var sampleDoc = parseHTML(sampleHTML);
            var sampleEntries = parseMuLvPage(sampleDoc);
            var playedEntry = null;
            for (var ei = 0; ei < sampleEntries.length; ei++) {
                if (sampleEntries[ei].score > 0 && sampleEntries[ei].detailUrl) {
                    playedEntry = sampleEntries[ei];
                    break;
                }
            }
            if (!playedEntry) {
                var muTopHTML = await fetchPage(buildMuTopURL(0));
                var muTopDoc = parseHTML(muTopHTML);
                var muTopEntries = parseMuTopPage(muTopDoc);
                for (var mi = 0; mi < muTopEntries.length; mi++) {
                    if (muTopEntries[mi].detailUrl) { playedEntry = muTopEntries[mi]; break; }
                }
            }
            if (playedEntry) {
                log('Sample detail: ' + playedEntry.title + ' (score=' + (playedEntry.score || 0) + ')');
                pages.push({ name: 'mu_detail_sample', url: playedEntry.detailUrl });
            }
        } catch (e) {
            log('Could not find detail link: ' + e.message);
        }

        for (var i = 0; i < pages.length; i++) {
            var page = pages[i];
            try {
                log('<- GET ' + page.url);
                var html = await fetchPage(page.url);
                dump[page.name] = html;
                log(page.name + ': ' + html.length + ' bytes');
            } catch (err) {
                dump[page.name] = 'ERROR: ' + err.message;
                log(page.name + ': ERROR ' + err.message);
            }
            await delay(400);
        }

        var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        var versionSlug = VERSION ? Object.keys(SUPPORTED_VERSIONS).filter(function(k){ return SUPPORTED_VERSIONS[k] === VERSION; })[0] : 'unknown';
        a.download = 'popn_html_dump_' + versionSlug + '_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log('HTML dump saved: ' + a.download);
        setMsg1('HTML dump complete. ' + Object.keys(dump).length + ' pages saved.');
    }

    // ========== Main flow ==========

    function requestStop() {
        stopRequested = true;
        setMsg2('Stopping...');
    }

    async function startUpdate(deepMode) {
        if (isRunning) return;
        isRunning = true;
        stopRequested = false;
        collectedData.scores = [];
        setButtonState('running');
        setProgress(0);

        var modeLabel = deepMode ? 'Deep' : 'Quick';
        log('Starting ' + modeLabel + ' scrape...');

        try {
            // Step 1: Player status
            setMsg1('Fetching player status...');
            log('<- GET ' + VERSION_BASE + '/playdata/index.html');
            var statusHTML = await fetchPage(VERSION_BASE + '/playdata/index.html');
            collectedData.player = parseStatusPage(parseHTML(statusHTML));
            log('Player: ' + (collectedData.player['プレーヤー名'] || 'OK'));

            // Medal sprites are baked into the bookmarklet at build time, so no
            // cross-origin fetch is needed at runtime — just hand them to the viewer.
            collectedData.medalImages = MEDAL_IMAGES;

            // Character avatar + official-class tier image are both same-origin
            // (eagate.573.jp), so fetch them in parallel for offline embedding.
            var chara = collectedData.player['使用キャラクター'];
            var tierImgPath = collectedData.player.officialClass && collectedData.player.officialClass.tierImg;
            var imageJobs = [];
            if (chara && chara.img) {
                imageJobs.push(fetchImageAsDataURL(chara.img).then(function(d) {
                    chara.imgData = d;
                    log('Character avatar: ' + chara.name);
                }, function(e) { log('Could not fetch avatar: ' + e.message); }));
            }
            if (tierImgPath) {
                var tierAbs = tierImgPath.indexOf('://') >= 0 ? tierImgPath : ('https://p.eagate.573.jp' + tierImgPath);
                imageJobs.push(fetchImageAsDataURL(tierAbs).then(function(d) {
                    collectedData.player.officialClass.tierImgData = d;
                    log('Pop\'n Class tier image fetched');
                }, function(e) { log('Could not fetch tier image: ' + e.message); }));
            }
            await Promise.all(imageJobs);

            if (stopRequested) { finish('Stopped'); return; }

            // Step 2: Scrape mu_lv.html level by level (lv=1~50)
            var songMap = {};

            for (var lv = 1; lv <= MAX_LEVEL; lv++) {
                if (stopRequested) { finish('Stopped (lv ' + lv + ')'); return; }

                setMsg1(modeLabel + ': Level ' + lv + '/' + MAX_LEVEL);
                setProgress((lv - 1) / MAX_LEVEL);

                var firstURL = buildMuLvURL(lv, 0);
                log('<- Lv.' + lv + ' p1');
                var firstHTML = await fetchPage(firstURL);
                var firstDoc = parseHTML(firstHTML);
                var totalPages = getTotalPages(firstDoc);
                var entries = parseMuLvPage(firstDoc);

                if (entries.length === 0) {
                    log('Lv.' + lv + ': empty, skip');
                    await delay(PAGE_DELAY);
                    continue;
                }

                for (var e = 0; e < entries.length; e++) {
                    mergeEntry(songMap, entries[e]);
                }

                for (var page = 1; page < totalPages; page++) {
                    if (stopRequested) { finish('Stopped'); return; }
                    await delay(PAGE_DELAY);

                    log('<- Lv.' + lv + ' p' + (page + 1) + '/' + totalPages);
                    var html = await fetchPage(buildMuLvURL(lv, page));
                    var pageEntries = parseMuLvPage(parseHTML(html));

                    for (var e2 = 0; e2 < pageEntries.length; e2++) {
                        mergeEntry(songMap, pageEntries[e2]);
                    }

                    if (pageEntries.length === 0) break;
                }

                var currentCount = Object.keys(songMap).length;
                setMsg2('Lv.' + lv + ' done | ' + currentCount + ' unique songs');
                log('Lv.' + lv + ': ' + totalPages + 'p, unique: ' + currentCount);

                await delay(PAGE_DELAY);
            }

            // Step 2.5: For versions with mu_top (a flat full-song listing), scrape it
            // to fill in extra difficulties (LIGHT → easy, でっかポップ君 → dekkapop)
            // that mu_lv doesn't return.
            if (VERSION && VERSION.hasMuTop && !stopRequested) {
                setMsg1('Fetching mu_top (extra difficulties)...');
                var muTopPage = 0;
                var muTopTotalPages = 1;
                while (muTopPage < muTopTotalPages) {
                    if (stopRequested) { finish('Stopped (mu_top p' + muTopPage + ')'); return; }
                    var muTopURL = buildMuTopURL(muTopPage);
                    log('<- mu_top p' + (muTopPage + 1));
                    try {
                        var muTopHTML = await fetchPage(muTopURL);
                        var muTopDoc = parseHTML(muTopHTML);
                        if (muTopPage === 0) muTopTotalPages = getTotalPages(muTopDoc);
                        var muTopEntries = parseMuTopPage(muTopDoc);
                        for (var mte = 0; mte < muTopEntries.length; mte++) {
                            mergeEntry(songMap, muTopEntries[mte]);
                        }
                        log('mu_top p' + (muTopPage + 1) + '/' + muTopTotalPages + ': ' + muTopEntries.length + ' entries');
                    } catch (mtErr) {
                        log('mu_top p' + (muTopPage + 1) + ' err: ' + mtErr.message);
                        break;
                    }
                    muTopPage++;
                    if (muTopPage < muTopTotalPages) await delay(PAGE_DELAY);
                }
            }

            // Convert to array and mark Upper charts
            collectedData.scores = Object.values(songMap);
            markUpperCharts(collectedData.scores);
            var totalSongs = collectedData.scores.length;
            log('Quick scrape done: ' + totalSongs + ' unique songs');

            // Step 3: Deep mode — fetch detail per song
            if (deepMode && !stopRequested) {
                setMsg1('Deep: fetching song details...');
                var detailCount = 0;
                var songsWithDetail = collectedData.scores.filter(function(s) { return s.detailUrl; });

                for (var di = 0; di < songsWithDetail.length; di++) {
                    if (stopRequested) { finish('Stopped (detail ' + di + ')'); return; }

                    var song = songsWithDetail[di];
                    setMsg2('Detail ' + (di + 1) + '/' + songsWithDetail.length + ': ' + song.title);
                    setProgress(di / songsWithDetail.length);

                    try {
                        log('<- detail: ' + song.title);
                        var detailHTML = await fetchPage(song.detailUrl);
                        song.detail = parseDetailPage(parseHTML(detailHTML));
                        detailCount++;
                    } catch (err) {
                        log('detail err (' + song.title + '): ' + err.message);
                        song.detail = { error: err.message };
                    }

                    await delay(DETAIL_DELAY);
                }

                log('Deep scrape done: ' + detailCount + ' details fetched');
            }

            finish('Complete! ' + totalSongs + ' songs' + (deepMode ? ' (with details)' : ''));

        } catch (err) {
            log('ERROR: ' + err.message);
            setMsg1('Error: ' + err.message);
            isRunning = false;
            setButtonState('idle');
        }
    }

    function finish(msg) {
        collectedData.exportedAt = new Date().toISOString();
        isRunning = false;
        stopRequested = false;

        // Promote officialClass (parsed from status page on supported versions)
        // to a top-level field for easier consumption by viewer/PNG export.
        if (collectedData.player && collectedData.player.officialClass) {
            collectedData.officialClass = collectedData.player.officialClass;
        }

        // Calculate legacy Pop'n Class
        if (collectedData.scores.length > 0) {
            var pc = calcPopClass(collectedData.scores);
            collectedData.popClass = pc;
            var summary = msg + " | Pop'n Class (calc): " + pc.value.toFixed(2) + ' (' + pc.tier + ')';
            if (collectedData.officialClass && collectedData.officialClass.value != null) {
                summary += ' | Official: ' + collectedData.officialClass.value.toFixed(2);
            }
            setMsg1(summary);
            log("Pop'n Class (calc): " + pc.value.toFixed(2) + ' (' + pc.tier + ') from ' + pc.count + ' scored charts');
            if (collectedData.officialClass && collectedData.officialClass.value != null) {
                log("Pop'n Class (official): " + collectedData.officialClass.value.toFixed(2) + ' (tier ' + collectedData.officialClass.tierIndex + ')');
            }
        } else {
            setMsg1(msg);
        }

        setMsg2(collectedData.scores.length + ' songs in memory');
        setProgress(1);
        setButtonState('done');
        log(msg);
    }

    // ========== Pop Class calculation ==========

    var CLASS_TIERS = [
        { min: 91, name: '神', color: '#d0203a' },
        { min: 79, name: '仙人', color: '#c03050' },
        { min: 68, name: '将軍', color: '#c08020' },
        { min: 59, name: 'アイドル', color: '#b0a010' },
        { min: 46, name: '刑事', color: '#209040' },
        { min: 34, name: '番長', color: '#1a9080' },
        { min: 21, name: '小学生', color: '#2e70c0' },
        { min: 0, name: 'にゃんこ', color: '#907860' },
    ];

    function popClassMedalBonus(medal) {
        if (!medal) return 0;
        if (medal === 'easy_clear' || medal.indexOf('normal_clear') === 0) return 3000;
        if (medal.indexOf('full_combo') === 0 || medal === 'perfect') return 5000;
        return 0;
    }

    function calcChartClassPts(lv, score, medal) {
        // Skip charts without a level (e.g. でっかポップ君 from mu_top has no level info).
        if (!lv || lv <= 0) return 0;
        if (!score || score < 50000) return 0;
        var raw = (10000 * lv + score - 50000 + popClassMedalBonus(medal)) / 5440;
        // Round Down
        return Math.min(Math.floor(raw * 100) / 100, 100);
    }

    function calcPopClass(scores) {
        var pts = [];
        for (var si = 0; si < scores.length; si++) {
            var song = scores[si];
            var charts = song.charts || {};
            var diffs = ['easy', 'normal', 'hyper', 'ex'];
            for (var di = 0; di < diffs.length; di++) {
                var c = charts[diffs[di]];
                if (!c) continue;
                var p = calcChartClassPts(c.level || 0, c.score || 0, c.medal);
                if (p > 0) pts.push(p);
            }
        }
        pts.sort(function(a, b) { return b - a; });
        var top50 = pts.slice(0, 50);
        if (top50.length === 0) return { value: 0, tier: 'にゃんこ', count: 0 };
        var avg = 0;
        for (var i = 0; i < top50.length; i++) avg += top50[i];
        // Round down
        avg = Math.floor((avg / Math.min(top50.length, 50)) * 100) / 100;
        var tier = 'にゃんこ';
        for (var ti = 0; ti < CLASS_TIERS.length; ti++) {
            if (avg >= CLASS_TIERS[ti].min) { tier = CLASS_TIERS[ti].name; break; }
        }
        return { value: avg, tier: tier, count: pts.length };
    }

    // ========== High Cheers Pop'n Class (official per-chart formula) ==========
    //
    // Replicates https://github.com/ssdh233/popn-class (index-hc.js) bit-for-bit:
    //   chart point (x60-scaled) =
    //     floorTo(floorTo(level * (3750*level + bonus + (score-50000)) / 3881250, 8) * 60, 2)
    //   total = floorTo(roundTo(sum(top20 new + top40 old points), 8) / 60, 2)
    // New songs (version=29 catalog) use lifetime score directly (lifetime == version).
    // Old songs must use CURRENT-VERSION score/medal from mu_detail.html.

    function floorTo(x, p) {
        var m = Math.pow(10, p);
        return Math.floor(x * m) / m;
    }

    function roundTo(x, p) {
        var m = Math.pow(10, p);
        return Math.round(x * m) / m;
    }

    // Official medal-letter bonus table mapped onto our semantic medal names.
    // a=21250, b/c/d=17500, e/f/g=12500, l=10000, k=6250, h/i/j/none=0.
    function hcMedalBonus(medal) {
        if (!medal) return 0;
        if (medal === 'perfect') return 21250;
        if (medal.indexOf('full_combo') === 0) return 17500;
        if (medal.indexOf('normal_clear') === 0) return 12500;
        if (medal === 'assist_clear') return 10000;
        if (medal === 'easy_clear') return 6250;
        return 0;
    }

    function calcHcChartPoint(level, score, medal) {
        if (!level || level <= 0) return 0;
        if (!score || score < 50000) return 0;
        var inner = floorTo(level * (3750 * level + hcMedalBonus(medal) + (score - 50000)) / 3881250, 8);
        return floorTo(inner * 60, 2);
    }

    // The VERSION table on mu_detail has no medal image — infer it from the
    // clear/FC/PERFECT counters (mirrors the reference: a / b / e / h).
    function inferVersionMedal(counts) {
        if (!counts) return 'no_play';
        if (counts.perfectCount > 0) return 'perfect';
        if (counts.fcCount > 0) return 'full_combo';
        if (counts.clearCount > 0) return 'normal_clear';
        return 'failed_3';
    }

    // Effective medal for an old chart: keep the (more precise) lifetime medal
    // when its bonus tier matches the inferred version medal, else trust the
    // version medal. With useEC on, a lifetime EASY clear survives an uncleared
    // version medal (the official game appears to honor it).
    function effectiveHcMedal(histMedal, verMedal, useEC) {
        if (useEC && histMedal === 'easy_clear' && hcMedalBonus(verMedal) === 0) return 'easy_clear';
        return hcMedalBonus(verMedal) === hcMedalBonus(histMedal) ? histMedal : verMedal;
    }

    // x60-scaled sum -> display value (2dp, floor), matching the reference chain.
    function hcSumToDisplay(entries) {
        var sum = 0;
        for (var i = 0; i < entries.length; i++) sum += entries[i].point;
        return floorTo(roundTo(sum, 8) / 60, 2);
    }

    // Pick the top-40 old charts for a given EASY-clear toggle state.
    // Entries carry both variants precomputed (point / pointEC).
    function hcTop40Old(oldResolved, useEC) {
        var list = oldResolved.map(function(e) {
            return {
                title: e.title, genre: e.genre, diff: e.diff, level: e.level,
                score: e.versionScore, medal: useEC ? e.medalEC : e.medal,
                lifetimeScore: e.lifetimeScore, lifetimeMedal: e.lifetimeMedal,
                versionMedal: e.versionMedal,
                point: useEC ? e.pointEC : e.point,
            };
        });
        list.sort(function(a, b) { return b.point - a.point; });
        return list.slice(0, 40);
    }

    /**
     * Compute the HC-formula class from collected scores.
     *
     * Relies on per-chart fields written during scraping:
     *   chart.isNew        — chart appears in the version=29 (new songs) catalog
     *   chart.hcResolved   — mu_detail was fetched; versionScore/versionMedal valid
     *   chart.versionScore — current-version score (0 if unplayed this version)
     *   chart.versionMedal — inferred current-version medal
     *
     * Only NORMAL/HYPER/EX charts with a level participate (mu_lv scope — LIGHT
     * and でっかポップ君 are outside the official formula, matching the reference).
     */
    function calcHcClass(scores, meta) {
        var newCharts = [];
        var oldResolved = [];
        var diffs = ['normal', 'hyper', 'ex'];
        for (var si = 0; si < scores.length; si++) {
            var song = scores[si];
            var charts = song.charts || {};
            for (var di = 0; di < diffs.length; di++) {
                var d = diffs[di];
                var c = charts[d];
                if (!c || !c.level) continue;
                if (c.isNew) {
                    var np = calcHcChartPoint(c.level, c.score || 0, c.medal);
                    if (np > 0) {
                        newCharts.push({
                            title: song.title, genre: song.genre, diff: d,
                            level: c.level, score: c.score || 0, medal: c.medal, point: np,
                        });
                    }
                } else if (c.hcResolved) {
                    var em = effectiveHcMedal(c.medal, c.versionMedal, false);
                    var emEC = effectiveHcMedal(c.medal, c.versionMedal, true);
                    oldResolved.push({
                        title: song.title, genre: song.genre, diff: d,
                        level: c.level,
                        lifetimeScore: c.score || 0, lifetimeMedal: c.medal,
                        versionScore: c.versionScore || 0, versionMedal: c.versionMedal,
                        medal: em, point: calcHcChartPoint(c.level, c.versionScore || 0, em),
                        medalEC: emEC, pointEC: calcHcChartPoint(c.level, c.versionScore || 0, emEC),
                    });
                }
            }
        }

        newCharts.sort(function(a, b) { return b.point - a.point; });
        var top20New = newCharts.slice(0, 20);
        var top40Old = hcTop40Old(oldResolved, false);
        var top40OldEC = hcTop40Old(oldResolved, true);

        var newSum = hcSumToDisplay(top20New);
        var oldSum = hcSumToDisplay(top40Old);
        var oldSumEC = hcSumToDisplay(top40OldEC);

        var result = {
            value: hcSumToDisplay(top20New.concat(top40Old)),
            valueEC: hcSumToDisplay(top20New.concat(top40OldEC)),
            newSum: newSum, oldSum: oldSum, oldSumEC: oldSumEC,
            top20New: top20New,
            oldResolved: oldResolved,
            newChartCount: newCharts.length,
            resolvedCount: oldResolved.length,
        };
        if (meta) {
            result.candidateCount = meta.candidateCount;
            result.fetchedSongs = meta.fetchedSongs;
            result.cutoffPoint = meta.cutoffPoint;
            result.complete = meta.complete;
        }
        return result;
    }

    // ========== Export ==========

    function exportJSON() {
        var exportData = {
            player: collectedData.player,
            scores: collectedData.scores,
            popClass: collectedData.popClass,
            officialClass: collectedData.officialClass,
            medalImages: collectedData.medalImages,
            version: VERSION ? VERSION.label : null,
            exportedAt: collectedData.exportedAt,
        };
        var json = JSON.stringify(exportData, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'popn_scores_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log('Exported JSON: ' + a.download);
    }

    var MEDAL_LABELS = {
        'no_play': 'No Play', 'assist_clear': 'ASSIST', 'easy_clear': '\u7dd1\u2b24',
        'failed_1': '\u7070\u2b24', 'failed_2': '\u7070\u25c6', 'failed_3': '\u7070\u2605',
        'normal_clear': '\u9285\u2b24', 'normal_clear_in_20_bad': '\u9285\u25c6', 'normal_clear_in_5_bad': '\u9285\u2605',
        'full_combo': '\u9280\u2b24', 'full_combo_in_20_good': '\u9280\u25c6', 'full_combo_in_5_good': '\u9280\u2605',
        'perfect': '\u91d1\u2605'
    };

    var MEDAL_COLORS = {
        'no_play': '#bbb', 'assist_clear': '#7fb8d8', 'easy_clear': '#2ea868',
        'failed_1': '#999', 'failed_2': '#999', 'failed_3': '#999',
        'normal_clear': '#b87333', 'normal_clear_in_20_bad': '#b87333', 'normal_clear_in_5_bad': '#b87333',
        'full_combo': '#888', 'full_combo_in_20_good': '#888', 'full_combo_in_5_good': '#888',
        'perfect': '#d4a017'
    };

    var DIFF_COLORS = { dekkapop: '#a06ec0', easy: '#1ea868', normal: '#2e7ed6', hyper: '#d08a10', ex: '#d04030' };
    var DIFF_LABELS = { dekkapop: 'でっか', easy: 'EASY', normal: 'NORMAL', hyper: 'HYPER', ex: 'EX' };

    // Pre-load embedded medal sprites into HTMLImageElements so canvas can draw them.
    // Returns a Promise resolving to { medalKey: HTMLImageElement } (no_play has no sprite).
    function loadMedalSprites() {
        var loaded = {};
        var keys = Object.keys(MEDAL_IMG_NUM);
        var jobs = keys.map(function(medal) {
            var n = MEDAL_IMG_NUM[medal];
            var src = MEDAL_IMAGES && MEDAL_IMAGES[n];
            if (!src) return Promise.resolve();
            return new Promise(function(resolve) {
                var img = new Image();
                img.onload = function() { loaded[medal] = img; resolve(); };
                img.onerror = function() { resolve(); };
                img.src = src;
            });
        });
        return Promise.all(jobs).then(function() { return loaded; });
    }

    function exportClassImage() {
        if (collectedData.scores.length === 0) return;

        // Build top 50 chart list
        var chartPts = [];
        for (var si = 0; si < collectedData.scores.length; si++) {
            var song = collectedData.scores[si];
            var charts = song.charts || {};
            var diffs = ['easy', 'normal', 'hyper', 'ex'];
            for (var di = 0; di < diffs.length; di++) {
                var c = charts[diffs[di]];
                if (!c) continue;
                var p = calcChartClassPts(c.level || 0, c.score || 0, c.medal);
                if (p > 0) chartPts.push({
                    title: song.title, genre: song.genre, diff: diffs[di],
                    level: c.level || 0, score: c.score || 0,
                    medal: c.medal, rank: c.rank, pts: p
                });
            }
        }
        chartPts.sort(function(a, b) { return b.pts - a.pts; });
        var top50 = chartPts.slice(0, 50);

        loadMedalSprites().then(function(medalImgs) { renderClassImage(top50, medalImgs); });
    }

    function renderClassImage(top50, medalImgs) {
        // Two-column layout: 1-25 left, 26-50 right
        var rowH = 28;
        var headerH = 40;
        var titleH = 60;
        var footerH = 30;
        var colGap = 16;
        var cols = [34, 250, 54, 34, 60, 50, 60];
        var tableW = 0;
        for (var ci = 0; ci < cols.length; ci++) tableW += cols[ci];
        tableW += 16;

        var rowCount = Math.min(top50.length, 25);
        var hasTwoCols = top50.length > 25;
        var totalW = hasTwoCols ? (tableW * 2 + colGap) : tableW;
        var totalH = titleH + headerH + (rowCount * rowH) + footerH;

        var canvas = document.createElement('canvas');
        canvas.width = totalW;
        canvas.height = totalH;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = '#fef6f0';
        ctx.fillRect(0, 0, totalW, totalH);

        var pc = collectedData.popClass || { value: 0, tier: 'にゃんこ' };
        var tierColor = '#907860';
        for (var ti2 = 0; ti2 < CLASS_TIERS.length; ti2++) {
            if (pc.value >= CLASS_TIERS[ti2].min) { tierColor = CLASS_TIERS[ti2].color; break; }
        }
        ctx.fillStyle = tierColor;
        ctx.font = 'bold 24px Segoe UI, sans-serif';
        ctx.fillText("Pop'n Score Tool", 10, 30);
        var titleRight = 10 + ctx.measureText("Pop'n Score Tool").width + 16;
        var chara = collectedData.player && collectedData.player['\u4f7f\u7528\u30ad\u30e3\u30e9\u30af\u30bf\u30fc'];
        var avatarSize = 36;
        var hasAvatar = chara && chara.imgData;
        var textLeft = hasAvatar ? titleRight + avatarSize + 8 : titleRight;
        ctx.fillStyle = '#3d2b1f';
        ctx.font = '16px Segoe UI, sans-serif';
        var playerName = (collectedData.player && collectedData.player['\u30d7\u30ec\u30fc\u30e4\u30fc\u540d']) || '';
        var classLine = playerName + "  Calc: " + pc.value.toFixed(2) + ' (' + pc.tier + ')';
        if (collectedData.officialClass && typeof collectedData.officialClass.value === 'number') {
            classLine += '  Official: ' + collectedData.officialClass.value.toFixed(2);
        }
        ctx.fillText(classLine, textLeft, 30);
        ctx.fillStyle = '#907860';
        ctx.font = '11px Segoe UI, sans-serif';
        ctx.fillText('Top 50 Charts', textLeft, 48);

        var headers = ['#', 'Genre / Title', 'Diff', 'Lv', 'Score', 'Medal', 'Pts'];

        function drawTable(startIdx, endIdx, offsetX) {
            var y = titleH;
            ctx.fillStyle = '#ffe0d0';
            ctx.fillRect(offsetX, y, tableW, headerH);
            ctx.fillStyle = '#907860';
            ctx.font = 'bold 12px Segoe UI, sans-serif';
            var x = offsetX + 8;
            for (var hi = 0; hi < headers.length; hi++) {
                ctx.fillText(headers[hi], x, y + 26);
                x += cols[hi];
            }

            y += headerH;
            ctx.font = '12px Segoe UI, sans-serif';
            for (var ri = startIdx; ri < endIdx; ri++) {
                var c = top50[ri];
                if ((ri - startIdx) % 2 === 0) {
                    ctx.fillStyle = '#fff0ea';
                    ctx.fillRect(offsetX, y, tableW, rowH);
                }

                x = offsetX + 8;
                ctx.fillStyle = '#907860';
                ctx.fillText((ri + 1).toString(), x, y + 19);
                x += cols[0];

                ctx.fillStyle = '#3d2b1f';
                var baseTitle = c.title.replace(/ \[UPPER\]$/, '');
                var t = (!c.genre || c.genre === baseTitle) ? c.title : (c.genre + ' / ' + c.title);
                if (t.length > 28) t = t.substring(0, 26) + '...';
                ctx.fillText(t, x, y + 19);
                x += cols[1];

                ctx.fillStyle = DIFF_COLORS[c.diff] || '#3d2b1f';
                ctx.fillText(DIFF_LABELS[c.diff] || c.diff.toUpperCase(), x, y + 19);
                x += cols[2];

                ctx.fillStyle = '#3d2b1f';
                ctx.fillText(c.level.toString(), x, y + 19);
                x += cols[3];

                ctx.fillText(c.score > 0 ? c.score.toString() : '-', x, y + 19);
                x += cols[4];

                var medalImg = medalImgs[c.medal];
                if (medalImg) {
                    var medalSize = 22;
                    ctx.drawImage(medalImg, x, y + (rowH - medalSize) / 2, medalSize, medalSize);
                } else {
                    ctx.fillStyle = MEDAL_COLORS[c.medal] || '#907860';
                    ctx.fillText(MEDAL_LABELS[c.medal] || c.medal || '-', x, y + 19);
                }
                x += cols[5];

                ctx.fillStyle = '#e94560';
                ctx.fillText(c.pts.toFixed(2), x, y + 19);

                y += rowH;
            }
        }

        drawTable(0, Math.min(top50.length, 25), 0);
        if (hasTwoCols) {
            drawTable(25, top50.length, tableW + colGap);
        }

        ctx.fillStyle = '#907860';
        ctx.font = '10px Segoe UI, sans-serif';
        ctx.fillText("Generated by Pop'n Score Tool | " + (collectedData.exportedAt || ''), 10, totalH - 10);

        function doDownload() {
            var link = document.createElement('a');
            link.download = 'popn_class_top50.png';
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            log("Exported Pop'n Class image");
        }

        if (hasAvatar) {
            var avatarImg = new Image();
            avatarImg.onload = function() {
                ctx.drawImage(avatarImg, titleRight, 12, avatarSize, avatarSize);
                doDownload();
            };
            avatarImg.onerror = doDownload;
            avatarImg.src = chara.imgData;
        } else {
            doDownload();
        }
    }

    // viewer-template.html is embedded at build time
    var VIEWER_TEMPLATE = '{{VIEWER_TEMPLATE}}';

    function openViewer() {
        var exportData = {
            player: collectedData.player,
            scores: collectedData.scores,
            popClass: collectedData.popClass,
            officialClass: collectedData.officialClass,
            medalImages: collectedData.medalImages,
            version: VERSION ? VERSION.label : null,
            exportedAt: collectedData.exportedAt,
        };
        log('Opening viewer...');

        var html = VIEWER_TEMPLATE.replace('{{DATA_PLACEHOLDER}}', JSON.stringify(exportData));

        var blob = new Blob([html], { type: 'text/html' });
        var viewUrl = URL.createObjectURL(blob);
        window.open(viewUrl, '_blank');
        log('Viewer opened in new tab');
    }

    // ========== Init ==========

    createUI();
    log("Pop'n Score Tool initialized");
    if (VERSION) {
        setMsg1('Ready (' + VERSION.label + '). Click Scrape to start.');
        setMsg2('');
        setButtonState('idle');
    } else {
        setMsg1('Unsupported page.');
        setMsg2('Open the Jam&Fizz or High Cheers playdata page first.');
        document.getElementById('popnme_btn_quick').disabled = true;
        document.getElementById('popnme_btn_html').disabled = true;
        document.getElementById('popnme_btn_img').disabled = true;
        // [DEV] document.getElementById('popnme_btn_dump').disabled = true;
        log('Detected URL: ' + location.pathname);
    }

})();
