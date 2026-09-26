/**
 * Product contract check.
 *
 * The Stripe contract fixes Transmute Desktop Pro's commercial constants, and
 * this repository is the only public place where they are quoted. This script
 * keeps README, docs/ and the site from drifting away from that contract, and
 * keeps the claims they make verifiable: only the official Payment Link, no
 * price or machine count invented per page, no link to a private repository,
 * no reference to a workflow that does not exist, and one version for npm, the
 * CLI and the site.
 *
 * It is part of `npm test`. Fix tools/product-contract.json or the page, not
 * this script, when it fails — unless the contract itself changed, which is
 * Mads' decision and not the loop's.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The contract of record. Changing a value here requires Mads' decision. */
const LOCKED = {
  product_key: 'transmute-desktop',
  amount: 19,
  currency: 'USD',
  billing: 'one_time',
  machines: 3,
  payment_link: 'https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02',
  licence_api: 'https://mahope.tools/api/license/',
  licence_cache_days: 7,
  order_email: 'orders@mahoje.dk',
  donation_link: 'https://donate.stripe.com/7sYeVcbn50wieFM8gDbMQ0c',
};

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, en: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10 };
const COUNT = `(?:\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
const SECRET_PATTERN = /\b(?:sk|rk|pk|whsec)_[A-Za-z0-9]{8,}|\bBearer\s+[A-Za-z0-9._-]{12,}/;
const RECURRING_CLAIM = /\b(?:per month|monthly|per year|yearly|annually|subscription fee|per month or year)\b|\b(?:pr\. måned|månedlig|per år|årlig)\b/i;
/** Anything that promises a desktop build this repository does not publish. */
const PUBLIC_DOWNLOAD_CLAIM = /github\.com\/mahope\/transmute\/releases/i;
const DESKTOP_LABEL = /desktop[-\s]?app|desktopapp|macos,? windows/i;
const PRIVATE_REPO = /github\.com\/mahope\/(?:transmute-desktop|paid-products)|mahope\/(?:transmute-desktop|paid-products)\b/i;

const failures = [];
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collect(dir, extensions) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(path, extensions));
    } else if (extensions.some(extension => entry.name.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

function label(text) {
  return relative(root, text).split('\\').join('/');
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

const contract = JSON.parse(readFileSync(join(root, 'tools', 'product-contract.json'), 'utf8'));
const pro = contract.desktop_pro ?? {};
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Every public file that quotes a commercial claim. */
const claimed = [
  join(root, 'README.md'),
  ...collect(join(root, 'docs'), ['.md']),
  ...collect(join(root, 'site'), ['.html', '.txt']),
];

const failuresByFile = new Map();
function fail(file, message) {
  const list = failuresByFile.get(file) ?? [];
  list.push(message);
  failuresByFile.set(file, list);
}

console.log('\n📜 Transmute Product Contract\n');

check('product-contract.json states the locked commercial constants', () => {
  for (const [key, value] of Object.entries(LOCKED)) {
    const actual = key in contract ? contract[key] : pro[key];
    assert(actual === value, `${key} is ${JSON.stringify(actual)}, the contract says ${JSON.stringify(value)}`);
  }
  assert(pro.source_repository_private === true, 'desktop_pro.source_repository_private must be true: the desktop app is built from a private repository');
  assert(Number.isInteger(pro.free_tier_transformations_per_launch) && pro.free_tier_transformations_per_launch > 0, 'desktop_pro.free_tier_transformations_per_launch must be a positive number, so the free tier is stated in one place');
});

check('product-contract.json holds no secrets', () => {
  for (const file of [join(root, 'tools', 'product-contract.json')]) {
    const source = readFileSync(file, 'utf8');
    assert(SECRET_PATTERN.test(source) === false, 'the contract file looks like it contains a key');
  }
  for (const [key, value] of Object.entries({ ...contract, ...pro })) {
    if (typeof value === 'string' && /https?:/.test(value)) {
      assert(/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(value), `${key} is not a plain https url: ${value}`);
    }
  }
});

for (const file of claimed) {
  const text = readFileSync(file, 'utf8');
  const name = label(file);

  check(`${name}: quotes only the official Stripe links`, () => {
    for (const [url] of text.matchAll(/https:\/\/(?:buy|donate)\.stripe\.com\/[A-Za-z0-9]+/g)) {
      const allowed = [pro.payment_link, contract.donation_link];
      assert(allowed.includes(url), `unknown Stripe link ${url}`);
    }
  });

  check(`${name}: quotes the locked price`, () => {
    for (const [, amount] of text.matchAll(/(\d+)\s*(?:USD|US\$)\b/g)) {
      assert(Number(amount) === pro.amount, `price ${amount} ${pro.currency} does not match the contract (${pro.amount} ${pro.currency})`);
    }
    for (const [, amount, unit] of text.matchAll(/(\d+)\s*(EUR|DKK|kr\.?)\b/gi)) {
      assert(false, `hardcoded ${unit} price ${amount}: Stripe chooses the currency, so only ${pro.amount} ${pro.currency} is a product constant`);
    }
  });

  check(`${name}: quotes the locked machine count and free tier`, () => {
    for (const [, word, unit] of text.matchAll(new RegExp(`\\b(${COUNT})\\s+(machines|maskiner)\\b`, 'gi'))) {
      const count = NUMBER_WORDS[word.toLowerCase()] ?? Number(word);
      assert(count === pro.machines, `${word} ${unit} does not match the contract (${pro.machines} machines)`);
    }
    for (const [, word] of text.matchAll(new RegExp(`\\b(${COUNT})\\s+transformations? per launch\\b`, 'gi'))) {
      const count = NUMBER_WORDS[word.toLowerCase()] ?? Number(word);
      assert(count === pro.free_tier_transformations_per_launch, `free tier states ${word} transformations per launch, the contract says ${pro.free_tier_transformations_per_launch}`);
    }
    for (const [, word] of text.matchAll(new RegExp(`\\b(${COUNT})\\s+transformationer? pr\\. start\\b`, 'gi'))) {
      const count = NUMBER_WORDS[word.toLowerCase()] ?? Number(word);
      assert(count === pro.free_tier_transformations_per_launch, `free tier states ${word} transformationer pr. start, the contract says ${pro.free_tier_transformations_per_launch}`);
    }
  });

  check(`${name}: does not sell a subscription`, () => {
    const match = text.match(RECURRING_CLAIM);
    assert(match === null, `a recurring-billing claim slipped in: "${match?.[0]}"`);
  });

  check(`${name}: does not link the private repository`, () => {
    const match = text.match(PRIVATE_REPO);
    assert(match === null, `links a private repository: "${match?.[0]}"`);
  });

  if (file.endsWith('.md')) {
    check(`${name}: only badges for workflows that exist`, () => {
      for (const [, workflow] of text.matchAll(/workflows\/([A-Za-z0-9._-]+\.ya?ml)/g)) {
        const exists = existsSync(join(root, '.github', 'workflows', workflow));
        assert(exists, `references ${workflow}, which is not in .github/workflows/`);
      }
    });
  }

  if (file.endsWith('.html')) {
    check(`${name}: desktop links point at a page in this repository, not a build of a private one`, () => {
      for (const [, url, inner] of text.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        if (url.startsWith('#')) {
          continue;
        }
        const plain = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!DESKTOP_LABEL.test(plain)) {
          continue;
        }
        if (PUBLIC_DOWNLOAD_CLAIM.test(url)) {
          fail(file, `"${plain}" points at this repository's releases, which do not contain the desktop app`);
          continue;
        }
        const allowed = contract.allowed_desktop_link_targets;
        assert(allowed.includes(url), `"${plain}" points at ${url}, which is not one of ${allowed.join(', ')}`);
      }
    });
  }
}

