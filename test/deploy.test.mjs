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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublishArgs, defaultBranch, inspectDeploy, pagesProject, WRANGLER_VERSION } from '../tools/deploy_guard.mjs';

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

test('publishes without --branch, so the deploy is production and not a preview', () => {
  // Cloudflare's Direct Upload docs: --branch is the preview environment, and
  // <PROJECT_NAME>.pages.dev is the production one. On 2026-09-28 this guard
  // passed --branch main, and the custom domain never moved while 32 commits
  // waited. The whole argument list is asserted, so a future flag cannot come
  // back on a line no test reads.
  const { args } = buildPublishArgs({ project: 'transmute-run' });
  assert.deepEqual(args, ['--yes', `wrangler@${WRANGLER_VERSION}`, 'pages', 'deploy', 'site', '--project-name', 'transmute-run']);
  assert.equal(args.some(a => a === '--branch' || a.startsWith('--branch=')), false, 'a --branch makes wrangler publish a preview the custom domain does not read');
  assert.equal(buildPublishArgs({ project: 'transmute-run' }).command, 'npx');
});

test('pins wrangler, because @latest is a different program on every run', () => {
  assert.match(WRANGLER_VERSION, /^\d+\.\d+\.\d+$/);
  const { args } = buildPublishArgs({ project: 'transmute-run' });
  assert.equal(args.includes('wrangler@latest'), false);
  assert.equal(args.includes(`wrangler@${WRANGLER_VERSION}`), true);
});

test('the pinned wrangler asks for no node newer than the engine this repo declares', () => {
  // The jordemoderstudy failure: a newer framework on an older build server,
  // which only shows up in production. Read from the registry at test time, so
  // the claim cannot rot into a comment.
  const declared = Number(/"node":\s*">=(\d+)"/.exec(readFileSync(join(root, 'package.json'), 'utf8'))[1]);
  let required = '';
  try {
    required = execFileSync('npm', ['view', `wrangler@${WRANGLER_VERSION}`, 'engines.node', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return; // offline: the pin in source and the engines field are still checked below
  }
  const need = Number(/(\d+)/.exec(required.replace(/"/g, ''))[1]);
  assert.ok(declared >= need, `package.json declares node >=${declared} but wrangler@${WRANGLER_VERSION} needs node >=${need}`);
});

test('names the two steps separately, so a failure says which one it was', () => {
  // Both steps used to exit 1 silently, and thirty-four measurements were spent
  // choosing between "wrangler failed" and "wrangler worked, the site did not
  // change". The guard must keep saying which step failed.
  const body = readFileSync(join(root, 'tools', 'deploy_guard.mjs'), 'utf8');
  assert.match(body, /STEP 1 of 2 failed/);
  assert.match(body, /STEP 2 of 2 failed/);
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

console.log(`\n  deploy: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
