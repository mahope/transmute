/**
 * Claim tests: the rules in tools/verify_contract.mjs that bind a claim to the
 * committed code, exercised the only way that proves anything — by breaking one
 * thing in a copy of this repository and asserting the gate notices.
 *
 * The measurement that shaped these rules, taken on this repository on
 * 2026-09-26 before they existed: renaming `name` in package.json *and*
 * package-lock.json, so the tree agreed with itself, left all 174 checks green
 * while thirty public files still told users to run `npm i -g @mahope/transmute`.
 * Three claims in the contract of record — the package name, the licence and the
 * repository — were read by no rule at all, and all three could be wrong at once
 * without a sound. T52's version lie survived for the same reason: the lock
 * compared claims with claims, so a claim that drifts together with the thing it
 * describes cannot be seen.
 *
 * Each test copies the files the contract check reads into a temporary directory,
 * changes exactly one of them, and runs the real script there. Nothing touches
 * this repository, the network or npm.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything tools/verify_contract.mjs reads, and nothing it does not. */
const COPIED = [
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', '.nvmrc', '.gitignore',
  'src', 'docs', 'site', 'scripts',
  'tools/verify_contract.mjs', 'tools/product-contract.json', 'tools/site-requirements.txt',
  'tools/site_chrome.py', 'tools/make_og.py', 'tools/seo_check.py', 'tools/verify_live.py',
  'tools/check_deploy_freshness.py',
  '.github/workflows',
];

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