check('npm, the CLI and the site agree on the version', () => {
  const version = packageJson.version;
  assert(/^\d+\.\d+\.\d+$/.test(version), `package.json version is not a release version: ${version}`);
  const pages = collect(join(root, 'site'), ['.html']);
  let seen = 0;
  for (const page of pages) {
    for (const [, claim] of readFileSync(page, 'utf8').matchAll(/"softwareVersion":\s*"([^"]+)"/g)) {
      seen += 1;
      assert(claim === version, `${label(page)} claims softwareVersion ${claim}, package.json is ${version}`);
    }
  }
  assert(seen > 0, 'no site page declares a softwareVersion, so the version check has nothing to compare');
  const cli = readFileSync(join(root, 'src', 'cli.js'), 'utf8');
  assert(cli.includes("require('../package.json')"), 'src/cli.js must read its version from package.json instead of hardcoding it');
  const contractVersion = /^\d+\.\d+\.\d+$/.test(String(contract.version ?? '')) ? contract.version : null;
  assert(contractVersion === null || contractVersion === version, `tools/product-contract.json pins version ${contractVersion}, package.json is ${version}`);
});

check('the desktop app is not built or published from this repository', () => {
  for (const path of ['desktop', 'src-tauri', 'Cargo.toml', 'Cargo.lock', 'tauri.conf.json']) {
    assert(!existsSync(join(root, path)), `${path} is back in the public repository; the desktop app is built from the private repository`);
  }
  const published = ['src', 'README.md', 'LICENSE'];
  assert(statSync(join(root, 'src')).isDirectory(), 'src/ must ship with the npm package');
  const files = packageJson.files ?? [];
  for (const entry of files) {
    const candidate = join(root, entry.replace(/\/$/, ''));
    assert(existsSync(candidate), `package.json lists ${entry} in files, but it does not exist`);
  }
  for (const entry of files) {
    assert(!entry.includes('desktop') && !entry.includes('tauri'), `package.json would ship ${entry}; paid code does not belong in the public package`);
  }
  assert(published.includes('src'), 'the CLI is the published package');
});

