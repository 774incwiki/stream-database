# archives.csv / talents.csv から data.js を作ります。
# index.html をダブルクリックで開いて見たいときに使います（公開サイトでは不要）。
#   python3 make_data.py
import json, os
d = os.path.dirname(os.path.abspath(__file__))
out = {}
for n in ('archives.csv', 'talents.csv', 'aliases.csv'):
    p = os.path.join(d, n)
    if os.path.exists(p):
        out[n] = open(p, encoding='utf-8').read()
open(os.path.join(d, 'data.js'), 'w', encoding='utf-8').write(
    '// make_data.py で自動生成。CSVを更新したらもう一度実行してください。\nwindow.LOCAL_DATA = ' + json.dumps(out, ensure_ascii=False) + ';\n')
print('data.js を作りました')
