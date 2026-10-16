/* ななしいんく配信アーカイブ 公開サイト
   データは archives.csv と talents.csv を読み込みます。このファイルは通常さわらなくてOKです。 */
(function () {
'use strict';

var PER_OPTIONS = [10, 20, 50, 100];
var DEFAULT_PER = 20;
var WD = ['日', '月', '火', '水', '木', '金', '土'];
var GROUPS = [
  /* 配信者(ゲスト出演も含む)。2人以上選ぶと、その全員が出ている配信に絞る */
  { id: 'cast', label: '配信者', param: 'cast', mode: 'all', vals: function (i) { return i.whoVals || i.parts; } },
  { id: 'genre', label: 'ジャンル', param: 'genre', vals: function (i) { return i.genres; } },
  { id: 'kind', label: '形式', param: 'kind', vals: function (i) { return [KIND_LABEL[i.kind]]; } },
  { id: 'sub', label: '詳細ジャンル', param: 'sub', vals: function (i) { return i.subs; } },
  /* 箱内の人を選ぶと、その人がゲストの配信と、その人が配信者の配信の両方が出る */
  { id: 'collabIn', label: 'コラボ相手（箱内）', param: 'in', vals: function (i) { return i.inVals || i.collabIn; } },
  { id: 'collabOut', label: 'コラボ相手（箱外）', param: 'collab', vals: function (i) { return i.collabOut; } },
  { id: 'away', label: 'チャンネル', param: 'ch', vals: function (i) { return [AWAY_LABEL[i.away ? 1 : 0]]; } },
  { id: 'chan', label: '配信元チャンネル', param: 'chn', vals: function (i) { return i.chan ? [i.chan] : []; } },
  { id: 'platform', label: 'プラットフォーム', param: 'pf', vals: function (i) { return [PF_LABEL[i.twitch ? 1 : 0]]; } },
  { id: 'status', label: '公開状態', param: 'status', vals: function (i) { return [STATUS_LABEL[i.status]]; } }
];
var PF_LABEL = ['YouTube', 'Twitch'];
var AWAY_LABEL = ['自チャンネル', '他チャンネル出演'];
var KIND_LABEL = { 'live': '配信', 'video': '動画', 'short': 'Shorts' };
var KIND_ORDER = ['配信', '動画', 'Shorts'];
var FIXED_ORDER = { platform: PF_LABEL, away: AWAY_LABEL, kind: KIND_ORDER, status: ['公開', 'メンバー限定', '非公開'] };
var STATUS_LABEL = { 'public': '公開', 'members': 'メンバー限定', 'private': '非公開' };
var STATUS_ORDER = ['公開', 'メンバー限定', '非公開'];
var PRIVATE_TITLE = '【配信タイトル】◯◯◯◯◯◯◯◯◯◯';

/* ---------- リクエスト・訂正の受付先(config.js の requestUrl) ---------- */
var CFG = window.SITE_CONFIG || {};
var REQ_URL = '';
try {
  var ru = new URL(String(CFG.requestUrl || '').trim());
  if (ru.protocol === 'https:' || ru.protocol === 'http:') REQ_URL = ru.href;
} catch (e) { /* 未設定 */ }
/* GitHub Issues のURLなら、対象の配信を題名と本文に入れた状態で開きます */
function reqHref(it) {
  if (!REQ_URL) return '';
  var u = new URL(REQ_URL);
  if (u.hostname === 'github.com' && /\/issues\/new/.test(u.pathname)) {
    u.searchParams.set('title', '【訂正・追加】' + (it ? (it.title || '（非公開の配信）') : ''));
    u.searchParams.set('body', (it ? '対象の配信: ' + fmtDate(it.date) + ' ' + it.talent + ' ' + (it.title || '') + '\n\n' : '') + '内容:\n');
    return u.href;
  }
  return REQ_URL;
}
function setupRequest() {
  if (!REQ_URL) return;
  var nav = $('.site nav');
  if (nav) nav.insertAdjacentHTML('beforeend', '<a href="' + esc(reqHref(null)) + '" target="_blank" rel="noopener noreferrer">リクエスト</a>');
  var foot = $('.foot');
  if (foot) foot.insertAdjacentHTML('beforeend', '<br>追加してほしい配信や、訂正のお願いは<a href="' + esc(reqHref(null)) + '" target="_blank" rel="noopener noreferrer">こちら</a>から受け付けています。');
}

/* ---------- helpers ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function norm(s) { return String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase(); }
function pad(n) { return String(n).padStart(2, '0'); }
function normDate(s) {
  var m = String(s || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  var mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return m[1] + '-' + pad(mo) + '-' + pad(d);
}
function fmtDate(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '日付なし';
  var dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return m[1] + '/' + m[2] + '/' + m[3] + ' (' + WD[dt.getDay()] + ')';
}
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
  catch (e) { return ''; }
}
/* 公開状態の書き方: 「メンバー限定」「非公開」以外(空欄含む)は公開として扱います */
function parseStatus(s) {
  var n = norm(s);
  if (!n) return 'public';
  if (/メンバー|メン限|member/.test(n)) return 'members';
  if (/非公開|private|削除|^[x×]$/.test(n)) return 'private';
  return 'public';
}
/* 形式の書き方: 「動画」「Shorts(ショート)」以外(空欄含む)は配信として扱います */
function parseKind(s) {
  var n = norm(s);
  if (!n) return 'live';
  if (/short|ショート/.test(n)) return 'short';
  if (/動画|video|投稿/.test(n)) return 'video';
  return 'live';
}
/* ●○〇✓1 などの印か「はい」「true」が入っていればオン。空欄・×・なし・0 はオフ */
function parseFlag(s) {
  var n = norm(s);
  if (!n) return false;
  return !/^(×|x|✕|-|ー|なし|無|いいえ|no|false|0|off)$/.test(n);
}
function splitTags(s) {
  return String(s || '').split(/[、;；\/／|]/).map(function (x) { return x.trim(); }).filter(Boolean);
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') { q = true; }
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') { cell += c; }
  }
  row.push(cell); rows.push(row);
  return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
}
/* 1行目が見出しなら見出し名で列を探し、なければ決まった順番で読みます */
function mapRows(rows, cols, order) {
  var head = (rows[0] || []).map(norm), idx = {}, found = 0, start = 0;
  Object.keys(cols).forEach(function (k) {
    var i = head.findIndex(function (h) { return cols[k].some(function (a) { return norm(a) === h; }); });
    if (i >= 0) { idx[k] = i; found++; }
  });
  if (found >= 1) start = 1;
  else { idx = {}; order.forEach(function (k, i) { idx[k] = i; }); }
  return rows.slice(start).map(function (r) {
    var o = {};
    Object.keys(idx).forEach(function (k) { o[k] = (r[idx[k]] || '').trim(); });
    return o;
  });
}
var ARCH_COLS = {
  talent: ['配信者', 'タレント', 'talent'], date: ['日付', '配信日', 'date'], title: ['タイトル', 'title'],
  url: ['URL', 'リンク', 'link'], genre: ['ジャンル', 'genre'], sub: ['詳細ジャンル', 'subgenre'],
  collab: ['コラボ相手', 'コラボ', 'collab'], memo: ['説明', 'メモ', 'memo'],
  status: ['公開状態', '公開', 'status'], reason: ['非公開の理由', '理由', 'reason'], kind: ['形式', '種別', 'kind'],
  priv: ['非公開', '非公開フラグ'], mem: ['メンバー限定', 'メン限', 'メンバー限定フラグ'],
  video: ['動画', '動画投稿'], short: ['Shorts', 'ショート'],
  chan: ['配信元チャンネル', '配信チャンネル', 'チャンネル名', 'channel'],
  twitch: ['Twitch', 'Twitch配信', 'ツイッチ']
};
var ARCH_ORDER = ['talent', 'date', 'title', 'url', 'genre', 'sub', 'collab', 'mem', 'video', 'short', 'twitch', 'memo', 'priv', 'reason', 'chan'];
var TAL_COLS = {
  slug: ['slug', 'スラッグ', 'id'], name: ['名前', 'name', 'タレント名', '配信者'], box: ['所属', '箱', 'グループ', '事務所', 'box', 'group'], intro: ['紹介', 'intro', 'プロフィール'],
  youtube: ['youtube', 'チャンネル'], x: ['x', 'twitter'], color: ['色', 'カラー', 'color', 'カラーコード']
};
var TAL_ORDER = ['slug', 'name', 'intro', 'youtube', 'x', 'box', 'color'];
/* 色は #ff6699 の形だけ受け付ける。文字色は背景の明るさで白か黒を自動で選ぶ */
var TAL_COLOR = {};
function parseColor(s) {
  var m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((s || '').trim()); if (!m) return null;
  var h = m[1]; if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
  var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  /* WCAGの相対輝度で、白文字と黒文字のうちコントラストが高いほうを選ぶ */
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  var L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return { bg: '#' + h, ink: (L + 0.05) / 0.0603 > 1.05 / (L + 0.05) ? '#1a1a1a' : '#ffffff' };
}

function loadText(u) {
  // data.js があれば(ローカルで直接開いたとき用)、fetchが使えない場合の代わりに使う
  var local = window.LOCAL_DATA && window.LOCAL_DATA[u];
  return fetch(u, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(u + ' ' + r.status);
    return r.text();
  }).catch(function (e) {
    if (typeof local === 'string') return local;
    throw e;
  });
}
function prepItem(o, idx) {
  var it = {
    idx: idx, talent: (o.talent || '').trim(), date: normDate(o.date), title: (o.title || '').trim(),
    url: o.url || '', genres: splitTags(o.genre), subs: splitTags(o.sub), collabs: splitTags(o.collab), memo: (o.memo || '').trim(),
    status: parseFlag(o.priv) ? 'private' : parseFlag(o.mem) ? 'members' : parseStatus(o.status), reason: (o.reason || '').trim(), kind: parseFlag(o.short) ? 'short' : parseFlag(o.video) ? 'video' : parseKind(o.kind), chan: (o.chan || '').trim(), twitch: parseFlag(o.twitch)
  };
  it.hay = norm([it.title, it.talent, it.genres.join(' '), it.chan, it.twitch ? 'twitch' : '', it.memo, it.reason, STATUS_LABEL[it.status], KIND_LABEL[it.kind]].concat(it.subs, it.collabs).join(' '));
  return it;
}
function loadData() {
  return Promise.all([
    loadText('archives.csv'),
    loadText('talents.csv').catch(function () { return ''; }),
    loadText('aliases.csv').catch(function () { return ''; })
  ]).then(function (res) {
    var items = mapRows(parseCSV(res[0]), ARCH_COLS, ARCH_ORDER).map(prepItem).filter(function (it) { return it.title || it.status === 'private'; });
    /* 表記ゆれ: aliases.csv の1行を「同じ意味の言葉」のグループとして、どれで検索しても見つかるようにする */
    var groups = (res[2] ? parseCSV(res[2]) : []).map(function (r) {
      return r.map(norm).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    }).filter(function (g) { return g.length >= 2; });
    if (groups.length) items.forEach(function (it) {
      groups.forEach(function (g) {
        if (g.some(function (t) { return it.hay.indexOf(t) >= 0; })) it.hay += ' ' + g.join(' ');
      });
    });
    var tRows = res[1] ? mapRows(parseCSV(res[1]), TAL_COLS, TAL_ORDER) : [];
    var byName = new Map(), bySlug = new Map();
    tRows.forEach(function (o) {
      if (!o.name) return;
      var t = { name: o.name, slug: o.slug || o.name, intro: o.intro || '', youtube: safeUrl(o.youtube), x: safeUrl(o.x), box: o.box || '', color: parseColor(o.color) };
      t.reg = true; byName.set(norm(t.name), t); bySlug.set(t.slug, t);
    });
    var hasReg = byName.size > 0;
    items.forEach(function (it) {
      if (!it.talent) return;
      var k = norm(it.talent);
      if (!byName.has(k)) {
        var t = { name: it.talent, slug: it.talent, intro: '', youtube: '', x: '', box: '', reg: !hasReg };
        byName.set(k, t); bySlug.set(t.slug, t);
      }
    });
    /* 出演者(配信者+ゲスト)と、ゲストの箱内/箱外を決める。同じ「所属」同士なら箱内 */
    var hasBox = Array.from(byName.values()).some(function (t) { return t.box; });
    /* 「所属」を誰にも書いていなければ、talents.csv に載っている人は全員、同じ箱として扱う */
    if (!hasBox && hasReg) {
      byName.forEach(function (t) { if (t.reg) t.box = '(同じ箱)'; });
      hasBox = true;
    }
    byName.forEach(function (t, k) { if (t.color) TAL_COLOR[k] = t.color; });
    items.forEach(function (it) {
      var host = byName.get(norm(it.talent)), hb = host ? norm(host.box) : '';
      var seen = new Set(), parts = [];
      function add(n) { var k = norm(n); if (!k || seen.has(k)) return; seen.add(k); parts.push(n); }
      add(it.talent); it.collabs.forEach(add);
      it.parts = parts; it.partKeys = seen;
      it.collabIn = []; it.collabOut = [];
      it.collabs.forEach(function (c) {
        var tc = byName.get(norm(c)), cb = tc ? norm(tc.box) : '';
        (hb && cb && hb === cb ? it.collabIn : it.collabOut).push(c);
      });
      /* 自分たち(talents.csv)のタレントのキー。箱外でも「w/」「外部」を付けない */
      it.color = host ? host.color : null;
      it.regKeys =new Set(it.collabs.filter(function (c) { var tc = byName.get(norm(c)); return tc && tc.reg; }).map(norm));
      /* 配信者で絞ると、その人がゲストとして出ている配信(w/)も出す */
      it.whoVals = hasReg ? (it.talent ? [it.talent] : []).concat(it.collabs.filter(function (c) { var tc = byName.get(norm(c)); return tc && tc.reg && norm(c) !== norm(it.talent); })) : parts;
      it.inVals =it.collabIn.concat(host && host.reg ?[it.talent] : []);
      /* 掲載タレント(talents.csv)以外のチャンネルに、掲載タレントがゲストで出ている配信 */
      it.away = hasReg && !(host && host.reg) && it.collabs.some(function (c) { var tc = byName.get(norm(c)); return tc && tc.reg; });
      it.hay += ' ' + norm(parts.join(' '));
    });
    GROUPS.forEach(function (g) { if (g.id === 'collabOut') g.label = hasBox ? 'コラボ相手（箱外）' : 'コラボ相手'; });
    return { items: items, hasBox: hasBox, talents: { byName: byName, bySlug: bySlug } };
  });
}

