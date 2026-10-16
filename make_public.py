# 元データ(archives_master.csv)から、公開用の archives.csv を作ります。
# 非公開・削除の配信は、URLだけを消します（タイトル・理由などはそのまま）。
#   python3 make_public.py
# archives_master.csv は GitHub にアップロードしないでください。
import csv, os, re, sys, unicodedata
d = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(d, 'archives_master.csv')
dst = os.path.join(d, 'archives.csv')
if not os.path.exists(src):
    sys.exit('archives_master.csv が見つかりません。元データをこの名前で同じフォルダに置いてください。')

def norm(s): return unicodedata.normalize('NFKC', s or '').strip().lower()
def is_private(s):
    n = norm(s)
    return bool(n) and not re.search(r'メンバー|メン限|member', n) and bool(re.search(r'非公開|private|削除|^[x×]$', n))

rows = list(csv.reader(open(src, encoding='utf-8-sig', newline='')))
head = [norm(h) for h in rows[0]]
def col(names):
    for i, h in enumerate(head):
        if h in [norm(n) for n in names]: return i
    return -1
ui = col(['URL', 'リンク', 'link'])
si = col(['公開状態', '公開', 'status'])
pi = col(['非公開', '非公開フラグ'])
if ui < 0 or (si < 0 and pi < 0):
    sys.exit('1行目の見出しに「URL」と「非公開」（または「公開状態」）の列が必要です。')
def flag(s):
    n = norm(s)
    return bool(n) and not re.match(r'^(×|x|✕|-|ー|なし|無|いいえ|no|false|0|off)$', n)
def private_row(r):
    if pi >= 0 and len(r) > pi and flag(r[pi]): return True
    return si >= 0 and len(r) > si and is_private(r[si])
cleared = 0
for r in rows[1:]:
    if len(r) > ui and private_row(r) and r[ui].strip():
        r[ui] = ''; cleared += 1
with open(dst, 'w', encoding='utf-8-sig', newline='') as f:
    csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator='\r\n').writerows(rows)
print('archives.csv を作りました（非公開のURLを %d 件消しました）' % cleared)
