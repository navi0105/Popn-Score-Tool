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

    var GAME_BASE = '/game/popn/jamfizz';
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
        'rank_a1': 'A',
        'rank_a2': 'AA',
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

    // ========== URL builders ==========

    function buildMuLvURL(lv, page) {
        return GAME_BASE + '/playdata/mu_lv.html?page=' + page
            + '&version=0&category=0&keyword=&lv=' + lv;
    }

    // ========== Parsers ==========

    function parseStatusPage(doc) {
        var data = {};

        doc.querySelectorAll('div.st_box div.item').forEach(function(itemEl) {
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

        var charaEl = doc.querySelector('#chara');
        if (charaEl) {
            var charaImg = charaEl.querySelector('img');
            data['使用キャラクター'] = {
                name: charaEl.textContent.trim(),
                img: charaImg ? charaImg.getAttribute('src') : null,
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
     * Structure: ul.mu_list_table > li (first li is table header)
     * Each row contains one difficulty:
     *   div.col_music_lv  = title/genre/artist + detail link
     *   div.col_normal_lv = difficulty name ("EASY"/"NORMAL"/"HYPER"/"EX")
     *   div.col_hyper_lv  = level number
     *   div.col_ex_lv     = medal img + rank img + score
     *
     * Returns: one entry per row { title, detailUrl, genre, artist, difficulty, level, score, medal, rank, ... }
     */
    function parseMuLvPage(doc) {
        var entries = [];
        var rows = doc.querySelectorAll('ul.mu_list_table > li');

        for (var i = 1; i < rows.length; i++) {
            var li = rows[i];

            var colMusic = li.querySelector('div.col_music_lv');
            if (!colMusic) continue;

            var titleLink = colMusic.querySelector('a');
            var subDivs = colMusic.querySelectorAll('div');

            var diffText = '';
            var diffEl = li.querySelector('div.col_normal_lv');
            if (diffEl) diffText = diffEl.textContent.trim().toLowerCase();

            var levelText = '';
            var levelEl = li.querySelector('div.col_hyper_lv');
            if (levelEl) levelText = levelEl.textContent.trim();

            var scoreCol = li.querySelector('div.col_ex_lv');
            var score = null;
            var medalSrc = null;
            var rankSrc = null;
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

    /**
     * Parse song detail page (mu_detail.html)
     *
     * Structure: div.dif_tbl#easy / #normal / #hyper / #ex
     *   - div.detail_medal  background:url(meda_big_X.png) + img rank_big_X.png
     *   - table.dif_score_tbl  SCORE / COOL / GREAT / GOOD / BAD / highlight / play count / clear / FC / PERFECT
     *   - div.item_st  play options
     */
    function parseDetailPage(doc) {
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
        var diff = entry.difficulty; // "easy", "normal", "hyper", "ex"

        if (!diff) return;

        // Write or update this difficulty's data
        if (!song.charts[diff] || song.charts[diff].score === 0 || song.charts[diff].score === null) {
            song.charts[diff] = {
                level: entry.level,
                score: entry.score,
                medal: entry.medal,
                rank: entry.rank,
                medalImg: entry.medalImg,
                rankImg: entry.rankImg,
            };
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
            { name: 'status', url: GAME_BASE + '/playdata/index.html' },
            { name: 'mu_lv_1_p0', url: buildMuLvURL(1, 0) },
            { name: 'mu_lv_30_p0', url: buildMuLvURL(30, 0) },
            { name: 'mu_lv_43_p0', url: buildMuLvURL(43, 0) },
            { name: 'mu_lv_50_p0', url: buildMuLvURL(50, 0) },
        ];

        // Find a played song's detail URL
        try {
            log('Looking for a played song detail link...');
            var listHTML = await fetchPage(buildMuLvURL(43, 0));
            var listDoc = parseHTML(listHTML);
            var entries = parseMuLvPage(listDoc);
            var playedEntry = null;
            for (var ei = 0; ei < entries.length; ei++) {
                if (entries[ei].score > 0 && entries[ei].detailUrl) {
                    playedEntry = entries[ei];
                    break;
                }
            }
            if (playedEntry) {
                log('Found played song: ' + playedEntry.title + ' (score=' + playedEntry.score + ')');
                pages.push({ name: 'mu_detail_sample', url: playedEntry.detailUrl });
            } else {
                // Fallback: pick the first song
                var firstLink = listDoc.querySelector('ul.mu_list_table > li:nth-child(2) div.col_music_lv a');
                if (firstLink) {
                    pages.push({ name: 'mu_detail_sample', url: firstLink.getAttribute('href') });
                }
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
        a.download = 'popn_html_dump_v4_' + new Date().toISOString().slice(0, 10) + '.json';
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
            log('<- GET ' + GAME_BASE + '/playdata/index.html');
            var statusHTML = await fetchPage(GAME_BASE + '/playdata/index.html');
            collectedData.player = parseStatusPage(parseHTML(statusHTML));
            log('Player: ' + (collectedData.player['プレーヤー名'] || 'OK'));

            // Fetch character avatar as base64 for offline embedding
            var chara = collectedData.player['使用キャラクター'];
            if (chara && chara.img) {
                try {
                    chara.imgData = await fetchImageAsDataURL(chara.img);
                    log('Character avatar: ' + chara.name);
                } catch (e) {
                    log('Could not fetch avatar: ' + e.message);
                }
            }

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

        // Calculate Pop Class
        if (collectedData.scores.length > 0) {
            var pc = calcPopClass(collectedData.scores);
            collectedData.popClass = pc;
            setMsg1(msg + " | Pop'n Class: " + pc.value.toFixed(2) + ' (' + pc.tier + ')');
            log("Pop'n Class: " + pc.value.toFixed(2) + ' (' + pc.tier + ') from ' + pc.count + ' scored charts');
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

    // ========== Export ==========

    function exportJSON() {
        var exportData = {
            player: collectedData.player,
            scores: collectedData.scores,
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
        'no_play': 'No Play', 'easy_clear': '\u7dd1\u2b24',
        'failed_1': '\u7070\u2b24', 'failed_2': '\u7070\u25c6', 'failed_3': '\u7070\u2605',
        'normal_clear': '\u9285\u2b24', 'normal_clear_in_20_bad': '\u9285\u25c6', 'normal_clear_in_5_bad': '\u9285\u2605',
        'full_combo': '\u9280\u2b24', 'full_combo_in_20_good': '\u9280\u25c6', 'full_combo_in_5_good': '\u9280\u2605',
        'perfect': '\u91d1\u2605'
    };

    var MEDAL_COLORS = {
        'no_play': '#bbb', 'easy_clear': '#2ea868',
        'failed_1': '#999', 'failed_2': '#999', 'failed_3': '#999',
        'normal_clear': '#b87333', 'normal_clear_in_20_bad': '#b87333', 'normal_clear_in_5_bad': '#b87333',
        'full_combo': '#888', 'full_combo_in_20_good': '#888', 'full_combo_in_5_good': '#888',
        'perfect': '#d4a017'
    };

    var DIFF_COLORS = { easy: '#1ea868', normal: '#2e7ed6', hyper: '#d08a10', ex: '#d04030' };

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
        ctx.fillText(playerName + "  Pop'n Class: " + pc.value.toFixed(2) + ' (' + pc.tier + ')', textLeft, 30);
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
                ctx.fillText(c.diff.toUpperCase(), x, y + 19);
                x += cols[2];

                ctx.fillStyle = '#3d2b1f';
                ctx.fillText(c.level.toString(), x, y + 19);
                x += cols[3];

                ctx.fillText(c.score > 0 ? c.score.toString() : '-', x, y + 19);
                x += cols[4];

                ctx.fillStyle = MEDAL_COLORS[c.medal] || '#907860';
                ctx.fillText(MEDAL_LABELS[c.medal] || c.medal || '-', x, y + 19);
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
    setMsg1('Ready. Click Scrape to start.');
    setMsg2('');
    setButtonState('idle');

})();
