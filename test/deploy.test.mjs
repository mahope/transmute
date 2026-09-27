/**
 * Deploy tests: the real tools/deploy_guard.mjs, in real temporary git repos.
 *
 * Covers the four promises the guard makes, each measured missing on
 * 2026-09-27 when the site had not been published since 2026-09-24 and
 * .github/workflows/deploy-site.yml had been deleted three days earlier by
 * 28a06dd, leaving this repository with no way to publish itself at all.
 *
 * Nothing here touches this repository, the network, Cloudflare or npm: the
 * guard is asked whether it would publish, never asked to publish.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { defaultBranch, inspectDeploy, pagesProject, siteUrl, verifyPublished } from '../tools/deploy_guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;

const queue = [];

/** Tests run in order, one at a time, so a local port never collides. */
function test(name, fn) {
  queue.push(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (error) {
      failed++;
      console.error(`  ❌ ${name}: ${error.message}`);
    }
  });
}

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

/** A clone of this repository's shape: a remote, a default branch, site/, the contract. */
function scratch() {
  const repo = mkdtempSync(join(tmpdir(), 'transmute-deploy-'));
  const remote = join(repo, '..', `${repo.split('/').pop()}-remote.git`);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remote], { stdio: 'ignore' });

  git(repo, 'init', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'deploy@example.com');
  git(repo, 'config', 'user.name', 'Deploy Test');
  git(repo, 'remote', 'add', 'origin', remote);
  mkdirSync(join(repo, 'site'), { recursive: true });
  mkdirSync(join(repo, 'tools'), { recursive: true });
  writeFileSync(join(repo, 'site', 'index.html'), '<!doctype html><title>ok</title>');
  writeFileSync(join(repo, 'tools', 'product-contract.json'), JSON.stringify({ site_url: 'https://transmute.run' }));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'first');
  git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'remote', 'set-head', 'origin', 'main');

  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const CREDENTIALS = { CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'test-account' };

test('derives the Pages project from the locked site address', () => {
  assert.equal(pagesProject('https://transmute.run'), 'transmute-run');
  assert.equal(pagesProject('https://example.co.uk'), 'example-co-uk');
});

test('agrees on the default branch with git, not with a hardcoded name', () => {
  const { repo, cleanup } = scratch();
  try {
    assert.equal(defaultBranch(repo), 'main');
  } finally {
    cleanup();
  }
});

test('publishes a clean main without complaint', () => {
  const { repo, cleanup } = scratch();
  try {
    const state = inspectDeploy(repo, CREDENTIALS);
    assert.deepEqual(state.problems, [], state.problems.join('\n'));
    assert.equal(state.project, 'transmute-run');
  } finally {
    cleanup();
  }
});

test('refuses a branch, so a branch cannot be published by accident', () => {
  const { repo, cleanup } = scratch();
  try {
    git(repo, 'checkout', '-b', 'ceo/unmerged');
    const [problem] = inspectDeploy(repo, CREDENTIALS).problems;
    assert.match(problem, /not main/);
    assert.match(problem, /never held/);
  } finally {
    cleanup();
  }
});

test('refuses a dirty tree, and names the files that are not committed', () => {
  const { repo, cleanup } = scratch();
  try {
    writeFileSync(join(repo, 'site', 'index.html'), '<!doctype html><title>edited on a laptop</title>');
    const [problem] = inspectDeploy(repo, CREDENTIALS).problems;
    assert.match(problem, /not clean/);
    assert.match(problem, /site\/index\.html/);
  } finally {
    cleanup();
  }
});

test('refuses without credentials, and says which one is missing', () => {
  const { repo, cleanup } = scratch();
  try {
    const problems = inspectDeploy(repo, { CLOUDFLARE_API_TOKEN: 'test-token' }).problems;
    assert.equal(problems.length, 1);
    assert.match(problems[0], /CLOUDFLARE_ACCOUNT_ID is not set/);
  } finally {
    cleanup();
  }
});

