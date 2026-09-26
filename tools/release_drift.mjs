#!/usr/bin/env node
// Fails when package.json's version is older than the code that ships with it.
//
// On 2026-09-26 this repo's version said 0.2.1, npm's latest was also 0.2.1 —
// and the two were not the same code: 0.2.1 was published on 2026-09-07, before
// every fix in src/ since. `transmute --version` and the site's
// softwareVersion therefore named a release that does not contain the program
// they belong to, and the three claims agreed with each other, so
// tools/verify_contract.mjs passed. The version bump is the release script's
// job (scripts/release.mjs), so this is what catches the bump being skipped.
//
// Deliberately not part of `npm test`: between the bump and the release it
// describes, src/ moves again and this is expected to fail. Run it in the
// release checklist, not in the loop's gate.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

export const describeCommit = (repo, sha) =>
  git(repo, 'log', '-1', '--format=%h %ad %s', '--date=short', sha);

/**
 * The one implementation of the drift rule, so the release script and this
 * report can never disagree about it.
 */
export function measureDrift(repo = root) {
  const pkg = JSON.parse(readFileSync(`${repo}/package.json`, 'utf8'));
  const version = pkg.version;

  // The commit that last put this exact version string into package.json. Empty
  // when the version has never been committed — which is the state this script
  // exists to report, so it is not an error here.
  const bump = git(repo, 'log', '-1', '--format=%H', '-S', `"version": "${version}"`, '--', 'package.json');
  const drifted = bump
    ? git(repo, 'log', '--format=%H', `${bump}..HEAD`, '--', 'src/').split('\n').filter(Boolean)
    : [];

  return { version, bump, drifted };
}

function report(repo = root) {
  const { version, bump, drifted } = measureDrift(repo);
  const line = (sha) => describeCommit(repo, sha);

  console.log(`version in package.json: ${version}`);
  console.log(bump ? `version claimed by:      ${line(bump)}` : 'version claimed by:      never committed');
  console.log(`last change to src/:    ${line('HEAD')}`);
  console.log(`commits touching src/ since the version was claimed: ${drifted.length}`);

  if (drifted.length === 0) {
    console.log(`OK: ${version} describes the code in src/.`);
    return 0;
  }

  console.log('');
  console.log(`DRIFT: src/ has changed in ${drifted.length} commit(s) that ${version} does not describe.`);
  console.log('Anyone installing this version from npm gets older code than this tree.');
  console.log('Fix: bump the version and publish — npm run release -- <version>');
  return 1;
}

// Imported by tools/release_guard.mjs, which needs the measurement and not the
// report — so the report only runs when this file is the one being executed.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(report());
}

export { report };
