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

/**
 * An XML name, loose enough for what real documents contain: a namespace
 * prefix, dots and dashes (`dc:creator`, `content-type`, `order.id`). Kept as
 * a string so the tag patterns below stay readable.
 */
const XML_NAME = '[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?';

/**
 * `name="value"`, `name='value'` or a bare `name=value`; 1 is the name, 2–4 the
 * value. A bare value may not *end* in `/`, so `<i b=two/>` reads `two` and not
 * `two/` — the slash is the tag's own closing marker. Unquoted values are not
 * valid XML anyway; they are read leniently, not strictly.
 */
const XML_ATTR = '([A-Za-z_][A-Za-z0-9._:-]*)\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]*[^\s"\'=<>`/]))';

const parsers = {
  json: (text) => {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  },
  csv: (text, opts) => parseCSV(text, opts),
  yaml: (text, opts) => parseYAML(text, opts),
  xml: (text) => {
    // XML to array-of-objects conversion.
    // Strategy: find the root element's matching close tag, parse its direct
    // children; if each child has the same tag and contains sub-elements,
    // flatten to one row per child (array-of-records shape).
    //
    // An XML name is not a bare `\w+`: a tag or attribute may carry a namespace
    // prefix, and may contain `.` and `-`. Matching only `\w+` did not make the
    // reader reject such a file — it stopped at the first name it could not read
    // and returned what it had, so `<ns:item>` or a `<!DOCTYPE>` prologue turned a
    // whole document into `[]` with exit 0. Attributes were dropped outright, and
    // an attribute whose name matched a child element's silently lost to it.
    const strip = (s) => s
      .replace(/<\?[\s\S]*?\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // A DOCTYPE may carry an internal subset in `[...]`, which can itself
      // contain `>`, so the declaration cannot be closed on the first one.
      .replace(/<!DOCTYPE[^>\[]*(?:\[[\s\S]*?\])?[^>]*>/gi, '')
      .trim();

    text = strip(text);
    if (!text) return [];
    const rootMatch = text.match(new RegExp(`^<(${XML_NAME})((?:[^>"']|"[^"]*"|'[^']*')*)>`));
    // A document with content and no readable root is not an empty result set.
    // Returning `[]` here made a file the reader did not understand look like a
    // file with no records, and every transformation after it succeeded.
    if (!rootMatch) throw new Error('No XML root element found');
    const rootTag = rootMatch[1];
    const openLen = rootMatch[0].length;
    const closeIdx = text.lastIndexOf('</' + rootTag + '>');
    if (closeIdx === -1) throw new Error(`XML root element <${rootTag}> is never closed`);
    const inner = text.slice(openLen, closeIdx);

    // Attributes are fields of their own, prefixed with `@` the way xmltodict,
    // xml2json and BadgerFish do it. The prefix is what makes the parse
    // lossless: `<item name="a"><name>b</name></item>` keeps both, where a bare
    // `name` could only hold one of them. A prefixed name cannot collide with a
    // child element, because an element name may not start with `@`.
    const parseAttributes = (raw) => {
      const attrs = {};
      if (!raw.trim()) return attrs;
      for (const m of raw.matchAll(new RegExp(XML_ATTR, 'g'))) {
        const value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        attrs['@' + m[1]] = decodeXML(value);
      }
      return attrs;
    };

    // Parse one element starting at index i in `inner`.
    // Returns [{ tag, value }, nextIndex] so parents can key children by tag name.
    const parseElement = (inner, i) => {
      const m = inner.slice(i).match(new RegExp(`^<(${XML_NAME})((?:[^>"']|"[^"]*"|'[^']*')*)>`));
      if (!m) return null;
      const tag = m[1];
      const attrs = parseAttributes(m[2]);
      const contentStart = i + m[0].length;
      if (m[2].trim().endsWith('/')) return [{ tag, value: attrs }, contentStart];
      const closeTag = '</' + tag + '>';
      const closeIdx = inner.indexOf(closeTag, contentStart);
      if (closeIdx === -1) return null;
      const content = inner.slice(contentStart, closeIdx).trim();
      let value;
      if (content.startsWith('<')) {
        value = { ...attrs };
        let pos = 0;
        while (pos < content.length) {
          const rest = content.slice(pos);
          if (!rest.trim()) break;
          const offset = pos + (rest.length - rest.trimStart().length);
          const child = parseElement(content, offset);
          // Stopping here used to leave the element holding only its attributes,
          // so one tag the reader could not name turned the whole record into
          // `{}` — printed, exit 0, no warning. Half a document is not a result.
          if (!child) throw new Error(`Could not read the XML element at "${content.slice(offset, offset + 40).trim()}"`);
          const [{ tag: childTag, value: childValue }, next] = child;
          const [childKey, unwrapped] = readFieldName(childTag, childValue);
          if (childKey in value) {
            if (!Array.isArray(value[childKey])) value[childKey] = [value[childKey]];
            value[childKey].push(unwrapped);
          } else {
            value[childKey] = unwrapped;
          }
          pos = next;
        }
      } else {
        value = Object.keys(attrs).length ? { ...attrs, '#text': decodeXML(content) } : decodeXML(content);
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
      if (!parsed) throw new Error(`Could not read the XML element at "${inner.slice(offset, offset + 40).trim()}"`);
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

/**
 * A value written into a flat cell — one CSV field, one SQL literal, one
 * column of the `table` preview. All three need the same answer, and they
 * disagreed: `table` and `docs/cli.md` wrote an object as compact JSON while
 * `csv` and `sql` ran it through `String()`, which produced the literal
 * `[object Object]` and a comma-joined array that reads back as one string.
 *
 * That was the lossiest thing this tool could do quietly. An API response with
 * a nested `user` object became a CSV whose `user` column held those fourteen
 * characters, exit 0, no warning — and the site's own flattening guide names
 * `[object Object]` as the defect it tells users to work around.
 *
 * Compact JSON is what `jq`'s `@csv` writes for a non-scalar, so the cell is
 * both faithful and parseable by the reader on the next hop. One helper keeps
 * the three serializers from drifting apart a second time.
 */
function cellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function sqlValue(val) {
  // `null` and `undefined` are the absence of a value, so they become NULL.
  // An empty string is a value: it becomes ''. Writing it as NULL silently
  // changes every `WHERE col = ''` query after an import.
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  // An object or an array is data, not a value to stringify. It goes in as a
  // JSON string literal, so importing it keeps the content instead of the word
  // `[object Object]`.
  if (typeof val === 'object') return `'${escapeSQLString(JSON.stringify(val))}'`;
  const s = String(val);
  // Numeric-looking strings stay unquoted so CSV numbers insert as numbers,
  // but a leading zero marks an identifier rather than a number — a Danish
  // postal code 0074 is not 74 — so those are quoted.
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.length < 16) return s;
  return `'${escapeSQLString(s)}'`;
}

/**
 * `unique` without `by` compares whole records, and two records that hold the
 * same data in a different key order are the same record. `JSON.stringify`
 * does not agree: `{"a":1,"b":2}` and `{"b":2,"a":1}` serialise differently, so
 * the deduplication kept both and the operation quietly did nothing on exactly
 * the input where key order varies — anything that did not come out of this
 * tool. Keys are sorted on the way down, so nested objects compare by content
 * too, and a key's value is compared before the next key's.
 */
function stableKey(val) {
  if (val === undefined) return 'undefined';
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(stableKey).join(',') + ']';
  return '{' + Object.keys(val).sort()
    .map(k => JSON.stringify(k) + ':' + stableKey(val[k]))
    .join(',') + '}';
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
      lines.push(headers.map(h => escapeCSV(cellValue(row[h]))).join(','));
    }
    return lines.join('\n');
  },
  yaml: (data) => {
    if (!Array.isArray(data)) data = [data];
    return data.map(item => {
      // A record is a mapping; the dash carries the first line and the keys
      // sit in the column the reader will look for them in.
      if (!isYAMLPlainObject(item)) return `- ${formatYAMLValue(item)}`;
      return writeYAMLMapping(Object.entries(item), 2, '- ').join('\n');
    }).join('\n');
  },
  xml: (data, rootName = 'data') => {
    if (!Array.isArray(data)) data = [data];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
    for (const row of data) {
      if (typeof row !== 'object' || row === null) {
        xml += `  <item>${escapeXML(String(row))}</item>\n`;
      } else {
        xml += `${writeXMLElement('item', row, 1)}\n`;
      }
    }
    xml += `</${rootName}>`;
    return xml;
  },
  table: (data) => {
    if (data.length === 0) return '(empty)';
    const headers = unionKeys(data);
    // Calculate column widths
    const colWidths = headers.map(h => Math.max(
      h.length,
      ...data.map(row => cellValue(row[h]).length)
    ));
    // Build separator
    const sep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Header
    const header = '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';
    const headerSep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Rows (first 20)
    const maxRows = 20;
    const rows = data.slice(0, maxRows).map(row =>
      '| ' + headers.map((h, i) => cellValue(row[h]).padEnd(colWidths[i])).join(' | ') + ' |'
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
      const key = by ? item[by] : stableKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  group: (data, params) => {
    const by = params.by;
    // The group key used to be a property on a plain object, so a value of
    // `__proto__` — a string any JSON file may hold — reached `Object.prototype`
    // and the run died with "push is not a function" instead of reporting the
    // group. A Map has no inherited keys, so every value stays a value.
    const groups = new Map();
    for (const item of data) {
      const key = item[by] ?? '(null)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups].map(([key, items]) => ({ key, count: items.length, items }));
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
    // Compile every expression before the first record. One that is not valid
    // JavaScript is broken in the same way in every row, so it is a bad
    // pipeline and must not be averaged away into a field full of nulls. An
    // expression that compiles but throws on one record still yields null for
    // that field, as documented.
    const compiled = Object.entries(fields).map(([name, spec]) => {
      const expr = typeof spec === 'object' && spec !== null ? spec.expr : spec;
      return [name, compileExpression(expr)];
    });
    return data.map((item, i) => {
      const out = { ...item };
      for (const [name, fn] of compiled) {
        try {
          out[name] = fn(item, i);
        } catch {
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
          // The guard has to ask about the name we are about to write, not the
          // one on the right. It asked about the unprefixed one, so a join that
          // passed a `prefix` — which exists precisely to survive a collision —
          // dropped the field anyway and still exited 0. `docs/cli.md` and the
          // join guide both promise that a prefix prevents the collision.
          const target = prefix + k;
          if (k !== on && !(target in merged)) merged[target] = v;
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

/**
 * Quote a CSV field whenever it holds a character a reader can mistake for
 * structure. The obvious ones are the comma, the quote and the line break, but
 * the reader in this file also auto-detects `;`, tab and `|`, and it treats a
 * bare CR as the end of a record. Writing those raw produced files this tool
 * itself read back as two columns or two records — a `;` in a free-text field
 * survives one hop and destroys the row on the next. Quoting for every
 * delimiter we recognise costs nothing on well-formed data and makes the
 * output safe for whichever delimiter the next reader settles on.
 */
function escapeCSV(val) {
  if (/[",;\t|\r\n]/.test(val)) {
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

// ─── YAML reader ──────────────────────────────────────────────────────────

/**
 * YAML is read by indentation, not line by line.
 *
 * The reader this replaces walked one line at a time and only recognised a
 * mapping when two keys sat side by side. A config file with an indented
 * block under a key — the normal shape of a config file — lost that block
 * entirely and still exited 0, which is the worst failure this tool can
 * have: the user asked for a conversion and got a smaller, plausible answer.
 *
 * Two rules carry the reader:
 *   1. a line belongs to the block above it when it is indented further, and
 *   2. a block is a sequence when its first line starts with `- `, otherwise
 *      it is a mapping.
 *
 * Block scalars, quoting, comments, flow collections and document separators
 * sit on top of those two rules without changing them.
 */
function parseYAML(text, opts) {
  // YAML is a superset of JSON, so a JSON document never needs this reader.
  try { return parsers.json(text); } catch {}

  const lines = tokenizeYAML(text);

  // `---` opens the document; anything before it that is not a document is
  // not read at all, and every further one is a document this tool does not
  // read. Saying so beats silently using the first half of the file.
  let start = skipYAMLBlanks(lines, 0);
  if (start < lines.length && lines[start].content === '---') {
    start = skipYAMLBlanks(lines, start + 1);
  }
  const extra = lines.slice(start)
    .filter(l => !l.blank && l.indent === 0 && (l.content === '---' || l.content === '...')).length;
  if (extra > 0 && opts && Array.isArray(opts.warnings)) {
    opts.warnings.push(`YAML: ${extra + 1} documents in file, only the first was read`);
  }
  if (start >= lines.length) return [];

  // The shapes a document can have for a pipeline: a sequence (one record per
  // item), a mapping (one record), or a run of bare scalars (one record per
  // line). The last one is not YAML, but the reader above it accepted it and
  // data in the wild is shaped that way.
  if (!isYAMLSequenceEntry(lines[start].content) && !splitYAMLKey(lines[start].content)) {
    const records = [];
    for (let i = start; i < lines.length; i++) {
      if (lines[i].blank || isYAMLComment(lines[i].content)) continue;
      if (lines[i].content === '---' || lines[i].content === '...') break;
      if (isYAMLSequenceEntry(lines[i].content) || splitYAMLKey(lines[i].content)) break;
      records.push(parseYAMLScalar(lines[i].content));
    }
    return records;
  }

  const parsed = parseYAMLBlock(lines, start, lines[start].indent);
  if (Array.isArray(parsed.value)) return parsed.value;
  if (parsed.value === null) return [];
  return [parsed.value];
}

/**
 * Split a document into lines that remember their indentation, their source
 * line number and whether they are blank. Comments are deliberately *not*
 * stripped here: a `#` inside a block scalar is data, and stripping it early
 * would quietly rewrite every shell snippet a config file carries.
 */
function tokenizeYAML(text) {
  return text.split(/\r\n|\n|\r/).map((line, i) => {
    const lead = /^[ \t]*/.exec(line)[0];
    const content = line.slice(lead.length);
    return {
      indent: lead.length,
      content: content.replace(/\s+$/, ''),
      blank: content.trim() === '',
      no: i + 1
    };
  });
}

function isYAMLComment(content) {
  return content.startsWith('#');
}

/** Advance past blank lines and comment-only lines. */
function skipYAMLBlanks(lines, i) {
  while (i < lines.length && (lines[i].blank || isYAMLComment(lines[i].content))) i++;
  return i;
}

function isYAMLSequenceEntry(content) {
  return content === '-' || /^-[\s]/.test(content);
}

/**
 * Find the `:` that ends a mapping key, or null when the line is not a
 * mapping entry. A colon only ends a key when a space or the end of the line
 * follows it, which is what keeps `12:30` and `a:b` the plain scalars they
 * look like.
 */
function splitYAMLKey(content) {
  if (!content || content === '-' || isYAMLComment(content)) return null;
  if (content[0] === '"' || content[0] === "'") {
    const quoted = readYAMLQuoted(content, 0);
    if (!quoted) return null;
    const after = content.slice(quoted.end).replace(/^[ \t]*/, '');
    if (!after.startsWith(':')) return null;
    return { key: quoted.value, rest: after.slice(1).replace(/^[ \t]+/, '') };
  }
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '#' && i > 0 && /\s/.test(content[i - 1])) return null;
    if (ch === ':' && (i === content.length - 1 || /\s/.test(content[i + 1]))) {
      return {
        key: content.slice(0, i).trim(),
        rest: content.slice(i + 1).replace(/^[ \t]+/, '')
      };
    }
  }
  return null;
}

/**
 * Parse the block starting at `start`, indented by `indent`. Returns
 * `{ value, end }` so the caller can carry on after the block.
 */
function parseYAMLBlock(lines, start, indent) {
  const i = skipYAMLBlanks(lines, start);
  if (i >= lines.length || lines[i].indent < indent) return { value: null, end: i };
  const content = lines[i].content;
  if (isYAMLSequenceEntry(content)) return parseYAMLSequence(lines, i, lines[i].indent);
  if (splitYAMLKey(content)) return parseYAMLMapping(lines, i, lines[i].indent);
  return parseYAMLFoldedScalar(lines, i, lines[i].indent);
}

function parseYAMLMapping(lines, start, indent) {
  const map = {};
  let i = start;
  while (i < lines.length) {
    if (lines[i].blank || isYAMLComment(lines[i].content)) { i++; continue; }
    if (lines[i].indent < indent) break;
    if (lines[i].content === '---' || lines[i].content === '...') break;
    if (lines[i].indent > indent) {
      throw new SyntaxError(`YAML line ${lines[i].no}: unexpected indentation`);
    }
    const split = splitYAMLKey(lines[i].content);
    if (!split) {
      throw new SyntaxError(`YAML line ${lines[i].no}: expected "key: value", got "${lines[i].content}"`);
    }
    const { key, rest } = split;

    if (rest === '' || isYAMLComment(rest)) {
      // No value on the line, so the block underneath owns it — or it is null.
      const j = skipYAMLBlanks(lines, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const child = parseYAMLBlock(lines, j, lines[j].indent);
        map[key] = child.value;
        i = child.end;
        continue;
      }
      // A sequence may sit at the same indentation as the key that owns it,
      // which is how most hand-written config files are written.
      if (j < lines.length && lines[j].indent === indent && isYAMLSequenceEntry(lines[j].content)) {
        const child = parseYAMLSequence(lines, j, indent);
        map[key] = child.value;
        i = child.end;
        continue;
      }
      map[key] = null;
      i++;
      continue;
    }

    const block = blockScalarHeader(rest);
    if (block) {
      const child = readYAMLBlockScalar(lines, i + 1, indent, block);
      map[key] = child.value;
      i = child.end;
      continue;
    }

    map[key] = parseYAMLScalar(rest);
    i++;
  }
  return { value: map, end: i };
}

function parseYAMLSequence(lines, start, indent) {
  const arr = [];
  let i = start;
  while (i < lines.length) {
    if (lines[i].blank || isYAMLComment(lines[i].content)) { i++; continue; }
    if (lines[i].indent < indent) break;
    if (lines[i].content === '---' || lines[i].content === '...') break;
    if (lines[i].indent > indent) {
      throw new SyntaxError(`YAML line ${lines[i].no}: unexpected indentation`);
    }
    if (!isYAMLSequenceEntry(lines[i].content)) break;

    const after = lines[i].content.slice(1);
    const lead = after.length - after.trimStart().length;
    const inner = after.trimStart();

    if (inner === '' || isYAMLComment(inner)) {
      const j = skipYAMLBlanks(lines, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const child = parseYAMLBlock(lines, j, lines[j].indent);
        arr.push(child.value);
        i = child.end;
        continue;
      }
      arr.push(null);
      i++;
      continue;
    }

    // `- key: value` opens a mapping whose lines are indented to the column
    // the key starts in, so the entry is rewritten in place as that block.
    const childIndent = indent + 1 + lead;
    const block = blockScalarHeader(inner);
    if (block) {
      const child = readYAMLBlockScalar(lines, i + 1, indent, block);
      arr.push(child.value);
      i = child.end;
      continue;
    }
    lines[i] = { indent: childIndent, content: inner, blank: false, no: lines[i].no };
    const child = parseYAMLBlock(lines, i, childIndent);
    arr.push(child.value);
    i = child.end;
  }
  return { value: arr, end: i };
}

/** A run of bare scalars with no dash and no key, folded the way YAML folds. */
function parseYAMLFoldedScalar(lines, start, indent) {
  const parts = [];
  let i = start;
  while (i < lines.length && !lines[i].blank && lines[i].indent === indent) {
    if (isYAMLSequenceEntry(lines[i].content) || splitYAMLKey(lines[i].content)) break;
    parts.push(parseYAMLScalar(lines[i].content));
    i++;
  }
  return { value: parts.length === 1 ? parts[0] : parts.join(' '), end: i };
}

/**
 * `key: |` and `key: >`, with the chomping indicators `-` (drop the final
 * newline) and `+` (keep every one). `|` keeps line breaks, `>` folds them
 * into spaces the way prose does.
 */
function blockScalarHeader(value) {
  const m = /^[|>]([+-]?)[ \t]*(?:#.*)?$/.exec(value.trim());
  if (!m) return null;
  return { style: m[0][0], chomp: m[1] || 'clip' };
}

function readYAMLBlockScalar(lines, start, parentIndent, header) {
  const collected = [];
  let i = start;
  while (i < lines.length && (lines[i].blank || lines[i].indent > parentIndent)) {
    collected.push(lines[i]);
    i++;
  }
  // Trailing blank lines are the chomping rules' business, not the value's.
  let last = collected.length;
  while (last > 0 && collected[last - 1].blank) last--;
  const body = collected.slice(0, last);
  const trailing = collected.length - last;

  const shared = body.reduce((min, l) => (l.blank ? min : Math.min(min, l.indent)), Infinity);
  const dedented = body.map(l => (l.blank ? '' : ' '.repeat(l.indent - shared) + l.content));

  let text;
  if (header.style === '>') {
    text = '';
    for (const line of dedented) {
      if (line === '') { text += '\n'; continue; }
      text += (text === '' || text.endsWith('\n')) ? line : ' ' + line;
    }
  } else {
    text = dedented.join('\n');
  }

  const stripped = text.replace(/\n+$/, '');
  if (header.chomp === '-') text = stripped;
  else if (header.chomp === '+') text = stripped + '\n'.repeat(trailing + (stripped ? 1 : 0));
  else text = stripped ? stripped + '\n' : '';

  return { value: text, end: i };
}

/**
 * A `#` only opens a comment at the start of a line or after a space, and
 * never inside quotes — `note: "a # b"` keeps its hash.
 */
function stripYAMLComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function parseYAMLScalar(raw) {
  const value = stripYAMLComment(raw).trim();
  if (value === '') return null;
  if (value[0] === '"' || value[0] === "'") {
    // A quoted scalar is a string even when it reads like a number, so it
    // never goes through the number and boolean coercion below.
    const quoted = readYAMLQuoted(value, 0);
    if (quoted) return quoted.value;
  }
  if (value[0] === '[' || value[0] === '{') {
    const flow = parseYAMLFlow(value);
    if (flow.ok) return flow.value;
  }
  return parseYAMLValue(value);
}

/**
 * Read a quoted scalar starting at `start`. Returns `{ value, end }` with
 * `end` just past the closing quote, or null when the quote never closes — a
 * half-open quote is a typo, not a reason to throw away the rest of a file.
 */
function readYAMLQuoted(text, start) {
  const quote = text[start];
  let out = '';
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") {
        if (text[i + 1] === "'") { out += "'"; i++; continue; }
        return { value: out, end: i + 1 };
      }
      out += ch;
      continue;
    }
    if (ch === '\\') { out += unescapeYAML(text[i + 1]); i++; continue; }
    if (ch === '"') return { value: out, end: i + 1 };
    out += ch;
  }
  return null;
}

function unescapeYAML(ch) {
  const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0', '\\': '\\', '"': '"', '/': '/' };
  return ch === undefined ? '' : (ch in escapes ? escapes[ch] : ch);
}

/**
 * Flow collections on one line — `[a, b]`, `{k: v}`. They are everywhere in
 * config files, and the line-for-line reader handed them back as a string, so
 * `hosts: {a: 1}` silently became the text `{a: 1}`. Anything this cannot
 * read is returned as the plain string it is, never dropped.
 */
function parseYAMLFlow(text) {
  let i = 0;
  const skipSpace = () => { while (i < text.length && /[ \t]/.test(text[i])) i++; };
  const separators = ',]}:';

  const scalar = () => {
    skipSpace();
    if (text[i] === '"' || text[i] === "'") {
      const quoted = readYAMLQuoted(text, i);
      if (!quoted) throw new SyntaxError('unclosed quote');
      i = quoted.end;
      return quoted.value;
    }
    let raw = '';
    while (i < text.length && !separators.includes(text[i])) raw += text[i++];
    return parseYAMLValue(raw.trim());
  };

  const value = () => {
    skipSpace();
    if (text[i] === '[') return sequence();
    if (text[i] === '{') return mapping();
    return scalar();
  };

  const sequence = () => {
    i++;
    const out = [];
    skipSpace();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value());
      skipSpace();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      throw new SyntaxError('expected , or ] in flow sequence');
    }
  };

  const mapping = () => {
    i++;
    const out = {};
    skipSpace();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      skipSpace();
      let key;
      if (text[i] === '"' || text[i] === "'") {
        const quoted = readYAMLQuoted(text, i);
        if (!quoted) throw new SyntaxError('unclosed quote');
        key = quoted.value;
        i = quoted.end;
      } else {
        let raw = '';
        while (i < text.length && !separators.includes(text[i])) raw += text[i++];
        key = raw.trim();
      }
      skipSpace();
      if (text[i] !== ':') throw new SyntaxError('expected : in flow mapping');
      i++;
      out[key] = value();
      skipSpace();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      throw new SyntaxError('expected , or } in flow mapping');
    }
  };

  try {
    const parsed = value();
    skipSpace();
    return i === text.length ? { ok: true, value: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ─── YAML writer ──────────────────────────────────────────────────────────

function isYAMLPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A scalar written the way the reader reads it back: numbers, booleans and
 * null bare; a string that could be read as something else, or that carries a
 * character with meaning in YAML, quoted. `0074` is a zip code in every
 * dataset this tool has seen, and written bare the reader hands back 74.
 */
function formatYAMLValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    if (val.includes('\n') || val.trim() === '') return JSON.stringify(val);
    return needsYAMLQuotes(val) ? JSON.stringify(val) : val;
  }
  return JSON.stringify(val);
}

function needsYAMLQuotes(value) {
  if (value === '') return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/:\s/.test(value) || /:$/.test(value)) return true;
  if (/#/.test(value)) return true;
  if (/[\t\r]/.test(value)) return true;
  if (/^(true|false|null|~)$/i.test(value)) return true;
  return !isNaN(Number(value));
}

function formatYAMLKey(key) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.\-/ ]*$/.test(key) ? key : JSON.stringify(String(key));
}

/**
 * Write a mapping as `key: value` lines at `indent`, prefixing the first one
 * with `prefix` — `- ` for a record in a sequence, otherwise the indentation
 * itself. The keys of one mapping all start in the same column, because that
 * is the column the reader takes the mapping's indent from.
 */
function writeYAMLMapping(entries, indent, prefix) {
  const pad = ' '.repeat(indent);
  return entries.flatMap(([k, v], i) =>
    writeYAMLEntry(i === 0 ? prefix : pad, k, v, indent));
}

function writeYAMLEntry(prefix, key, value, indent) {
  const head = prefix + formatYAMLKey(key) + ':';
  const pad = ' '.repeat(indent + 2);

  if (typeof value === 'string' && value.includes('\n') && value.trim() !== '') {
    // A block scalar is the only way to keep line breaks. A quoted string
    // would need \n escapes, and hand-folding them is how a value gets
    // quietly rewritten; the marker says what the trailing newline does.
    const marker = value.endsWith('\n\n') ? '|+' : value.endsWith('\n') ? '|' : '|-';
    return [head + ' ' + marker, ...value.slice(0, -1).split('\n').map(line => pad + line)];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [head + ' []'];
    return [head, ...value.flatMap(item => isYAMLPlainObject(item)
      ? writeYAMLMapping(Object.entries(item), indent + 4, pad + '- ')
      : [pad + '- ' + formatYAMLValue(item)])];
  }

  if (isYAMLPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [head + ' {}'];
    return [head, ...writeYAMLMapping(entries, indent + 2, pad)];
  }

  return [head + ' ' + formatYAMLValue(value)];
}

/**
 * One element, indented. A field named `@x` is an attribute and `#text` is the
 * element's own text, which is the shape the reader produces — so a document that
 * went through `xml → json → xml` keeps its attributes instead of having them
 * demoted to child elements.
 */
/**
 * The other half of the writer's key handling: `<field name="first name">`
 * goes back to being the key `first name`, so a document that left as JSON
 * reads back as the records it started as. A `<field>` without a `name`
 * attribute is an ordinary element and is left alone.
 */
function readFieldName(tag, value) {
  if (tag !== 'field') return [tag, value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [tag, value];
  const carried = value['@name'];
  if (typeof carried !== 'string') return [tag, value];
  const { '@name': _carried, ...rest } = value;
  if (Object.keys(rest).length === 0) return [carried, ''];
  if (Object.keys(rest).length === 1 && '#text' in rest) return [carried, rest['#text']];
  return [carried, rest];
}

function writeXMLElement(tag, value, depth, key = null) {
  const pad = '  '.repeat(depth);
  // A JSON key is free text; an XML tag name is not. `first name`, `2fa`,
  // `a/b` and an empty key are all things a CSV header row or an API response
  // contains, and writing one as a tag name produced a file that no XML parser
  // accepts — this one included, which then read its own output back as a
  // record with no fields at all. A key that is not a legal name travels in a
  // `name` attribute on `<field>` instead, which is legal everywhere, and
  // `readFieldName` puts it back on the way in.
  const carried = key !== null && !new RegExp(`^${XML_NAME}$`).test(key);
  const name = carried ? ` name="${escapeXML(key)}"` : '';
  const safeTag = carried ? 'field' : tag;
  if (typeof value !== 'object' || value === null) return `${pad}<${safeTag}${name}>${escapeXML(String(value))}</${safeTag}>`;
  const entries = Object.entries(value);
  // An attribute name follows the same rules as a tag name, and the `@` prefix
  // does not launder them: `@2fa` and a bare `@` wrote `<item 2fa="x">` and
  // `<item ="x">`, which no parser reads. Those go out as child elements through
  // the same `field` marker, so the record still comes back with the key it had.
  const asAttribute = ([k]) => k.startsWith('@') && new RegExp(`^${XML_NAME}$`).test(k.slice(1));
  const attrs = entries.filter(asAttribute).map(([k, v]) => ` ${k.slice(1)}="${escapeXML(String(v ?? ''))}"`).join('');
  const rest = entries.filter(([k]) => !asAttribute([k]));
  if (rest.length === 0) return `${pad}<${safeTag}${name}${attrs}/>`;
  const inner = rest.map(([k, v]) =>
    k === '#text' ? `${pad}  ${escapeXML(String(v ?? ''))}` : writeXMLElement(k, v, depth + 1, k)
  ).join('\n');
  return `${pad}<${safeTag}${name}${attrs}>\n${inner}\n${pad}</${safeTag}>`;
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
 * The five predefined entities plus numeric character references. The writer
 * above escapes on the way out, so a reader that does not decode on the way in
 * hands back `Tom &amp; Jerry` and grows it to `&amp;amp;` on every round
 * trip — the escape compounds until the text is unreadable. Unknown entities
 * are passed through unchanged: guessing what `&nbsp;` was meant to be is
 * worse than letting the user see it.
 */
function decodeXML(val) {
  if (!val.includes('&')) return val;
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return val.replace(
    /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (match, dec, hex, name) => {
      if (name) return named[name];
      const code = dec !== undefined ? Number(dec) : parseInt(hex, 16);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
  );
}

/**
 * Compile a safe JS expression for filter/map/add operations.
 * The expression receives `item` (current row) and `i` (index).
 *
 * An expression that is not valid JavaScript throws. It used to fall back to
 * the identity passthrough, so a typo the user can see and fix — `item.age >`
 * — kept every row, exited 0 and said nothing, which is a filter that silently
 * did not filter. The error carries `usage`, so the CLI reports a bad
 * expression as a usage error (exit 2) and `run` still returns an ordinary
 * `{ error }` result, which the browser playground renders like any other.
 */
function compileExpression(expr) {
  if (!expr || expr === 'item') return (item) => item;
  let fn;
  try {
    fn = new Function('item', 'i', `"use strict"; return (${expr});`);
  } catch (err) {
    const error = new Error(`Invalid expression ${JSON.stringify(expr)}: ${err.message}`);
    error.usage = true;
    throw error;
  }
  return fn;
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
 * @returns {object} { data, text, error, warnings, usage } — `usage` is true
 *   when the error is a bad argument rather than a failing transformation, so
 *   the caller can pick a different exit code
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
    return { error: err.message, warnings, usage: err.usage === true };
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
    // The first line that says something: a comment or a blank above it is
    // not evidence of any format, and a YAML file usually starts with one.
    const firstLine = trimmed.split('\n')
      .map(l => l.trim())
      .find(l => l && !l.startsWith('#') && l !== '---') || '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<')) return 'xml';
    if (trimmed.startsWith('- ') || trimmed.startsWith('---')) return 'yaml';
    // A `key: value` line is YAML. A CSV header row has no colon, so this
    // cannot steal a CSV file, and without it a config file pasted into the
    // browser playground is read as JSON and the YAML reader never runs.
    if (/^[^\s#-][^:\n]*:(\s|$)/.test(firstLine)) return 'yaml';
    // The delimiter rule is the reader's rule, not a second copy of it. The
    // detector used to know only `,`, so a Danish Excel export, a TSV and a
    // pipe table were all routed to the JSON reader and refused, even though
    // the CSV reader behind this line handles all four.
    if (CSV_DELIMITERS.some(d => countUnquoted(firstLine, d) > 0)) return 'csv';
    // One column has no delimiter to find, and a one-column export is still a
    // real file — `email\na@b.dk\nc@d.dk` is what a mailing list looks like.
    // A second line is the evidence: one word alone is a scalar or a mistake,
    // not a header, and `42`, `true` and `hello` must stay JSON.
    if (trimmed.includes('\n') && firstLine) return 'csv';
  }
  return 'json'; // default
}
