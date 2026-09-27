/**
 * Version tests: the invariants that stay true between a bump and the release it
 * describes, in real temporary git repositories.
 *
 * The point of these rules is that they are green on every commit and red only
 * when a release is actually impossible — so each test here adds a commit and
 * asserts the answer does not change, and then breaks one thing and asserts it
 * does. Nothing touches this repository, the network or npm.
 *
 * tools/release_check.mjs, not tools/release_drift.mjs: drift is asked at release
 * time, on purpose, because it is supposed to fail after the bump.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectVersion } from '../tools/release_check.mjs';
import { lastSrcChange } from '../tools/release_drift.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ❌ ${name}: ${error.message}`);
  }
}

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  }).trim();

/** A repo on main with a version, a src/ directory, and no history behind it. */
function repo({ version = '0.3.0' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-version-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version }, null, 2)}\n`);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.js'), '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'first');
  return dir;
}

/** A later commit that touches src/ — the move that makes drift red. */
function touchSrc(dir, message = 'fix') {
  writeFileSync(join(dir, 'src', 'a.js'), `${message}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', message);
}

test('this repository is releasable under these rules', () => {
  const { problems } = inspectVersion(root);
  assert.deepEqual(problems, [], `this repo should pass: ${problems.join(' / ')}`);
});

test('a later src/ commit does not make it red — that is what separates it from drift', () => {
  const dir = repo();
  assert.deepEqual(inspectVersion(dir).problems, []);
  touchSrc(dir);
  touchSrc(dir, 'another fix');
  assert.deepEqual(inspectVersion(dir).problems, [], 'must stay green across later commits');
});

test('a version that is not committed is refused', () => {
  const dir = repo();
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version: '0.4.0' }, null, 2)}\n`);
  const { problems } = inspectVersion(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /committed package\.json says 0\.3\.0/);
});

test('a tag whose commit carried another version is refused', () => {
  const dir = repo({ version: '0.2.0' });
  git(dir, 'tag', 'v0.3.0');
  const { problems } = inspectVersion(dir);
  assert.ok(
    problems.some((p) => /Tag v0\.3\.0 points at a commit whose package\.json says 0\.2\.0/.test(p)),
    `expected the tag-mismatch problem, got: ${problems.join(' / ')}`
  );
});

test('a tag ahead of package.json is refused', () => {
  const dir = repo({ version: '0.3.0' });
  git(dir, 'tag', 'v0.3.0');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version: '0.2.0' }, null, 2)}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'downgrade');
  const { problems } = inspectVersion(dir);
  assert.ok(
    problems.some((p) => /Tag v0\.3\.0 is ahead of package\.json's 0\.2\.0/.test(p)),
    `expected the ahead-of-version problem, got: ${problems.join(' / ')}`
  );
});

test('a matching tag behind the current version is fine', () => {
  const dir = repo({ version: '0.2.0' });
  git(dir, 'tag', 'v0.2.0');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version: '0.3.0' }, null, 2)}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'bump');
  assert.deepEqual(inspectVersion(dir).problems, []);
});

test('the version npm already serves is refused instead of crashing npm', () => {
  const dir = repo({ version: '0.3.0' });
  const { problems } = inspectVersion(dir, { published: '0.3.0' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Version not changed/);
});

test('a version behind the published one is refused', () => {
  const dir = repo({ version: '0.3.0' });
  const { problems } = inspectVersion(dir, { published: '0.4.0' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /cannot go backwards/);
});

test('a published version far ahead compares numerically, not as text', () => {
  const dir = repo({ version: '0.3.10' });
  assert.deepEqual(inspectVersion(dir, { published: '0.3.9' }).problems, [], '0.3.10 is newer than 0.3.9');
  assert.equal(inspectVersion(dir, { published: '0.3.100' }).problems.length, 1);
});

test('a shallow clone fails loudly instead of passing while measuring nothing', () => {
  // The measurement that shaped this rule: actions/checkout's default depth-1
  // clone of this repo reported zero tags and claimed HEAD introduced the version
  // string, so every history rule would have been green and wrong.
  const source = repo({ version: '0.3.0' });
  git(source, 'tag', 'v0.2.0');
  const shallow = mkdtempSync(join(tmpdir(), 'transmute-shallow-'));
  const target = join(shallow, 'clone');
  execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${source}`, target]);
  const { problems, shallow: isShallowClone } = inspectVersion(target);
  assert.equal(isShallowClone, true, 'the clone should be detected as shallow');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /fetch-depth: 0/);
});

test('the drift report names the commit that changed src/, not HEAD', () => {
  const dir = repo();
  touchSrc(dir, 'the real change');
  assert.match(lastSrcChange(dir), /the real change/);
  writeFileSync(join(dir, 'README.md'), 'not src/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'a later commit that never touches src/');
  assert.match(lastSrcChange(dir), /the real change/, 'must not report the newest commit as the src/ change');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
