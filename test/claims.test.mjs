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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