/** A throwaway copy of the files the contract check reads. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-claims-'));
  for (const entry of COPIED) {
    cpSync(join(root, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

/** Run the real contract check in `dir` and return what it printed. */
function contractCheck(dir) {
  try {
    const stdout = execFileSync('node', [join(dir, 'tools', 'verify_contract.mjs')], { encoding: 'utf8' });
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const readJson = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const writeJson = (dir, file, value) => writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`);

/** Rename the package in package.json and in the lockfile, so the tree agrees. */
function renamePackageEverywhere(dir, name) {
  const pkg = readJson(dir, 'package.json');
  pkg.name = name;
  writeJson(dir, 'package.json', pkg);
  const lock = readJson(dir, 'package-lock.json');
  lock.name = name;
  if (lock.packages?.['']) lock.packages[''].name = name;
  writeJson(dir, 'package-lock.json', lock);
}

test('this repository passes its own claim rules', () => {
  const { code, output } = contractCheck(repo());
  assert.equal(code, 0, `the copy of this repository should pass: ${output}`);
});

test('renaming the published package turns every install instruction red', () => {
  // The measured fund. The lockfile cannot see it, because the lockfile was
  // renamed in the same commit — the tree agreed with itself and said nothing.
  const dir = repo();
  renamePackageEverywhere(dir, '@mahope/transmute-fork');
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a package the public files do not name must not pass');
  assert.match(output, /README\.md tells readers to install @mahope\/transmute, but npm serves this repository as @mahope\/transmute-fork/);
});

test('a contract that names another package is refused', () => {
  const dir = repo();
  const contract = readJson(dir, 'tools/product-contract.json');
  contract.cli.package = '@mahope/somethingelse';
  writeJson(dir, 'tools/product-contract.json', contract);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /contract\.cli\.package is "@mahope\/somethingelse"/);
});

test('a licence that disagrees with package.json is refused', () => {
  // Measured before these rules: "GPL-3.0" in package.json left the gate green
  // while LICENSE and the README both said MIT, and that claim ships in the npm
  // tarball's metadata.
  const dir = repo();
  const pkg = readJson(dir, 'package.json');
  pkg.license = 'GPL-3.0';
  writeJson(dir, 'package.json', pkg);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /contract\.cli\.license is "MIT", package\.json declares "GPL-3\.0"/);
});

test('a licence in package.json that LICENSE does not name is refused', () => {
  const dir = repo();
  const pkg = readJson(dir, 'package.json');
  pkg.license = 'Apache-2.0';
  writeJson(dir, 'package.json', pkg);
  const contract = readJson(dir, 'tools/product-contract.json');
  contract.cli.license = 'Apache-2.0';
  writeJson(dir, 'tools/product-contract.json', contract);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /package\.json declares the licence "Apache-2\.0", but LICENSE starts "MIT License"/);
});

test('a contract that points at a foreign repository is refused', () => {
  const dir = repo();
  const contract = readJson(dir, 'tools/product-contract.json');
  contract.cli.repository = 'https://github.com/mahope/not-this-repo';
  writeJson(dir, 'tools/product-contract.json', contract);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /contract\.cli\.repository is "https:\/\/github\.com\/mahope\/not-this-repo"/);
});

test('a page that invents another paid tier is refused', () => {
  const dir = repo();
  const page = join(dir, 'site', 'support', 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', '<p>Transmute Desktop Premium</p></body>'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /calls the paid product "Transmute Desktop Premium", but the contract locks it as "Transmute Desktop Pro"/);
});

test('prose after the product name is not read as a second product', () => {
  // The rule that keeps the rule above honest: "Transmute Desktop is the paid
  // app" must stay green, or the fix would be turned off within a week.
  const dir = repo();
  const page = join(dir, 'site', 'support', 'index.html');
  const text = readFileSync(page, 'utf8');
  writeFileSync(page, text.replace('</body>', '<p>Transmute Desktop is the paid app. Transmute Desktop and its settings.</p></body>'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 0, `prose must not be read as a tier claim: ${output}`);
});

test('a claim no rule can read is refused, so the contract cannot grow a dead one', () => {
  const dir = repo();
  const contract = readJson(dir, 'tools/product-contract.json');
  contract.desktop_pro.renewal_price = 15;
  writeJson(dir, 'tools/product-contract.json', contract);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /contract\.desktop_pro\.renewal_price is a claim no rule can contradict/);
});

test('a site generator that hardcodes the package is refused', () => {
  // Måling A som test: de tre npm-links i generatoren pegede på en pakke der
  // ikke findes, og alle 178 checks var grønne, fordi reglerna læser de
  // genererede sider og ikke den der skriver dem.

  const dir = repo();
  const file = join(dir, 'tools', 'site_chrome.py');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('NPM_URL = f"https://www.npmjs.com/package/{package()[\'name\']}"',
      'NPM_URL = "https://www.npmjs.com/package/@mahope/transmute-fork"'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /tools\/site_chrome\.py installs @mahope\/transmute-fork, but npm serves this repository as @mahope\/transmute/);
});

test('a site generator that hardcodes the repository is refused', () => {
  const dir = repo();
  const file = join(dir, 'tools', 'site_chrome.py');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('REPO = repo_url()', 'REPO = "https://github.com/mahope/somewhere-else"'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /tools\/site_chrome\.py points at github\.com\/mahope\/somewhere-else/);
});

test('deleting the derivation is refused, so the rule is not satisfied by absence', () => {
  // En regel der bare forbyder navnet kan passes ved at slette det hele. Derfor
  // skal generatoren også læse package.json — ellers er der ingen kilde igjen.
  const dir = repo();
  const file = join(dir, 'tools', 'make_og.py');
  const text = readFileSync(file, 'utf8')
    .replace("json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['name']", "'transmute'")
    .replace('import json\n', '');
  writeFileSync(file, text);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /tools\/make_og\.py must read package\.json/);
});

test('dropping the bytecode rule from .gitignore is refused', () => {
  // The other half of the rule. Without this line, untracking the seven committed
  // .pyc files would be a one-time cleanup that the next `git add -A` undoes —
  // which is exactly how those seven got committed in the first place: they were
  // added on 8/9, and .gitignore only learned to ignore __pycache__/ a month later.
  const dir = repo();
  const file = join(dir, '.gitignore');
  writeFileSync(file, readFileSync(file, 'utf8').replace('__pycache__/\n', ''));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /\.gitignore does not ignore __pycache__\//);
});

test('a committed bytecode file the repository ignores is named and refused', () => {
  // Measured on this repository on 2026-09-27, before the rule existed: seven
  // tools/__pycache__/*.cpython-314.pyc were committed, carried a magic number no
  // interpreter here can load, and four of them were older than the .py beside
  // them. A working-tree walk cannot see this — the files are on disk either way
  // — so the check has to read the index, which means a real repository here.
  const git = (dir, ...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
      },
    }).trim();

  const dir = repo();
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'Udgiv v0.3.0');

  // The positive control: the same repository, before anything is forced in.
  assert.equal(contractCheck(dir).code, 0, 'a repository with nothing ignored in the index must pass');

  mkdirSync(join(dir, 'tools', '__pycache__'), { recursive: true });
  const pyc = join(dir, 'tools', '__pycache__', 'seo_check.cpython-314.pyc');
  writeFileSync(pyc, Buffer.from([0xcb, 0x0e, 0x0d, 0x0a, 0, 0, 0, 0]));
  // -f, because that is how the seven arrived: added before the ignore rule existed.
  git(dir, 'add', '-f', 'tools/__pycache__/seo_check.cpython-314.pyc');
  git(dir, 'commit', '--quiet', '-m', 'Tilføj bytecode');

  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a committed .pyc the .gitignore excludes must not pass');
  assert.match(output, /1 file\(s\) are committed although \.gitignore excludes them: tools\/__pycache__\/seo_check\.cpython-314\.pyc/);
  assert.match(output, /git rm --cached/);
});

/** The one line in each tool that reads the address, verbatim. */
const DERIVES_SITE = 'json.loads((ROOT / "tools" / "product-contract.json").read_text(encoding="utf-8"))["site_url"].rstrip("/")';

test('a page that states another address is named and refused', () => {
  // Måling B som test: en af nitten sider fik et kanonisk domæne der ikke findes,
  // og alle 180 checks var grønne. Det er præcis den fejl en søgemaskine agerer
  // på, og den agerer i stilhed og længe efter den commit der lavede den.
  const dir = repo();
  const page = join(dir, 'site', 'guides', 'jq-alternative', 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('rel="canonical" href="https://transmute.run/', 'rel="canonical" href="https://gammel-transmute.example/'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a page that points its canonical somewhere else must not pass');
  assert.match(output, /site\/guides\/jq-alternative\/index\.html states its address as https:\/\/gammel-transmute\.example\/guides\/jq-alternative\//);
});

test('a tool that writes the site address out in full is named and refused', () => {
  // Måling A som test: de fem værktøjer, der henter eller skriver sitet, pegede på
  // et domæne der ikke findes, og alle 180 checks var grønne. Det skarpe var
  // check_deploy_freshness.py: den afgør om sitet er deployet, så et forkert
  // domæne ville give et facit om et site ingen serverer — hver gang, uden at
  // sige hvilket site den kiggede på.
  const dir = repo();
  const file = join(dir, 'tools', 'check_deploy_freshness.py');
  // Helt samme værdi, skrevet ud i stedet for læst. Det er den tilstand
  // målingen beskriver, og den er umulig at se: værktøjet svarer rigtigt.
  writeFileSync(file, readFileSync(file, 'utf8').replace(DERIVES_SITE, "'https://transmute.run'"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /tools\/check_deploy_freshness\.py writes the site address https:\/\/transmute\.run out in full; take it from tools\/product-contract\.json/);
});

test('deleting the site address is refused, so the rule is not satisfied by absence', () => {
  // Samme anden halvdel som pakkenavnet: en regel der bare forbyder adressen kan
  // passes ved at slette den hele, og så er der ingen kilde tilbage. Derfor
  // mutationen her ikke efterlader adressen — den fjerner den.
  const dir = repo();
  const file = join(dir, 'tools', 'seo_check.py');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(DERIVES_SITE, 'os.environ.get("TRANSMUTE_SITE_BASE", "")')
    .replace('import json\n', ''));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /tools\/seo_check\.py must read tools\/product-contract\.json, or deleting the address above leaves no source at all/);
});

test('a sitemap that lists another address is refused', () => {
  // Sitemapten er den første adresse en crawler læser, så en side der er kommet
  // væk fra den indsendes stadig korrekt.
  const dir = repo();
  const file = join(dir, 'site', 'sitemap.xml');
  writeFileSync(file, readFileSync(file, 'utf8').replace('<loc>https://transmute.run/</loc>', '<loc>https://gammel-transmute.example/</loc>'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /site\/sitemap\.xml lists https:\/\/gammel-transmute\.example\//);
});

test('the CLI handing a user a path its own package does not contain is refused', () => {
  // The measured fund, on the packed tarball rather than in a clone. The footer
  // the default path prints named `docs/cli.md`; the tarball is five files and
  // none of them is under docs/, so for everyone who installed the CLI the path
  // led nowhere — and being relative it resolved against whatever directory the
  // user was standing in, so it never did.
  const dir = repo();
  const file = join(dir, 'src', 'cli.js');
  writeFileSync(file, readFileSync(file, 'utf8').replace('`Docs: ${DOCS_URL}', "'Docs: docs/cli.md"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a path that no install contains must not pass');
  assert.match(output, /the preview footer in src\/cli\.js must print the derived address/);
});