check('the checked-in lockfile is present, honest and reproducible', () => {
  const lockPath = join(root, 'package-lock.json');
  assert(existsSync(lockPath), 'package-lock.json is not committed, so CI cannot install reproducibly');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  assert(lock.name === packageJson.name, `lockfile is for ${lock.name}, package.json is ${packageJson.name}`);
  assert(lock.version === packageJson.version, `lockfile pins ${lock.version}, package.json is ${packageJson.version}. Run npm install --package-lock-only and commit it.`);
  assert(lock.lockfileVersion === 3, `lockfileVersion is ${lock.lockfileVersion}; npm ci here needs 3`);
  const rootEntry = lock.packages?.[''] ?? {};
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const names = Object.keys(rootEntry[field] ?? packageJson[field] ?? {});
    assert(names.length === 0, `package.json declares ${field} (${names.join(', ')}); README advertises zero dependencies, and a published dependency is a supply-chain promise`);
  }
  const resolved = Object.keys(lock.packages ?? {}).filter(path => path !== '');
  assert(resolved.length === 0, `lockfile resolves ${resolved.length} package(s); README advertises zero dependencies`);
  const workflows = join(root, '.github', 'workflows');
  for (const entry of readdirSync(workflows, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(join(workflows, entry.name), 'utf8');
    for (const [, command] of source.matchAll(/^\s*(?:-\s*run:\s*|run\s*\|\s*)?(npm (?:install|i)\b.*)$/gm)) {
      assert(!/npm (?:install|i)\b/.test(command), `${entry.name} runs "${command.trim()}"; install from the committed lockfile with npm ci so CI and npm see the same tree`);
    }
  }
});

