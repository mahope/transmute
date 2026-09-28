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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The contract of record. Changing a value here requires Mads' decision. */
const LOCKED = {
  product_key: 'transmute-desktop',
  product_name: 'Transmute Desktop Pro',
  amount: 19,
  currency: 'USD',
  billing: 'one_time',
  machines: 3,
  payment_link: 'https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02',
  licence_api: 'https://mahope.tools/api/license/',
  licence_cache_days: 7,
  order_email: 'orders@mahoje.dk',
  donation_link: 'https://donate.stripe.com/7sYeVcbn50wieFM8gDbMQ0c',
  site_url: 'https://transmute.run',
};

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, en: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10 };
const COUNT = `(?:\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
const SECRET_PATTERN = /\b(?:sk|rk|pk|whsec)_[A-Za-z0-9]{8,}|\bBearer\s+[A-Za-z0-9._-]{12,}/;
// \b is ASCII-only in JavaScript, so it fires between "d" and "år" in "dårlig" and a Danish
// page saying a licence server had "en dårlig eftermiddag" would be read as a recurring-billing
// claim. The Danish half therefore uses explicit Unicode letter lookarounds instead.
const WORD_BEFORE = '(?<![\\p{L}\\p{N}_])';
const WORD_AFTER = '(?![\\p{L}\\p{N}_])';
const RECURRING_CLAIM = new RegExp(`${WORD_BEFORE}(?:per month|monthly|per year|yearly|annually|subscription fee|per month or year)${WORD_AFTER}|${WORD_BEFORE}(?:pr\\. måned|månedlig|per år|årlig)${WORD_AFTER}`, 'iu');
/** Anything that promises a desktop build this repository does not publish. */
const PUBLIC_DOWNLOAD_CLAIM = /github\.com\/mahope\/transmute\/releases/i;
const DESKTOP_LABEL = /desktop[-\s]?app|desktopapp|macos,? windows/i;
const PRIVATE_REPO = /github\.com\/mahope\/(?:transmute-desktop|paid-products)|mahope\/(?:transmute-desktop|paid-products)\b/i;

/** The files that write the public pages, where a stale claim reaches everyone. */
const GENERATORS = ['tools/site_chrome.py', 'tools/make_og.py'];

/**
 * The tools that name the site's own address: the generator that writes the
 * canonical into every page, the checker that decides whether the site is
 * deployed, and the ones that fetch the live site. None of them is read by the
 * checks below, so before this list was bound to the contract a domain change
 * left the gate green.
 *
 * `layout_check.py` was on this list and is not: measuring it showed no code of
 * its names the site — it serves site/ from an ephemeral 127.0.0.1 port and takes
 * `--base` from the caller — so a rule it cannot fail is a rule that only costs a
 * reader. Its usage line did name the address in prose and now says
 * `[--base URL]`, like the others. The selftests stay out for the other reason:
 * their fixtures pin the address on purpose, because a checker proved against a
 * derived value proves nothing.
 */
const SITE_TOOLS = [
  'tools/site_chrome.py',
  'tools/make_og.py',
  'tools/seo_check.py',
  'tools/verify_live.py',
  'tools/check_deploy_freshness.py',
];

/** The pages' own statements of where they live, in the attributes SEO reads. */
const PAGE_ADDRESS = /(?:rel="canonical"\s+href|property="og:url"\s+content)="([^"]+)"/g;

/**
 * Every address a file in `site/` hands a reader, in the forms the site actually
 * uses: an `href` (which is also how canonical and `og:url` are written), a
 * `<loc>` in the sitemap, a JSON-LD `url`, and a markdown link in the two `llms`
 * files. The first three are HTML/XML, the last is plain text — the two files
 * that exist for readers a browser never shows.
 */
const ADDRESS_FORMS = [
  ['href', /href="([^"]+)"/g],
  ['loc', /<loc>([^<]+)<\/loc>/g],
  ['json-ld url', /"url"\s*:\s*"([^"]+)"/g],
  ['llms link', /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g],
];

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

/** The SPDX id a `license` field names, so it can be looked for in LICENSE. */
function licenseId(value) {
  return String(value ?? '').replace(/^\(|\)$/g, '').split(/\s+OR\s+/)[0].trim();
}

function escapeFor(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/**
 * The files that are both committed and covered by a .gitignore rule, which is
 * the one state neither tool wants: ignored files are meant to stay out of the
 * index, and indexed files are meant to be readable. `git ls-files -c -i` asks
 * git for the intersection directly rather than asking this script to reimplement
 * gitignore. Returns null outside a repository, where there is no index to read.
 */
function committedAndIgnored() {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-c', '-i', '--exclude-standard'], {
      encoding: 'utf8',
      // git writes its own complaint to stderr when there is no repository, and
      // `npm test` runs this script in a temporary directory that has none.
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
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

// Eleven of the seventeen indexable pages — every guide and the cheat sheet,
// which is where a visitor arrives from a search result — carried the paid
// product in the shared footer and nowhere else. That is chrome, identical on
// every page, so a reader who lands on one guide and wants the app is told
// where to look without being told anything about whether it is worth it.
// Measured by tools/measure_t105.py, which counts body links and reports the
// footer separately for exactly that reason.
//
// The rule asks one question per page: does the body give a reader a way
// through? A page that is not a place someone decides to buy is exempt and has
// to say so here, so adding an exempt page is a visible decision rather than a
// gap in a count. Privacy and terms pages are exempt because nobody arrives
// from a search result intending to buy on them, and a buy button in a privacy
// policy is the ontrængende case the product rules rule out.
const PRO_PATH_EXEMPT = [
  { match: /privacy/, why: 'a privacy page is not where a reader decides to buy, and selling there would be pushy' },
  { match: /404\.html$/, why: 'an error page has no reader to sell to' },
  { match: /search\//, why: 'search results are a list, not a landing page' },
  { match: /support\//, why: 'the support page is where the buy button lives' },
];

check('every page a reader lands on gives them a way to the paid product', () => {
  const buying = new Set([
    pro.payment_link,
    '/support/', '/support/#buying-pro', '/da/support/', '/da/support/#buying-pro',
    '/#desktop', '/da/#desktop',
  ]);
  let measured = 0;

  for (const file of claimed) {
    if (!file.endsWith('.html')) continue;
    const rel = file.slice(root.length + 1).replace(/\\/g, '/');
    if (/noindex/.test(readFileSync(file, 'utf8'))) continue;
    const exempt = PRO_PATH_EXEMPT.find(e => e.match.test(rel));
    if (exempt) continue;
    measured += 1;

    // The footer is stripped before the question is asked. Counting it made
    // this check report that every page was fine, which was true and useless:
    // chrome is the same on all of them and is not where the reader is.
    const body = readFileSync(file, 'utf8')
      .replace(/<header\b[\s\S]*?<\/header>/g, '')
      .replace(/<footer\b[\s\S]*?<\/footer>/g, '');

    const paths = [...body.matchAll(/<a\b[^>]*href="([^"]+)"/g)]
      .map(([, href]) => href)
      .filter(href => buying.has(href));
    assert(paths.length > 0,
      `${rel} gives a reader no way to the paid product outside the shared footer; the guides and the cheat sheet are where visitors arrive from a search result, so that is where the path has to be`);
  }

  assert(measured >= 11,
    `only ${measured} pages are held to this rule, which is fewer than the eleven that were measured as missing a path; the rule has stopped covering the pages it was written for`);
});

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

check("the contract's claims about this repository are what the committed code says", () => {
  // Measured 2026-09-26, on this repository, before these rules existed.
  //
  //   1. Rewriting `name` in package.json *and* package-lock.json — so the tree
  //      agreed with itself — left all 174 checks green while thirty public files
  //      still told users `npm i -g @mahope/transmute`. The package a stranger
  //      installs is the one claim here nobody had bound to the code.
  //   2. `tools/product-contract.json`'s own `cli` block was read by no rule at
  //      all: a wrong package name, `GPL-3.0` as the licence and a foreign
  //      repository URL, all three wrong together, produced zero failures.
  //
  // Same failure form as T52's version lie: the lock compared claims with claims,
  // so a claim that drifts together with the thing it describes cannot be seen.
  // These are the rules that cannot be satisfied by agreeing with yourself.
  const cli = contract.cli ?? {};
  for (const key of ['package', 'license', 'repository']) {
    assert(key in cli, `contract.cli.${key} is gone, so the contract of record no longer states what this repository is`);
  }

  assert(cli.package === packageJson.name,
    `contract.cli.package is ${JSON.stringify(cli.package)}, the published package.json is ${JSON.stringify(packageJson.name)}`);
  assert(cli.license === packageJson.license,
    `contract.cli.license is ${JSON.stringify(cli.license)}, package.json declares ${JSON.stringify(packageJson.license)}`);

  const licenceFile = readFileSync(join(root, 'LICENSE'), 'utf8').split('\n', 1)[0];
  assert(new RegExp(`\\b${escapeFor(licenseId(packageJson.license))}\\b`).test(licenceFile),
    `package.json declares the licence ${JSON.stringify(licenseId(packageJson.license))}, but LICENSE starts "${licenceFile}"`);

  const repository = String(packageJson.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  assert(cli.repository === repository,
    `contract.cli.repository is ${JSON.stringify(cli.repository)}, package.json's repository is ${JSON.stringify(repository)}`);
});

