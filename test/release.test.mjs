/**
 * Release tests: the real scripts/release.mjs, in real temporary git repos, with
 * a real local remote to push to.
 *
 * The remote is a bare repository in the temp directory, so a passing test really
 * does push a tag and the assertions really can read it back. Nothing here
 * touches this repository, the network or npm.
 *
 * Covers the three promises tools/release_guard.mjs makes after they were
 * measured missing on 2026-09-26: a release from an unmerged branch is refused,
 * a release whose version no longer describes src/ is refused, and the version
 * already committed can be released as it is instead of crashing npm.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultBranch, inspectRelease } from '../tools/release_guard.mjs';

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

/**
 * A working repo on main with a bare origin, holding this repo's release
 * scripts. `version` is written as package.json's version.
 */
function repo({ version = '0.3.0', withSrc = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-release-'));
  const remote = join(dir, 'remote.git');
  const work = join(dir, 'work');

  git(dir, 'init', '--quiet', '--bare', remote);
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools'), { recursive: true });
  for (const file of ['scripts/release.mjs', 'tools/release_guard.mjs', 'tools/release_drift.mjs']) {
    cpSync(join(root, file), join(work, file));
  }
  if (withSrc) {
    mkdirSync(join(work, 'src'));
    writeFileSync(join(work, 'src', 'engine.js'), 'export const version = 1;\n');
  }
  writeFileSync(join(work, 'package.json'), `${JSON.stringify({ name: 'x', version, scripts: {} }, null, 2)}\n`);

  git(work, 'init', '--quiet', '--initial-branch=main');
  git(work, 'add', '-A');
  git(work, 'commit', '--quiet', '-m', 'Udgiv v0.0.1');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '--quiet', '-u', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');

  return { dir, work, remote, release: (...args) => spawnSync(process.execPath, ['scripts/release.mjs', ...args], { cwd: work, encoding: 'utf8' }) };
}

const tags = (repoPath) => {
  const out = git(repoPath, 'tag');
  return out ? out.split('\n') : [];
};

const version = (work) => JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version;

test('refuses a release from a branch that is not merged into main', () => {
  const r = repo();
  git(r.work, 'checkout', '--quiet', '-b', 'ceo/feature');
  writeFileSync(join(r.work, 'src', 'engine.js'), 'export const version = 2;\n');
  git(r.work, 'commit', '--quiet', '-am', 'Feature');

  const result = r.release('patch');
  assert.equal(result.status, 1, `expected a refusal, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /is not on origin\/main/);
  assert.deepEqual(tags(r.work), [], 'no tag may exist after a refusal');
  assert.equal(version(r.work), '0.3.0', 'the version must not be bumped by a refusal');
});

test('refuses a release whose version no longer describes src/', () => {
  const r = repo();
  writeFileSync(join(r.work, 'src', 'engine.js'), 'export const version = 2;\n');
  git(r.work, 'commit', '--quiet', '-am', 'Ret noget i src');

  const result = r.release('0.3.1');
  assert.equal(result.status, 1, `expected a refusal, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /src\/ has changed in 1 commit/);
  assert.deepEqual(tags(r.work), []);
  assert.equal(version(r.work), '0.3.0');
});

test('releases the version already committed instead of crashing npm', () => {
  const r = repo();

  const result = r.release('0.3.0');
  assert.equal(result.status, 0, `expected a release, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /already 0\.3\.0/);
  assert.equal(version(r.work), '0.3.0');
  assert.deepEqual(tags(r.work), ['v0.3.0']);
  assert.deepEqual(tags(r.remote), ['v0.3.0'], 'the tag must reach the remote, or CI never publishes');
});

test('bumps, tags and pushes for a version that does not exist yet', () => {
  const r = repo();

  const result = r.release('patch');
  assert.equal(result.status, 0, `expected a release, got:\n${result.stdout}${result.stderr}`);
  assert.equal(version(r.work), '0.3.1');
  assert.deepEqual(tags(r.remote), ['v0.3.1']);
});

test('refuses a dirty working tree', () => {
  const r = repo();
  writeFileSync(join(r.work, 'src', 'engine.js'), 'export const version = 3;\n');

  const result = r.release('patch');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /working tree is dirty/i);
  assert.deepEqual(tags(r.work), []);
});

test('refuses an argument that is not a version', () => {
  const r = repo();
  const result = r.release('yolo');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: npm run release/);
  assert.deepEqual(tags(r.work), []);
});

test('inspectRelease answers without running the release', () => {
  const r = repo();
  const before = inspectRelease(r.work, 'patch');
  assert.deepEqual(before.problems, [], before.problems.join('; '));
  assert.equal(before.needsBump, true);

  const same = inspectRelease(r.work, '0.3.0');
  assert.equal(same.needsBump, false);
  assert.deepEqual(tags(r.work), [], 'asking must not tag anything');

  git(r.work, 'checkout', '--quiet', '-b', 'ceo/other');
  writeFileSync(join(r.work, 'README.md'), '# andet arbejde\n');
  git(r.work, 'add', 'README.md');
  git(r.work, 'commit', '--quiet', '-m', 'Andet arbejde');
  const unmerged = inspectRelease(r.work, 'patch');
  assert.equal(unmerged.problems.length, 2, unmerged.problems.join('; '));
  assert.match(unmerged.problems[0], /is not on origin\/main/);
});

test('defaultBranch is what the remote says, not a hardcoded name', () => {
  const r = repo();
  assert.equal(defaultBranch(r.work), 'main');
  git(r.remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  assert.equal(defaultBranch(r.work), 'main');
});

test('a repo with no committed version is drift, not a crash', () => {
  const r = repo({ withSrc: false });
  mkdirSync(join(r.work, 'src'));
  writeFileSync(join(r.work, 'src', 'engine.js'), 'export const version = 1;\n');
  git(r.work, 'add', '-A');
  git(r.work, 'commit', '--quiet', '-m', 'Tilføj src efter versionsskrivningen');
  git(r.work, 'push', '--quiet', 'origin', 'main');

  const seen = inspectRelease(r.work, 'patch');
  assert.match(seen.problems.join('\n'), /src\/ has changed in 1 commit/);
  assert.ok(!seen.problems.join('\n').includes('origin/main'), `a pushed main must pass the branch rule, so the only reason left is drift: ${seen.problems.join('; ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