test('refuses a repository with no site directory', () => {
  const { repo, cleanup } = scratch();
  try {
    rmSync(join(repo, 'site'), { recursive: true, force: true });
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', 'drop site');
    const [problem] = inspectDeploy(repo, CREDENTIALS).problems;
    assert.match(problem, /site\/ does not exist/);
  } finally {
    cleanup();
  }
});

test('collects every reason, not just the first', () => {
  const { repo, cleanup } = scratch();
  try {
    git(repo, 'checkout', '-b', 'ceo/unmerged');
    writeFileSync(join(repo, 'site', 'index.html'), 'edited');
    assert.equal(inspectDeploy(repo, {}).problems.length, 4);
  } finally {
    cleanup();
  }
});

test('names the commit it would publish', () => {
  const { repo, cleanup } = scratch();
  try {
    const state = inspectDeploy(repo, CREDENTIALS);
    assert.equal(state.commit, git(repo, 'rev-parse', '--short', 'HEAD'));
    assert.equal(state.branch, 'main');
  } finally {
    cleanup();
  }
});

test('no committed workflow names a Cloudflare credential', () => {
  // git grep exits 1 on no match, which is the answer this test wants. If a
  // workflow ever reads these names again, the deploy is one merge away from
  // firing itself — the shape 28a06dd deleted.
  let matched = '';
  try {
    matched = execFileSync('git', ['-C', root, 'grep', '-ril', '-e', 'CLOUDFLARE_API_TOKEN', '-e', 'CLOUDFLARE_ACCOUNT_ID', '--', '.github'], { encoding: 'utf8' });
  } catch (error) {
    matched = error.stdout ?? '';
  }
  assert.equal(String(matched).trim(), '', '.github/ names a Cloudflare credential, so a workflow could publish without a human');
});

test('reads the address from the contract when it pins one, and from the page when it does not', () => {
  const { repo, cleanup } = scratch();
  try {
    writeFileSync(join(repo, 'tools/product-contract.json'), JSON.stringify({ site_url: 'https://transmute.run' }));
    assert.equal(siteUrl(repo), 'https://transmute.run');

    writeFileSync(join(repo, 'tools/product-contract.json'), JSON.stringify({ amount: 19 }));
    writeFileSync(join(repo, 'site', 'index.html'), '<!doctype html><link rel="canonical" href="https://transmute.run/">');
    assert.equal(siteUrl(repo), 'https://transmute.run/');

    writeFileSync(join(repo, 'site', 'index.html'), '<!doctype html><title>no address here</title>');
    assert.equal(siteUrl(repo), '');
  } finally {
    cleanup();
  }
});

test('calls a live page stale when it is missing, not published or wrong', async () => {
  // A local server, so "the live site" is a real socket answering 200, 404 and
  // wrong bytes. These pages have answered 200 while serving three-day-old
  // files, which is why a status code is not a deploy check.
  const server = createServer((request, response) => {
    if (request.url === '/fresh') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<p>ny</p>');
      return;
    }
    if (request.url === '/gone') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<p>findes ikke lokalt</p>');
      return;
    }
    if (request.url === '/stale') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<p>gammel</p>');
      return;
    }
    response.writeHead(404);
    response.end('Not Found');
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const { repo, cleanup } = scratch();
  writeFileSync(join(repo, 'site', 'fresh'), '<p>ny</p>');
  writeFileSync(join(repo, 'site', 'stale'), '<p>ny</p>');

  try {
    assert.deepEqual(await verifyPublished(join(repo, 'site'), base, ['fresh']), []);
    assert.deepEqual(await verifyPublished(join(repo, 'site'), base, ['missing']), ['missing: not in site/']);
    assert.deepEqual(await verifyPublished(join(repo, 'site'), base, ['gone']), ['gone: not in site/']);
    assert.deepEqual(await verifyPublished(join(repo, 'site'), base, ['stale']), ['stale: live is 13 bytes, site/ has 9']);
  } finally {
    cleanup();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const run of queue) {
  await run();
}

console.log(`\n  deploy: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
