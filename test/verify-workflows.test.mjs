import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLocalResolver, findWorkflowViolations } from '../tools/verify_workflows.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`${name}: ${error.message}`);
  }
}

function reasons(...sources) {
  return findWorkflowViolations(sources.map((source, index) => ({
    file: `fixture-${index}.yml`,
    source,
  }))).map(({ reason }) => reason);
}

function localReason(reference, localFile, localSource) {
  const [violation] = findWorkflowViolations([{
    file: 'caller.yml',
    source: `on:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    uses: ${reference}`,
    localSources: {
      [reference]: { file: localFile, source: localSource },
    },
  }]);
  return violation?.reason;
}

test('allows CI and release publication workflows', () => {
  assert.deepEqual(reasons(
    `on:\n  push:\n    branches: [main]\njobs:\n  test:\n    steps:\n      - run: npm test`,
    `on:\n  push:\n    tags: [v*]\njobs:\n  release:\n    steps:\n      - run: npm publish`,
  ), []);
});

test('allows deploy text in comments and echo commands', () => {
  assert.deepEqual(reasons(
    `on: [push]\njobs:\n  test:\n    steps:\n      - run: echo "netlify deploy"\n# npx vercel --prod`,
    `on: push\njobs:\n  test:\n    steps:\n      - run: echo "x; npx netlify deploy"`,
  ), []);
});

test('does not treat a workflow_dispatch input named push as a push trigger', () => {
  assert.deepEqual(reasons(
    `on:\n  workflow_dispatch:\n    inputs:\n      push:\n        description: test\njobs:\n  test:\n    steps:\n      - run: npm test`,
  ), []);
});

test('allows non-deploy Wrangler commands', () => {
  assert.deepEqual(reasons(
    `on:\n  push:\n    branches: [main]\njobs:\n  database:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: d1 execute transmute --command "SELECT 1"`,
  ), []);
});

test('blocks dry-run and read-only Wrangler deploy-like commands', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  check:\n    steps:\n      - run: npx wrangler pages deploy --dry-run`,
    `on: push\njobs:\n  check:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: pages deploy --dry-run`,
  ), ['Cloudflare Pages deployment', 'Cloudflare Pages deployment']);
});

test('allows read-only Wrangler commands', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  check:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: pages project list`,
  ), []);
});

test('blocks write-like Wrangler commands', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  write:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: r2 object put bucket/key --file=file`,
    `on: push\njobs:\n  write:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: kv key put namespace key value`,
    `on: push\njobs:\n  write:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: queues push queue`,
    `on: push\njobs:\n  write:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: d1 execute database --command "DELETE FROM records"`,
  ), [
    'Cloudflare Wrangler action',
    'Cloudflare Wrangler action',
    'Cloudflare Wrangler action',
    'Cloudflare Wrangler action',
  ]);
});

test('allows deploy-check scripts on push', () => {
  assert.deepEqual(reasons(
    `on:\n  push:\n    branches: [main]\njobs:\n  check:\n    steps:\n      - run: ./scripts/deploy-check.sh`,
  ), []);
});

test('blocks Cloudflare Pages without a push trigger', () => {
  assert.deepEqual(reasons(
    `on:\n  workflow_dispatch:\njobs:\n  deploy:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: pages deploy site --project-name transmute-run`,
  ), ['Cloudflare Pages deployment']);
});

test('blocks quoted Cloudflare action and flow-map command syntax', () => {
  assert.deepEqual(reasons(
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - uses: "cloudflare/wrangler-action@v3"\n        with: { command: pages deploy site }`,
  ), ['Cloudflare Pages deployment']);
});

test('allows read-only hosting CLI commands', () => {
  assert.deepEqual(reasons(
    `on:\n  push:\n    branches: [main]\njobs:\n  check:\n    steps:\n      - run: npx vercel inspect abc`,
    `on:\n  push:\n    branches: [main]\njobs:\n  check:\n    steps:\n      - run: bash -c "echo deploy"`,
  ), []);
});

