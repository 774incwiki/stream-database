// make_data.py の Node.js 版。  node make_data.js
const fs = require('fs'), path = require('path');
const out = {};
for (const n of ['archives.csv', 'talents.csv', 'aliases.csv']) {
  const p = path.join(__dirname, n);
  if (fs.existsSync(p)) out[n] = fs.readFileSync(p, 'utf8');
}
fs.writeFileSync(path.join(__dirname, 'data.js'),
  '// make_data.js で自動生成。CSVを更新したらもう一度実行してください。\nwindow.LOCAL_DATA = ' + JSON.stringify(out) + ';\n');
console.log('data.js を作りました');
