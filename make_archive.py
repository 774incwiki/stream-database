# 編集用シート(CSVで書き出したもの)を整えて、archives_master.csv を作ります。
#   python3 make_archive.py [edit.csv]        （省略すると edit.csv を読みます）
# 直せる揺れは自動で直し、確認が必要な行は check_report.txt に書き出します。
import csv, difflib, os, re, sys, unicodedata
from urllib.parse import urlparse

D = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, 'edit.csv')
DST = os.path.join(D, 'archives_master.csv')
REPORT = os.path.join(D, 'check_report.txt')

COLS = ['配信者', '日付', 'タイトル', 'URL', 'ジャンル', '詳細ジャンル', 'コラボ相手',
        'メンバー限定', '動画', 'Shorts', 'Twitch', '説明', '非公開', '非公開の理由', '配信元チャンネル']
ALIAS = {
    '配信者': ['配信者', 'タレント', 'talent'], '日付': ['日付', '配信日', 'date'], 'タイトル': ['タイトル', 'title'],
    'URL': ['URL', 'リンク', 'link'], 'ジャンル': ['ジャンル', 'genre'], '詳細ジャンル': ['詳細ジャンル', 'subgenre'],
    'コラボ相手': ['コラボ相手', 'コラボ', 'collab', 'ゲスト'], '説明': ['説明', 'メモ', 'memo'],
    '非公開': ['非公開', '非公開フラグ'], '非公開の理由': ['非公開の理由', '理由', 'reason'],
    'メンバー限定': ['メンバー限定', 'メン限', 'メンバー限定フラグ'], '動画': ['動画', '動画投稿'],
    'Shorts': ['Shorts', 'ショート'], '配信元チャンネル': ['配信元チャンネル', '配信チャンネル', 'チャンネル名', 'channel'],
    'Twitch': ['Twitch', 'Twitch配信', 'ツイッチ'],
}
LISTS = ('ジャンル', '詳細ジャンル', 'コラボ相手')
FLAGS = ('非公開', 'メンバー限定', '動画', 'Shorts', 'Twitch')
EXTERNAL = '外部'

def nfkc(s): return unicodedata.normalize('NFKC', s or '')
def key(s): return re.sub(r'\s+', '', nfkc(s)).lower()
def clean(s): return re.sub(r'\s+', ' ', (s or '').replace('　', ' ')).strip()

def flag(s):
    n = key(s)
    if not n: return False
    return not re.match(r'^(×|x|✕|-|ー|なし|無|いいえ|no|false|0|off|☐)$', n)

def parse_date(s, default_year):
    t = nfkc(s).strip()
    if not t: return '', 'empty'
    m = re.match(r'^(\d{4})\D+(\d{1,2})\D+(\d{1,2})', t) or re.match(r'^(\d{4})(\d{2})(\d{2})$', t)
    if m: y, mo, d = map(int, m.groups())
    else:
        m = re.match(r'^(\d{1,2})[/月.\-](\d{1,2})', t)
        if not m: return s, 'bad'
        if not default_year: return s, 'noyear'
        y, (mo, d) = default_year, map(int, m.groups())
    if not (1 <= mo <= 12 and 1 <= d <= 31): return s, 'bad'
    return '%04d-%02d-%02d' % (y, mo, d), ''

def split_list(s):
    out, seen = [], set()
    for p in re.split(r'[、,，;；/／|]', (s or '').replace('\n', '、')):
        p = clean(p)
        if p and key(p) not in seen: seen.add(key(p)); out.append(p)
    return out

# talents.csv の名前
names = {}
tp = os.path.join(D, 'talents.csv')
if os.path.exists(tp):
    tr = list(csv.reader(open(tp, encoding='utf-8-sig', newline='')))
    if tr:
        h = [key(x) for x in tr[0]]
        ni = next((i for i, x in enumerate(h) if x in ('名前', 'name', 'タレント名', '配信者')), 0)
        for r in tr[1:]:
            if len(r) > ni and r[ni].strip(): names[key(r[ni])] = clean(r[ni])

def canon(n, where, warn):
    k = key(n)
    if k in names: return names[k]
    if k == key(EXTERNAL): return EXTERNAL
    near = difflib.get_close_matches(k, list(names), n=1, cutoff=0.8) if names else []
    if near: warn('%s「%s」は talents.csv にありません。もしかして「%s」？' % (where, n, names[near[0]]))
    return n

if not os.path.exists(SRC):
    sys.exit('%s が見つかりません。編集用シートをCSVで書き出して、edit.csv という名前で置いてください。' % SRC)