test('blocks Cloudflare actions with command and args', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: pages\n          args: deploy`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with: { command: pages, args: [deploy, site] }`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: pages\n          args: \${{ inputs.args }}`,
  ), [
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
  ]);
});

test('blocks inline push triggers and list-form run steps', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - run: npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('blocks flow-array push triggers on continuation lines', () => {
  assert.deepEqual(reasons(
    `on:\n  [push]\njobs:\n  deploy:\n    steps:\n      - run: npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('blocks flow-map push triggers on continuation lines', () => {
  assert.deepEqual(reasons(
    `on:\n  { push: null }\njobs:\n  deploy:\n    steps:\n      - run: npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('fails closed for YAML anchors in event triggers', () => {
  assert.deepEqual(reasons(
    `on: &event push\njobs:\n  deploy:\n    steps:\n      - run: npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('handles consistently indented root event mappings', () => {
  assert.deepEqual(reasons(
    `  on:\n    push:\n  jobs:\n    deploy:\n      steps:\n        - run: npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('fails closed for unresolved command anchors and aliases', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - run: &deploy npx netlify deploy`,
    `on: push\njobs:\n  deploy:\n    steps:\n      - run: *deploy`,
  ), ['unresolved shell command', 'unresolved shell command']);
});

test('collects multiline plain command values', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - run: npx netlify\n          deploy`,
  ), ['Netlify']);
});

test('blocks quoted push triggers and package deploy scripts', () => {
  assert.deepEqual(reasons(
    `"on":\n  "push":\n    branches: [main]\njobs:\n  deploy:\n    steps:\n      - run: npm run deploy`,
  ), ['package deploy script']);
});

test('blocks flow-map run fields', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - { run: npx netlify deploy --prod }`,
  ), ['Netlify']);
});

test('blocks quoted run field names', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - "run": npx netlify deploy --prod`,
  ), ['Netlify']);
});

test('blocks versioned Wrangler Pages commands in block scripts', () => {
  assert.deepEqual(reasons(
    `on:\n  workflow_dispatch:\njobs:\n  deploy:\n    steps:\n      - run: |\n          npx wrangler@latest pages deploy site`,
  ), ['Cloudflare Pages deployment']);
});

test('blocks wrapped and continued Wrangler Pages commands', () => {
  assert.deepEqual(reasons(
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - run: if true; then npx wrangler pages deploy site; fi`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - run: npx wrangler pages \\\n          deploy site`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - env:\n          DEPLOY_COMMAND: npx wrangler pages deploy site\n        run: \${{ env.DEPLOY_COMMAND }}`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - env:\n          DEPLOY_COMMAND: |\n            npx wrangler pages deploy site\n        run: \${{ env.DEPLOY_COMMAND }}`,
    `on: workflow_dispatch\njobs:\n  deploy:\n    steps:\n      - uses: cloudflare/wrangler-action@v3\n        with:\n          command: \${{ inputs.command }}`,
  ), [
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
  ]);
});

test('does not treat arbitrary action inputs as Wrangler commands', () => {
  assert.deepEqual(reasons(
    `on: workflow_dispatch\njobs:\n  test:\n    steps:\n      - uses: vendor/test@v1\n        with:\n          command: pages deploy --dry-run`,
  ), []);
});

test('blocks supported command spelling variants', () => {
  assert.deepEqual(findWorkflowViolations([
    { file: 'npx.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx -y netlify deploy` },
    { file: 'netlify-cli.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx netlify-cli deploy` },
    { file: 'firebase-tools.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx firebase-tools hosting:deploy` },
    { file: 'vercel-latest.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx vercel@latest --prod` },
    { file: 'npm-exec.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm exec -- wrangler pages deploy` },
    { file: 'chained.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: cd site && npx netlify deploy` },
    { file: 'wrangler.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx wrangler deploy` },
    { file: 'npm.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm run deploy:prod` },
    { file: 'serverless.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx serverless deploy` },
    { file: 'flyctl.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: flyctl deploy` },
    { file: 'azure.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: az webapp deploy` },
    { file: 'hyphen-prefix.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm run deploy-site` },
    { file: 'hyphen-suffix.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm run site-deploy` },
    { file: 'firebase-options.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx firebase --project example hosting:deploy site` },
    { file: 'npm-options.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm --silent run deploy` },
    { file: 'bash-hyphen.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: bash scripts/site-deploy.sh` },
  ]).map(({ reason }) => reason), [
    'Netlify',
    'Netlify',
    'Firebase',
    'Vercel',
    'Cloudflare Pages deployment',
    'Netlify',
    'Cloudflare',
    'package deploy script',
    'Serverless',
    'Fly.io',
    'Azure',
    'package deploy script',
    'package deploy script',
    'Firebase',
    'package deploy script',
    'deploy script',
  ]);
});

test('blocks runner flags, local binaries, environment prefixes, and deploy suffixes', () => {
  assert.deepEqual(findWorkflowViolations([
    { file: 'no-install.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx --no-install wrangler pages deploy` },
    { file: 'package-flag.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx --package wrangler wrangler pages deploy` },
    { file: 'local-binary.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: ./node_modules/.bin/wrangler pages deploy` },
    { file: 'absolute-binary.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: /usr/local/bin/vercel --prod` },
    { file: 'env-prefix.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: CI=1 npx vercel --prod` },
    { file: 'bare-vercel.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx vercel` },
    { file: 'quoted-command.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx netlify "deploy"` },
    { file: 'script-suffix.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm run site:deploy` },
    { file: 'wrangler-versions.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npx wrangler versions deploy` },
  ]).map(({ reason }) => reason), [
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Vercel',
    'Vercel',
    'Vercel',
    'Netlify',
    'package deploy script',
    'Cloudflare',
  ]);
});

test('blocks alternate runners and shell indirections', () => {
  assert.deepEqual(findWorkflowViolations([
    { file: 'pnpm-exec.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: pnpm exec wrangler pages deploy` },
    { file: 'pnpm-dlx.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: pnpm dlx wrangler pages deploy` },
    { file: 'npm-package.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: npm exec --package=wrangler wrangler pages deploy` },
    { file: 'yarn-quiet.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: yarn dlx --quiet wrangler pages deploy` },
    { file: 'bun-x.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: bun x wrangler pages deploy` },
    { file: 'bash-c.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: bash -c "npx netlify deploy"` },
    { file: 'substitution.yml', source: `on: push\njobs:\n  x:\n    steps:\n      - run: echo "$(npx netlify deploy)"` },
  ]).map(({ reason }) => reason), [
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'Cloudflare Pages deployment',
    'shell deploy script',
    'Netlify',
  ]);
});

test('blocks flow-map push triggers and quoted deploy actions', () => {
  assert.deepEqual(reasons(
    `on: { push: { branches: [main] } }\njobs:\n  deploy:\n    steps:\n      - uses: "Azure/web-apps-deploy@v2"`,
  ), ['Azure/web-apps-deploy']);
});

test('resolves local actions with opaque names', () => {
  assert.equal(
    localReason(
      './.github/actions/site',
      '.github/actions/site/action.yml',
      `runs:\n  using: composite\n  steps:\n    - run: npx netlify deploy --prod\n      shell: bash`,
    ),
    'Netlify',
  );
});

test('blocks local actions and containers with deploy names', () => {
  assert.equal(
    localReason(
      './.github/actions/site',
      '.github/actions/site/action.yml',
      `runs:\n  using: node20\n  main: deploy.js`,
    ),
    'local deploy action',
  );
  assert.equal(
    localReason(
      './.github/actions/site',
      '.github/actions/site/action.yml',
      `runs:\n  using: docker\n  image: docker/deploy-runner`,
    ),
    'container deploy action',
  );
});

test('fails closed for opaque local runtime actions', () => {
  assert.equal(
    localReason(
      './.github/actions/site',
      '.github/actions/site/action.yml',
      `runs:\n  using: node20\n  main: index.js`,
    ),
    'local runtime action',
  );
});

test('resolves local references from the filesystem', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const resolveLocal = createLocalResolver(root);
  const resolved = resolveLocal('./.github/workflows/ci.yml', { file: 'fixture.yml' });

  assert.equal(resolved.file, '.github/workflows/ci.yml');
  assert.deepEqual(findWorkflowViolations([{
    file: 'fixture.yml',
    source: 'on: push\njobs:\n  check:\n    uses: ./.github/workflows/ci.yml',
  }], { resolveLocal }), []);
});

test('resolves local reusable workflows with workflow_call', () => {
  assert.equal(
    localReason(
      './.github/workflows/site.yml',
      '.github/workflows/site.yml',
      `on:\n  workflow_call:\njobs:\n  deploy:\n    steps:\n      - run: npx netlify deploy --prod`,
    ),
    'Netlify',
  );
});

test('blocks deploy commands stored in environment variables', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    steps:\n      - env:\n          DEPLOY_COMMAND: npx netlify deploy --prod\n        run: \${{ env.DEPLOY_COMMAND }}`,
  ), ['Netlify']);
});

test('runs the workflow verifier through its real command boundary', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath, ['tools/verify_workflows.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Workflow deploy contract: \d+ workflows passed\./);
});

test('allows non-deploy local actions on push', () => {
  assert.equal(
    localReason(
      './.github/actions/site',
      '.github/actions/site/action.yml',
      `runs:\n  using: composite\n  steps:\n    - run: npm test\n      shell: bash`,
    ),
    undefined,
  );
});

test('blocks known deploy actions on push', () => {
  assert.deepEqual(reasons(
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: nwtgck/actions-netlify@v2`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: amondnetlify/vercel-action@v25`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: FirebaseExtended/action-hosting-deploy@v0.7.0`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: crazy-max/ghaction-github-pages@v4`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: Azure/functions-action@v1`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: owner/deploy-site@v1`,
    `on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: softprops/action-gh-pages@v2`,
  ), [
    'actions/deploy-pages',
    'nwtgck/actions-netlify',
    'amondnetlify/vercel-action',
    'FirebaseExtended/action-hosting-deploy',
    'crazy-max/ghaction-github-pages',
    'Azure/functions-action',
    'deploy action',
    'softprops/action-gh-pages',
  ]);
});

test('fails closed for unresolved local references on push', () => {
  assert.deepEqual(reasons(
    `on: push\njobs:\n  deploy:\n    uses: ./.github/actions/site`,
  ), ['unresolved local reference ./.github/actions/site']);
});

console.log(`Workflow deploy tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
