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
