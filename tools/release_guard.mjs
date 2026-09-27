#!/usr/bin/env node
// What must be true before a version may be published, and why each thing is
// checked rather than assumed.
//
// On 2026-09-26 three of these were not true, and all three were measured on the
// real release script in a throwaway clone of this repo:
//
//   1. `node scripts/release.mjs 0.3.1` on branch ceo/published-version-lies —
//      a branch that is not on main — created commit "Udgiv v0.3.1" and tag
//      v0.3.1 on that branch, and only stopped because the clone had no remote.
//      publish.yml accepted it: its only guard compares the tag with
//      package.json, so npm would have received a version main never contained.
//   2. `node scripts/release.mjs 0.3.0` — the command IMPLEMENTATION_PLAN.md
//      tells Mads to run for the version this repo already carries — died in a
//      raw execSync stack trace, because npm answers "Version not changed".
//   3. Nothing ever asked whether package.json's version still described src/,
//      which is how 39 commits of fixes reached no user behind the version
//      0.2.1 (see tools/release_drift.mjs).
//
// The rules live here, not in scripts/release.mjs, because the release script
// must be able to answer "would this release be refused?" without running it —
// test/release.test.mjs calls this module against real temporary git repos.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureDrift } from './release_drift.mjs';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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
 * @returns {{version: string, requested: string, needsBump: boolean,
 *            problems: string[]}} every reason this release must not happen.
 */
export function inspectRelease(repo = repoRoot, requested) {
  const { version, drifted } = measureDrift(repo);
  const problems = [];

  if (git(repo, 'status', '--porcelain').trim()) {
    problems.push('The working tree is dirty; commit or stash first.');
  }

  // A tag is a promise about a released tree. If the tree is not on the default
  // branch, npm gets a version that the repository's own front page does not
  // have, and npm versions cannot be taken back.
  const branch = defaultBranch(repo);
  if (!gitOk(repo, 'merge-base', '--is-ancestor', 'HEAD', `origin/${branch}`)) {
    const current = (() => {
      try {
        return git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
      } catch {
        return 'HEAD';
      }
    })();
    problems.push(
      `HEAD (${current}) is not on origin/${branch}; publishing now would put a version on npm that ${branch} does not contain.`,
      `Push it to ${branch} (or merge it there) first, then release from there.`
    );
  }

  if (drifted.length > 0) {
    problems.push(
      `package.json still says ${version}, but src/ has changed in ${drifted.length} commit(s) since.`,
      `Anyone installing ${version} from npm gets older code than this tree. Run npm run check:release, then release a version that describes src/.`
    );
  }

  // `npm version 0.3.0` when package.json already says 0.3.0 is an npm error,
  // not a no-op. When the requested version is the committed one, the release
  // is a tag, not a bump — which is the case after a hand-written bump and the
  // one this repo is in right now.
  const needsBump = !/^\d+\.\d+\.\d+$/.test(requested) || requested !== version;

  return { version, requested, needsBump, problems };
}
