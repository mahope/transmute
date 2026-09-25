'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUY_URL = 'https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02';
const appPath = path.join(__dirname, '..', 'desktop', 'frontend', 'app.js');
const htmlPath = path.join(__dirname, '..', 'desktop', 'frontend', 'index.html');
const tauriConfigPath = path.join(__dirname, '..', 'desktop', 'src-tauri', 'tauri.conf.json');
const capabilityPath = path.join(__dirname, '..', 'desktop', 'src-tauri', 'capabilities', 'default.json');
const appSource = fs.readFileSync(appPath, 'utf8');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : force;
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.href = '';
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.style = { display: '' };
    this.className = '';
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = new Map();
    this.selected = false;
    this.type = '';
    this.placeholder = '';
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  remove() {}

  focus() {}
}

function createDocument() {
  const ids = [
    'pipeline', 'addStep', 'inputData', 'outputPane', 'errorBanner',
    'limitBanner', 'runsLeft', 'tierBadge', 'inputFormat', 'outputFormat',
    'runBtn', 'licenseFree', 'licenseForm', 'licenseActive', 'buyLink',
    'buyLink2', 'showLicenseBtn', 'cancelLicenseBtn', 'licenseInput',
    'activateBtn', 'deactivateBtn', 'licensedAs'
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  elements.get('inputData').value = '[{"name":"Alice","age":32}]';
  elements.get('inputFormat').value = 'json';
  elements.get('outputFormat').value = 'table';
  return {
    elements,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      return new FakeElement(tag);
    }
  };
}

function createApp({ tauri = false, rejectOpener = false } = {}) {
  const document = createDocument();
  const calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === 'plugin:opener|open_url' && rejectOpener) {
      throw new Error('private plugin detail');
    }
    if (command === 'get_free_limit') return 3;
    if (command === 'get_license_state') return { license_key: null };
    if (command === 'get_runs_used') return 0;
    return null;
  };
  const window = { __TAURI__: tauri ? { core: { invoke } } : undefined };
  const context = { window, document, console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(appSource, context, { filename: appPath });
  return { document, calls };
}

function clickEvent() {
  return {
    type: 'click',
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function openerCalls(calls) {
  return calls.filter(call => call.command === 'plugin:opener|open_url');
}

async function testTauriLinks() {
  const app = createApp({ tauri: true });
  await flushPromises();

  for (const id of ['buyLink', 'buyLink2']) {
    const element = app.document.getElementById(id);
    assert.equal(element.href, BUY_URL);
    const event = clickEvent();
    element.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }

  await flushPromises();
  const calls = openerCalls(app.calls);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, 'plugin:opener|open_url');
    assert.equal(call.args.url, BUY_URL);
  }
}

async function testBrowserFallback() {
  const app = createApp();
  await flushPromises();

  for (const id of ['buyLink', 'buyLink2']) {
    const element = app.document.getElementById(id);
    const event = clickEvent();
    element.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }

  assert.equal(openerCalls(app.calls).length, 0);
}

async function testOpenerError() {
  const app = createApp({ tauri: true, rejectOpener: true });
  await flushPromises();

  const buyLink = app.document.getElementById('buyLink');
  const event = clickEvent();
  buyLink.dispatchEvent(event);
  await flushPromises();

  assert.equal(event.defaultPrevented, true);
  assert.equal(app.document.getElementById('errorBanner').style.display, 'block');
  assert.match(app.document.getElementById('errorBanner').textContent, /system browser/i);
  assert.doesNotMatch(app.document.getElementById('errorBanner').textContent, /private plugin detail/);

  const runEvent = clickEvent();
  app.document.getElementById('runBtn').dispatchEvent(runEvent);
  await flushPromises();
  assert.notEqual(app.document.getElementById('outputPane').value, '');
}

function testConfiguration() {
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
  const capability = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  const html = fs.readFileSync(htmlPath, 'utf8');
  const openerPermissions = capability.permissions.filter(permission => {
    const identifier = typeof permission === 'string' ? permission : permission.identifier;
    return typeof identifier === 'string' && identifier.startsWith('opener:');
  });
  const openerPermission = openerPermissions[0];

  assert.equal(tauriConfig.app.withGlobalTauri, true);
  assert.equal(openerPermissions.length, 1);
  assert.deepEqual(openerPermission, {
    identifier: 'opener:allow-open-url',
    allow: [{ url: BUY_URL }]
  });
  assert.equal(capability.permissions.includes('opener:default'), false);
  assert.equal(capability.permissions.includes('opener:allow-default-urls'), false);
  assert.equal(capability.permissions.includes('opener:allow-open-path'), false);
  assert.equal(capability.permissions.includes('opener:allow-reveal-item-in-dir'), false);
  assert.match(html, /id="buyLink"/);
  assert.match(html, /id="buyLink2"/);
}

async function main() {
  await testTauriLinks();
  await testBrowserFallback();
  await testOpenerError();
  testConfiguration();
  console.log('Desktop purchase-link tests: 4 passed');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