rows = list(csv.reader(open(SRC, encoding='utf-8-sig', newline='')))
if not rows: sys.exit('空のファイルです。')
head = [key(h) for h in rows[0]]
idx = {}
for c, al in ALIAS.items():
    for i, h in enumerate(head):
        if h in [key(a) for a in al]: idx[c] = i; break
for need in ('配信者', 'タイトル'):
    if need not in idx: sys.exit('1行目の見出しに「%s」の列が必要です。' % need)

# 日付が「10/5」のように年なしで書かれているとき用に、年を指定できる(--year 2026)
default_year = None
if '--year' in sys.argv:
    default_year = int(sys.argv[sys.argv.index('--year') + 1])

msgs, out, seen_url, fixed = [], [], {}, 0
def add(level, n, text): msgs.append((level, n, text))

for n, r in enumerate(rows[1:], start=2):
    if not any(x.strip() for x in r): continue
    g = lambda c: (r[idx[c]] if c in idx and idx[c] < len(r) else '')
    row = {}
    warn = lambda t, n=n: add('確認', n, t)
    row['配信者'] = clean(g('配信者'))
    row['タイトル'] = clean(g('タイトル'))
    row['説明'] = clean(g('説明'))
    row['非公開の理由'] = clean(g('非公開の理由'))
    row['配信元チャンネル'] = clean(g('配信元チャンネル'))
    url = g('URL').strip()
    row['URL'] = url
    dt, st = parse_date(g('日付'), default_year)
    row['日付'] = dt
    if st == 'empty': add('確認', n, '日付が空です')
    elif st == 'noyear': add('確認', n, '日付に年がありません（%s）。--year 2026 のように年を指定できます' % g('日付'))
    elif st == 'bad': add('エラー', n, '日付を読み取れません（%s）' % g('日付'))
    elif dt != g('日付').strip(): fixed += 1
    for c in LISTS:
        row[c] = '、'.join(split_list(g(c)))
    if not row['配信者']: add('エラー', n, '配信者が空です')
    else:
        row['配信者'] = canon(row['配信者'], '配信者', warn)
        if names and key(row['配信者']) not in names and row['配信者'] != EXTERNAL and not any(
                'もしかして' in m[2] for m in msgs if m[1] == n):
            warn('配信者「%s」は talents.csv にありません（他チャンネルへの出演なら「%s」と書いてください）' % (row['配信者'], EXTERNAL))
    if row['コラボ相手']:
        row['コラボ相手'] = '、'.join(canon(x, 'コラボ相手', warn) for x in split_list(row['コラボ相手']))
    for c in FLAGS: row[c] = '●' if flag(g(c)) else ''
    # URLから分かるものは自動で入れる
    host = urlparse(url).netloc.lower() if url else ''
    if url and not re.match(r'^https?://', url): add('エラー', n, 'URLが http(s):// で始まっていません（%s）' % url)
    if 'twitch.tv' in host and not row['Twitch']: row['Twitch'] = '●'; fixed += 1
    if re.search(r'youtube\.com/shorts/', url) and not row['Shorts']: row['Shorts'] = '●'; fixed += 1
    if row['Shorts'] and row['動画']: add('確認', n, '「動画」と「Shorts」の両方に●があります（Shortsとして扱います）')
    if row['非公開'] and row['メンバー限定']: add('確認', n, '「非公開」と「メンバー限定」の両方に●があります（非公開として扱います）')
    if row['非公開の理由'] and not row['非公開']: add('確認', n, '「非公開の理由」があるのに「非公開」に●がありません')
    if not row['タイトル'] and not row['非公開']: add('確認', n, 'タイトルが空です')
    if not url and not row['非公開'] and not row['Twitch']: add('確認', n, 'URLが空です（非公開なら「非公開」に●を入れてください）')
    if url:
        k = url.split('&')[0].rstrip('/')
        if k in seen_url: add('確認', n, 'URLが %d 行目と同じです（重複？）' % seen_url[k])
        else: seen_url[k] = n
    row['_n'] = n
    out.append(row)

with open(DST, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
    w.writerow(COLS)
    for row in out: w.writerow([row.get(c, '') for c in COLS])

errs = [m for m in msgs if m[0] == 'エラー']; checks = [m for m in msgs if m[0] == '確認']
lines = ['読み込み: %d 行 → %s' % (len(out), os.path.basename(DST)), '自動で直した箇所: %d' % fixed,
         'エラー: %d 件 ／ 確認: %d 件' % (len(errs), len(checks)), '']
for lv, n, t in sorted(msgs, key=lambda m: (m[0] != 'エラー', m[1])):
    lines.append('[%s] %d行目: %s' % (lv, n, t))
open(REPORT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines[:3]))
if msgs: print('くわしくは check_report.txt を見てください（行番号はスプレッドシートの行です）')
