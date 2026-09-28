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
//
// On 2026-09-28 the command still had not published 32 commits, and the reason
// it could not be found from here was that main() returned wrangler's exit code
// bare, so "wrangler failed" and "wrangler succeeded and the site did not
// change" were the same 1. Thirty-four measurements had been spent choosing
// between two causes the output never distinguished. So the two steps now say
// which one they are, and buildPublishArgs is exported and tested like the rest
// of the guard.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** The Cloudflare Pages project a site_url belongs to: transmute.run -> transmute-run. */
export function pagesProject(siteUrl) {
  const host = new URL(siteUrl).hostname;
  return host.replace(/\./g, '-');
}

/**
 * Pinned, because this is the one command that publishes the site and
 * `wrangler@latest` is a different program on every run. Its own engines field
 * asks for node >=22, which is exactly what package.json declares, so the pin
 * cannot outrun the declared runtime — the jordemoderstudy failure, where a
 * newer framework met an older build server and only showed it in production.
 * Bump it deliberately, and read the changelog while doing it.
 */
export const WRANGLER_VERSION = '4.143.0';

/**
 * The arguments that publish site/.
 *
 * There is deliberately no `--branch`. Cloudflare's own docs for Direct Upload
 * are explicit about the difference: `npx wrangler pages deploy <BUILD_OUTPUT_DIRECTORY>`
 * makes the *production* deployment, served at `<PROJECT_NAME>.pages.dev`, and
 * "to deploy assets to a preview environment, run: npx wrangler pages deploy
 * <OUTPUT_DIRECTORY> --branch=<BRANCH_NAME>", whose alias is
 * `<BRANCH_NAME>.<PROJECT_NAME>.pages.dev`.
 *
 * This guard passed `--branch main`, so every run asked for a preview while the
 * custom domain follows production. Measured on 2026-09-28: transmute-run.pages.dev
 * — the documented production host — served the same bytes as transmute.run, and
 * both were 32 commits stale.
 *
 * @returns {{command: string, args: string[]}}
 */
export function buildPublishArgs(state) {
  return {
    command: 'npx',
    args: ['--yes', `wrangler@${WRANGLER_VERSION}`, 'pages', 'deploy', 'site', '--project-name', state.project],
  };
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

export function siteUrl(repo = repoRoot) {
  return JSON.parse(readFileSync(`${repo}/tools/product-contract.json`, 'utf8')).site_url;
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

  return { branch, commit, project: pagesProject(siteUrl(repo)), problems };
}

function main() {
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

  // Two steps, and for thirty-four measurements they exited 1 the same way, so
  // nobody could tell which one had failed. Each now names itself, because the
  // answer decides what a human does next: a wrangler failure is a token, a
  // project name or a network problem, and a freshness failure after a
  // successful upload is the Pages production branch not being this branch.
  const { command, args } = buildPublishArgs(state);
  const deploy = spawnSync(command, args, { stdio: 'inherit' });
  if (deploy.status !== 0) {
    console.error(
      `\nSTEP 1 of 2 failed: wrangler did not publish site/ (exit ${deploy.status ?? 'none'}).\n` +
        'Nothing was uploaded, so live is unchanged and this is a wrangler problem:\n' +
        'a rejected CLOUDFLARE_API_TOKEN, a wrong account, or no project named\n' +
        `${state.project}. The lines wrangler printed above are the answer.`,
    );
    return deploy.status ?? 1;
  }

  console.log('\nNow proving the live site actually changed — a 200 on its own does not.');
  // The freshness check is npm run check:deploy's command, not a second copy of
  // it: two spellings of one check is how the site address drifted out of five
  // tools in the first place (see tools/verify_contract.mjs).
  const check = spawnSync('npm', ['run', 'check:deploy'], { stdio: 'inherit' });
  if (check.status !== 0) {
    console.error(
      '\nSTEP 2 of 2 failed: wrangler reported success, but the live site did not\n' +
        'change. The upload went somewhere transmute.run does not read from, so the\n' +
        `Pages project ${state.project} publishes a branch other than ${state.branch}.\n` +
        'Set the production branch in the Cloudflare dashboard, or with\n' +
        `  curl --request PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/${state.project}" \\\n` +
        '    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --header "Content-Type: application/json" \\\n' +
        `    --data '{"production_branch": "${state.branch}"}'\n` +
        'and run this again. Do not raise a tag or a release: the site is not published from either.',
    );
    return check.status ?? 1;
  }
  console.log(`\nPublished and verified: transmute.run now serves ${state.branch}@${state.commit}.`);
  return 0;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exit(main());
}