check('the declared runtime is the runtime CI actually tests', () => {
  // Node's even majors are LTS lines and odd majors are non-LTS, so an odd
  // major is end-of-life within months of release. A release must never be
  // gated or published from one. The floor is Node 22 because Node 20 left
  // support in April 2026; raise it here and in the docs together.
  const floor = 22;
  const engines = String(packageJson.engines?.node ?? '');
  const declared = engines.match(/^>=\s*(\d+)/);
  assert(declared, `engines.node is "${engines || '(unset)'}"; declare the supported floor as ">=${floor}" so the build server cannot silently pick a runtime nobody tests`);
  assert(Number(declared[1]) === floor, `engines.node allows Node ${declared[1]}, but the supported floor is ${floor} (Node 20 reached end of life in April 2026)`);

  const nvmrc = join(root, '.nvmrc');
  assert(existsSync(nvmrc), '.nvmrc is missing, so a build server picks the Node version at random');
  const pinned = readFileSync(nvmrc, 'utf8').trim();
  assert(/^\d+$/.test(pinned), `.nvmrc is "${pinned}"; pin one major, not a range or a comment`);

  const workflows = join(root, '.github', 'workflows');
  const sources = new Map();
  for (const entry of readdirSync(workflows, { withFileTypes: true })) {
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      sources.set(entry.name, readFileSync(join(workflows, entry.name), 'utf8'));
    }
  }
  const ci = sources.get('ci.yml') ?? '';
  const matrix = ci.match(/node:\s*\[([\d,\s]+)\]/);
  assert(matrix, 'ci.yml has no "node: [...]" matrix, so the supported runtimes are not tested on every release');
  const tested = matrix[1].split(',').map(value => value.trim()).filter(Boolean);
  assert(tested.length > 0, 'ci.yml tests no Node version');
  for (const major of tested) {
    assert(Number(major) >= floor, `ci.yml tests Node ${major}, which is below the supported floor of ${floor} and end-of-life`);
    assert(Number(major) % 2 === 0, `ci.yml tests Node ${major}, an odd non-LTS major that is end-of-life within months of release; gate on LTS lines only`);
  }
  assert(tested.includes(String(floor)), `ci.yml tests ${tested.join(', ')} but not the declared floor ${floor}; engines promises a runtime nothing tests`);
  assert(tested.includes(pinned), `.nvmrc pins Node ${pinned}, which no ci.yml leg tests; a build server would run an untested runtime`);

  for (const [name, source] of sources) {
    for (const [, version] of source.matchAll(/node-version:\s*['"]?(\d+)\b/g)) {
      assert(tested.includes(version), `${name} pins node-version ${version}, which the ci.yml matrix (${tested.join(', ')}) does not test`);
    }
  }

  for (const file of claimed) {
    for (const [, claim] of readFileSync(file, 'utf8').matchAll(/Node\.?js?\s+(\d+)\s*(?:or (?:newer|higher)|eller nyere|\+)/gi)) {
      assert(Number(claim) === floor, `${label(file)} tells readers it needs Node ${claim} or newer, but the supported floor is ${floor}`);
    }
  }
});

check('no workflow pins an action major GitHub has deprecated', () => {
  // GitHub deprecates old action majors, then quietly runs them on a newer Node
  // runtime than they were written for, and the job fails with a warning
  // nobody reads. T10 therefore walks one major per commit so a breaking major
  // can be rolled back alone; raise each floor here in the same commit as the
  // bump it locks in, and never lower one.
  //
  // Raising a floor does not stop the workflows from drifting apart again:
  // site-gate.yml sat on checkout v7 while ci.yml and publish.yml were walked
  // through v5 and v6, so each was above the floor and no gate complained. The
  // check therefore also requires one major per action across all workflows.
  const floors = {
    'actions/checkout': 7,
    'actions/setup-node': 7,
    'actions/setup-python': 7,
  };
  const workflows = join(root, '.github', 'workflows');
  const seen = new Map();
  const pinnedIn = new Map();
  for (const entry of readdirSync(workflows, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(join(workflows, entry.name), 'utf8');
    for (const [, action, ref] of source.matchAll(/uses:\s*['"]?([\w.-]+\/[\w.-]+)@([\w.-]+)['"]?/g)) {
      if (!(action in floors)) {
        continue;
      }
      if (/^[0-9a-f]{40}$/.test(ref)) {
        continue;
      }
      const major = ref.match(/^v(\d+)$/);
      assert(major, `${entry.name} pins ${action}@${ref}; pin a major tag (v7) or a full commit SHA, not a branch or a range`);
      const pinned = Number(major[1]);
      assert(pinned >= floors[action], `${entry.name} pins ${action}@${ref}; GitHub has deprecated everything below v${floors[action]}`);
      if (!pinnedIn.has(action)) {
        pinnedIn.set(action, new Map());
      }
      pinnedIn.get(action).set(pinned, (pinnedIn.get(action).get(pinned) ?? new Set()).add(entry.name));
      seen.set(action, pinned);
    }
  }
  for (const [action, perMajor] of pinnedIn) {
    if (perMajor.size < 2) {
      continue;
    }
    const written = [...perMajor.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([major, names]) => `v${major} in ${[...names].sort().join(', ')}`)
      .join(' and ');
    assert(false, `workflows disagree on ${action}: ${written}. They run from the same runner with the same credentials, so a split pin means the checkout one workflow gets is not the checkout the other was reviewed against. Bump every workflow to one major in the same commit.`);
  }
  for (const [action, floor] of Object.entries(floors)) {
    assert(seen.has(action), `no workflow uses ${action}, so the v${floor} floor is asserted against nothing; remove the entry or pin the action`);
  }
});

check('every workflow runs on one pinned, non-deprecated runner image', () => {
  // ubuntu-latest is a floating label. GitHub moves it to Ubuntu 26.04 in a
  // rollout starting 19 October 2026 and finishing 19 November 2026
  // (actions/runner-images#14748), and the Ubuntu 22.04 images are already in
  // deprecation with brownouts scheduled from March 2027 (#14254). A workflow
  // on the floating label therefore changes operating system with no commit in
  // this repository and no rollback point, so every job pins its image here.
  const newest = 'ubuntu-26.04';

  // Playwright carries a hardcoded apt-package list per Ubuntu major in
  // packages/playwright-core/src/server/registry/nativeDeps.ts. Version
  // 1.60.0 lists 18.04, 20.04, 22.04 and 24.04 only. hostPlatform.ts maps
  // Ubuntu 26.04 to "ubuntu26.04-x64" with isOfficiallySupportedPlatform
  // false, and installDependenciesLinux then prints "Cannot install
  // dependencies for ubuntu26.04-x64" and returns without failing. So
  // TRANSMUTE_PLAYWRIGHT_DEPS=1 would quietly install nothing and the site
  // gate would run Chromium against unverified system libraries. A workflow
  // that installs Playwright must therefore stay on an image the locked
  // Playwright knows. Add a version's Ubuntu list only after that gate has
  // actually run green on the image.
  const playwrightUbuntu = {
    '1.60.0': ['20.04', '22.04', '24.04'],
  };

  const requirements = readFileSync(join(root, 'tools', 'site-requirements.txt'), 'utf8');
  const locked = requirements.match(/^playwright==([^\s\\]+)/m);
  assert(locked, 'tools/site-requirements.txt does not pin playwright, so the site gate has no known runner requirement');
  const supported = playwrightUbuntu[locked[1]];
  assert(supported, `playwright is pinned to ${locked[1]}, which has no entry in the ubuntu list this check knows. Verify the site gate on a newer image, then add ${locked[1]}'s supported Ubuntu versions here.`);

  const workflows = join(root, '.github', 'workflows');
  let jobs = 0;
  for (const entry of readdirSync(workflows, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(join(workflows, entry.name), 'utf8');
    const usesPlaywright = /\bcheck:site\b/.test(source);
    for (const [, image] of source.matchAll(/^[ \t]*runs-on:[ \t]*['"]?([\w.-]+)/gm)) {
      jobs += 1;
      const version = image.match(/^ubuntu-(\d+\.\d+)$/);
      assert(version, `${entry.name} runs on "${image}"; pin an explicit image (${newest}) so an image migration shows up as a commit instead of appearing overnight`);
      if (usesPlaywright) {
        assert(
          supported.includes(version[1]),
          `${entry.name} runs ${source.includes('check:site') ? 'the site gate' : 'Playwright'} on ${image}, but playwright ${locked[1]} has no dependency list for Ubuntu ${version[1]} — it would install no system libraries at all and fail later inside Chromium. Use one of ubuntu-${supported.join(', ubuntu-')}.`,
        );
      } else {
        assert(image === newest, `${entry.name} runs on ${image}; it does not install Playwright, so pin the newest image (${newest}) and move to a new one on purpose.`);
      }
    }
  }
  assert(jobs > 0, 'no workflow declares runs-on, so the runner pin is asserted against nothing');
});

check('no workflow inherits implicit dependency caching from setup-node', () => {
  // setup-node v5 started caching on its own as soon as package.json declared a
  // package manager, and v6 widened the trigger: either devEngines.packageManager
  // or the top-level packageManager field naming npm now switches caching on.
  // v6.5.0 and v7 answer it with the package-manager-cache input, and v7's own
  // README examples set it to false. So every step says it out loud rather than
  // relying on package.json staying silent: a `packageManager` field added to the
  // manifest later then changes nothing, and the opt-out cannot be lost in a
  // future pin bump the way an absent field can.
  const workflows = join(root, '.github', 'workflows');
  for (const entry of readdirSync(workflows, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(join(workflows, entry.name), 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!/uses:\s*['"]?actions\/setup-node@/.test(line)) {
        return;
      }
      const indent = line.length - line.trimStart().length;
      const nextStep = new RegExp(`^\\s{${indent}}-\\s`);
      const block = [line];
      for (let next = index + 1; next < lines.length && !nextStep.test(lines[next]); next += 1) {
        block.push(lines[next]);
      }
      const step = block.join('\n');
      const decided = /package-manager-cache:\s*(?:['"]?false['"]?|false)/.test(step) || /\bcache:\s*\S/.test(step);
      assert(
        decided,
        `${entry.name} uses actions/setup-node without saying what caching should do. Add "package-manager-cache: false" to its with: block, or an explicit "cache:" input, so a packageManager field added to package.json later cannot switch npm caching on silently.`,
      );
    });
  }

  const declared = [packageJson.packageManager, packageJson.devEngines?.packageManager].filter(Boolean);
  assert(
    declared.length === 0,
    `package.json declares package manager "${declared.join('", "')}"; actions/setup-node caches npm for it. Either drop the field, or review the cache keys the opt-out above is hiding.`,
  );
});

for (const [file, messages] of failuresByFile) {
  for (const message of messages) {
    failures.push(`${label(file)}: ${message}`);
  }
}

for (const failure of failures) {
  console.error(`  ❌ ${failure}`);
}

console.log(`\n📊 ${checks} checks, ${claimed.length} files, ${failures.length} failed\n`);
process.exit(failures.length > 0 ? 1 : 0);
