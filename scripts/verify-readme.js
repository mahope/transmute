#!/usr/bin/env node
// Verify every CLI example in the README works against the real engine.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-verify-'));
const cli = path.join(__dirname, '..', 'src', 'cli.js');
fs.writeFileSync(path.join(tmp, 'people.csv'), 'name,age,city\nAlice,32,Aarhus\nBob,25,Odense\n');
fs.writeFileSync(path.join(tmp, 'config.yaml'), 'a: 1\nb: hello\n');

const checks = [
  ['npx-style run', `node ${cli} ${tmp}/people.csv --output json`, /Alice/],
  ['filter+sort pipe', `node ${cli} ${tmp}/people.csv --pipe '[{"op":"filter","expr":"item.age > 26"},{"op":"sort","by":"age","dir":"desc"}]' -o csv`, /name,age/],
  ['yaml stdin', `cat ${tmp}/config.yaml | node ${cli} --format yaml --output json`, /hello/],
  ['json to xml', `echo '{"a":1}' | node ${cli} --output xml`, /<a>1<\/a>/],
];

let fail = 0;
for (const [name, cmd, re] of checks) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' });
    if (!re.test(out)) { console.log(`❌ ${name}: output mismatch`); fail++; }
    else console.log(`✅ ${name}`);
  } catch (e) { console.log(`❌ ${name}: ${e.message}`); fail++; }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail === 0 ? '\nAll README examples verified.' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
