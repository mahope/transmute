#!/usr/bin/env node
// What must be true before site/ may be published, and the one command that
// publishes it.
//
// On 2026-09-27 the site had not been deployed since 3d90812 (2026-09-24
// 23:32:50 +0200), and the reason was in this repository's own history:
// 28a06dd ("Fjern push-triggeret site-deploy") deleted
// .github/workflows/deploy-site.yml — the only thing that had ever published
// site/ — and left nothing behind. Five site commits on main, including the
// support and buy page, never reached transmute.run; /support/ answered 404
// while /cheatsheet/ answered 200, so the site was serving, just three days
// stale. Thirty-six iterations then treated that as a reason to stop merging
// rather than as the outage it was.
//
// So the deploy path lives here, not in a workflow: tools/verify_workflows.mjs
// bans outward deploys from .github/workflows under every trigger, and that
// rule is deliberate. A human running one command is not a workflow firing
// itself, and the guard below makes that command safe to run:
//
//   1. HEAD must be the default branch, so a branch is never published by
//      accident — the opposite of the measured release bug, where a tag on an
//      unmerged branch reached npm.
//   2. The working tree must be clean, so what is published is a commit and not
//      a laptop.
//   3. site/ must exist.
//   4. CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be in the
//      environment. They are never read from a file in the repository, so
//      there is nothing here to leak and nothing to commit.
//
// The Pages project name is derived from the locked site_url instead of being a
// second constant to keep in step: transmute.run -> transmute-run. If the
// domain changes, the deploy follows it in the same commit.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** The Cloudflare Pages project a site_url belongs to: transmute.run -> transmute-run. */
export function pagesProject(siteUrl) {
  const host = new URL(siteUrl).hostname;
  return host.replace(/\./g, '-');
}

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

const gitOk = (repo, ...args) => {
  try {
    execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** main, as git itself names it — not a hardcoded branch name. */
export function defaultBranch(repo = repoRoot) {
  const head = (() => {
    try {
      return git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
    } catch {
      return '';
    }
  })();
  return head.replace(/^origin\//, '') || 'main';
}

/**
 * The site's own address, never written out here. The contract pins it when it
 * has a site_url; before it did, the page's own canonical link was the only
 * place the address existed, and reading it from there keeps one source for it
 * in both revisions instead of a constant that only one of them has.
 */
export function siteUrl(repo = repoRoot) {
  try {
    const contract = JSON.parse(readFileSync(join(repo, 'tools/product-contract.json'), 'utf8'));
    if (contract.site_url) {
      return contract.site_url;
    }
  } catch {
    // No contract, or no site_url in it: fall through to the page.
  }

  try {
    const canonical = readFileSync(join(repo, 'site/index.html'), 'utf8')
      .match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    return canonical?.[1] ?? '';
  } catch {
    return '';
  }
}

/**
 * @returns {{branch: string, commit: string, project: string, problems: string[]}}
 *          every reason this deploy must not happen, in the order a reader
 *          meets them.
 */
export function inspectDeploy(repo = repoRoot, env = process.env) {
  const problems = [];
  const branch = gitOk(repo, 'symbolic-ref', '--quiet', '--short', 'HEAD')
    ? git(repo, 'symbolic-ref', '--short', 'HEAD')
    : '';
  const commit = gitOk(repo, 'rev-parse', '--short', 'HEAD') ? git(repo, 'rev-parse', '--short', 'HEAD') : '';
  const main = defaultBranch(repo);

  if (branch !== main) {
    problems.push(
      `HEAD is on ${branch || 'no branch'}, not ${main}. Publishing a branch publishes something ${main} has never held, which is the bug that put v0.3.1 on a branch in tools/release_guard.mjs. Check out ${main} and pull first.`,
    );
  }

  if (!siteUrl(repo)) {
    problems.push('Neither tools/product-contract.json nor site/index.html names the site address, so there is nothing to check the deploy against.');
  }

  if (!existsSync(`${repo}/site`)) {
    problems.push('site/ does not exist, so there is nothing to publish. Run this in a clone of the repository.');
  }

  // Read raw, not through git(): that helper trims, and porcelain's two status
  // columns are followed by the path, so trimming silently eats the column that
  // says whether the file is modified or untracked — and the message then names
  // a path one character short of the real one.
  let status = '';
  try {
    status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
  } catch {
    status = '';
  }
  status = status.replace(/\n$/, '');
  if (status) {
    const files = status.split('\n').slice(0, 5).map(line => `  ${line.slice(3)}`).join('\n');
    const more = status.split('\n').length > 5 ? `\n  … and ${status.split('\n').length - 5} more` : '';
    problems.push(`The working tree is not clean, so this would publish a laptop and not a commit:\n${files}${more}\nCommit it, or stash it, and run this again.`);
  }

  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!env[name]) {
      problems.push(`${name} is not set. This script never reads a credential from a file in the repository, so export it in your shell first.`);
    }
  }

  const url = siteUrl(repo);

  return { branch, commit, url, project: url ? pagesProject(url) : '', problems };
}

/**
 * Prove the live site now serves what is on disk. A 200 proves nothing — these
 * pages have answered 200 while serving three-day-old files — so this compares
 * bytes, the same way npm run check:deploy does, and it works on a clone of
 * main where that script does not exist yet.
 */
export async function verifyPublished(localRoot, liveUrl, paths) {
  const stale = [];

  for (const path of paths) {
    let local;

    try {
      local = readFileSync(join(localRoot, path));
    } catch {
      stale.push(`${path}: not in site/`);
      continue;
    }

    let live;

    try {
      const response = await fetch(new URL(path, liveUrl), { redirect: 'follow' });
      if (!response.ok) {
        stale.push(`${path}: HTTP ${response.status}`);
        continue;
      }
      live = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      stale.push(`${path}: ${error.message}`);
      continue;
    }

    if (!local.equals(live)) {
      stale.push(`${path}: live is ${live.length} bytes, site/ has ${local.length}`);
    }
  }

  return stale;
}

const PROBE = ['index.html', 'cheatsheet/index.html', 'support/index.html'];

async function main() {
  const state = inspectDeploy();

  if (state.problems.length > 0) {
    console.error('Refusing to publish site/.');
    for (const problem of state.problems) {
      console.error(`\n  ${problem}`);
    }
    console.error('');
    return 1;
  }

  console.log(`Publishing site/ from ${state.branch}@${state.commit} to the Pages project ${state.project}.`);

  const deploy = spawnSync('npx', ['--yes', 'wrangler@latest', 'pages', 'deploy', 'site', '--project-name', state.project, '--branch', defaultBranch()], { stdio: 'inherit' });
  if (deploy.status !== 0) {
    return deploy.status ?? 1;
  }

  console.log('\nNow proving the live site actually changed — a 200 on its own does not.');
  const stale = await verifyPublished(join(repoRoot, 'site'), siteUrl(), PROBE);

  if (stale.length > 0) {
    console.error(`\nDEPLOY-MISSING. ${siteUrl()} does not serve what site/ holds:`);
    for (const line of stale) {
      console.error(`  ${line}`);
    }
    return 1;
  }

  console.log(`DEPLOY OK. ${siteUrl()} serves ${PROBE.length} files byte for byte from site/.`);
  return 0;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exit(await main());
}
