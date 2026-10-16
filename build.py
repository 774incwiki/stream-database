# 編集用シートから公開用までを、まとめて実行します。
#   python3 build.py [edit.csv] [--year 2026]
# 1. make_archive.py : 整形・チェック → archives_master.csv
# 2. make_public.py  : 非公開のURLを消す → archives.csv
# 3. make_data.py    : ローカル確認用の data.js
import os, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__))
def run(s, *a):
    r = subprocess.run([sys.executable, os.path.join(D, s)] + list(a))
    if r.returncode: sys.exit(r.returncode)
run('make_archive.py', *sys.argv[1:])
run('make_public.py')
run('make_data.py')
print('\nできました。archives.csv をGitHubにアップロードしてください。')
