/**
 * Regenerate test/fixtures/expected.json from the CLI engine.
 *
 *   node tools/update_cli_snapshots.mjs
 *
 * The snapshots are committed and asserted by test/conformance.test.mjs, so a
 * behaviour change in the engine has to be a deliberate edit of this file.
 * docs/cli.md quotes the same output, which is why the test also checks the
 * documentation against these strings.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import engine from '../src/engine.js';
import { CASES, fixtureText } from '../test/fixtures/cases.mjs';

const { run } = engine;
const here = dirname(fileURLToPath(import.meta.url));
const out = {};

for (const testCase of CASES) {
  const result = run(
    fixtureText(testCase.fixture, testCase.file),
    testCase.fixture,
    testCase.pipeline,
    testCase.outputFormat,
    testCase.opts || {}
  );
  if (result.error) {
    console.error(`FAIL ${testCase.name}: ${result.error}`);
    process.exit(1);
  }
  out[testCase.name] = result.text;
}

const target = join(here, '..', 'test', 'fixtures', 'expected.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`Wrote ${Object.keys(out).length} snapshots to test/fixtures/expected.json`);