/* ---------- 一覧ブラウザ(検索・絞り込み・一覧) ---------- */
function createBrowser(cfg) {
  var G = GROUPS.filter(function (g) { return cfg.groups.indexOf(g.id) >= 0; });
  var st = { all: cfg.all, items: [], q: '', sort: 'desc', f: {}, labels: {}, expanded: {}, per: DEFAULT_PER, page: 1, only: false };
  G.forEach(function (g) { st.f[g.id] = new Set(); st.labels[g.id] = []; });

  function rebase() {
    var base = cfg.base();
    st.items = st.all.filter(base);
    G.forEach(function (g) {
      var m = new Map();
      st.items.forEach(function (it) {
        var seen = new Set();
        g.vals(it).forEach(function (v) {
          var k = norm(v); if (!k || seen.has(k)) return; seen.add(k);
          var e = m.get(k); if (e) e.count++; else m.set(k, { key: k, label: v, count: 1 });
        });
      });
      st.labels[g.id] = Array.from(m.values()).sort(function (a, b) {
        if (FIXED_ORDER[g.id]) return FIXED_ORDER[g.id].indexOf(a.label) - FIXED_ORDER[g.id].indexOf(b.label);
        return b.count - a.count || a.label.localeCompare(b.label, 'ja');
      });
      var keys = new Set(st.labels[g.id].map(function (e) { return e.key; }));
      Array.from(st.f[g.id]).forEach(function (k) { if (!keys.has(k)) st.f[g.id].delete(k); });
    });
  }
  /* 選んだ人が全員出演している配信。2人以上選んだときは、ほかの出演者がいない配信だけに絞る */
  function castOk(it, set, size) {
    var ok = true;
    set.forEach(function (k) { if (!it.partKeys.has(k)) ok = false; });
    if (!ok) return false;
    return size < 2 || !st.only || it.partKeys.size === size;
  }
  function tokens() { return norm(st.q).split(/\s+/).filter(Boolean); }
  function matches(it, skip, toks) {
    for (var t = 0; t < toks.length; t++) if (it.hay.indexOf(toks[t]) < 0) return false;
    for (var i = 0; i < G.length; i++) {
      var g = G[i]; if (g.id === skip) continue;
      var set = st.f[g.id];
      if (!set.size) continue;
      if (g.mode === 'all') { if (!castOk(it, set, set.size)) return false; }
      else if (!g.vals(it).some(function (v) { return set.has(norm(v)); })) return false;
    }
    return true;
  }
  function visible() {
    var toks = tokens(), dir = st.sort === 'asc' ? 1 : -1;
    var rows = st.items.filter(function (it) { return matches(it, null, toks); });
    rows.sort(function (a, b) {
      if (!a.date && !b.date) return (a.idx - b.idx) * dir;
      if (!a.date) return 1; if (!b.date) return -1;
      if (a.date !== b.date) return a.date < b.date ? -dir : dir;
      return (a.idx - b.idx) * dir;
    });
    return rows;
  }
  function activeCount() { var n = 0; G.forEach(function (g) { n += st.f[g.id].size; }); return n; }
  function labelOf(gid, key) { var e = st.labels[gid].find(function (x) { return x.key === key; }); return e ? e.label : key; }

  function renderFilters() {
    var toks = tokens(), html = '';
    G.forEach(function (g) {
      var all = st.labels[g.id], counts = new Map();
      if (FIXED_ORDER[g.id] && all.length < 2 && !st.f[g.id].size) return;
      st.items.forEach(function (it) {
        if (!matches(it, g.id, toks)) return;
        if (g.mode === 'all') {
          var set = st.f[g.id], cover = true;
          set.forEach(function (k) { if (!it.partKeys.has(k)) cover = false; });
          if (!cover) return;
          it.partKeys.forEach(function (k) {
            var size = set.has(k) ? set.size : set.size + 1;
            if (size < 2 || !st.only || it.partKeys.size === size) counts.set(k, (counts.get(k) || 0) + 1);
          });
          return;
        }
        var seen = new Set();
        g.vals(it).forEach(function (v) { var k = norm(v); if (!k || seen.has(k)) return; seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); });
      });
      var limit = 10, exp = st.expanded[g.id];
      var shown = all.filter(function (e, idx) { return exp || idx < limit || st.f[g.id].has(e.key); });
      if ((g.id === 'collabIn' || g.id === 'collabOut' || g.id === 'chan') && !all.length && !st.f[g.id].size) return;
      html += '<section class="grp"><h3>' + esc(g.label) + '</h3>';
      if (g.id === 'cast') html += '<p class="hint">複数選ぶと、全員が出ている配信を表示します（ゲスト出演も含む）。</p>';
      if (!all.length) html += '<p class="nogrp">タグはまだありません</p>';
      else {
        html += '<div class="chips">' + shown.map(function (e) {
          var on = st.f[g.id].has(e.key), n = counts.get(e.key) || 0;
          return '<button type="button" class="chip k-' + g.id + (n ? '' : ' zero') + '" data-f="' + g.id + '" data-k="' + esc(e.key) +
            '" aria-pressed="' + on + '"><i></i><span class="lbl">' + esc(e.label) + '</span><span class="n">' + n + '</span></button>';
        }).join('') + '</div>';
        if (g.id === 'cast' && st.f.cast.size >= 2) html += '<label class="opt"><input type="checkbox" data-only' + (st.only ? ' checked' : '') + '><span>この人たちだけの配信に絞る</span></label>';
        if (all.length > limit) html += '<button type="button" class="linkbtn more" data-more="' + g.id + '">' +
          (exp ? '閉じる' : 'ほか ' + (all.length - shown.length) + ' 件を表示') + '</button>';
      }
      html += '</section>';
    });
    $('#filters').innerHTML = html;
    var c = activeCount();
    $('#fbadge').hidden = !c; $('#fbadge').textContent = c;
  }
  function renderActive() {
    var h = '';
    G.forEach(function (g) {
      st.f[g.id].forEach(function (k) {
        h += '<button type="button" class="chip k-' + g.id + '" data-f="' + g.id + '" data-k="' + esc(k) + '" aria-pressed="true" aria-label="' +
          esc(g.label + ' ' + labelOf(g.id, k)) + 'の絞り込みを外す"><i></i><span class="lbl">' + esc(g.label + '：' + labelOf(g.id, k)) + '</span><span class="n">×</span></button>';
      });
    });
    if (h) h += '<button type="button" class="linkbtn" data-clear>すべて解除</button>';
    $('#active').innerHTML = h;
    $('#active').style.marginBottom = h ? '4px' : '0';
  }
  function tagBtn(gid, label, cls, noBx) {
    var tc = (gid === 'collabIn' || gid === 'collabOut') ? TAL_COLOR[norm(label)] : null,
      sty = tc ? ' style="background:' + tc.bg + ';color:' + tc.ink + '"' : '';
    var pre = gid === 'chan' ? '配信元：' : '', bx = gid === 'collabOut' && !noBx ?'<small class="bx">外部</small>' : '';
    if (!st.f[gid]) return '<span class="tag ' + cls + '"' + sty + '>' + pre + esc(label) + bx + '</span>';
    var on = st.f[gid].has(norm(label));
    return '<button type="button" class="tag ' + cls + '"' + sty + ' data-f="' + gid + '" data-k="' + esc(norm(label)) + '" aria-pressed="' + on + '">' +
      pre + esc(label) + bx + '</button>';
  }
  function rowHtml(it) {
    var priv = it.status === 'private', mem = it.status === 'members';
    var url = safeUrl(it.url);
    var tt = it.title || (priv ? PRIVATE_TITLE : '');
    var title = (url && !priv) ? '<a class="title" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(tt) + '</a>'
      : '<span class="title nolink">' + esc(tt) + '</span>';
    var badge = (mem || priv) ? '<button type="button" class="st ' + it.status + '" data-f="status" data-k="' + esc(norm(STATUS_LABEL[it.status])) + '" aria-pressed="' + (st.f.status.has(norm(STATUS_LABEL[it.status]))) + '" title="この公開状態で絞り込む">' + STATUS_LABEL[it.status] + '</button>' : '';
    var away = it.away ? '<span class="kd away">他チャンネル出演</span>' : '';
    var tw = it.twitch ? '<span class="kd twitch">Twitch</span>' : '';
    var tags = '';
    if (it.kind !== 'live') tags += tagBtn('kind', KIND_LABEL[it.kind], 'kind');
    it.genres.forEach(function (g) { tags += tagBtn('genre', g, 'genre'); });
    it.subs.forEach(function (s) { tags += tagBtn('sub', s, 'sub'); });
    if (it.chan) tags += tagBtn('chan', it.chan, 'chan');
    it.collabIn.forEach(function (c) { tags += tagBtn('collabIn', c, 'collab'); });
    it.collabOut.forEach(function (c) { tags += tagBtn('collabOut', c, 'collab', it.regKeys.has(norm(c))); });
    return '<li class="row' + (priv ? ' private' : '') + (mem ? ' members' : '') + '"><div class="meta"><time class="date">' + esc(fmtDate(it.date)) + '</time>' + tw + away + badge +
      (it.talent ? '<button type="button" class="talent"' + (it.color ? ' style="background:' + it.color.bg + ';color:' + it.color.ink + '"' : '') + ' data-f="cast" data-k="' + esc(norm(it.talent)) + '" title="この配信者で絞り込む">' + esc(it.talent) + '</button>' : '') +
      (REQ_URL ? '<a class="req" href="' + esc(reqHref(it)) + '" target="_blank" rel="noopener noreferrer">訂正を連絡</a>' : '') +
      '</div>' + title + (priv && it.reason ? '<p class="reason">※' + esc(it.reason) + '</p>' : '') +
      (it.memo ? '<p class="desc">' + esc(it.memo) + '</p>' : '') + (tags ? '<div class="tags">' + tags + '</div>' : '') + '</li>';
  }
  function pagerHtml(total) {
    if (total < 2) return '';
    var cur = st.page;
    var set = [1, total, cur - 1, cur, cur + 1].filter(function (n) { return n >= 1 && n <= total; });
    set = Array.from(new Set(set)).sort(function (a, b) { return a - b; });
    var h = '<nav class="pager" aria-label="ページ送り"><button type="button" class="pg" data-pg="' + (cur - 1) + '"' + (cur < 2 ? ' disabled' : '') + '>‹ 前へ</button>';
    var prev = 0;
    set.forEach(function (n) {
      if (prev && n - prev > 1) h += '<span class="pgap">…</span>';
      h += '<button type="button" class="pg' + (n === cur ? ' cur' : '') + '" data-pg="' + n + '"' + (n === cur ? ' aria-current="page"' : '') + '>' + n + '</button>';
      prev = n;
    });
    return h + '<button type="button" class="pg" data-pg="' + (cur + 1) + '"' + (cur >= total ? ' disabled' : '') + '>次へ ›</button></nav>';
  }
  function scrollToList() {
    try { var t = $('.toolbar').getBoundingClientRect().top + window.pageYOffset - 70; window.scrollTo({ top: Math.max(0, t) }); } catch (e) { /* ignore */ }
  }
  function renderList() {
    var el = $('#list'), cnt = $('#count');
    if (!st.items.length) {
      el.innerHTML = '<div class="empty"><h2>まだ配信が登録されていません</h2><p>archives.csv に配信を追加すると、ここに表示されます。</p></div>';
      cnt.textContent = ''; return;
    }
    var rows = visible();
    cnt.textContent = rows.length + ' 件を表示' + (rows.length !== st.items.length ? '（全 ' + st.items.length + ' 件）' : '');
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><h2>条件に合う配信がありません</h2><p>検索語を短くするか、絞り込みを外してみてください。</p><button class="btn" type="button" data-clear>検索と絞り込みを解除</button></div>';
      return;
    }
    var perMonth = {};
    rows.forEach(function (r) { var k = r.date ? r.date.slice(0, 7) : ''; perMonth[k] = (perMonth[k] || 0) + 1; });
    var pages = Math.max(1, Math.ceil(rows.length / st.per));
    if (st.page > pages) st.page = pages;
    var from = (st.page - 1) * st.per;
    cnt.textContent = rows.length + ' 件中 ' + (from + 1) + '〜' + Math.min(from + st.per, rows.length) + ' 件を表示' +
      (rows.length !== st.items.length ? '（全 ' + st.items.length + ' 件）' : '');
    var out = '', cur = null, open = false;
    rows.slice(from, from + st.per).forEach(function (it) {
      var key = it.date ? it.date.slice(0, 7) : '';
      if (key !== cur) {
        if (open) out += '</ul>';
        out += '<h2 class="month">' + (key ? esc(key.slice(0, 4) + '年' + (+key.slice(5)) + '月') : '日付なし') + '<small>' + perMonth[key] + '件</small></h2><ul class="list">';
        cur = key; open = true;
      }
      out += rowHtml(it);
    });
    if (open) out += '</ul>';
    out += pagerHtml(pages);
    el.innerHTML = out;
  }
  function renderAll() { renderFilters(); renderActive(); renderList(); writeUrl(); }

  /* 検索条件をURLに残して、同じ条件のリンクを共有できるようにします */
  function writeUrl() {
    try {
      var p = new URLSearchParams();
      (cfg.keepParams || []).forEach(function (k) {
        var v = new URLSearchParams(location.search).get(k); if (v) p.set(k, v);
      });
      if (st.q.trim()) p.set('q', st.q.trim());
      if (st.sort === 'asc') p.set('sort', 'asc');
      if (st.per !== DEFAULT_PER) p.set('per', String(st.per));
      if (st.page > 1) p.set('p', String(st.page));
      if (st.only && st.f.cast && st.f.cast.size >= 2) p.set('only', '1');
      G.forEach(function (g) { st.f[g.id].forEach(function (k) { p.append(g.param, k); }); });
      var s = p.toString();
      history.replaceState(null, '', s ? '?' + s : location.pathname);
    } catch (e) { /* ignore */ }
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    st.q = p.get('q') || '';
    st.sort = p.get('sort') === 'asc' ? 'asc' : 'desc';
    var per = parseInt(p.get('per'), 10);
    st.per = PER_OPTIONS.indexOf(per) >= 0 ? per : DEFAULT_PER;
    st.page = Math.max(1, parseInt(p.get('p'), 10) || 1);
    st.only = p.get('only') === '1';
    $('#q').value = st.q; $('#sort').value = st.sort; $('#per').value = String(st.per);
    G.forEach(function (g) { p.getAll(g.param).forEach(function (k) { st.f[g.id].add(norm(k)); }); });
    p.getAll('who').forEach(function (k) { st.f.cast.add(norm(k)); }); /* 昔のURL(?who=)も使えるように */
  }

  function toggle(gid, key) {
    var s = st.f[gid]; if (!s) return;
    if (s.has(key)) s.delete(key); else s.add(key);
    st.page = 1; renderAll();
  }
  function clearAll() {
    G.forEach(function (g) { st.f[g.id].clear(); });
    st.only = false;
    st.q = ''; $('#q').value = ''; st.page = 1; renderAll();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var lo = t.closest('[data-only]'); if (lo) { st.only = !!lo.checked; st.page = 1; renderAll(); return; }
    var f = t.closest('[data-f]'); if (f) { toggle(f.getAttribute('data-f'), f.getAttribute('data-k')); return; }
    var m = t.closest('[data-more]'); if (m) { var id = m.getAttribute('data-more'); st.expanded[id] = !st.expanded[id]; renderFilters(); return; }
    if (t.closest('[data-clear]')) { clearAll(); return; }
    var pg = t.closest('[data-pg]');
    if (pg && !pg.disabled) { st.page = parseInt(pg.getAttribute('data-pg'), 10) || 1; renderList(); writeUrl(); scrollToList(); }
  });
  $('#q').addEventListener('input', function (e) { st.q = e.target.value; st.page = 1; renderFilters(); renderActive(); renderList(); writeUrl(); });
  $('#sort').addEventListener('change', function (e) { st.sort = e.target.value; st.page = 1; renderList(); writeUrl(); });
  $('#per').addEventListener('change', function (e) { st.per = parseInt(e.target.value, 10) || DEFAULT_PER; st.page = 1; renderList(); writeUrl(); });
  /* スマホでは、絞り込みを左から出るパネルにする。外側か「閉じる」で閉じる */
  function setFilters(o) { $('#filters').classList.toggle('open', o); $('#fbtn').setAttribute('aria-expanded', String(o)); }
  $('#fbtn').addEventListener('click', function () { setFilters(!$('#filters').classList.contains('open')); });
  $('#fclose').addEventListener('click', function () { setFilters(false); });
  $('#fback').addEventListener('click', function () { setFilters(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFilters(false); });

  readUrl(); rebase(); renderAll();
  return { rebase: function () { st.page = 1; rebase(); renderAll(); } };
}

