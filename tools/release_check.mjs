#!/usr/bin/env node
// Can this version be published at all? The rules that stay true between a bump
// and the release it describes, so they can live in the gate.
//
// This is the other half of tools/release_drift.mjs, and the split is the point.
// Drift asks "does the number still describe src/?" — which is false again the
// moment a fix lands, so it belongs on the release checklist, not in CI. The
// rules here ask questions whose answers do not change between bump and release:
// is the version committed, is any tag ahead of it or lying about it, and has npm
// already got this number. All three stay green across any number of later
// commits, so CI can hold them on every commit.
//
// Measured 2026-09-26, on this repo, before these rules were written:
//
//   1. `git log -S '"version": "0.3.0"' -- package.json` answers correctly in a
//      full clone, and answers *wrongly* in the clone CI makes. With
//      `actions/checkout`'s default `fetch-depth: 1` a depth-1 clone of this repo
//      reported that HEAD introduced "0.3.0" — it did not; the bump is 07f9914,
//      one commit further back — and reported zero tags, when the repo has three.
//      Every history-based rule would therefore have been green while measuring
//      nothing. So a shallow repository is a hard failure here, never a skip, and
//      ci.yml checks out with `fetch-depth: 0` for the same reason publish.yml
//      already does.
//   2. `git rev-parse --is-shallow-repository` is the check that distinguishes the
//      two, and it is what makes rule 1's answer trustworthy.
//
// The registry rule (4) needs the network, so it is opt-in: `npm test` runs the
// offline rules, and CI adds `--published` where the registry is reachable.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

const isShallow = (repo) => git(repo, 'rev-parse', '--is-shallow-repository') === 'true';

/** Numeric form of `x.y.z`, so versions compare instead of sorting as text. */
const asNumber = (version) => {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return parts ? parts.slice(1).reduce((total, part) => total * 1000 + Number(part), 0) : null;
};

/** The version committed in a tree, or null when the file or field is not there. */
function committedVersion(repo, rev) {
  try {
    return JSON.parse(git(repo, 'show', `${rev}:package.json`)).version ?? null;
  } catch {
    return null;
  }
}

/** Every tag that claims to be a release, with the version its commit carried. */
function taggedVersions(repo) {
  return git(repo, 'tag', '--list')
    .split('\n')
    .filter(Boolean)
    .map((tag) => {
      const claimed = /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1] ?? null;
      let carried = null;
      try {
        carried = committedVersion(repo, `${tag}^{commit}`);
      } catch {
        carried = null;
      }
      return { tag, claimed, carried };
    });
}

/**
 * @param {string} repo
 * @param {{published?: string|null}} [options] `published` is the version npm
 *   already serves, when the caller knows it. Omit it to skip rule 4.
 * @returns {{version: string, problems: string[], tags: object[], shallow: boolean}}
 */
export function inspectVersion(repo = repoRoot, { published = null } = {}) {
  const version = JSON.parse(readFileSync(`${repo}/package.json`, 'utf8')).version;
  const shallow = isShallow(repo);
  const problems = [];
  const tags = [];

  // Rule 1. A version that is only in the working tree is a number the repository
  // does not contain, which is the same ground T53 measured a release being taken
  // on. Compared against HEAD's own package.json rather than `git log -S`, because
  // that is a question with one answer instead of a search with a shallow-history
  // false positive.
  const atHead = committedVersion(repo, 'HEAD');
  if (atHead !== version) {
    problems.push(
      `package.json says ${version}, but the committed package.json says ${atHead ?? 'nothing'}. ` +
        'Commit the bump: a release publishes the committed tree.'
    );
  }

  // Rule 2. The measurement, not an assumption: without history these rules read
  // an empty repo and pass. Failing loudly is the only honest option — the
  // alternative is a green gate that measured nothing, which is the failure mode
  // this repo's plan keeps finding.
  if (shallow) {
    problems.push(
      'This repository is a shallow clone, so tags and committed versions cannot be read. ' +
        'Check out with fetch-depth: 0 (ci.yml and publish.yml do) before trusting this check.'
    );
    return { version, problems, tags, shallow };
  }

  // Rule 3. A tag is a promise about a released tree: it must match the version
  // that tree carried, and it must not be ahead of the version now in package.json,
  // because npm numbers cannot be taken back.
  for (const { tag, claimed, carried } of taggedVersions(repo)) {
    tags.push({ tag, claimed, carried });
    if (!claimed) {
      problems.push(`Tag ${tag} is not a v<major>.<minor>.<patch> release, so nothing can check it.`);
      continue;
    }
    if (carried !== claimed) {
      problems.push(
        `Tag ${tag} points at a commit whose package.json says ${carried ?? 'no version'}. ` +
          'A tag has to name the version it released.'
      );
    }
    const ahead = asNumber(claimed) !== null && asNumber(version) !== null && asNumber(claimed) > asNumber(version);
    if (ahead) {
      problems.push(
        `Tag ${tag} is ahead of package.json's ${version}. Publishing ${version} would put npm ` +
          'behind a version this repository has already released.'
      );
    }
  }

  // Rule 4. `npm version 0.3.0` when npm already has 0.3.0 is an npm error, not a
  // no-op — measured in T53 as a raw execSync stack trace.
  if (published !== null && published !== undefined) {
    if (asNumber(published) === asNumber(version)) {
      problems.push(
        `npm already serves ${version}. Publishing it again fails with "Version not changed"; ` +
          'bump the version before releasing again.'
      );
    } else if (asNumber(published) !== null && asNumber(version) !== null && asNumber(version) < asNumber(published)) {
      problems.push(
        `package.json says ${version}, but npm already serves ${published}. The version cannot go ` +
          'backwards: users on ' + published + ' would be moved to older code.'
      );
    }
  }

  return { version, problems, tags, shallow };
}

export function report(repo = repoRoot, { published = null } = {}) {
  const { version, problems, tags, shallow } = inspectVersion(repo, { published });

  console.log(`version in package.json:  ${version}`);
  console.log(`version committed at HEAD: ${committedVersion(repo, 'HEAD') ?? '(none)'}`);
  console.log(`tags in this repository:   ${tags.length ? tags.map((t) => t.tag).join(' ') : 'none'}`);
  if (published !== null && published !== undefined) console.log(`version npm already serves: ${published}`);
  if (shallow) console.log('repository history:        SHALLOW — tag and version rules cannot be read');

  if (problems.length === 0) {
    console.log(`OK: ${version} can be published; npm run release -- ${version} is not blocked by this check.`);
    console.log('This says nothing about whether the number describes src/ — npm run check:release does.');
    return 0;
  }

  console.log('');
  for (const problem of problems) console.log(`NOT RELEASABLE: ${problem}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const withRegistry = process.argv.includes('--published');
  let published = null;
  if (withRegistry) {
    try {
      published = execFileSync('npm', ['view', JSON.parse(readFileSync(`${repoRoot}/package.json`, 'utf8')).name, 'version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      console.log('SKIPPED: the npm registry could not be reached, so the published version was not compared.');
    }
  }
  process.exit(report(repoRoot, { published }));
}