test('a README that links the reference relatively is refused, because npm renders it', () => {
  // The same link is correct in a clone and dead on npmjs.com, which renders the
  // README against the package URL rather than the tree — so the one place the
  // link is most often followed is the one place it 404s.
  const dir = repo();
  const file = join(dir, 'README.md');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('[the CLI reference in the repository](https://github.com/mahope/transmute/blob/main/docs/cli.md)', '[docs/cli.md](docs/cli.md)'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /README\.md links to the relative path docs\/cli\.md/);
});

test('a cheat sheet that stops linking the full reference is refused', () => {
  // Three surfaces state this address, so the two halves can drift apart without
  // either noticing. The cheat sheet had the one link that already worked.
  const dir = repo();
  const file = join(dir, 'site', 'cheatsheet', 'index.html');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('href="https://github.com/mahope/transmute/blob/main/docs/cli.md"', 'href="docs/cli.md"'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /site\/cheatsheet\/index\.html does not link the full reference at/);
});

test('restating the docs address in the CLI is refused, so it has one source', () => {
  // Deriving it is the point: a second copy of the address is a claim that can
  // drift away from the repository field it is supposed to come from. Written out
  // in full — even the right address, which is the tempting version of this
  // change — it is a second source, and the rule says so.
  const dir = repo();
  const file = join(dir, 'src', 'cli.js');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/const DOCS_URL = `[^`]*`;/, "const DOCS_URL = 'https://github.com/mahope/transmute/blob/main/docs/cli.md';"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /src\/cli\.js writes the docs address .* out in full; derive it from the repository field/);
});

test('a CLI that prints some other repository as its reference is refused', () => {
  // The other half: an address that is absolute, spelled out and plausible still
  // has to be the one the repository field derives, or the derivation is
  // decorative and the user is sent to a fork.
  const dir = repo();
  const file = join(dir, 'src', 'cli.js');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/const DOCS_URL = `[^`]*`;/, "const DOCS_URL = 'https://github.com/mahope/transmute-fork/blob/main/docs/cli.md';"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /src\/cli\.js must derive the docs address from package\.json's repository field/);
});