check('every public file quotes the package npm actually publishes', () => {
  // The measured failure above: package.json and the lockfile renamed together,
  // thirty install instructions left behind, gate green. The install line is the
  // promise, and it is only true if it names the committed package.
  const published = packageJson.name;
  for (const file of claimed) {
    // Any scope, not just ours: a package renamed to a scope we do not own is
    // exactly the case this rule exists for. The trailing strip keeps a
    // sentence-ending dot in "…/package/@mahope/transmute." out of the name.
    for (const [, raw] of readFileSync(file, 'utf8').matchAll(/(@[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)/gi)) {
      const name = raw.replace(/[._-]+$/, '');
      assert(name === published,
        `${label(file)} tells readers to install ${name}, but npm serves this repository as ${published}`);
    }
  }
});

check('the site generators take the package and the repository from package.json', () => {
  // Measured 2026-09-26, on this repository, before this rule: pointing the
  // generator's three npm links at a package that does not exist left all 178
  // checks green. The rule above reads the *rendered* pages, and the generator is
  // what writes them, so a stale template is invisible until somebody
  // regenerates the site — and then one stale literal reaches every page, the
  // nav, the footer and the JSON-LD at once. In make_og.py the same literal is
  // drawn into a PNG, which no text rule can read at all.
  const repository = String(packageJson.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  for (const file of GENERATORS) {
    const path = join(root, file);
    const source = readFileSync(path, 'utf8');
    assert(/package\.json/.test(source),
      `${label(path)} must read package.json, so the package name has one source and not two`);
    for (const [, raw] of source.matchAll(/(@[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)/gi)) {
      const name = raw.replace(/[._-]+$/, '');
      assert(name === packageJson.name,
        `${label(path)} installs ${name}, but npm serves this repository as ${packageJson.name}; derive it from package.json`);
    }
    for (const [raw] of source.matchAll(/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g)) {
      assert(raw === repository,
        `${label(path)} points at ${raw}, but package.json's repository is ${repository}`);
    }
  }
});

check('every page states the address the contract locks, and no other', () => {
  // Measured 2026-09-27, on this repository, before this rule. Pointing the
  // canonical of one page at a domain that does not exist left all 180 checks
  // green. The site's own address is the one claim here that no rule could
  // contradict: nineteen pages state it, a sitemap lists it, and a canonical
  // pointing somewhere else is the failure a search engine acts on — silently,
  // and long after the commit that caused it.
  const locked = String(contract.site_url ?? '').replace(/\/+$/, '');
  assert(/^https:\/\/[^\s/]+$/.test(locked),
    `contract.site_url is ${JSON.stringify(contract.site_url)}, which is not a bare https origin`);

  for (const file of collect(join(root, 'site'), ['.html', '.txt', '.xml'])) {
    for (const [, url] of readFileSync(file, 'utf8').matchAll(PAGE_ADDRESS)) {
      assert(url.startsWith(`${locked}/`),
        `${label(file)} states its address as ${url}, but the contract locks the site to ${locked}`);
    }
    // A sitemap is a list of addresses, written as <loc>, and it is what a
    // crawler reads first — so a page that drifts is still submitted correctly.
    for (const [, url] of readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      assert(url.startsWith(`${locked}/`),
        `${label(file)} lists ${url}, but the contract locks the site to ${locked}`);
    }
  }
});

check('every address the site hands a reader reaches a page the site serves', () => {
  // Measured 2026-09-28 on this repository, before this rule: 1236 internal
  // addresses across `site/`, every one of which resolves — and nothing in the
  // gate ever asked. The three rules above all read *what address a file states*;
  // none reads whether the file it names is there. That gap is quiet because the
  // site is generated: `tools/site_chrome.py` rewrites the footer, the crumbs and
  // the search index on every run, so a link whose page is gone arrives in a
  // commit every other rule calls clean. It is also the first thing a reader
  // hits — a dead guide link on the page that sells the product — and the first
  // thing a crawler follows, in the sitemap and in `llms.txt`.
  const siteDir = join(root, 'site');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
  const served = new Set(walk(siteDir).map((path) => '/' + relative(siteDir, path).split('\\').join('/')));

  for (const file of collect(siteDir, ['.html', '.txt', '.xml'])) {
    const here = '/' + label(file).slice('site/'.length);
    const text = readFileSync(file, 'utf8');
    for (const [form, pattern] of ADDRESS_FORMS) {
      for (const [, raw] of text.matchAll(pattern)) {
        // A fragment, a mail, a phone number or a data url is not a page.
        if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(raw)) continue;
        let target = raw;
        if (/^https?:\/\//i.test(raw)) {
          // Another origin is somebody else's page; only the site's own addresses
          // are ours to keep, and the rule above already holds them to the contract.
          if (!raw.startsWith(`${String(contract.site_url).replace(/\/+$/, '')}/`)) continue;
          target = raw.slice(String(contract.site_url).replace(/\/+$/, '').length);
        } else if (!target.startsWith('/')) {
          target = posix.join(here.replace(/\/[^/]*$/, '/'), target);
        }
        // `?v=` is the asset hash every page carries, and a `#` is a place inside a
        // page that exists — neither says anything about whether it is there.
        target = target.split(/[?#]/)[0];
        const found = served.has(target) || served.has(`${target}index.html`);
        assert(found,
          `${label(file)}: ${form} points at ${raw}, which is no file in site/ — a reader and a crawler both get 404`);
      }
    }
  }
});

check('the tools that name the site take the address from the contract', () => {
  // The other half of the measurement above: pointing all five checkers and the
  // generator at a domain that does not exist was equally invisible, because the
  // rules read the rendered pages, not the code that fetches and writes them.
  // `check_deploy_freshness.py` is the sharp one — it decides whether the site is
  // deployed, so a wrong address there reports a verdict about a site nobody
  // serves, and does it every run without saying so. In make_og.py the address
  // is drawn into a PNG, which no text rule can read at all.
  const locked = String(contract.site_url ?? '');
  for (const file of SITE_TOOLS) {
    const path = join(root, file);
    const source = readFileSync(path, 'utf8');
    assert(!source.includes(locked),
      `${label(path)} writes the site address ${locked} out in full; take it from tools/product-contract.json, so the address has one source and not two`);
    assert(/product-contract\.json/.test(source),
      `${label(path)} must read tools/product-contract.json, or deleting the address above leaves no source at all`);
  }
});

check('every address the product hands a user is absolute', () => {
  // Measured 2026-09-27, on the packed tarball of this repository, before this
  // rule. `transmute people.csv` — the default path, and the first command the
  // README shows — ended in `Docs: docs/cli.md`, and the tarball is five files
  // with no docs directory among them. Every user who installed the CLI was
  // handed a path to a file that was not on their machine, and a relative path
  // resolves against the directory they happened to be standing in, so it never
  // did. The same link in the README works on GitHub and 404s on npmjs.com,
  // which renders that README against the package URL rather than the tree.
  //
  // The address is derived from the `repository` field the package already
  // carries, so there is no second constant to keep in step: `cli.repository` is
  // locked above and read by its own rules, and a rule here checks that the
  // surfaces state the address that field derives.
  const repo = String(contract.cli?.repository ?? '').replace(/\/+$/, '');
  assert(/^https:\/\/github\.com\/[^\s/]+\/[^\s/]+$/.test(repo),
    `contract.cli.repository is ${JSON.stringify(contract.cli?.repository)}, which is not a bare https GitHub repository`);
  const docs = `${repo}/blob/main/docs/cli.md`;

  // A markdown link with a relative target is the exact shape of the npm 404:
  // correct in a clone, dead everywhere the README is actually read. Prose that
  // merely names the file is left alone — a contributor in a cloned tree can
  // find docs/cli.md, and that sentence is telling them so.
  for (const [, , target] of readFileSync(join(root, 'README.md'), 'utf8')
    .matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    assert(/^(?:https?:|#|mailto:)/.test(target),
      `README.md links to the relative path ${target}, which resolves against the directory the reader is in — npmjs.com renders this README and that link 404s; use ${docs}`);
  }

  // The CLI is shipped code, so it may not restate the address either: it derives
  // it, and the derivation has to survive someone deleting the source it reads.
  // The shape is matched rather than the word, because a comment that explains
  // the derivation mentions `repository` too — and that satisfied a substring
  // test while the binding it described had been deleted.
  const cli = readFileSync(join(root, 'src', 'cli.js'), 'utf8');
  const binds = new RegExp(`const\\s*\\{[^}]*\\brepository\\b[^}]*\\}\\s*=\\s*require\\('\\.\\./package\\.json'\\)`);
  assert(binds.test(cli),
    'src/cli.js must bind `repository` from package.json, or deleting that field leaves no source for the docs address at all');
  assert(!cli.includes(docs),
    `src/cli.js writes the docs address ${docs} out in full; derive it from the repository field in package.json, so the address has one source and not two`);
  // And the derivation has to produce the address the other surfaces state, or
  // the two halves drift apart without either one noticing.
  assert(docs.endsWith('/docs/cli.md') && new RegExp(`DOCS_URL\\s*=[^;]*repository`).test(cli),
    `src/cli.js must derive the docs address from package.json's repository field, which gives ${docs}`);
  // Deriving it is not the same as printing it. A footer that went back to the
  // bare path while the derivation sat unused above it kept every one of these
  // assertions true and reintroduced the exact bug this rule was written for, so
  // the line the user reads has to be built from the derived value itself.
  const footer = cli.match(/console\.log\((.*Docs:.*)\);/);
  assert(footer && /\$\{DOCS_URL\}/.test(footer[1]),
    `the preview footer in src/cli.js must print the derived address as \`Docs: \${DOCS_URL}\`, so the path a user follows is the one that exists; use ${docs}`);
  assert(!/href="docs\/cli\.md"/.test(cli), 'src/cli.js links the relative path docs/cli.md, which is dead for anyone outside a clone');

  // The browser cheat sheet already linked the one address that works, and it is
  // held to it here so the three surfaces cannot disagree.
  const cheatsheet = join(root, 'site', 'cheatsheet', 'index.html');
  if (existsSync(cheatsheet)) {
    const source = readFileSync(cheatsheet, 'utf8');
    assert(source.includes(docs),
      `site/cheatsheet/index.html does not link the full reference at ${docs}`);
    assert(!/href="docs\/cli\.md"/.test(source),
      'site/cheatsheet/index.html links the relative path docs/cli.md, which is dead on the site; use the absolute address');
  }
});

check('the paid product is named the way the contract locks it', () => {
  // product_name was in the contract of record and no rule could contradict it, so
  // a page was free to invent "Transmute Desktop Premium" and sell a tier that
  // does not exist. Only a capitalised word after the product is a tier claim;
  // "Transmute Desktop is the paid app" is prose, not a second product.
  const locked = pro.product_name;
  for (const file of claimed) {
    for (const [, raw] of readFileSync(file, 'utf8').matchAll(/Transmute Desktop\s+([A-Z][\w.+-]*)/g)) {
      const tier = raw.replace(/[.,:;!?]+$/, '');
      assert(locked.endsWith(` ${tier}`),
        `${label(file)} calls the paid product "Transmute Desktop ${tier}", but the contract locks it as "${locked}"`);
    }
  }
});

check('every claim in the contract is one a rule can contradict', () => {
  // A claim nothing reads is a claim nothing can catch, and this file had three of
  // them. So the contract may not grow a key that no rule below is able to
  // contradict: add it to LOCKED (Mads' Stripe contract) with a rule that reads
  // it, or derive it from committed code under `cli`.

  const containers = new Set(['cli', 'desktop_pro']);
  const read = new Set([
    ...Object.keys(LOCKED),
    'free_tier_transformations_per_launch',
    'source_repository_private',
  ]);
  for (const [key, value] of Object.entries(contract)) {
    if (containers.has(key)) {
      assert(value && typeof value === 'object' && !Array.isArray(value), `contract.${key} must be an object of claims`);
      continue;
    }
    if (key === '$comment' || key === 'allowed_desktop_link_targets') {
      continue;
    }
    assert(read.has(key), `contract.${key} is a claim no rule can contradict: add it to LOCKED with a rule that reads it, or derive it from committed code under cli`);
  }
  for (const key of Object.keys(pro)) {
    assert(read.has(key), `contract.desktop_pro.${key} is a claim no rule can contradict: add it to LOCKED with a rule that reads it, or derive it from committed code under cli`);
  }
});

check('only a version that describes the code and sits on the default branch can be published', () => {
  // Three of these were measured missing on 2026-09-26: the release script
  // tagged a feature branch, `npm run release -- <committed version>` died in an
  // npm error, and nothing asked whether the version still described src/ — which
  // is how 39 commits of fixes reached no user behind 0.2.1. See
  // tools/release_guard.mjs and test/release.test.mjs.
  const script = readFileSync(join(root, 'scripts', 'release.mjs'), 'utf8');
  assert(script.includes('inspectRelease'), 'scripts/release.mjs no longer asks tools/release_guard.mjs whether the release may happen, so the three guards are gone');

  const publish = readFileSync(join(root, '.github', 'workflows', 'publish.yml'), 'utf8');
  assert(/merge-base --is-ancestor/.test(publish), 'publish.yml publishes any v* tag whose number matches package.json, so a tag on an unmerged branch reaches npm and cannot be taken back');
  assert(/fetch-depth:\s*0/.test(publish), 'publish.yml checks out a shallow clone, which cannot answer whether the tagged commit is on the default branch');

  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert(readme.includes('npm run check:release'), 'README.md no longer mentions npm run check:release, so the drift report has no documented place in the checklist');
});

check('the Danish support page says what the English one says', () => {
  const en = readFileSync(join(root, 'site', 'support', 'index.html'), 'utf8');
  const da = readFileSync(join(root, 'site', 'da', 'support', 'index.html'), 'utf8');
  const sections = text => [...text.matchAll(/<h[23] id="([^"]+)"/g)].map(m => m[1].length);
  const stripe = text => [...new Set([...text.matchAll(/https:\/\/(?:buy|donate)\.stripe\.com\/[A-Za-z0-9]+/g)].map(m => m[0]))].sort();
  assert(sections(da).length === sections(en).length,
    `the Danish support page has ${sections(da).length} sections, the English one has ${sections(en).length}: a section must be translated, not dropped`);
  assert(stripe(da).join() === stripe(en).join(),
    `the Danish support page links ${stripe(da).join(', ')}, the English one links ${stripe(en).join(', ')}: both languages must sell and donate through the same links`);
  const machines = text => [...new Set([...text.matchAll(new RegExp(`\\b(?:${COUNT}|\\d+)\\s+(?:machines|maskiner)`, 'gi'))]
    .map(m => NUMBER_WORDS[m[0].split(/\s+/)[0].toLowerCase()] ?? Number(m[0].split(/\s+/)[0])))].sort();
  assert(machines(da).join() === machines(en).join() && machines(en).length > 0,
    `the Danish support page quotes the machine limit as ${machines(da).join(', ') || '(never)'}, the English one as ${machines(en).join(', ') || '(never)'}: both must state the same limit`);
  const words = text => text.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  assert(words(da) >= Math.round(words(en) * 0.6),
    `the Danish support page has ${words(da)} words against ${words(en)} in the English one, so it reads as a stub rather than a translation`);
  for (const page of [['site/support/index.html', en], ['site/da/support/index.html', da]]) {
    assert(page[1].includes(`<link rel="alternate" hreflang="${page[1] === da ? 'en' : 'da'}"`), `${page[0]} has no hreflang link to its translated counterpart`);
  }
});

check('the privacy pages say where the fonts come from, and the stylesheet proves it', () => {
  // The measurement that wrote this rule, on this repository on 2026-09-27:
  // both privacy pages told the reader that the IBM Plex typefaces are loaded
  // from Google Fonts, so that Google sees every visit. They are not. site/style.css
  // declares all three @font-face blocks with a local `url(/fonts/…woff2)`, the
  // three files sit in site/fonts/, and not one page or stylesheet in the site
  // mentions a font host. So the page was not merely stale, it was describing a
  // third party that never receives a byte — and a privacy page that is wrong
  // about what leaves your browser is worse than one that says nothing.
  //
  // The rule is a rule and not a comment: it reads the committed stylesheet, so
  // the day someone puts Google Fonts back, this fails and the page text has to
  // be rewritten in the same commit rather than left to contradict it.
  const THIRD_PARTY_FONTS = /fonts\.(?:googleapis|gstatic)\.com|@import\s+url\(\s*['"]?https?:/i;
  const css = readFileSync(join(root, 'site', 'style.css'), 'utf8');
  assert(!THIRD_PARTY_FONTS.test(css),
    'site/style.css loads fonts from a third-party host, so the privacy pages must say so again');

  const pages = ['site/privacy/index.html', 'site/da/privacy/index.html'];
  for (const path of pages) {
    const text = readFileSync(join(root, path), 'utf8');
    const section = text.match(/<h2 id="(?:fonts|skrifttyper)">[\s\S]*?<\/p>/i);
    assert(section, `${path} has no fonts section, so the claim this rule checks is not on the page`);
    assert(!THIRD_PARTY_FONTS.test(section[0]),
      `${path} says the fonts come from a third-party host, but no host is named in site/style.css`);
    assert(/served from this site|serveres fra dette site/.test(section[0]),
      `${path} does not say the fonts are served from this site`);
  }

  // Every font the stylesheet promises is a file in the repository, so "served
  // from this site" is a statement about something that exists and not a promise.
  const faces = [...css.matchAll(/@font-face\s*\{[\s\S]*?\}/g)];
  assert(faces.length > 0, 'site/style.css declares no @font-face, so the privacy pages promise fonts that no rule supplies');
  for (const face of faces) {
    const source = face[0].match(/url\(([^)]+)\)/);
    assert(source, 'an @font-face in site/style.css names no source file');
    const file = source[1].replace(/^['"]|['"]$/g, '').replace(/^\//, '');
    assert(existsSync(join(root, 'site', file)),
      `site/style.css points at ${file}, which is not in the repository: the privacy pages cannot promise a font the site does not ship`);
  }
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

check('no committed file is one the repository ignores', () => {
  // The measurement that wrote this rule, on this repository on 2026-09-27
  // before it existed: seven tools/__pycache__/*.cpython-314.pyc files had been
  // committed on 8/9, a month before .gitignore learned to ignore __pycache__/.
  // A .gitignore rule only governs files git is not already tracking, so adding
  // it changed nothing for them and they stayed. Nothing can load them — the
  // magic number in all seven is 3627 (CPython 3.14), while the interpreter this
  // repository installs is 3571 (3.13) — and four of the seven are two days
  // older than the .py file they were compiled from, so they are not even a
  // stale copy of the code next to them.
  const committed = committedAndIgnored();
  if (committed !== null) {
    assert(
      committed.length === 0,
      `${committed.length} file(s) are committed although .gitignore excludes them: ${committed.join(', ')}. ` +
        'gitignore does not untrack a file that is already in the index, and an unreadable build artefact that follows every diff of its directory is worse than no file — run `git rm --cached` on them.',
    );
  }
  const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : null;
  assert(gitignore !== null, '.gitignore is missing, so build output and Python bytecode can be committed by the next `git add -A`');
  assert(
    /^__pycache__\/$/m.test(gitignore),
    '.gitignore does not ignore __pycache__/, so every run of the Python site tools leaves bytecode behind that the next `git add -A` can pick up',
  );
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
