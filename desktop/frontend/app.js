/* Transmute desktop frontend — runs the same engine as the CLI and web demo. */
'use strict';

let invoke = null;
if (window.__TAURI__ && window.__TAURI__.core) {
  invoke = window.__TAURI__.core.invoke;
}

// ─── Engine (shared logic, mirrored from src/engine.js) ──────────────

function parseCSVLine(line) {
  const result = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}
function coerceCSVValue(v) {
  if (v === '') return '';
  if (/^0\d+$/.test(v)) return v;
  if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 16) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}
function escapeCSV(v) {
  return /["\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function yamlVal(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  const n = Number(v);
  return (!isNaN(n) && String(v).trim() !== '') ? n : v;
}
function escXML(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function fmtYAMLVal(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const parsers = {
  json: (t) => { const d = JSON.parse(t); return Array.isArray(d) ? d : [d]; },
  csv: (t) => {
    const lines = t.trim().split('\n');
    if (!lines.length) return [];
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = parseCSVLine(line);
      const row = {};
      headers.forEach((h, idx) => { row[h] = idx < vals.length ? coerceCSVValue(vals[idx]) : ''; });
      rows.push(row);
    }
    return rows;
  },
  yaml: (t) => {
    try { return parsers.json(t); } catch {}
    const lines = t.split('\n');
    const obj = {};
    let found = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([^:#]+):\s*(.*)$/);
      if (m) { obj[m[1].trim()] = yamlVal(m[2]); found = true; }
    }
    if (found) return [obj];
    return lines.map(l => l.trim()).filter(l => l.startsWith('- '))
      .map(l => yamlVal(l.slice(2).trim()));
  },
  xml: (t) => {
    const strip = (s) => s.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    t = strip(t);
    const rootMatch = t.match(/^<(\w+)([^>]*)>/);
    if (!rootMatch) return [];
    const rootTag = rootMatch[1];
    const closeIdx = t.lastIndexOf('</' + rootTag + '>');
    if (closeIdx === -1) return [];
    const inner = t.slice(rootMatch[0].length, closeIdx);
    const rows = [];
    let pos = 0;
    while (pos < inner.length) {
      const rest = inner.slice(pos);
      if (!rest.trim()) break;
      pos += rest.length - rest.trimStart().length;
      const m = inner.slice(pos).match(/^<(\w+)((?:[^>"']|"[^"]*"|'[^']*')*)>/);
      if (!m) break;
      const tag = m[1];
      const contentStart = pos + m[0].length;
      if (m[2].trim().endsWith('/')) { rows.push({ [tag]: '' }); pos = contentStart; continue; }
      const ci = inner.indexOf('</' + tag + '>', contentStart);
      if (ci === -1) break;
      const content = inner.slice(contentStart, ci).trim();
      if (content.startsWith('<')) {
        const sub = {};
        const re = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;
        let mm;
        while ((mm = re.exec(content))) sub[mm[1]] = mm[2].trim();
        rows.push({ [tag]: sub });
      } else {
        rows.push({ [tag]: content });
      }
      pos = ci + tag.length + 3;
    }
    if (
      rows.length > 0 &&
      rows.every(r => Object.keys(r).length === 1) &&
      new Set(rows.map(r => Object.keys(r)[0])).size === 1 &&
      rows.every(r => typeof r[Object.keys(r)[0]] === 'object')
    ) {
      const key = Object.keys(rows[0])[0];
      return rows.map(r => r[key]);
    }
    return rows;
  }
};

const serializers = {
  json: (d) => JSON.stringify(d, null, 2),
  csv: (d) => {
    if (!d.length) return '';
    const headers = [...new Set(d.flatMap(r => Object.keys(r)))];
    const lines = [headers.map(escapeCSV).join(',')];
    for (const row of d) lines.push(headers.map(h => escapeCSV(String(row[h] ?? ''))).join(','));
    return lines.join('\n');
  },
  yaml: (d) => d.map(item => {
    if (typeof item !== 'object' || item === null) return '- ' + item;
    return Object.keys(item).map((k, i) =>
      `${i === 0 ? '- ' : '  '}${k}: ${fmtYAMLVal(item[k])}`).join('\n');
  }).join('\n'),
  xml: (d, rootName = 'data') => {
    let x = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
    for (const row of d) {
      if (typeof row !== 'object' || row === null) { x += `  <item>${escXML(String(row))}</item>\n`; continue; }
      x += '  <item>\n';
      for (const [k, v] of Object.entries(row)) x += `    <${k}>${escXML(String(v ?? ''))}</${k}>\n`;
      x += '  </item>\n';
    }
    return x + `</${rootName}>`;
  },
  table: (d) => {
    if (!d.length) return '(empty)';
    const headers = Object.keys(d[0]);
    const w = headers.map(h => Math.max(h.length, ...d.map(r => String(r[h] ?? '').length)));
    const sep = '+-' + w.map(n => '-'.repeat(n)).join('-+-') + '-+';
    const out = [sep, '| ' + headers.map((h, i) => h.padEnd(w[i])).join(' | ') + ' |', sep];
    for (const row of d.slice(0, 50)) {
      out.push('| ' + headers.map((h, i) => String(row[h] ?? '').padEnd(w[i])).join(' | ') + ' |');
    }
    out.push(sep);
    if (d.length > 50) out.push(`... ${d.length - 50} more rows`);
    out.push(`(${d.length} rows, ${headers.length} columns)`);
    return out.join('\n');
  },
  sql: (d, tableName = 'my_table') => {
    if (!Array.isArray(d)) d = [d];
    if (d.length === 0 || typeof d[0] !== 'object') return '';
    const cols = [...new Set(d.flatMap(r => Object.keys(r)))];
    const colList = cols.map(c => `"${c}"`).join(', ');
    const lines = [`-- Generated by Transmute`, `INSERT INTO "${tableName}" (${colList}) VALUES`];
    const rows = d.map(row =>
      `  (${cols.map(c => sqlValue(row[c])).join(', ')})`
    );
    return lines.join('\n') + '\n' + rows.join(',\n') + ';';
  }
};

function escapeSQLString(val) {
  return String(val).replace(/'/g, "''");
}

function sqlValue(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  const s = String(val);
  // Numeric-looking strings stay unquoted so CSV numbers insert as numbers
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 16) return s;
  return `'${escapeSQLString(s)}'`;
}

const OPS = ['filter', 'map', 'pick', 'omit', 'sort', 'unique', 'group', 'count', 'head', 'tail', 'rename', 'flatten'];

function compileExpr(expr) {
  if (!expr || expr === 'item') return (item) => item;
  try { return new Function('item', 'i', `"use strict"; return (${expr});`); }
  catch { return (item) => item; }
}

const operations = {
  filter: (d, p) => { const f = compileExpr(p.expr); return d.filter((x, i) => f(x, i)); },
  map: (d, p) => { const f = compileExpr(p.expr); return d.map((x, i) => f(x, i)); },
  pick: (d, p) => {
    const fs = Array.isArray(p.fields) ? p.fields : p.fields.split(',').map(s => s.trim()).filter(Boolean);
    return d.map(it => { const o = {}; for (const f of fs) if (f in it) o[f] = it[f]; return o; });
  },
  omit: (d, p) => {
    const fs = new Set(Array.isArray(p.fields) ? p.fields : p.fields.split(',').map(s => s.trim()).filter(Boolean));
    return d.map(it => { const o = {}; for (const [k, v] of Object.entries(it)) if (!fs.has(k)) o[k] = v; return o; });
  },
  sort: (d, p) => {
    const dir = p.dir === 'desc' ? -1 : 1;
    return [...d].sort((a, b) => {
      const va = a[p.by], vb = b[p.by];
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  },
  unique: (d, p) => {
    const seen = new Set();
    return d.filter(it => {
      const key = p.by ? it[p.by] : JSON.stringify(it);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  },
  group: (d, p) => {
    const g = {};
    for (const it of d) { const k = it[p.by] ?? '(null)'; (g[k] = g[k] || []).push(it); }
    return Object.entries(g).map(([key, items]) => ({ key, count: items.length }));
  },
  count: (d) => [{ count: d.length }],
  head: (d, p) => d.slice(0, Number(p.n) || 10),
  tail: (d, p) => d.slice(-(Number(p.n) || 10)),
  rename: (d, p) => {
    const m = {};
    String(p.mapping || '').split(',').forEach(pair => {
      const [a, b] = pair.split('=').map(s => s.trim());
      if (a && b) m[a] = b;
    });
    return d.map(it => { const o = {}; for (const [k, v] of Object.entries(it)) o[m[k] ?? k] = v; return o; });
  },
  flatten: (d, p) => {
    const res = [];
    for (const it of d) {
      const arr = it[p.field];
      if (Array.isArray(arr)) for (const s of arr) res.push(typeof s === 'object' ? { ...it, ...s } : { ...it, [p.field]: s });
      else res.push(it);
    }
    return res;
  }
};

function detectFormat(t) {
  const trimmed = t.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  if (/^\s*\{?\s*"?[\w-]+?"?\s*:/.test(trimmed) && !trimmed.includes(',')) return 'yaml';
  const firstLine = trimmed.split('\n')[0];
  if (firstLine.includes(',') && !firstLine.includes(': ')) return 'csv';
  if (/^-\s/m.test(trimmed) || trimmed.startsWith('---')) return 'yaml';
  return 'json';
}

function runPipeline(text, inFmt, pipeline, outFmt) {
  let data = parsers[inFmt](text);
  for (const step of pipeline) {
    if (!operations[step.op]) throw new Error(`Unknown operation: ${step.op}`);
    data = operations[step.op](data, step);
    if (!Array.isArray(data)) data = [data];
  }
  return { data, text: serializers[outFmt](data) };
}

// ─── Pipeline step UI ────────────────────────────────────────────────

const pipelineEl = document.getElementById('pipeline');

// Which extra params each op needs beyond the defaults
const OP_PARAMS = {
  filter: ['expr'], map: ['expr'], flatten: ['field'],
  pick: ['fields'], omit: ['fields'], rename: ['mapping'],
  unique: [], group: [], count: [],
};

function addStep(op = 'filter', params = {}) {
  const row = document.createElement('div');
  row.className = 'pipeline-row';
  row.style.marginBottom = '6px';

  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Operation');
  sel.style.width = 'auto';
  OPS.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (o === op) opt.selected = true;
    sel.appendChild(opt);
  });

  const exprWrap = document.createElement('div');
  exprWrap.className = 'expr-input';
  const paramWrap = document.createElement('div');
  paramWrap.className = 'param';
  const rmBtn = document.createElement('button');
  rmBtn.className = 'rm'; rmBtn.textContent = '✕'; rmBtn.type = 'button';
  rmBtn.setAttribute('aria-label', 'Remove step');

  function rebuild() {
    const curOp = sel.value;
    exprWrap.innerHTML = '';
    paramWrap.innerHTML = '';
    const needExpr = OP_PARAMS[curOp]?.includes('expr');
    if (needExpr) {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'JS expression, e.g. item.age > 30';
      inp.value = params.expr ?? '';
      inp.setAttribute('aria-label', 'Expression');
      inp.addEventListener('change', () => { params.expr = inp.value; });
      exprWrap.appendChild(inp);
    }
    if (OP_PARAMS[curOp]?.includes('fields')) {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'field1, field2';
      inp.value = typeof params.fields === 'string' ? params.fields : '';
      inp.setAttribute('aria-label', 'Fields');
      inp.addEventListener('change', () => { params.fields = inp.value; });
      paramWrap.appendChild(inp);
    } else if (OP_PARAMS[curOp]?.includes('mapping')) {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'old_name=new_name, other=renamed';
      inp.value = params.mapping ?? '';
      inp.setAttribute('aria-label', 'Mapping');
      inp.addEventListener('change', () => { params.mapping = inp.value; });
      paramWrap.appendChild(inp);
    } else if (OP_PARAMS[curOp]?.includes('field')) {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'Field to flatten';
      inp.value = params.field ?? '';
      inp.setAttribute('aria-label', 'Field');
      inp.addEventListener('change', () => { params.field = inp.value; });
      paramWrap.appendChild(inp);
    } else if (['sort', 'unique'].includes(curOp)) {
      const byInp = document.createElement('input');
      byInp.type = 'text'; byInp.placeholder = 'by field'; byInp.style.maxWidth = '140px';
      byInp.value = params.by ?? '';
      byInp.setAttribute('aria-label', 'By field');
      byInp.addEventListener('change', () => { params.by = byInp.value; });
      paramWrap.appendChild(byInp);
      if (curOp === 'sort') {
        const dirSel = document.createElement('select');
        dirSel.style.maxWidth = '90px';
        [['asc', 'asc'], ['desc', 'desc']].forEach(([v, l]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = l;
          if (params.dir === v) o.selected = true;
          dirSel.appendChild(o);
        });
        dirSel.addEventListener('change', () => { params.dir = dirSel.value; });
        paramWrap.appendChild(dirSel);
      }
    } else if (['head', 'tail'].includes(curOp)) {
      const nInp = document.createElement('input');
      nInp.type = 'number'; nInp.placeholder = 'n'; nInp.style.maxWidth = '80px';
      nInp.value = params.n ?? 10;
      nInp.setAttribute('aria-label', 'Count');
      nInp.addEventListener('change', () => { params.n = Number(nInp.value); });
      paramWrap.appendChild(nInp);
    }
  }

  sel.addEventListener('change', () => { params = {}; rebuild(); });
  rmBtn.addEventListener('click', () => row.remove());

  row.appendChild(sel);
  row.appendChild(exprWrap);
  row.appendChild(paramWrap);
  row.appendChild(rmBtn);
  // layout: select | expr | param | remove
  row.style.gridTemplateColumns = 'auto auto 1fr auto';
  rebuild();
  pipelineEl.appendChild(row);
}

document.getElementById('addStep').addEventListener('click', () => addStep());

function collectPipeline() {
  const steps = [];
  pipelineEl.querySelectorAll('.pipeline-row').forEach(row => {
    const sel = row.querySelector('select');
    const step = { op: sel.value };
    const expr = row.querySelector('[aria-label="Expression"]');
    if (expr && expr.value.trim()) step.expr = expr.value.trim();
    const fields = row.querySelector('[aria-label="Fields"]');
    if (fields && fields.value.trim()) step.fields = fields.value.split(',').map(s => s.trim()).filter(Boolean);
    const mapping = row.querySelector('[aria-label="Mapping"]');
    if (mapping && mapping.value.trim()) step.mapping = mapping.value.trim();
    const field = row.querySelector('[aria-label="Field"]');
    if (field && field.value.trim()) step.field = field.value.trim();
    const by = row.querySelector('[aria-label="By field"]');
    if (by && by.value.trim()) step.by = by.value.trim();
    const dir = row.querySelector('select:not([aria-label])');
    if (step.op === 'sort' && dir && dir.value) step.dir = dir.value;
    const n = row.querySelector('[aria-label="Count"]');
    if (n && n.value) step.n = Number(n.value);
    steps.push(step);
  });
  return steps.filter(s => {
    // skip empty steps
    if (s.op === 'filter' || s.op === 'map') return !!s.expr;
    if (s.op === 'pick' || s.op === 'omit') return Array.isArray(s.fields) && s.fields.length > 0;
    if (s.op === 'rename') return !!s.mapping;
    if (s.op === 'flatten') return !!s.field;
    if (s.op === 'sort' || s.op === 'unique') return !!s.by;
    return true;
  });
}

// ─── Run ─────────────────────────────────────────────────────────────

const inputEl = document.getElementById('inputData');
const outputEl = document.getElementById('outputPane');
const errorBanner = document.getElementById('errorBanner');
const limitBanner = document.getElementById('limitBanner');
const runsLeftEl = document.getElementById('runsLeft');
const tierBadge = document.getElementById('tierBadge');

let licensed = false;
let freeLimit = 3;

function updateRunsLeft() {
  if (licensed) {
    tierBadge.textContent = '✓ Pro — unlimited';
    tierBadge.classList.add('pro');
    runsLeftEl.textContent = '';
    return;
  }
  tierBadge.classList.remove('pro');
  tierBadge.textContent = `Free — ${freeLimit} runs per launch`;
  if (!invoke) { runsLeftEl.textContent = '(dev mode outside Tauri)'; return; }
  invoke('get_runs_used').then(used => {
    const left = Math.max(0, freeLimit - used);
    runsLeftEl.textContent = left > 0 ? `${left} free run${left === 1 ? '' : 's'} left` : '';
  }).catch(() => {});
}

async function doRun() {
  errorBanner.style.display = 'none';
  limitBanner.style.display = 'none';
  outputEl.value = '';

  const text = inputEl.value;
  if (!text.trim()) { showError('Input is empty.'); return; }

  const inFmt = document.getElementById('inputFormat').value ||
    detectFormat(text);
  const outFmt = document.getElementById('outputFormat').value;
  const steps = collectPipeline();

  // Free-tier gate (desktop only)
  if (invoke && !licensed) {
    try {
      await invoke('count_run');
    } catch (e) {
      limitBanner.style.display = 'flex';
      runsLeftEl.textContent = '';
      return;
    }
  }

  try {
    const result = runPipeline(text, inFmt, steps, outFmt);
    outputEl.value = result.text;
  } catch (err) {
    showError(String(err.message || err));
  }
  updateRunsLeft();
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
}

document.getElementById('runBtn').addEventListener('click', doRun);

// ─── License UI ──────────────────────────────────────────────────────

const licenseFree = document.getElementById('licenseFree');
const licenseForm = document.getElementById('licenseForm');
const licenseActive = document.getElementById('licenseActive');

const BUY_URL = 'https://auditedwp.pages.dev/transmute/#pricing';
['buyLink', 'buyLink2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.href = BUY_URL;
});

function renderLicense() {
  licenseFree.classList.toggle('hidden', licensed);
  licenseForm.classList.add('hidden');
  licenseActive.classList.toggle('hidden', !licensed);
  if (licensed) {
    invoke('get_license_state').then(lic => {
      document.getElementById('licensedAs').textContent =
        '✓ Pro activated' + (lic.email ? ' · ' + lic.email : '');
    }).catch(() => {});
  }
  updateRunsLeft();
}

document.getElementById('showLicenseBtn').addEventListener('click', () => {
  licenseForm.classList.remove('hidden');
  licenseFree.classList.add('hidden');
  document.getElementById('licenseInput').focus();
});
document.getElementById('cancelLicenseBtn').addEventListener('click', renderLicense);
document.getElementById('activateBtn').addEventListener('click', async () => {
  const key = document.getElementById('licenseInput').value.trim();
  if (!key) return;
  try {
    await invoke('activate_license', { licenseKey: key });
    licensed = true;
    renderLicense();
  } catch (e) {
    showError(String(e));
  }
});
document.getElementById('deactivateBtn').addEventListener('click', async () => {
  try { await invoke('deactivate_license'); } catch {}
  licensed = false;
  renderLicense();
});

// ─── Init ────────────────────────────────────────────────────────────

addStep('filter', {});
addStep('sort', { by: 'name' });
addStep('head', { n: 2 });

(async function init() {
  if (invoke) {
    try { freeLimit = await invoke('get_free_limit') || 3; } catch {}
    try {
      const lic = await invoke('get_license_state');
      licensed = !!lic.license_key;
    } catch {}
  } else {
    // Browser dev mode — engine works, no gating
  }
  renderLicense();

  // Run the initial demo once so the user sees output immediately (free)
  try {
    const result = runPipeline(
      inputEl.value, 'json',
      [{ op: 'sort', by: 'age', dir: 'desc' }, { op: 'head', n: 2 }],
      'table'
    );
    outputEl.value = result.text;
  } catch {}
})();