/* ---------- ページごとの起動 ---------- */
function fail(msg) {
  var el = $('#list') || $('#app');
  if (el) el.innerHTML = '<div class="empty"><h2>データを読み込めませんでした</h2><p>' + esc(msg) + '</p></div>';
  var l = $('#lede'); if (l) l.textContent = '';
}
var LOAD_HELP = 'archives.csv が同じ場所にあるか確認してください。ファイルを直接開いている場合は、make_data.py（または make_data.js）を実行して data.js を作ると表示されます。';

function bootIndex(data) {
  var talents = new Set(data.items.filter(function (i) { var t = data.talents.byName.get(norm(i.talent)); return t && t.reg; })
    .map(function (i) { return norm(i.talent); }).filter(Boolean));
  $('#lede').textContent = '全 ' + data.items.length + ' 件' + (talents.size ? ' ／ ' + talents.size + ' 人' : '');
  createBrowser({
    groups: ['cast', 'genre', 'sub', 'collabIn', 'collabOut', 'away', 'chan', 'platform', 'kind', 'status'], hasBox: data.hasBox, all: data.items, talents: data.talents,
    base: function () { return function () { return true; }; }
  });
}

loadData().then(function (data) {
  setupRequest();
  bootIndex(data);
}).catch(function (e) {
  fail(LOAD_HELP);
  if (window.console) console.error(e);
});
})();
