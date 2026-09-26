#!/usr/bin/env node

/**
 * Transmute Engine — core data transformation pipeline
 *
 * Input → [Parse] → [Filter → Map → Pick → Sort → Unique → ...] → [Serialize] → Output
 *
 * All operations are pure functions that operate on arrays of objects.
 * The pipeline is a JSON array of operation descriptors.
 */

// ─── Format parsers / serializers ────────────────────────────────────────

const parsers = {
  json: (text) => {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  },
  csv: (text, opts) => parseCSV(text, opts),
  yaml: (text) => {
    // Simple YAML parser for basic structures (arrays of scalars/objects)
    const lines = text.split('\n');
    if (lines.length === 0) return [];
    
    // Try JSON.parse first (YAML is superset of JSON)
    try { return parsers.json(text); } catch {}
    
    // Detect if it's a YAML list
    const result = [];
    let current = null;
    let isList = false;
    let sawAny = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      sawAny = true;
      
      if (trimmed.startsWith('- ')) {
        isList = true;
        const val = trimmed.slice(2).trim();
        // Check if it's a key: value pair
        if (val.includes(': ')) {
          if (current) result.push(current);
          current = {};
          const [k, ...v] = val.split(': ');
          current[k.trim()] = v.join(': ').trim();
        } else {
          current = null;
          result.push(parseYAMLValue(val));
        }
      } else if (trimmed.includes(': ') && !trimmed.startsWith('- ')) {
        if (current && !isList) {
          const [k, ...v] = trimmed.split(': ');
          current[k.trim()] = parseYAMLValue(v.join(': ').trim());
        } else if (isList && current) {
          // continuation of previous object
          const [k, ...v] = trimmed.split(': ');
          current[k.trim()] = parseYAMLValue(v.join(': ').trim());
        }
      } else if (!trimmed.startsWith('-') && !trimmed.includes(':')) {
        // Scalar list item without dash — edge case
        if (trimmed) result.push(parseYAMLValue(trimmed));
      }
    }
    if (current) result.push(current);
    if (!isList && sawAny && result.length === 0 && current === null) {
      // Single top-level object (not a list): collect key: value pairs
      const obj = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^([^:#]+):\s*(.*)$/);
        if (m) obj[m[1].trim()] = parseYAMLValue(m[2]);
      }
      if (Object.keys(obj).length > 0) return [obj];
    }
    return result;
  },
  xml: (text) => {
    // Minimal XML to array-of-objects conversion.
    // Strategy: find the root element's matching close tag, parse its direct
    // children; if each child has the same tag and contains sub-elements,
    // flatten to one row per child (array-of-records shape).
    const strip = (s) => s
      .replace(/<\?[\s\S]*?\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    text = strip(text);
    const rootMatch = text.match(/^<(\w+)([^>]*)>/);
    if (!rootMatch) return [];
    const rootTag = rootMatch[1];
    const openLen = rootMatch[0].length;
    const closeIdx = text.lastIndexOf('</' + rootTag + '>');
    if (closeIdx === -1) return [];
    const inner = text.slice(openLen, closeIdx);

    // Parse one element starting at index i in `inner`.
    // Returns [{ tag, value }, nextIndex] so parents can key children by tag name.
    const parseElement = (inner, i) => {
      const m = inner.slice(i).match(/^<(\w+)((?:[^>"']|"[^"]*"|'[^']*')*)>/);
      if (!m) return null;
      const tag = m[1];
      const contentStart = i + m[0].length;
      if (m[2].trim().endsWith('/')) return [{ tag, value: '' }, contentStart];
      const closeTag = '</' + tag + '>';
      const closeIdx = inner.indexOf(closeTag, contentStart);
      if (closeIdx === -1) return null;
      const content = inner.slice(contentStart, closeIdx).trim();
      let value;
      if (content.startsWith('<')) {
        value = {};
        let pos = 0;
        while (pos < content.length) {
          const rest = content.slice(pos);
          if (!rest.trim()) break;
          const offset = pos + (rest.length - rest.trimStart().length);
          const child = parseElement(content, offset);
          if (!child) break;
          const [{ tag: childTag, value: childValue }, next] = child;
          if (childTag in value) {
            if (!Array.isArray(value[childTag])) value[childTag] = [value[childTag]];
            value[childTag].push(childValue);
          } else {
            value[childTag] = childValue;
          }
          pos = next;
        }
      } else {
        value = content;
      }
      return [{ tag, value }, closeIdx + closeTag.length];
    };

    // Parse all top-level children of root
    const rows = [];
    let pos = 0;
    while (pos < inner.length) {
      const rest = inner.slice(pos);
      if (!rest.trim()) break;
      const offset = pos + (rest.length - rest.trimStart().length);
      const parsed = parseElement(inner, offset);
      if (!parsed) break;
      const [{ tag, value }, next] = parsed;
      rows.push({ [tag]: value });
      pos = next;
    }

    // Flatten: <data><item>...</item><item>...</item></data> → records
    if (
      rows.length > 0 &&
      rows.every((r) => Object.keys(r).length === 1) &&
      new Set(rows.map((r) => Object.keys(r)[0])).size === 1 &&
      rows.every((r) => typeof r[Object.keys(r)[0]] === 'object')
    ) {
      const key = Object.keys(rows[0])[0];
      const flat = rows.map((r) => r[key]);
      if (flat.every((v) => typeof v === 'object' && !Array.isArray(v))) return flat;
    }

    return rows;
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

/**
 * Every key any record has, in first-seen order. `Object.keys(data[0])` alone
 * silently drops keys that only later records carry, and that is the normal
 * shape of JSON from an API or of a left join with no match. The SQL serializer
 * already worked this way; CSV and table now agree with it instead of losing
 * the columns.
 */
function unionKeys(data) {
  const keys = Object.keys(data[0]);
  const seen = new Set(keys);
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
    }
  }
  return keys;
}

const serializers = {
  sql: (data, tableName = 'my_table') => {
    if (!Array.isArray(data)) data = [data];
    if (data.length === 0 || typeof data[0] !== 'object') return '';
    const cols = [...new Set(data.flatMap(r => Object.keys(r)))];
    const colList = cols.map(c => `"${c}"`).join(', ');
    const lines = [`-- Generated by Transmute`, `INSERT INTO "${tableName}" (${colList}) VALUES`];
    const rows = data.map(row =>
      `  (${cols.map(c => sqlValue(row[c])).join(', ')})`
    );
    return lines[0] + '\n' + lines[1] + '\n' + rows.join(',\n') + ';';
  },

  json: (data, pretty = true) => pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data),
  csv: (data) => {
    if (data.length === 0) return '';
    const headers = unionKeys(data);
    const lines = [headers.map(escapeCSV).join(',')];
    for (const row of data) {
      lines.push(headers.map(h => escapeCSV(String(row[h] ?? ''))).join(','));
    }
    return lines.join('\n');
  },
  yaml: (data) => {
    if (!Array.isArray(data)) data = [data];
    return data.map(item => {
      if (typeof item !== 'object' || item === null) return `- ${item}`;
      const keys = Object.keys(item);
      return keys.map((k, i) => {
        const prefix = i === 0 ? '- ' : '  ';
        return `${prefix}${k}: ${formatYAMLValue(item[k])}`;
      }).join('\n');
    }).join('\n');
  },
  xml: (data, rootName = 'data') => {
    if (!Array.isArray(data)) data = [data];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
    for (const row of data) {
      if (typeof row !== 'object' || row === null) {
        xml += `  <item>${escapeXML(String(row))}</item>\n`;
      } else {
        xml += `  <item>\n`;
        for (const [key, val] of Object.entries(row)) {
          xml += `    <${key}>${escapeXML(String(val ?? ''))}</${key}>\n`;
        }
        xml += `  </item>\n`;
      }
    }
    xml += `</${rootName}>`;
    return xml;
  },
  table: (data) => {
    if (data.length === 0) return '(empty)';
    const headers = unionKeys(data);
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };
    // Calculate column widths
    const colWidths = headers.map(h => Math.max(
      h.length,
      ...data.map(row => cell(row[h]).length)
    ));
    // Build separator
    const sep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Header
    const header = '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';
    const headerSep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Rows (first 20)
    const maxRows = 20;
    const rows = data.slice(0, maxRows).map(row =>
      '| ' + headers.map((h, i) => cell(row[h]).padEnd(colWidths[i])).join(' | ') + ' |'
    );
    let output = [headerSep, header, headerSep, ...rows, headerSep];
    if (data.length > maxRows) {
      output.push(`... ${data.length - maxRows} more rows`);
    }
    output.push(`(${data.length} rows, ${headers.length} columns)`);
    return output.join('\n');
  }
};

// ─── Transformation operations ───────────────────────────────────────────

const operations = {
  filter: (data, params) => {
    const fn = compileExpression(params.expr);
    return data.filter((item, i) => fn(item, i));
  },
  map: (data, params) => {
    const fn = compileExpression(params.expr);
    return data.map((item, i) => fn(item, i));
  },
  pick: (data, params) => {
    const fields = Array.isArray(params.fields) ? params.fields : [params.fields];
    return data.map(item => {
      const picked = {};
      for (const f of fields) {
        if (f in item) picked[f] = item[f];
      }
      return picked;
    });
  },
  omit: (data, params) => {
    const fields = new Set(Array.isArray(params.fields) ? params.fields : [params.fields]);
    return data.map(item => {
      const omitted = {};
      for (const [k, v] of Object.entries(item)) {
        if (!fields.has(k)) omitted[k] = v;
      }
      return omitted;
    });
  },
  sort: (data, params) => {
    const by = params.by;
    const dir = params.dir === 'desc' ? -1 : 1;
    return [...data].sort((a, b) => {
      const va = a[by], vb = b[by];
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  },
  unique: (data, params) => {
    const by = params.by;
    const seen = new Set();
    return data.filter(item => {
      const key = by ? item[by] : JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  group: (data, params) => {
    const by = params.by;
    const groups = {};
    for (const item of data) {
      const key = item[by] ?? '(null)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).map(([key, items]) => ({
      key,
      count: items.length,
      items
    }));
  },
  count: (data) => {
    return [{ count: data.length }];
  },
  head: (data, params) => {
    const n = params.n ?? 10;
    return data.slice(0, n);
  },
  tail: (data, params) => {
    const n = params.n ?? 10;
    return data.slice(-n);
  },
  rename: (data, params) => {
    const mapping = params.mapping ?? {};
    return data.map(item => {
      const renamed = {};
      for (const [k, v] of Object.entries(item)) {
        renamed[mapping[k] ?? k] = v;
      }
      return renamed;
    });
  },
  flatten: (data, params) => {
    const field = params.field;
    const result = [];
    for (const item of data) {
      const arr = item[field];
      if (Array.isArray(arr)) {
        for (const sub of arr) {
          if (typeof sub === 'object' && sub !== null) {
            result.push({ ...item, [field]: undefined, ...sub });
          } else {
            result.push({ ...item, [field]: sub });
          }
        }
      } else {
        result.push(item);
      }
    }
    return result;
  },
  add: (data, params) => {
    const fields = params.fields ?? {};
    return data.map((item, i) => {
      const out = { ...item };
      for (const [name, spec] of Object.entries(fields)) {
        const expr = typeof spec === 'object' && spec !== null ? spec.expr : spec;
        try {
          out[name] = compileExpression(expr)(item, i);
        } catch (e) {
          out[name] = null;
        }
      }
      return out;
    });
  },
  join: (data, params) => {
    const rows = Array.isArray(params.with) ? params.with : [];
    const on = params.on;
    const index = new Map(rows.map(r => [String(r[on]), r]));
    const keepMissing = params.keep === 'left' || params.keep === 'all';
    const prefix = params.prefix ?? '';
    const result = [];
    for (const item of data) {
      const match = index.get(String(item[on]));
      if (match) {
        const merged = { ...item };
        for (const [k, v] of Object.entries(match)) {
          if (k !== on && !(k in merged)) merged[prefix + k] = v;
        }
        result.push(merged);
      } else if (keepMissing) {
        result.push(item);
      }
    }
    return result;
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * CSV has no types. Coerce values the way spreadsheets and most converters do:
 * numbers become numbers, true/false become booleans, empty becomes ''.
 * Leading-zero values (zip codes, IDs like "007") stay strings on purpose.
 */
function coerceCSVValue(val) {
  if (val === '') return '';
  if (/^0\d+$/.test(val)) return val;           // preserve leading zeros
  if (/^-?\d+(\.\d+)?$/.test(val) && val.length < 16) return Number(val);
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
}

/** Delimiters recognised when the caller does not force one. `,` wins a tie. */
const CSV_DELIMITERS = [',', ';', '\t', '|'];

/**
 * Count occurrences of `delimiter` in `line` that sit outside quoted sections.
 */
function countUnquoted(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count++;
    }
  }
  return count;
}

/**
 * Pick the delimiter from the first line. Excel in Denmark, Germany and most of
 * the rest of Europe writes `;` by default, so a comma-only reader silently
 * collapses such a file into a single column. A tie — and a line with no
 * delimiter at all — keeps `,`, so single-column and comma files are unchanged.
 */
function detectDelimiter(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  let best = ',';
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const count = countUnquoted(firstLine, delimiter);
    if (count > bestCount) { best = delimiter; bestCount = count; }
  }
  return best;
}

/**
 * Name for a value that arrived without a header of its own. The position is
 * 1-based, so `column4` is the fourth field of the row, which is where the user
 * has to look. A counter is added when the file already uses that name, so a
 * real column is never overwritten.
 */
function extraColumnName(index, taken) {
  const base = `column${index + 1}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/**
 * One warning per parse, not one per row: a 10,000-row file must not print
 * 10,000 lines to stderr. Row numbers and column names are both capped so a
 * broken export stays readable, and the message says where the values went
 * rather than only that something was wrong.
 */
function extraFieldsWarning(rowCount, lines, columns) {
  const names = [...columns];
  const shown = [...lines].slice(0, 3).join(', ');
  const where = lines.size > 3 ? `rows ${shown} and ${lines.size - 3} more` : `row${lines.size > 1 ? 's' : ''} ${shown}`;
  const cols = names.slice(0, 5);
  const rest = names.length > cols.length ? `, and ${names.length - cols.length} more` : '';
  const verb = lines.size === 1 ? 'has' : 'have';
  return `${lines.size} of ${rowCount} CSV rows ${verb} more fields than the header (${where}); the extra values are kept in ${cols.join(', ')}${rest}`;
}

/**
 * RFC 4180 reader: a quoted field may contain the delimiter, escaped quotes
 * (`""`) and line breaks, and whitespace inside quotes is data. Unquoted fields
 * are still trimmed, which is what every spreadsheet export expects.
 *
 * A row with more fields than the header keeps its extra values in a `columnN`
 * field instead of dropping them. Appending a column to a file without
 * touching the header is the normal cause, and the values are usually wanted.
 */
function parseCSV(text, opts = {}) {
  const delimiter = opts.delimiter || detectDelimiter(text);
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let quoted = false;

  const endField = () => {
    record.push(quoted ? field : field.trim());
    field = '';
    quoted = false;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') { inQuotes = true; quoted = true; continue; }
    if (char === delimiter) { endField(); continue; }
    if (char === '\r') { if (text[i + 1] === '\n') i++; endRecord(); continue; }
    if (char === '\n') { endRecord(); continue; }
    field += char;
  }
  if (field !== '' || record.length > 0 || quoted) endRecord();

  // RFC 4180 allows blank lines between records; the first real record is the header.
  const recordsWithIndex = records.filter((values) => !(values.length === 1 && values[0] === ''));
  if (recordsWithIndex.length === 0) return [];
  const headers = recordsWithIndex[0].map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h));

  const rows = [];
  const headerNames = new Set(headers);
  const extraNames = new Map();
  const extraLines = new Set();
  for (let r = 1; r < recordsWithIndex.length; r++) {
    const values = recordsWithIndex[r];
    const row = {};
    headers.forEach((h, idx) => { row[h] = idx < values.length ? coerceCSVValue(values[idx]) : ''; });
    if (values.length > headers.length) {
      extraLines.add(r + 1);
      for (let idx = headers.length; idx < values.length; idx++) {
        // One name per field position, not per value: a file where 900 rows
        // are too long must not produce 1800 columns.
        if (!extraNames.has(idx)) extraNames.set(idx, extraColumnName(idx, headerNames));
        row[extraNames.get(idx)] = coerceCSVValue(values[idx]);
      }
    }
    rows.push(row);
  }
  if (extraLines.size > 0 && Array.isArray(opts.warnings)) {
    opts.warnings.push(extraFieldsWarning(rows.length, extraLines, extraNames.values()));
  }
  return rows;
}

function escapeCSV(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function parseYAMLValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') return num;
  return val;
}

function formatYAMLValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function escapeXML(val) {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Compile a safe JS expression for filter/map operations.
 * The expression receives `item` (current row) and `i` (index).
 * Returns a function or the default identity passthrough.
 */
function compileExpression(expr) {
  if (!expr || expr === 'item') return (item) => item;
  try {
    const fn = new Function('item', 'i', `"use strict"; return (${expr});`);
    return fn;
  } catch {
    return (item) => item;
  }
}

// ─── Main pipeline function ──────────────────────────────────────────────

/**
 * Run a transformation pipeline.
 *
 * @param {string} inputText - Raw input text
 * @param {string} inputFormat - 'json' | 'csv' | 'yaml' | 'xml'
 * @param {Array} pipeline - Array of { op, ...params }
 * @param {string} outputFormat - 'json' | 'csv' | 'yaml' | 'xml' | 'table' | 'sql'
 * @param {object} opts - serializer options, e.g. { tableName: 'users' } for sql
 * @returns {object} { data, text, error }
 */
function run(inputText, inputFormat, pipeline = [], outputFormat = 'json', opts = {}) {
  // Collected here so a parse can report what it had to work around, and the
  // caller decides whether that is a line on stderr or nothing at all. The
  // browser build ignores them; the extra columns are visible in its output.
  const warnings = [];
  try {
    // Parse
    if (!parsers[inputFormat]) return { error: `Unknown input format: ${inputFormat}` };
    let data = parsers[inputFormat](inputText, { ...opts, warnings });

    // Transform
    for (const step of pipeline) {
      if (!operations[step.op]) return { error: `Unknown operation: ${step.op}` };
      data = operations[step.op](data, step);
      if (!Array.isArray(data)) data = [data];
    }

    // Serialize
    if (!serializers[outputFormat]) return { error: `Unknown output format: ${outputFormat}` };
    const text = serializers[outputFormat](data, outputFormat === 'sql' ? opts.tableName : undefined);

    return { data, text, warnings };
  } catch (err) {
    return { error: err.message, warnings };
  }
}

module.exports = { run, parsers, serializers, operations, detectFormat };

/**
 * Detect format from filename or content.
 */
function detectFormat(filename, content) {
  if (filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const extMap = { json: 'json', csv: 'csv', yaml: 'yaml', yml: 'yaml', xml: 'xml' };
    if (extMap[ext]) return extMap[ext];
  }
  if (content) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<')) return 'xml';
    if (trimmed.startsWith('- ') || trimmed.startsWith('---')) return 'yaml';
    if (trimmed.includes('\n') && trimmed.includes(',')) {
      const firstLine = trimmed.split('\n')[0];
      if (firstLine.includes(',') && !firstLine.includes(': ')) return 'csv';
    }
  }
  return 'json'; // default
}
