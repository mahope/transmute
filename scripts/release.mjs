#!/usr/bin/env node
// Usage: npm run release -- patch|minor|major|<x.y.z>
//
// Checks the three things that must be true before a version may be published —
// clean tree, HEAD merged into the default branch, and a version that still
// describes src/ — then bumps, commits, tags vX.Y.Z and pushes. CI publishes to
// npm and creates the GitHub release. The rules and why they exist live in
// tools/release_guard.mjs.
import { execSync } from 'node:child_process';
import { inspectRelease, repoRoot } from '../tools/release_guard.mjs';

const bump = process.argv[2];
if (!/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(bump ?? '')) {
  console.error('Usage: npm run release -- patch|minor|major|<x.y.z>');
  process.exit(1);
}

const { version, needsBump, problems } = inspectRelease(repoRoot, bump);
if (problems.length > 0) {
  console.error(`Refusing to release ${bump}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: repoRoot });
if (needsBump) {
  run(`npm version ${bump} -m "Udgiv v%s"`);
} else {
  console.log(`package.json is already ${version}; tagging it as it is.`);
  run(`git tag -a v${version} -m "Udgiv v${version}"`);
}
run('git push --follow-tags');
