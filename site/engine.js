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

/**
 * Find the close tag that ends the element named `rootTag`, opened just before
 * `from`. Keeps the stack of open elements, so the answer is a question about
 * nesting and not about which close tag happens to come last in the file.
 * Returns `{ start, end }` for that `</name>` — `start` just before its `<`,
 * `end` just past its `>` — or null when the file never closes what it opened,
 * or closes it with the wrong name.
 *
 * Null means "this file is malformed, not concatenated", and the caller then
 * answers with its own check: a count over a file whose tags do not match would
 * be a made-up answer, and a wrong one.
 */
function findRootClose(text, from, rootTag) {
  // The same tag pattern the reader uses, with the leading `/` of a close tag
  // captured so both directions come from one scan.
  const tag = new RegExp(`<(/?)(${XML_NAME})((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'g');
  tag.lastIndex = from;
  // The root is open before the scan starts — its own tag is the one at `from`.
  const open = [rootTag];
  for (;;) {
    // A CDATA section is text, not markup: a `<` and a `>` inside it are data,
    // and counting them as elements is how a closed document gets reported as
    // never closed.
    if (text.startsWith('<![CDATA[', tag.lastIndex)) {
      const end = text.indexOf(']]>', tag.lastIndex);
      if (end === -1) return null;
      tag.lastIndex = end + 3;
      continue;
    }
    const m = tag.exec(text);
    if (!m) return null;
    if (m[1] === '/') {
      if (open.pop() !== m[2]) return null;
      if (open.length === 0) return { start: m.index, end: tag.lastIndex };
    } else if (!m[3].trim().endsWith('/')) {
      open.push(m[2]);
    }
  }
}

const parsers = {
  json: (text, opts) => {
    const data = JSON.parse(text);
    if (opts && Array.isArray(opts.warnings)) {
      for (const dup of duplicateJSONKeys(text)) opts.warnings.push(dup);
    }
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
    // `<rootTag/>` is its own close tag. Treating it as a root that was never
    // closed refused a well-formed document — the one message about XML this
    // reader could say that was simply untrue.
    const selfClosed = rootMatch[2].trim().endsWith('/');
    const closeTag = '</' + rootTag + '>';
    // Where the root element ends is a question about *nesting*, not about the
    // last close tag in the file. `lastIndexOf` took the last one, so two
    // documents sharing a root name — what a batch tool appending the same
    // schema writes — hid the second document from the rule below and were
    // reported by the child reader instead, pointing inside the file rather than
    // at the rule the file broke. Counting also keeps `<root><root>x</root></root>`
    // and `<root><roots>x</roots></root>` reading the way they always did, since
    // the count is over nesting and not over names.
    //
    // A file whose tags do not match is not answered here: the scan returns null
    // and the caller's own check names it, because no count can say where a
    // malformed document's root ends.
    const found = selfClosed ? null : findRootClose(text, openLen, rootTag);
    const closeIdx = found ? found.start : text.lastIndexOf(closeTag);
    if (!selfClosed && closeIdx === -1) throw new Error(`XML root element <${rootTag}> is never closed`);
    const inner = selfClosed ? '' : text.slice(openLen, found ? found.start : closeIdx);
    // Whatever follows the root element was never read. Batch tools concatenate
    // XML documents, so `<one/>…</one><two/>…</two>` is a file a user really
    // has, and reading only the first document dropped the second with exit 0
    // and no warning — the same shape as a half-parsed file, which is what the
    // other checks in this reader refuse. An XML document has exactly one root
    // element, so the file is not well-formed and the reader says so instead of
    // choosing a document for the user.
    const endOfRoot = selfClosed ? openLen : closeIdx + closeTag.length;
    const afterRoot = strip(text.slice(endOfRoot));
    if (afterRoot) {
      throw new Error(
        `an XML document has one root element, but this file has more after ${selfClosed ? `<${rootTag}/>` : closeTag}: "${afterRoot.slice(0, 40)}". ` +
        'Concatenated XML is not one document — split it first, or read the documents one at a time.'
      );
    }

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

/**
 * The one warning every reader in this file shares: a name the input gives
 * twice, with two different values behind it.
 *
 * The reader cannot keep both, and picking one without saying so is the silent
 * data loss this tool keeps failing into — the file claims `status: 200` and
 * then claims `status: 500`, and the user gets a conversion of whichever the
 * reader happened to land on. So the value is kept, the run succeeds, stdout
 * stays clean data, and the collision is named on stderr with both values and
 * the line it was found on. An identical repeat is not a collision and stays
 * silent: there is nothing to decide.
 *
 * The line number is what makes it actionable — a file with 40 000 records
 * cannot be inspected by hand, but "line 3" is a place to look.
 */
function noteDuplicateKey(warnings, format, key, first, second) {
  if (!Array.isArray(warnings)) return;
  if (first.value === second.value) return;
  const where = first.line ? ` (lines ${first.line} and ${second.line})` : '';
  warnings.push(
    `${format}: key "${key}" has two different values${where} — ` +
    `${JSON.stringify(first.value)} and ${JSON.stringify(second.value)}; ` +
    'the last one is kept. One of them is a mistake in the input.'
  );
}

/**
 * Find every key that appears twice in one JSON object.
 *
 * `JSON.parse` has already thrown the first value away by the time this runs,
 * and a reviver cannot see the collision either, so the document is walked as
 * text. The walk only has to know two things: which strings are keys, and which
 * object each key belongs to. Both are exact, not heuristics — a JSON key is
 * always a string followed by `:`, and `{`/`}` nest in the only order they can
 * — so this reports a collision that is really there and never one that is not.
 *
 * The value of a key is sliced out of the same text and parsed on its own, which
 * is what lets an identical repeat stay silent: `{"a":1,"a":1}` says the same
 * thing twice, and a warning for it would be noise on correct input.
 */
function duplicateJSONKeys(text) {
  const warnings = [];
  // One entry per open object, innermost last.
  const stack = [new Map()];
  let i = 0;
  let line = 1;

  /** Read the JSON string at `i`; returns [decoded, end] or null. */
  const readString = () => {
    let end = i + 1;
    while (end < text.length) {
      if (text[end] === '\\') { end += 2; continue; }
      if (text[end] === '"') break;
      end++;
    }
    if (end >= text.length) return null;
    try { return [JSON.parse(text.slice(i, end + 1)), end + 1]; } catch { return null; }
  };

  /** Read one value from `i`; returns the end index, or -1 when unreadable. */
  const readValue = (from) => {
    let j = from;
    let depth = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '"') {
        const s = readStringAt(j);
        if (s === -1) return -1;
        j = s;
        continue;
      }
      if (ch === '{' || ch === '[') { depth++; j++; continue; }
      if (ch === '}' || ch === ']') {
        if (depth === 0) return j;
        depth--;
        j++;
        continue;
      }
      if (ch === ',' && depth === 0) return j;
      j++;
    }
    return j;
  };

  const readStringAt = (from) => {
    const saved = i;
    i = from;
    const s = readString();
    const end = s ? s[1] : -1;
    i = saved;
    return end;
  };

  /** Jump to `to`, counting the lines passed on the way. */
  const advanceTo = (from, to) => {
    for (let k = from; k < to && k < text.length; k++) if (text[k] === '\n') line++;
    i = to;
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === '{') { stack.push(new Map()); i++; continue; }
    if (ch === '}') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (ch !== '"') { i++; continue; }

    const str = readString();
    if (!str) { i++; continue; }
    const [key, after] = str;
    const keyLine = line;
    let j = after;
    while (j < text.length && /[ \t\r\n]/.test(text[j])) j++;
    if (text[j] !== ':') { advanceTo(i, after); continue; }

    // A key: remember the value it carries so a later repeat can be compared.
    const valueStart = j + 1;
    let v = valueStart;
    while (v < text.length && /[ \t\r\n]/.test(text[v])) v++;
    const valueEnd = readValue(valueStart);
    let value;
    try { value = JSON.parse(text.slice(valueStart, valueEnd)); } catch { value = undefined; }
    const current = stack[stack.length - 1];
    const seen = current.get(key);
    if (seen) noteDuplicateKey(warnings, 'JSON', key, seen, { value, line: keyLine });
    else current.set(key, { value, line: keyLine });
    // An object or array value is walked rather than skipped, so a collision
    // one level down is reported by the same rule as one at the top.
    const nested = text[v] === '{' || text[v] === '[';
    advanceTo(i, nested ? v : (valueEnd > 0 ? valueEnd : after));
  }
  return warnings;
}

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

// A table is read by a terminal, not by a text editor, so a cell is as wide as
// the columns it takes on screen. `.length` counts UTF-16 code units, which is
// a different number: `🚀` is two code units and two columns, `日本` is two
// code units and four columns, and a combining accent is two code units and
// one column. Padding by `.length` put the right-hand border in the wrong
// place on every line that held one of them — and `table` is the format every
// user sees first, because it is the preview.
//
// The ranges below are the ones a Danish or general-European data file
// actually meets: CJK, Hangul, kana, fullwidth forms and emoji. Ambiguous
// width (`±`, `°`, the variation selector) is left at one column, which is
// what most terminals do with it and is the choice that never over-pads
// ordinary Latin text.
const WIDE_RANGES = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd]
];
const ZERO_WIDTH_RANGES = [
  [0x0300, 0x036f], [0x20d0, 0x20f0], [0x200b, 0x200f], [0xfe00, 0xfe0f]
];

function inRanges(cp, ranges) {
  for (const [lo, hi] of ranges) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

function displayWidth(str) {
  let width = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (inRanges(cp, ZERO_WIDTH_RANGES)) continue;
    width += inRanges(cp, WIDE_RANGES) ? 2 : 1;
  }
  return width;
}

function padDisplay(str, width) {
  const w = displayWidth(str);
  return w >= width ? str : str + ' '.repeat(width - w);
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
    assertXMLWritable(data);
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
    // Only the rows below are printed, so only they decide how wide a column
    // is. Measuring the whole file made every printed line as wide as the
    // widest cell in a file the table never shows.
    const maxRows = 20;
    const shown = data.length > maxRows ? data.slice(0, maxRows) : data;
    // Calculate column widths
    const colWidths = headers.map(h => {
      let width = displayWidth(h);
      for (const row of shown) {
        const w = displayWidth(cellValue(row[h]));
        if (w > width) width = w;
      }
      return width;
    });
    // Build separator
    const sep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Header
    const header = '| ' + headers.map((h, i) => padDisplay(h, colWidths[i])).join(' | ') + ' |';
    const headerSep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Rows (first 20)
    const rows = shown.map(row =>
      '| ' + headers.map((h, i) => padDisplay(cellValue(row[h]), colWidths[i])).join(' | ') + ' |'
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
      // Two rows that both lack the field are equal, so the comparator has to
      // say so. It answered `1` for every pair, which is not an order at all:
      // the sort was then free to hand back any order it liked, and the only
      // reason the rows came out unchanged was that this engine never shuffled
      // them for a reason.
      if (va === undefined && vb === undefined) return 0;
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
    // `slice(-0)` is `slice(0)`, so the last zero rows came back as all of
    // them. A tail of nothing is nothing, whatever the sign of the zero.
    return n === 0 ? [] : data.slice(-n);
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

  const ctx = { warnings: (opts && opts.warnings) || null };

  // A flow collection can be the whole document: `{a: 1, b: two}` or `[1, 2]`
  // on the root line. The block reader below does not know that syntax, so it
  // took `{a` for a key and the file's content came out as one field holding
  // the text `1, b: two}` — exit 0, empty stderr, a conversion of a document
  // nobody wrote. `parseYAMLFlow` is the reader for this syntax and already read
  // the very same line correctly one level down, so the root gets it too.
  //
  // Two conditions, both there to keep today's behaviour for every other file:
  // the flow has to *close* on the line (`parseYAMLFlow` only says ok when it
  // consumed the whole line), and nothing may follow it, so a collection on the
  // root line can never swallow the lines under it.
  const rootLine = lines[start].content;
  if (rootLine[0] === '{' || rootLine[0] === '[') {
    const flow = parseYAMLFlow(stripYAMLComment(rootLine).trim(), ctx);
    const rest = lines.slice(start + 1);
    if (flow.ok && rest.every((l) => l.blank || isYAMLComment(l.content))) {
      return Array.isArray(flow.value) ? flow.value : [flow.value];
    }
  }

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

  const parsed = parseYAMLBlock(lines, start, lines[start].indent, ctx);
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
function parseYAMLBlock(lines, start, indent, ctx) {
  const i = skipYAMLBlanks(lines, start);
  if (i >= lines.length || lines[i].indent < indent) return { value: null, end: i };
  const content = lines[i].content;
  if (isYAMLSequenceEntry(content)) return parseYAMLSequence(lines, i, lines[i].indent, ctx);
  if (splitYAMLKey(content)) return parseYAMLMapping(lines, i, lines[i].indent, ctx);
  return parseYAMLFoldedScalar(lines, i, lines[i].indent);
}

function parseYAMLMapping(lines, start, indent, ctx) {
  const map = {};
  const seen = new Map();
  // `k: 1` followed by `k: 2` is the classic YAML trap: the second line wins
  // with nothing to show for it, and the first value is simply gone. The key
  // is kept, the run succeeds, and the collision is named.
  const set = (key, value, no) => {
    if (seen.has(key)) {
      noteDuplicateKey(ctx.warnings, 'YAML', key, seen.get(key), { value, line: no });
    } else {
      seen.set(key, { value, line: no });
    }
    map[key] = value;
  };
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
        const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
        set(key, child.value, lines[i].no);
        i = child.end;
        continue;
      }
      // A sequence may sit at the same indentation as the key that owns it,
      // which is how most hand-written config files are written.
      if (j < lines.length && lines[j].indent === indent && isYAMLSequenceEntry(lines[j].content)) {
        const child = parseYAMLSequence(lines, j, indent, ctx);
        set(key, child.value, lines[i].no);
        i = child.end;
        continue;
      }
      set(key, null, lines[i].no);
      i++;
      continue;
    }

    const block = blockScalarHeader(rest);
    if (block) {
      const child = readYAMLBlockScalar(lines, i + 1, indent, block);
      set(key, child.value, lines[i].no);
      i = child.end;
      continue;
    }

    set(key, parseYAMLScalar(rest, ctx), lines[i].no);
    i++;
  }
  return { value: map, end: i };
}

function parseYAMLSequence(lines, start, indent, ctx) {
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
        const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
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
    const child = parseYAMLBlock(lines, i, childIndent, ctx);
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

function parseYAMLScalar(raw, ctx) {
  const value = stripYAMLComment(raw).trim();
  if (value === '') return null;
  if (value[0] === '"' || value[0] === "'") {
    // A quoted scalar is a string even when it reads like a number, so it
    // never goes through the number and boolean coercion below.
    const quoted = readYAMLQuoted(value, 0);
    if (quoted) return quoted.value;
  }
  if (value[0] === '[' || value[0] === '{') {
    const flow = parseYAMLFlow(value, ctx);
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
function parseYAMLFlow(text, ctx) {
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
    if (text[i] === '[') return sequence(ctx);
    if (text[i] === '{') return mapping(ctx);
    return scalar();
  };

  const sequence = (ctx) => {
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

  const mapping = (ctx) => {
    i++;
    const out = {};
    const seen = new Map();
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
      const valueRead = value(ctx);
      // A flow mapping is one fragment of one line, so it has no line number to
      // give; the key and both values are what the reader needs.
      if (seen.has(key)) {
        noteDuplicateKey(ctx && ctx.warnings, 'YAML', key, seen.get(key), { value: valueRead, line: 0 });
      } else {
        seen.set(key, { value: valueRead, line: 0 });
      }
      out[key] = valueRead;
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

// The C0 controls, by the names `cat -v` and a terminal agree on. A file that
// carries one of these is unreadable in an editor, so the name is what makes the
// error message actionable instead of just a number.
const C0_NAMES = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL',
  'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3',
  'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

/**
 * The first character in `str` that XML 1.0 cannot represent, or `null`.
 *
 * This is the `Char` production from the XML 1.0 specification, written out
 * rather than approximated:
 *
 *     Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 *
 * So tab, newline and carriage return are in, and #x0-#x8, #xB, #xC, #xE-#x1F,
 * #xFFFE, #xFFFF and a lone surrogate are out. Iterating with `for...of` walks
 * code points, so a valid surrogate pair arrives as one character above
 * #xFFFF and is allowed, while a lone one arrives alone and is not.
 */
function firstUnrepresentableXMLChar(str) {
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === 0x9 || cp === 0xA || cp === 0xD) continue;
    if (cp >= 0x20 && cp <= 0xd7ff) continue;
    if (cp >= 0xe000 && cp <= 0xfffd) continue;
    if (cp >= 0x10000 && cp <= 0x10ffff) continue;
    return ch;
  }
  return null;
}

function describeXMLChar(ch) {
  const cp = ch.codePointAt(0);
  const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  if (cp <= 0x1f) return `${hex} (${C0_NAMES[cp]})`;
  if (cp === 0xfffe) return `${hex} (a permanently unassigned character)`;
  if (cp === 0xffff) return `${hex} (a permanently unassigned character)`;
  if (cp >= 0xd800 && cp <= 0xdfff) return `${hex} (half of a surrogate pair — the other half is missing)`;
  return hex;
}

/**
 * Refuse data that XML 1.0 has no room for, before any of it is written.
 *
 * A control character inside a value is ordinary data: a NUL left by a
 * fixed-width export, a bell from a terminal capture, the vertical tab in a
 * legacy file. The writer above escaped `&`, `<`, `>`, `"` and `'`, and wrote
 * everything else through untouched, so those characters landed in the file
 * raw. The result declared `version="1.0"` and no XML parser would accept it —
 * Expat refuses it as `not well-formed (invalid token)` — while this tool's own
 * reader is lenient enough to read the file back, so a round trip through
 * Transmute hid it completely. Exit was 0 and stderr was empty.
 *
 * There is no way to keep these characters, which is why the run stops instead
 * of inventing an answer. A numeric character reference is not a way out
 * either: `&#0;` is refused by the very production above, so an entity would not
 * make the file valid. Dropping the character would be the silent data loss
 * that T13 and T30 exist to remove, and a file that claims to be XML 1.0 and is
 * not is worse than no file at all.
 *
 * The formats that *can* carry these characters are untouched: CSV, SQL, JSON
 * and YAML all hold a NUL faithfully, so `json -> xml` refuses at exactly the
 * point where the target format runs out of room, and nothing else changes.
 */
function assertXMLWritable(data) {
  const rows = Array.isArray(data) ? data : [data];
  for (const [index, row] of rows.entries()) {
    const at = Array.isArray(data) ? `row ${index + 1}` : 'the input';
    scanXMLValue(row, at);
  }
}

function scanXMLValue(value, at) {
  if (typeof value === 'string') {
    const bad = firstUnrepresentableXMLChar(value);
    if (bad !== null) {
      throw new Error(
        `XML 1.0 cannot write ${describeXMLChar(bad)}, which is in ${at}. ` +
        'There is no way to keep it: a numeric character reference is refused by the same rule. ' +
        'Write CSV, JSON, SQL or YAML instead, or remove the character before converting.'
      );
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanXMLValue(item, `${at}[${i}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    // A key is checked too: a key that is not a legal tag name travels in a
    // `name` attribute (see `writeXMLElement`), which is text like any other.
    scanXMLValue(key, `the field name ${JSON.stringify(key)} in ${at}`);
    scanXMLValue(item, `${at}, field ${JSON.stringify(key)}`);
  }
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

// ─── Pipeline validation ─────────────────────────────────────────────────

/**
 * What a step must bring with it, as `{ op: { param: [kind, hint] } }`.
 *
 * Every operation here was reachable with its parameter missing, and every one
 * of them answered with something else rather than saying so: `filter` with no
 * `expr` kept every row, and `pick` with no `fields` returned `{}` for every
 * record — the whole file's content deleted, written to disk with exit 0. A
 * misspelled key, or a shell variable that expanded to nothing, produced a
 * result the user did not ask for and could not see. `join` with an empty
 * `with` was the same story: it dropped every row.
 */
const STEP_PARAMS = {
  filter:  { expr: ['expr', 'a JavaScript expression, e.g. "item.age > 26"'] },
  map:     { expr: ['expr', 'a JavaScript expression, e.g. "({...item, n: 1})"'] },
  pick:    { fields: ['fieldlist', 'a field name or an array of field names'] },
  omit:    { fields: ['fieldlist', 'a field name or an array of field names'] },
  sort:    { by: ['field', 'a field name to sort on'] },
  group:   { by: ['field', 'a field name to group by'] },
  unique:  { by: ['field', 'a field name'] },
  rename:  { mapping: ['object', 'an object of {oldField: newField}'] },
  flatten: { field: ['field', 'a field name holding the arrays'] },
  add:     { fields: ['object', 'an object of {newField: expression}'] },
  join:    { with: ['records', 'a non-empty array of records'], on: ['field', 'a field name to join on'] },
  head:    { n: ['rows', 'a number of rows'] },
  tail:    { n: ['rows', 'a number of rows'] }
};

/**
 * Parameters an operation has a documented default for: `unique` without `by`
 * drops fully identical records, `head` and `tail` without `n` take 10. They
 * are still checked when they are given — a `n` of `"5"` reached `slice`, where
 * a string is coerced, and `tail` with `0` returned every row.
 */
const OPTIONAL_PARAMS = new Set(['unique.by', 'head.n', 'tail.n']);

function isFieldName(val) {
  return typeof val === 'string' && val !== '';
}

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const PARAM_CHECKS = {
  expr: (val) => typeof val === 'string' && val.trim() !== '',
  field: isFieldName,
  fieldlist: (val) => isFieldName(val) || (Array.isArray(val) && val.every(isFieldName)),
  object: isPlainObject,
  records: (val) => Array.isArray(val) && val.length > 0,
  rows: (val) => typeof val === 'number' && Number.isFinite(val) && val >= 0
};

/** A bad pipeline is what the user typed, so it carries `usage` like a bad expression does. */
function pipelineError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

/**
 * Check a pipeline before it runs, so a step that cannot do its job says so
 * instead of quietly doing another one.
 *
 * The CLI calls this while it parses `--pipe`, and `run` calls it for everyone
 * else — the browser playground included. One rule, two callers, so a pipeline
 * is never judged twice and never differently.
 *
 * @param {Array} pipeline - Array of { op, ...params }
 * @returns {Array} the same pipeline, unchanged
 * @throws {Error} with `usage` set, when a step is not a step the tool can run
 */
function validatePipeline(pipeline) {
  if (!Array.isArray(pipeline)) {
    throw pipelineError('Pipeline must be a JSON array of steps, e.g. \'[{"op":"head","n":5}]\'');
  }
  pipeline.forEach((step, index) => {
    const at = `Pipeline step ${index + 1}`;
    if (!isPlainObject(step)) {
      throw pipelineError(`${at} must be an object with an "op" key`);
    }
    if (typeof step.op !== 'string' || !Object.prototype.hasOwnProperty.call(operations, step.op)) {
      throw pipelineError(`Unknown operation: ${step.op} (${at}; see \`transmute --help\`)`);
    }
    for (const [param, [kind, hint]] of Object.entries(STEP_PARAMS[step.op] || {})) {
      const val = step[param];
      if (val === undefined || val === null) {
        if (OPTIONAL_PARAMS.has(`${step.op}.${param}`)) continue;
        throw pipelineError(`${at} (${step.op}): "${param}" is required, ${hint}`);
      }
      if (!PARAM_CHECKS[kind](val)) {
        throw pipelineError(
          `${at} (${step.op}): "${param}" must be ${hint}, got ${JSON.stringify(val)}`
        );
      }
    }
  });
  return pipeline;
}

// ─── Fields a step names ─────────────────────────────────────────────────

/**
 * The field names each step names, and what that step did about finding none.
 *
 * A field name no record has is a typo, and every one of these operations
 * answered the typo with a result the user did not ask for: `unique` by `ag`
 * where the column is `age` compared `undefined` to `undefined`, found all
 * three rows identical and wrote one of them to disk; `sort` by a field nobody
 * has sorted nothing; `group` put every row in the group `(null)`; `pick`
 * dropped the field from every row; `rename` renamed nothing. All of it with
 * exit 0, an empty stderr, and a file the user believed was the transformation
 * they had asked for.
 *
 * A field *some* records have is not that. Heterogeneous data is what a left
 * join with no match, an API that adds a key, and `pick` itself are for, so
 * only a field no record has at all is worth a word.
 */
const STEP_FIELDS = {
  pick:    (params) => fieldList(params.fields),
  omit:    (params) => fieldList(params.fields),
  sort:    (params) => [params.by],
  unique:  (params) => (params.by ? [params.by] : []),
  group:   (params) => [params.by],
  rename:  (params) => Object.keys(params.mapping),
  flatten: (params) => [params.field],
  join:    (params) => [params.on]
};

const FIELD_EFFECTS = {
  pick:    () => 'it is in no output',
  omit:    () => 'nothing was removed',
  sort:    () => 'the rows are in their original order, not sorted',
  unique:  (field, rows) => (rows > 1
    ? `every row looked identical, so 1 of ${rows} rows survived`
    : 'there was nothing to compare'),
  group:   () => 'every row landed in the group "(null)"',
  rename:  (field, rows, params) => `it was not renamed to "${params.mapping[field]}"`,
  flatten: () => 'no row was expanded',
  join:    () => 'neither side has it, so every row was dropped'
};

function fieldList(val) {
  return Array.isArray(val) ? val : [val];
}

/**
 * Say what a step did with a field name no record has, before it does it.
 *
 * The result is unchanged — only the silence is gone. A pipeline that names a
 * field a file does not have may be a script meant for many files, so the run
 * still succeeds and still writes its output; what changes is that the user is
 * no longer left with a file that says the opposite of what they asked for.
 */
function reportMissingFields(data, step, warnings) {
  const names = STEP_FIELDS[step.op];
  if (!names || !Array.isArray(data)) return;
  const records = data.filter(isPlainObject);
  // Nothing to miss: rows that are not records have no fields, and a step that
  // cannot work on one says so in its own error.
  if (records.length === 0) return;
  const present = new Set(records.flatMap(r => Object.keys(r)));
  // `join` names its field on both sides, and the right-hand records are in
  // `with` rather than in `data`. A field only the right side has is a match
  // that cannot happen, but it is not the same mistake as a field neither side
  // has, so it is not reported as one.
  const right = step.op === 'join' && Array.isArray(step.with)
    ? step.with.filter(isPlainObject)
    : [];
  for (const field of names(step)) {
    if (typeof field !== 'string' || present.has(field)) continue;
    if (right.length > 0 && right.some(r => Object.prototype.hasOwnProperty.call(r, field))) continue;
    warnings.push(`${step.op}: no record has a field named "${field}"; ${FIELD_EFFECTS[step.op](field, data.length, step)}`);
  }
}

// ─── Rows that are not records ───────────────────────────────────────────

/**
 * The steps that read a row as a record, because they name a field in it.
 *
 * This is the data-shaped twin of `validatePipeline`. T25 asked whether a step
 * brings the parameter it needs; this asks what happens when the rows it meets
 * are not the shape the step was written for, and the answer was that six of
 * the eight said something other than what they did. After a `map` that yields
 * strings, `omit` built columns `0 1 2` holding `A d a` — data the file never
 * had — `rename` did the same, `add` spread a number into `{}` and lost it,
 * `group` put every row in the group `(null)`, `unique --by` compared
 * `undefined` with `undefined` and deleted all but one row, and `join` dropped
 * every row and wrote an empty file. All of it exit 0, empty stderr, and an
 * output the user believed was the transformation they had asked for. Only
 * `pick` was loud, and it shouted V8's own words: `Cannot use 'in' operator to
 * search for 'name' in Ada`.
 *
 * `count`, `head`, `tail`, `filter` and `map` are missing on purpose: they
 * work on any row, which is what makes them useful after a `map`. `unique`
 * without `by` compares whole rows and needs no field, so it is only in the set
 * when `by` is there.
 */
const RECORD_STEPS = new Set([
  'add', 'flatten', 'group', 'join', 'omit', 'pick', 'rename', 'sort'
]);

function readsRecords(step) {
  return RECORD_STEPS.has(step.op) || (step.op === 'unique' && Boolean(step.by));
}

/** What a row is, in words a user wrote the pipeline in. */
function describeRow(row) {
  if (row === null) return 'null';
  if (Array.isArray(row)) return 'an array';
  const kind = typeof row;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return `a ${kind} (${JSON.stringify(row)})`;
  }
  return `a ${kind}`;
}

/**
 * Say a step cannot read a row, instead of reading something out of it.
 *
 * Unlike a field name no record has, this is not a warning. A field name is an
 * assumption about data, and a script that guesses it may be right about the
 * next file, so the run succeeds and one line goes to stderr. A row that is not
 * a record is not an assumption the step can survive: there is no field to
 * read, and every answer the step could give — an empty object, a row of
 * character indexes, a dropped row — is invented or lost data. The run stops
 * and says which step, which row and what the row was, and leaves it to the
 * user to decide whether the fix is a `map` that builds records, a different
 * step, or different input.
 *
 * The error is the data's, not the pipeline's, so it is not a `usage` error:
 * the pipeline is a perfectly good pipeline for a file of records.
 */
function requireRecords(data, step, index) {
  if (!Array.isArray(data) || !readsRecords(step)) return;
  const at = `Pipeline step ${index + 1} (${step.op})`;
  for (let i = 0; i < data.length; i++) {
    if (!isPlainObject(data[i])) {
      throw new Error(
        `${at} names a field, but row ${i + 1} is ${describeRow(data[i])}, not a record. ` +
        `It has no fields to read — use map to turn each row into a record first.`
      );
    }
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
    // Before the parse, not after: a step that cannot do its job is the user's
    // own input, and it is the same whether the data happens to be readable.
    validatePipeline(pipeline);

    // Parse
    if (!parsers[inputFormat]) return { error: `Unknown input format: ${inputFormat}` };
    let data = parsers[inputFormat](inputText, { ...opts, warnings });

    // Transform
    for (const [index, step] of pipeline.entries()) {
      // Against the data as it is here, not against the file as it arrived: a
      // field `add` or `map` just created is present from this step on, and one
      // `rename` removed is gone from it.
      requireRecords(data, step, index);
      reportMissingFields(data, step, warnings);
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

module.exports = { run, parsers, serializers, operations, detectFormat, validatePipeline };

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