test('deleting the derivation is refused, so the rule is not satisfied by absence', () => {
  // En regel der bare forbyder den hårdkodede adresse kan passes ved at slette
  // afledningen, og så er der ingen kilde tilbage. Derfor fjerner mutationen her
  // bindingen i stedet for at efterlade den. Den matcher formen af bindingen og
  // ikke ordet `repository`, fordi kommentaren der forklarer afledningen også
  // nævner det — og det holdt en substring-test grøn, mens det den beskriver var
  // slettet.
  const dir = repo();
  const file = join(dir, 'src', 'cli.js');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace("const { version, repository } = require('../package.json');", "const { version } = require('../package.json');"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1);
  assert.match(output, /src\/cli\.js must bind `repository` from package\.json/);
});

test('a page whose path to the paid product crosses into another language is refused', () => {
  // The measured fund, T112. Thirteen pages were held to this question, twelve
  // pointed at a page in their own language, and the Danish front page pointed
  // at the English support page — so a reader who had decided to buy was handed
  // the price in a language they did not ask for. The rule that shipped with
  // T105 is a set of strings and could not see it: the English path was in the
  // set, so the page was credited for having a way through.
  const dir = repo();
  const page = join(dir, 'site', 'da', 'index.html');
  const text = readFileSync(page, 'utf8');
  assert.match(text, /href="\/da\/support\/#kob-pro"/, 'the Danish page is expected to point at the Danish path; this is the bug under test');
  writeFileSync(page, text.replace('href="/da/support/#kob-pro"', 'href="/support/#buying-pro"'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a path to the paid product that changes language must not pass');
  assert.match(output, /site\/da\/index\.html is written in "da" but its path to the paid product, \/support\/#buying-pro, is a "en" page/);
});

test('a path to a paid product that leads nowhere is refused', () => {
  // The other half, and the reason the rule cannot simply be "is the English
  // anchor name present". The set above also accepted `/da/support/#buying-pro`,
  // a path that leads nowhere: the Danish support page calls that section
  // `kob-pro`. So a fix that translated the anchor *name* and nothing else would
  // have passed the gate and sent Danish readers to a dead link.
  const dir = repo();
  const rule = join(dir, 'tools', 'verify_contract.mjs');
  const text = readFileSync(rule, 'utf8');
  const at = text.indexOf('const PRO_PATHS');
  assert.ok(at > 0, 'the paid-path set should be readable by this test');
  writeFileSync(rule, text.slice(0, at)
    + text.slice(at).replace("'/da/support/#kob-pro'", "'/da/support/#buying-pro'"));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a whitelisted path with no anchor behind it must not pass');
  assert.match(output, /the rule accepts \/da\/support\/#buying-pro, but the page it opens has no id="buying-pro"/);
});

test('a Danish page may still link an English guide when it says so', () => {
  // The rule that keeps the two above honest. It asks one question — does the
  // path to the *paid product* stay in the reader's language — and a rule that
    // read every link would force the Danish front page to drop the English
  // guide it offers, or to hide that the guide is in English. The Danish page
  // says "(engelsk)" next to that link; that has to stay legal.
  const dir = repo();
  const page = join(dir, 'site', 'da', 'index.html');
  const text = readFileSync(page, 'utf8');
  assert.match(text, /\(engelsk\)/, 'the Danish page is expected to label its English guide link');
  assert.match(text, /href="\/guides\/join-two-files\/"/, 'the Danish page is expected to offer the English guide');
  const { code, output } = contractCheck(dir);
  assert.equal(code, 0, `an honestly labelled cross-language guide link is not a purchase-path bug: ${output}`);
});

// Ten iterations of YAML work made `docs/cli.md`, the cheat sheet, the front
// page and llms-full.txt all say the reader cannot do anchors, aliases or
// multi-line strings. Every one of those sentences was true when it was
// written and none of the 187 checks could see it, because the checks read
// what a file *claims* and never asked the engine what it can do. These two
// tests break one thing each and require the gate to notice.
test('a page that denies a shape the engine reads is refused', () => {
  const dir = repo();
  const page = join(dir, 'site', 'cheatsheet', 'index.html');
  const text = readFileSync(page, 'utf8');
  assert.doesNotMatch(text, /Not supported: anchors/, 'the cheat sheet is expected to have been corrected; this is the bug under test');
  const broken = text.replace(
    'Lists of flat records, key\u2013value documents, and nested mappings',
    'Not supported: anchors, multi-line strings, deeply nested maps.');
  assert.notEqual(broken, text, 'the cheat sheet sentence under test was not found; the test would pass by measuring nothing');
  writeFileSync(page, broken);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a shape the engine reads cannot be denied in public prose');
  assert.match(output, /denies anchors and aliases with "Not supported: anchors/);
});

test('an address in llms.txt that leads nowhere is refused', () => {
  // The other rule from the same measurement, and the reason it exists: the
  // rules followed addresses in HTML and never in the three files a crawler or
  // a language model reaches the site through. A guide that is renamed leaves
  // llms.txt pointing at a 404, and nothing notices.
  const dir = repo();
  const file = join(dir, 'site', 'llms.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /\/guides\/csv-to-sql\//, 'llms.txt is expected to list the guide; this is the bug under test');
  writeFileSync(file, text.replace('https://transmute.run/guides/csv-to-sql/', 'https://transmute.run/guides/csv-to-sqall/'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a dead address in llms.txt must not pass');
  assert.match(output, /site\/llms\.txt publishes https:\/\/transmute\.run\/guides\/csv-to-sqall\//);
});

test('the file robots.txt hands a language model, stripped of its price, is refused', () => {
  // The measured fund, and a different reader from every rule above it. Every
  // one of those asks a reader who has arrived on a page, and a link is an
  // answer to that reader. robots.txt names a reader who is handed one URL and
  // answers from the text, so a link is not an answer: it will not open
  // /support/ and read the price off it. Measured before the rule existed,
  // llms.txt named Desktop Pro and "three machines" and stated no price and no
  // payment link, while llms-full.txt — which nothing points at — had all four.
  const dir = repo();
  const file = join(dir, 'site', 'llms.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /Desktop Pro is a one-time purchase of 19 USD/, 'llms.txt is expected to state the price; this is the bug under test');
  writeFileSync(file, text.replace('Desktop Pro is a one-time purchase of 19 USD', 'Desktop Pro is a one-time purchase'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'the file the site hands a language model must state the price');
  assert.match(output, /site\/llms\.txt is a file the site publishes for language models and states no price/);
});

test('a robots.txt that points language models at a file that cannot answer is refused', () => {
  // The same rule, from the other end: it reads the pointer out of robots.txt
  // instead of naming llms.txt, so moving the pointer is caught too. Without
  // this the rule would be a check on one filename that goes green the moment
  // the site sends models somewhere else — and the pointer is what decides who
  // gets the file at all.
  const dir = repo();
  const file = join(dir, 'site', 'robots.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /Guidance for language models: https:\/\/transmute\.run\/llms\.txt/, 'robots.txt is expected to name the model guidance; this is the bug under test');
  writeFileSync(file, text.replace('https://transmute.run/llms.txt', 'https://transmute.run/sitemap.xml'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a pointer to a file with no price must not pass');
  assert.match(output, /site\/sitemap\.xml is a file the site publishes for language models and states no payment link/);
});

test('the file robots.txt hands a language model, stripped of its product key, is refused', () => {
  // The same reader, asked a follow-up. The price is what a model quotes when
  // someone asks what Transmute costs; the product key is what it has to send
  // when someone hands it a licence key and says activate. Measured before the
  // rule existed: the key was in 0 of the 7 public files, and the licence API
  // answers a wrong `product` with 403 and "This license key is for another
  // product." — which a reader holding a correctly purchased key cannot act on.
  const dir = repo();
  const file = join(dir, 'site', 'llms.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /`transmute-desktop`/, 'llms.txt is expected to state the product key; this is the bug under test');
  writeFileSync(file, text.replace('`transmute-desktop`', '`transmute`'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'the file the site hands a language model must state the product key');
  assert.match(output, /site\/llms\.txt is a file the site publishes for language models and states no product key/);
});

test('the file robots.txt hands a language model, stripped of the licence API address, is refused', () => {
  // The product key on its own is half an answer — it is a value with nowhere to
  // go. Both facts are locked together so neither can be published alone and
  // still read as a complete instruction.
  const dir = repo();
  const file = join(dir, 'site', 'llms.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /https:\/\/mahope\.tools\/api\/license\//, 'llms.txt is expected to state the licence API address; this is the bug under test');
  writeFileSync(file, text.replaceAll('https://mahope.tools/api/license/', 'https://mahope.tools/'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'the product key must be published with the address it is sent to');
  assert.match(output, /site\/llms\.txt is a file the site publishes for language models and states no licence API address/);
});

test('llms-full.txt, stripped of the licence call, is refused even though nothing points at it', () => {
  // The reach, measured 2026-09-29 with tools/measure_t117.py before this test
  // existed. The rule asked the one file robots.txt names. llms-full.txt is the
  // file the llmstxt.org convention calls the whole text, and llms.txt links it
  // as "Full reference in one file" — so it is a file a model can be handed, and
  // it stated the price and 0 of the 5 parts of the call. A model given the full
  // file could quote 19 USD and could not activate anything. Nothing caught it:
  // the pointer does not name this file, which is exactly why the rule now asks
  // the convention rather than the pointer.
  const dir = repo();
  const file = join(dir, 'site', 'llms-full.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /https:\/\/mahope\.tools\/api\/license\//, 'llms-full.txt is expected to state the licence API address; this is the bug under test');
  writeFileSync(file, text.replaceAll('https://mahope.tools/api/license/', 'https://mahope.tools/'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'every file the site publishes for models must state the licence call, not only the one robots.txt names');
  assert.match(output, /site\/llms-full\.txt is a file the site publishes for language models and states no licence API address/);
});

test('a new llms file published without the call is refused the day it is added', () => {
  // The rule reads the convention rather than a list of filenames, so a file the
  // site adds later is covered the day it exists and not the day somebody
  // remembers to add it here. A list is a rule that goes green the moment the
  // site publishes somewhere else — which is the mistake T115's rule was written
  // to avoid, in the other direction.
  const dir = repo();
  const file = join(dir, 'site', 'llms-da.txt');
  writeFileSync(file, '# Transmute\n\nEt CLI der konverterer filer.\n');
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a file published under the llms.txt convention must carry the same answer as the others');
  assert.match(output, /site\/llms-da\.txt is a file the site publishes for language models and states no payment link/);
});

test('llms-full.txt, stripped of a field name, is refused', () => {
  // The address and the product key are the envelope, not the letter. A POST
  // with the wrong field name activates nothing and reports nothing about why,
  // so the two field names are locked with the address and the key.
  const dir = repo();
  const file = join(dir, 'site', 'llms-full.txt');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /`device_id`/, 'llms-full.txt is expected to name the device_id field; this is the bug under test');
  writeFileSync(file, text.replaceAll('`device_id`', '`machine`'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'the fields the call needs must be named wherever the address is');
  assert.match(output, /site\/llms-full\.txt is a file the site publishes for language models and names no `device_id` field/);
});

test('the support page, stripped of the product it sends, is refused', () => {
  // This is the bug T118 fixed. Both support pages named the failure — a key
  // bought for another product is refused — and neither said which product this
  // one is, so a reader with two keys the same shape was told the diagnosis and
  // not the treatment. The same sentence on llms.txt did carry the answer, which
  // is what made it a page defect rather than a missing fact.
  const dir = repo();
  const file = join(dir, 'site', 'support', 'index.html');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /<code>transmute-desktop<\/code>/, 'the support page is expected to name the product it sends; this is the bug under test');
  writeFileSync(file, text.replace('<code>transmute-desktop</code>', '<code>the product name</code>'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a page that names a refused key must say which product this one is');
  assert.match(output, /site\/support\/index\.html tells a reader that a key bought for another product is refused, but states no product key/);
});

test('a page that starts naming a refused key is held to the envelope the day it does', () => {
  // The trigger is the refusal itself, so the front page is not covered today and
  // is covered the moment it describes a 403. A file list would have had to be
  // edited here the day someone wrote the sentence, which is the mistake T115's
  // rule was written to avoid.
  //
  // The mutation is checked to have landed, because the front page is not a doc
  // layout and has no <article> to close — a rewrite that quietly did nothing
  // would leave this test green for the wrong reason, which is the one way a
  // claimtest can be worse than no test at all.
  const dir = repo();
  const file = join(dir, 'site', 'index.html');
  const text = readFileSync(file, 'utf8');
  const mutated = text.replace('</main>',
    '<p>A key bought for a different product is refused.</p>\n</main>');
  assert.notEqual(mutated, text, 'the mutation must actually change the front page');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'naming the failure is what earns the rule, so naming it must be enough to fail it');
  assert.match(output, /site\/index\.html tells a reader that a key bought for another product is refused, but states no licence API address/);
});

test('the support page, stripped of the way back from a dead key, is refused', () => {
  // The bug T119 fixed, and the sibling of the one above: the same sentence names
  // a key bought for another product and a key that has been cancelled or run
  // out of time, the first was treated completely and the second not at all. A
  // subscriber whose term ran out holds a key the server refuses, and the page
  // told them what was wrong without telling them what to do.
  const dir = repo();
  const file = join(dir, 'site', 'support', 'index.html');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /buying again/, 'the support page is expected to say the way back is a new purchase; this is the bug under test');
  writeFileSync(file, text.replace(/the way forward is <a href="#buying-pro">buying again<\/a>/, 'the way forward is to write in'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a block that names a dead key must say the way back is a new purchase');
  assert.match(output, /site\/support\/index\.html tells a reader about a key that was cancelled or ran out of time \(403\), but in the same breath does not say says the way back is a new purchase/);
});

test('a block that says what to do but not where to is still refused', () => {
  // The remedy has two halves — the act and a door to the button — because
  // "buy again" three sections up the page is the diagnosis again, not a
  // treatment. A page that carries the button somewhere is not answering a
  // reader who is stuck, so only the act is not enough.
  const dir = repo();
  const file = join(dir, 'site', 'da', 'support', 'index.html');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /#kob-pro/, 'the Danish page is expected to link the door to the button; this is the bug under test');
  writeFileSync(file, text.replace(/<a href="#kob-pro">at købe igen<\/a>/, 'at købe igen'));
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'naming the new purchase is half an answer; the door to it is the other half');
  assert.match(output, /site\/da\/support\/index\.html tells a reader about a key that was cancelled or ran out of time \(403\), but in the same breath does not say and gives a door to the button/);
});

test('a document that names the same section twice is refused', () => {
  // The bug T120 fixed: `## Publishing the site` was written into the README
  // twice, eighteen lines apart and byte for byte identical, by the commit that
  // added the deploy command. Nobody saw it because the rules read the README for
  // what it claims and for the addresses it gives, and no rule read what it is
  // shaped like — so the section sat there twice on GitHub and on npmjs.com.
  const dir = repo();
  const file = join(dir, 'README.md');
  const text = readFileSync(file, 'utf8');
  const mutated = text.replace('## License', '## Publishing the site\n\nOne more thing about the site.\n\n## License');
  assert.notEqual(mutated, text, 'the mutation must actually change the README');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a reader who opens the outline sees one heading twice, so the gate must see it too');
  assert.match(output, /README\.md names the section "Publishing the site" twice/);
});

test('a document that prints the same block of lines twice is refused, even under a new heading', () => {
  // The sibling of the test above, and the one a heading check cannot see: the
  // same four lines written twice, the second time under a different heading.
  // That is what copy-paste turns into once the two copies are days apart, and it
  // is why the rule asks of blocks as well as of names. Four lines is the floor
  // the rule uses, and this is the paragraph in the README that meets it — the
  // two-line ones below and above it are left alone on purpose, because a
  // two-line repeat is a divider.
  const dir = repo();
  const file = join(dir, 'README.md');
  const text = readFileSync(file, 'utf8');
  const block = 'It refuses, naming the reason, when `HEAD` is not the default branch, when the\nworking tree is dirty, or when the credentials are missing — a branch or a\nlaptop is not something to publish. Afterwards it runs `npm run check:deploy`,\nwhich compares the live files against `main`; a 200 on its own proves nothing.';
  assert.ok(text.includes(block), 'the README is expected to carry this paragraph once; this is the bug under test');
  const mutated = text.replace('## License', `## Notes\n\n${block}\n\n## License`);
  assert.notEqual(mutated, text, 'the mutation must actually change the README');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a paragraph printed twice is a section written twice, whatever it is called');
  assert.match(output, /README\.md prints the same \d+ lines twice/);
});

test('a page that gives one name to two elements is refused', () => {
  // The finding T121 measured: site/cheatsheet/index.html held `count` on its
  // `<section>` and again on the `<h3>` inside it, so the second one was not a
  // name anything could reach. Twenty-four sibling sections avoided it by
  // putting the operation's argument in the heading's name, and `count` takes no
  // argument — which is why only a question could tell. The mutation gives the
  // name to a second element, which is what a copied `<section>` looks like.
  const dir = repo();
  const file = join(dir, 'site', 'guides', 'flatten-nested-json', 'index.html');
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes('<h2 id="problem">'), 'the guide is expected to carry this heading; this is the bug under test');
  assert.ok(text.includes('<h2 id="gotchas">'), 'and this other one, which the mutation hands the same name as');
  const mutated = text.replace('<h2 id="problem">', '<h2 id="gotchas">');
  assert.notEqual(mutated, text, 'the mutation must actually change the page');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a name two elements share is a name the second element cannot be reached by');
  assert.match(output, /gives the name "gotchas" to two elements, at lines \d+ and \d+/);
});

test('a page that links to a name it does not hold is refused', () => {
  // The other half, and the one that decides whether the first half is worth
  // asking: a page may name everything once and still link to something it
  // never wrote. There were none on 2026-09-29, which is why this is a mutation
  // and not a repair — the rule covers the day a page links to itself wrongly.
  const dir = repo();
  const file = join(dir, 'site', 'cheatsheet', 'index.html');
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes('href="#count"'), 'the cheatsheet is expected to link its count section; this is the bug under test');
  const mutated = text.replace('href="#count"', 'href="#counted"');
  assert.notEqual(mutated, text, 'the mutation must actually change the page');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a link inside a page is an address, and an address that names nothing goes nowhere');
  assert.match(output, /site\/cheatsheet\/index\.html links to #counted, which it does not hold a name for/);
});

test('an address in the README is followed like an address anywhere else', () => {
  // The reach, not the finding: T114's rule read `site/` only, so of the 29
  // published files 23 gave addresses the gate never looked at — the README and
  // the reference the CLI itself points to among them. All 23 resolved on
  // 2026-09-29, so widening the rule repaired nothing that day; it closed a
  // blind spot, and this is the test that says the blind spot is closed.
  const dir = repo();
  const file = join(dir, 'README.md');
  const text = readFileSync(file, 'utf8');
  const mutated = text.replace('https://transmute.run/support/', 'https://transmute.run/guides/no-such-guide/');
  assert.notEqual(mutated, text, 'the mutation must actually change the README');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'the README is a published file, so its addresses resolve the day they are written');
  assert.match(output, /README\.md publishes https:\/\/transmute\.run\/guides\/no-such-guide\/, but site\/guides\/no-such-guide\/index\.html does not exist/);
});

test('a document that names an input it does not ship must show what the tool prints without it', () => {
  // The finding T123 measured: of 54 commands the reference documents, 38 name
  // a fixture this repository ships and 16 name a file the reader has to bring.
  // The first command on the page is one of the sixteen, and the tool's answer
  // to it — `Error: File not found:` — was in none of the 28 public files. The
  // mutation deletes the answer and leaves the commands, which is what a page
  // looks like after somebody tidies an example away.
  const dir = repo();
  const file = join(dir, 'docs', 'cli.md');
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes('Error: File not found: data.csv'), 'the reference is expected to show the missing-file answer; this is the bug under test');
  const mutated = text.replace(/```\nError: File not found: data\.csv\n```\n/g, '');
  assert.notEqual(mutated, text, 'the mutation must actually change the reference');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'a document that sends a reader to a file nobody has owes them the answer');
  assert.match(output, /docs\/cli\.md shows \d+ command\(s\) reading a file this repository does not ship, and never shows what Transmute prints/);
});

test('a document that claims its examples are all run must say which ones are not', () => {
  // The promise, not the answer. The reference said `test/cli.test.mjs` ran
  // "every command on this page" while 16 of them read a file the reader
  // brings, and the exception lived in a comment in the test rather than on the
  // page. The mutation puts the claim back without the paragraph that names the
  // skip — which is how the false claim was written in the first place.
  const dir = repo();
  const file = join(dir, 'docs', 'cli.md');
  const text = readFileSync(file, 'utf8');
  const paragraph = 'The one set neither suite can run is the commands that read a file you bring';
  assert.ok(text.includes(paragraph), 'the reference is expected to name the commands the suite skips; this is the bug under test');
  const mutated = text.replace(paragraph,
    '`test/cli.test.mjs` — the real CLI in a child process: every command on this\n   page, all exit codes, stdout/stderr separation, `--out`, stdin, and a\n   50-record run.\n\nThe other suites are unit tests for the engine and a comparison of every\ncommand and excerpt above against what the engine produces.');
  assert.notEqual(mutated, text, 'the mutation must actually change the reference');
  writeFileSync(file, mutated);
  const { code, output } = contractCheck(dir);
  assert.equal(code, 1, 'coverage that is only true by silence is the claim a reader finds out about first');
  assert.match(output, /claims ".*every command on this page.*" and names no exception/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
