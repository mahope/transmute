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
 * The same name, minus the part the *writer* cannot use: a colon.
 *
 * `XML_NAME` above is the reader's question — "is this a tag in a document
 * somebody else wrote?" — and a foreign document is allowed to declare its
 * prefixes, so a colon belongs in it. The writer's question is different: "can
 * a standard parser open the file I am about to write?" A colon in a name is a
 * namespace *reference*, and a reference is only legal when the document
 * declares the prefix it names. There is no URI here to declare, so a name that
 * carries a prefix cannot be spelled as a name at all: `{"a:b":1}` wrote
 * `<a:b>1</a:b>`, and a namespace-aware parser answered "unbound prefix" and
 * gave up on the whole file, while this tool read its own output back and said
 * it was fine.
 *
 * So a name with a prefix in it is not writable as a name, and travels as the
 * `name` attribute of a `<field>` — which is legal everywhere, and is where
 * every other name XML cannot carry already goes.
 */
const XML_WRITABLE_NAME = '[A-Za-z_][A-Za-z0-9._-]*';

/**
 * `xmlns` is not a name this writer may spell, even though the characters are
 * legal ones: as an attribute it is a *declaration*, naming the default
 * namespace of the element and of everything under it, and a conforming reader
 * reports no attribute at all. `{"@xmlns":"http://x"}` therefore left a record
 * whose only field was invisible to every other tool, in a document it had also
 * quietly re-namespaced.
 */
function writesAsXMLName(name) {
  return new RegExp(`^${XML_WRITABLE_NAME}$`).test(name) && name !== 'xmlns';
}

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

/**
 * The text of `content` when it is nothing but CDATA sections, and null when it
 * is not — so the caller can tell "this is text" from "this is markup" without
 * reading the first character twice.
 *
 * One section or several, with whitespace between them, because a writer that
 * wraps a long value puts each line in its own section. An unterminated
 * section is not one this reader can read, and it says so by answering null:
 * the caller's own check then names it, instead of a section swallowing the
 * rest of the file as its text.
 */
function cdataText(content) {
  let rest = content.trim();
  if (!rest.startsWith('<![CDATA[')) return null;
  let out = '';
  for (;;) {
    const end = rest.indexOf(']]>');
    if (end === -1) return null;
    out += rest.slice('<![CDATA['.length, end);
    rest = rest.slice(end + 3).trim();
    if (!rest) return out;
    if (!rest.startsWith('<![CDATA[')) return null;
  }
}

/**
 * What is in an element's content, in document order: the pieces of text, and
 * where each child element starts.
 *
 * One scan, asked once, because the two questions — *is there an element in
 * this* and *what is the text around it* — were two readers with two answers,
 * and the second one lost data. `cdataText` above only spoke when the content
 * was nothing but sections, so an element that held a section **beside** text
 * fell to the text path with the section still in it: `<a>pre<![CDATA[<b>]]>
 * post</a>` came out as `prepost`, the section's `<b>` gone, exit 0, no warning
 * — and `xml.etree.ElementTree` reads it as `pre<b>post`. Inside a child it was
 * worse: the section's own markers were handed back as the value, so
 * `<i>a<![CDATA[x]]>b</i>` read as `a<![CDATA[x]]>b`. Silent loss is the worst
 * class in this reader, so it is answered here instead of at either end.
 *
 * A section is text, so a `<` inside one is data and not an element, and the
 * scan asks about the marker before it asks about a name. A section left open
 * is answered as `unterminated` rather than swallowed: an unterminated
 * `<![CDATA[` would otherwise spell its own opening marker into a value, and a
 * value the file never held is the one thing this reader may not answer with.
 */
function readContentRuns(content) {
  const runs = [];
  let pos = 0;
  while (pos < content.length) {
    const next = content.indexOf('<', pos);
    if (next === -1) {
      runs.push({ pos, text: content.slice(pos) });
      break;
    }
    if (next > pos) runs.push({ pos, text: content.slice(pos, next) });
    if (content.startsWith('<![CDATA[', next)) {
      const end = content.indexOf(']]>', next);
      if (end === -1) return { runs, unterminated: content.slice(next, next + 40) };
      runs.push({ pos: next, section: content.slice(next + '<![CDATA['.length, end) });
      pos = end + 3;
      continue;
    }
    // Where the opening tag ends, so a `<` inside an attribute value is not read
    // as the start of an element. A `<` that begins no name at all is reported
    // as an element start anyway, so the caller's own error still names it.
    const open = content.slice(next).match(new RegExp(`^<(/?)(${XML_NAME})((?:[^>"']|"[^"]*"|'[^']*')*)>`));
    if (open) {
      // A closing tag is not an element. The caller reads each child whole —
      // `parseElement` returns where it ends — so the tag that ends it is
      // skipped rather than offered as another child to read.
      if (open[1] === '/') { pos = next + open[0].length; continue; }
      runs.push({ pos: next, at: next });
      pos = next + open[0].length;
      continue;
    }
    runs.push({ pos: next, at: next });
    pos = next + 1;
  }
  return { runs };
}

/**
 * The text of the runs between two elements, or `null` when there is none.
 *
 * `hasMarkup` is what tells "an element whose value is the empty string" from
 * "an element with no text of its own beside its children": `<a>   </a>` and
 * `<a><![CDATA[]]></a>` are a value, and `<a> <b>1</b> </a>` is a record whose
 * only text is layout. Whitespace at the ends of the content is layout, so a run
 * that is nothing but spaces between two elements contributes nothing — but an
 * element that is *only* text still has the value the file gave it, empty or
 * not.
 *
 * The other rules are the ones the file's own layout forces, and each of them is
 * there because the alternative puts a value in the output that the file never
 * held:
 *
 * - A space between two sections is layout too — a writer that wraps a long
 *   value puts each line in its own section — so a text piece that is nothing
 *   but spaces *between two sections* is dropped. Every other space is kept
 *   verbatim: `a <![CDATA[x]]> b` is `a x b` in `ElementTree` too.
 * - A section's own text is never trimmed and never decoded. That is the one
 *   thing that separates it from every other text in the file.
 */
function textBetweenRuns(runs, hasMarkup) {
  const parts = runs.filter((r) => r.at === undefined);
  // No runs at all is not a value: `<a></a>` holds nothing, so it is no record,
  // and an empty record would be a row the file never wrote.
  if (parts.length === 0) return null;
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const run = parts[i];
    if (run.section !== undefined) { out += run.section; continue; }
    let piece = decodeXML(run.text);
    const before = parts[i - 1];
    const after = parts[i + 1];
    if (!piece.trim() && before && after && before.section !== undefined && after.section !== undefined) continue;
    if (i === 0) piece = piece.trimStart();
    if (i === parts.length - 1) piece = piece.trimEnd();
    out += piece;
  }
  if (hasMarkup && !out.trim()) return null;
  return out;
}

/**
 * Where the element named `tag`, opened at `from - 1`, actually ends.
 *
 * Not the first `</tag>` in the text. An element that contains a child of its
 * own name closes twice, and the child's close comes first, so `indexOf` cut
 * the parent off inside the child: `{"a":{"a":1}}` is written as
 * `<a><a>1</a></a>`, the reader read the element's content as `<a>1`, found no
 * close tag in it, and failed the whole file — `json → xml` exit 0 followed by
 * `xml → json` exit 3 on the file it had just written. Recursive element names
 * are ordinary in hand-written XML, so the same file from a customer failed the
 * same way. Counting the same-name opens and matching every close against them
 * is the whole fix, and it is the same question `findRootClose` above already
 * answers with a stack.
 */
function findElementClose(inner, tag, closeTag, from) {
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  let depth = 0;
  let pos = from;
  for (;;) {
    const nextClose = inner.indexOf(closeTag, pos);
    if (nextClose === -1) return -1;
    open.lastIndex = pos;
    for (let m = open.exec(inner); m && m.index < nextClose; m = open.exec(inner)) {
      if (inner[m.index + m[0].length] !== '/') depth++;
    }
    if (depth === 0) return nextClose;
    depth--;
    pos = nextClose + closeTag.length;
  }
}

const parsers = {
  json: (text, opts) => {
    // A UTF-8 byte order mark is the file saying which encoding it is, and it
    // is not part of the document. Measured, not assumed: the CSV, YAML and XML
    // readers all accept it without a word, because they trim and
    // String.prototype.trim() removes U+FEFF, so the file's own format decided
    // whether the same three bytes were welcome. `JSON.parse` does not trim, so
    // the reader with the least excuse refused a valid file with exit 3 and a
    // message that points at the character instead of the reason it is there.
    // PowerShell 5.1, many editors and a number of export buttons write one.
    //
    // Exactly one marker at the very front is the encoding marker, and only
    // that one is dropped: a U+FEFF anywhere else — a second one in front, one
    // on the second line, one inside a value — is the file's own text, and a
    // value that begins with an invisible character is data, not a repair.
    // Dropping it here rather than at each caller is what lets the same rule
    // serve the binary and the browser playground, which share this reader.
    const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const data = JSON.parse(source);
    if (opts && Array.isArray(opts.warnings)) {
      for (const dup of duplicateJSONKeys(source)) opts.warnings.push(dup);
      for (const literal of jsonNumberLiterals(source)) {
        collectLostPrecision(opts.warnings, 'JSON', literal);
      }
    }
    return Array.isArray(data) ? data : [data];
  },
  csv: (text, opts) => parseCSV(text, opts),
  yaml: (text, opts) => parseYAML(text, opts),
  xml: (text, opts) => {
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
    // `mixed` counts the elements that hold text beside markup, so the loss that
    // costs is named once for the document instead of once per record.
    const mixed = { count: 0, first: null };
    const noteMixed = (tag) => {
      if (mixed.count === 0) mixed.first = tag;
      mixed.count++;
    };
    const parseElement = (inner, i) => {
      const m = inner.slice(i).match(new RegExp(`^<(${XML_NAME})((?:[^>"']|"[^"]*"|'[^']*')*)>`));
      if (!m) return null;
      const tag = m[1];
      const attrs = parseAttributes(m[2]);
      const contentStart = i + m[0].length;
      if (m[2].trim().endsWith('/')) return [{ tag, value: attrs }, contentStart];
      const closeTag = '</' + tag + '>';
      const closeIdx = findElementClose(inner, tag, closeTag, contentStart);
      if (closeIdx === -1) return null;
      const content = inner.slice(contentStart, closeIdx).trim();
      let value;
      // The content is text runs and child elements in document order, and
      // which of the two it holds decides the value. A CDATA section is text, so
      // the section's `<` is data: `<i><![CDATA[one]]></i>` — the shape an RSS
      // description, a SOAP string and every export that embeds markup writes —
      // used to fail the whole file with "Could not read the XML element" on a
      // document `xml.etree.ElementTree` reads.
      const { runs, unterminated } = readContentRuns(content);
      if (unterminated !== undefined) {
        throw new Error(`XML CDATA section is never closed: "${unterminated}"`);
      }
      if (!runs.some((r) => r.at !== undefined)) {
        const text = textBetweenRuns(runs, false);
        value = Object.keys(attrs).length
          ? (text === null ? { ...attrs } : { ...attrs, '#text': text })
          : (text === null ? '' : text);
        return [{ tag, value }, closeIdx + closeTag.length];
      }
      value = { ...attrs };
      // A child spans from its own start to wherever its own subtree ends, so a
      // text run belongs to this element when it starts outside the last child
      // read. The order between the two is what the warning below is about.
      let seen = 0;
      for (const run of runs) {
        if (run.at === undefined) continue;
        if (run.at < seen) continue;
        const child = parseElement(content, run.at);
        // Stopping here used to leave the element holding only its attributes,
        // so one tag the reader could not name turned the whole record into
        // `{}` — printed, exit 0, no warning. Half a document is not a result.
        if (!child) throw new Error(`Could not read the XML element at "${content.slice(run.at, run.at + 40).trim()}"`);
        const [{ tag: childTag, value: childValue }, next] = child;
        const [childKey, unwrapped] = readFieldName(childTag, childValue);
        if (hasField(value, childKey)) {
          if (!Array.isArray(value[childKey])) value[childKey] = [value[childKey]];
          value[childKey].push(unwrapped);
        } else {
          setField(value, childKey, unwrapped);
        }
        seen = next;
      }
      const text = textBetweenRuns(runs.filter((r) => r.at === undefined && r.pos >= seen), true);
      if (text !== null && text !== '') {
        setField(value, '#text', text);
        // Only when the element holds both — text beside markup. An element that
        // is only text has lost nothing, so it has nothing to be told about.
        if (seen > 0) noteMixed(tag, mixed);
      }
      return [{ tag, value }, closeIdx + closeTag.length];
    };

    // The root element's content, read the same way a child's is: one scan, and
    // the same question asked at both levels.
    //
    // This loop only ever looked for children, so an element whose content was
    // text was refused whatever the text was — `<a>hello</a>` and
    // `<a><![CDATA[x]]></a>` failed the same way, and the second is how an RSS
    // description, a SOAP string and every export that embeds markup spells its
    // value. The first version of the fix read the root's text with
    // `body.replace(/<!\[CDATA\[…]]>/g, '')`, which *deleted* every section in
    // the element instead of taking its text, so `<a>pre<![CDATA[<b>]]>post</a>`
    // came out as `prepost` — the section's `<b>` gone, exit 0, no warning, on a
    // document `xml.etree.ElementTree` reads as `pre<b>post`. Silent loss of what
    // the file said, from the fix for silent loss, is the class of bug this
    // reader keeps failing into.
    const { runs: rootRuns, unterminated: rootOpen } = readContentRuns(inner);
    if (rootOpen !== undefined) {
      throw new Error(`XML CDATA section is never closed: "${rootOpen}"`);
    }
    const rows = [];
    const spans = [];
    // A child that contains an element of its own name closes twice, and its own
    // scan already read everything inside it, so only the children that start
    // outside every child read so far are rows of their own. Without this the
    // same element was read twice — once inside its parent, once beside it.
    let seen = 0;
    for (const run of rootRuns) {
      if (run.at === undefined) continue;
      if (run.at < seen) continue;
      const parsed = parseElement(inner, run.at);
      if (!parsed) {
        throw new Error(`Could not read the XML element at "${inner.slice(run.at, run.at + 40).trim()}"`);
      }
      const [{ tag, value }, next] = parsed;
      rows.push({ [tag]: value });
      spans.push([run.at, next]);
      seen = next;
    }
    // Text the root holds beside its children. It belongs to no child, so it
    // rides on the records below, the same way the root's own attributes do —
    // see `carryRootAttributes`, and the reason it exists: a record is the only
    // place in this tool's output that can hold a value. The text *inside* a
    // child is the child's own and was already read as the child's value.
    const rootOwnText = textBetweenRuns(
      rootRuns.filter((r) => r.at === undefined && !spans.some(([from, to]) => r.pos > from && r.pos < to)),
      rows.length > 0
    );

    // Flatten: <data><item>...</item><item>...</item></data> → records
    let records = rows;
    if (
      rows.length > 0 &&
      rows.every((r) => Object.keys(r).length === 1) &&
      new Set(rows.map((r) => Object.keys(r)[0])).size === 1 &&
      rows.every((r) => typeof r[Object.keys(r)[0]] === 'object')
    ) {
      const key = Object.keys(rows[0])[0];
      const flat = rows.map((r) => r[key]);
      if (flat.every((v) => typeof v === 'object' && !Array.isArray(v))) records = flat;
    }

    // After the shape of the records is decided, not before: the flatten above
    // asks whether every record holds *one* field, and a document-level
    // attribute put on them first would answer "no" for a file whose records are
    // a single nested object each — which is most feeds. `<rss version="2.0">`
    // lost its `version` here for exactly that reason, measured.
    //
    // The root's own text goes the same way as its attributes and for the same
    // reason: a record is the only place in this tool's output that can hold a
    // value, so text on the root rides on every record rather than on none. A
    // root with no children at all is not a document of records — it is one
    // value — and keeps its tag, which is what `<a>only text</a>` has always
    // read as and what `ElementTree` says it is. That record *is* the root's
    // text, so it does not also carry a copy of it.
    if (rows.length === 0 && rootOwnText !== null) {
      return carryRootAttributes([{ [rootTag]: rootOwnText }], rootMatch[2], rootTag, opts, null);
    }
    if (rootOwnText !== null && rows.length > 0) noteMixed(rootTag, mixed);
    const out = carryRootAttributes(records, rootMatch[2], rootTag, opts, rootOwnText);
    // The one loss mixed content costs, named once. A record is a row and a
    // field is a column, so a table has no place for "the text that came before
    // the second field": the text runs are kept and joined into `#text`, and
    // where they stood between the elements is not kept. That is a decision this
    // reader made and the user did not, and the rule in this file is that an
    // assumption about data is one line on stderr and never a silent column.
    if (mixed.count > 0 && Array.isArray(opts && opts.warnings)) {
      opts.warnings.push(
        `xml: ${mixed.count} element${mixed.count === 1 ? '' : 's'} hold text beside markup, ` +
        `the first <${mixed.first}> — the text is joined into "#text" and the order between the text ` +
        'and the elements is not kept, because a record is a row and a field is a column'
      );
    }
    return out;
  }
};

/**
 * The root element's own attributes, on every record the document produced.
 *
 * An attribute on a child element was a field from the beginning, prefixed with
 * `@`; an attribute on the *root* had no place to go, because the loop over the
 * root's content only ever looked for children. So `<rss version="2.0">` came
 * back as its items with `version` gone — no warning, exit 0, a file that had
 * said which version of itself it was converted into a file that does not know.
 * That is the silent half-loss this engine keeps failing into, and it is
 * measured on the shapes people actually read: a feed's `version`, an Atom
 * entry's `id`, a sitemap's `generator`, a document's own `schemaLocation`.
 *
 * On every record, not on a record of its own, because the output of this tool
 * is a table: an attribute on no record cannot be written to CSV or SQL, cannot
 * be joined, and cannot be seen in the playground. A document that carries them
 * on all of its records keeps them the moment it leaves the reader.
 *
 * A record's own attribute of the same name wins — the record is the more
 * specific of the two answers, and the document's is the one that may be
 * repeated — and the collision is named on stderr, because a name on two levels
 * is a decision this reader has made and the user has not.
 */
function carryRootAttributes(rows, rawAttrs, rootTag, opts, rootText) {
  const attrs = {};
  for (const m of String(rawAttrs).matchAll(new RegExp(XML_ATTR, 'g'))) {
    const value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
    attrs['@' + m[1]] = decodeXML(value);
  }
  const names = Object.keys(attrs);
  if (names.length === 0 && rootText === null) return rows;
  // A root that holds nothing but its attributes — `<a id="1"/>` — is a record
  // that says what it is and has no other content, and an empty result said
  // nothing at all about a file that was not empty.
  const out = rows.length === 0 ? [{}] : rows;
  for (const row of out) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue;
    for (const name of names) {
      if (hasField(row, name)) {
        if (Array.isArray(opts && opts.warnings)) {
          opts.warnings.push(
            `xml: <${rootTag} ${name.slice(1)}="…"> and a record below it both carry "${name}" — ` +
            'the record keeps its own, because it is the more specific of the two answers'
          );
        }
        continue;
      }
      setField(row, name, attrs[name]);
    }
    if (rootText === null) continue;
    if (hasField(row, '#text')) {
      if (Array.isArray(opts && opts.warnings)) {
        opts.warnings.push(
          `xml: <${rootTag}> and a record below it both carry "#text" — ` +
          'the record keeps its own, because it is the more specific of the two answers'
        );
      }
      continue;
    }
    setField(row, '#text', rootText);
  }
  return out;
}

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
/**
 * Does this record already carry that name, and put a name into a record.
 *
 * A record is a plain object, and a plain object answers to eleven names it was
 * never given: `toString`, `constructor`, `__proto__` and the rest of
 * `Object.prototype`. Reading one with `in` therefore reports "you already have
 * it" about a field the input never mentioned, and writing one by assignment
 * goes through the `__proto__` setter, which adds no field at all — it replaces
 * the object's prototype, and the name is then absent from `Object.keys`, from
 * every writer and from the output.
 *
 * Both halves of that reached real output. `<item><toString>1</toString>` read
 * back as `{"toString":[null,"1"]}` — a null nobody wrote, inside a list nobody
 * asked for, growing by one more null on every round trip — because the
 * repeated-key rule saw an inherited name and wrapped a *function* as the first
 * member. `<item><__proto__>1</__proto__>` read back as `{}`, and so did a CSV
 * column and a YAML key by that name. `rename` was the loudest of them: with no
 * mapping for a field, `mapping[k] ?? k` found the inherited member and wrote
 * the record's field under the name `"function Object() { [native code] }"`.
 *
 * None of this needs a filename or a spelling: `json → xml` already writes
 * `<__proto__>x</__proto__>`, so the file this tool produced did not read back.
 * The writer was never wrong about the name; the record was.
 */
function hasField(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function setField(record, key, value) {
  // Assignment to `__proto__` on a plain object is a prototype write, not a
  // field write. `defineProperty` is what `JSON.parse` uses for the same name,
  // which is why a JSON file can hold the field at all.
  if (key === '__proto__') {
    Object.defineProperty(record, key, { value, writable: true, enumerable: true, configurable: true });
    return;
  }
  record[key] = value;
}

/**
 * Read a field the record has, and nothing else.
 *
 * `item[by]` with a dot and a bracket answers a different question than the one
 * the pipeline asked: it walks the prototype chain, so a name no record has but
 * every object inherits reads as a value the file never held. `group` then wrote
 * that value as its group key — the table showed `function Object() { [native
 * code] }` and the JSON dropped the field — and `join` matched both sides on the
 * string of the same inherited member.
 *
 * `undefined` is what a missing field means everywhere else in this engine, so
 * it is what this returns, and no caller can tell a missing field from a
 * prototype member any more.
 *
 * A record that is not a record at all — `null` in the middle of a JSON array —
 * has no fields either, and asking it threw. The writers meet that shape in
 * their key union, so the answer is the same one they already give a record
 * without the field.
 */
function readField(record, key) {
  if (!record || typeof record !== 'object') return undefined;
  return hasField(record, key) ? record[key] : undefined;
}

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

/**
 * Every number literal in a JSON document that is not inside a string.
 *
 * The document has already been through `JSON.parse` by the time this runs, so
 * it is valid JSON — and in valid JSON the only places a digit or a minus sign
 * appear outside a string are the number literals themselves. Skipping the
 * strings is therefore not a guess about where numbers hide, it is what keeps
 * a digit inside `"AB-9007199254740993"` a digit in a string and silent.
 */
function jsonNumberLiterals(text) {
  const out = [];
  let i = 0;
  const digits = () => { while (i < text.length && text[i] >= '0' && text[i] <= '9') i++; };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = i;
      if (ch === '-') i++;
      digits();
      if (text[i] === '.') { i++; digits(); }
      if (text[i] === 'e' || text[i] === 'E') {
        i++;
        if (text[i] === '+' || text[i] === '-') i++;
        digits();
      }
      out.push(text.slice(start, i));
      continue;
    }
    i++;
  }
  return out;
}

/**
 * What a number literal shows: the digits it is written with, the place its
 * last digit stands in, and how many of those digits carry the value.
 *
 * `1.50` shows `150` with its last digit at 10^-2, `1.5e1` shows `15` with its
 * last digit at 10^0, and `9007199254740993` shows itself at 10^0. That place
 * is the most anyone can see of either number, so it is the one the reading has
 * to agree with — and it is what makes `1.50` and `1.5` the same question: the
 * same value, written with a different number of last digits.
 *
 * `keep` counts only the digits that carry the value, so leading and trailing
 * zeros are not part of it: `100.00` has two and `1e21` has one. It is what the
 * fast path in `losesPrecision` goes by, and it is why the twenty written digits
 * of `10000000000000000000` — a value that is held exactly — do not make this a
 * long number.
 */
function shownDigits(literal) {
  const m = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!m) return null;
  const fraction = m[3] || '';
  const written = m[2] + fraction;
  return {
    digits: BigInt(written),
    scale: (m[4] ? Number(m[4]) : 0) - fraction.length,
    keep: written.replace(/^0+/, '').replace(/0+$/, '').length,
  };
}

/**
 * Does reading `literal` as a JavaScript number change a digit the file shows?
 *
 * Two questions, not one, and the second is the one that matters. A number is a
 * 64-bit float, so it holds every integer up to 2^53 exactly and then every
 * *other* one — which is why a rule counting digits is wrong at both ends:
 * `9007199254740993` is sixteen digits and loses one, `9007199254740994` is
 * sixteen and loses none, and `10000000000000000000` is twenty and is exact.
 *
 * The question is not therefore about the literal but about the two numbers:
 * the value the file wrote, and the value that came out of it. They are
 * compared at the precision the file is written in — the place its last digit
 * stands — because that is the most anyone can see of either. A double that
 * written back at that place gives the same digits back has not changed anything
 * the file showed, however the bits underneath it are arranged. That is one
 * answer for a whole number and for a decimal alike, and it is what keeps
 * `1.50`, `0.1` and `19.99` quiet: their nearest double is a hair away in binary
 * and exact in every digit the file wrote.
 *
 * Comparing at the file's own place instead of counting digits is what reaches
 * the decimals. `123456789012345678.5` is nineteen digits of which the last is a
 * half, and the rule that asked "is this an integer that fits" never looked at
 * it: its fraction did not survive the shift, so it had no integer to be wrong
 * about, and `123456789012345678.5` came out as `123456789012345680` with
 * nothing on stderr. The value changed and no digit count could have seen it.
 *
 * `1e400` is no value at all rather than a changed one, and
 * `1.7976931348623157e308` is the largest double there is written in the
 * seventeen digits anyone can write it in — its exact value has more, but not one
 * a reader can see. Both are answered elsewhere: the first by the writer that
 * refuses it, the second by coming back out of this comparison unchanged.
 */
function losesPrecision(literal) {
  const shown = shownDigits(literal);
  if (!shown) return false;
  const read = Number(literal);
  if (!Number.isFinite(read)) return false;
  // Fifteen digits that carry the value cannot be lost, and that is a proof
  // rather than a sample: a double's neighbours are 2^-52 apart relative to it,
  // so at the top of a fifteen-digit value they are under a quarter of the
  // file's last shown digit, and rounding there gives the file's own digits
  // back. It also keeps `BigInt` off every ordinary number in a file, which is
  // all this path would have cost.
  if (shown.keep <= 15) return false;
  const exact = exactDecimalOf(read);
  return rescaleAt(exact.numerator, exact.scale, shown.scale) !== shown.digits;
}

/** The exact value of a finite double, as `numerator · 10^scale`. */
const doubleBits = new DataView(new ArrayBuffer(8));

function exactDecimalOf(value) {
  doubleBits.setFloat64(0, Math.abs(value));
  const bits = doubleBits.getBigUint64(0);
  const fraction = bits & ((1n << 52n) - 1n);
  const biased = Number(bits >> 52n);
  // A normal number is `1.fraction · 2^(biased - 1023)` and a subnormal one has
  // no leading 1: its exponent is the fixed 2^-1074 and its significand is the
  // fraction alone. Both come out of here as `significand · 2^power`, which is
  // the form that becomes a decimal without a division — a negative power of two
  // is `5^-power / 10^-power`.
  //
  // The sign is dropped on the way in, because no sign changes a digit: `-0` and
  // `0` are the same number, and `-123456789012345678.5` is held exactly when
  // `123456789012345678.5` is.
  const significand = biased === 0 ? fraction : (1n << 52n) + fraction;
  const power = biased === 0 ? -1074 : biased - 1075;
  if (power >= 0) return { numerator: significand << BigInt(power), scale: 0 };
  return { numerator: significand * 5n ** BigInt(-power), scale: power };
}

/**
 * The digits of `numerator · 10^from` seen at the place `to`, which is what a
 * reader writing that value with its last digit at 10^to would show.
 *
 * Rounding is half away from zero, and only the digits *below* the place the
 * file asked for are ever affected — the digits above it are copied, not
 * recomputed, which is why a value that is a hair below what the file said can
 * still be the value the file said. Truncating instead would be the sound but
 * noisy way round: `19.99` is `19.989999999999998573…` in binary and has to be
 * allowed to round back up to `19.99`.
 */
function rescaleAt(numerator, from, to) {
  const shift = from - to;
  if (shift === 0) return numerator;
  if (shift > 0) return numerator * 10n ** BigInt(shift);
  const unit = 10n ** BigInt(-shift);
  const whole = numerator / unit;
  const rest = numerator % unit;
  const twice = rest < 0n ? -rest : rest;
  return twice * 2n >= unit ? whole + (numerator < 0n ? -1n : 1n) : whole;
}

/**
 * Lossy number literals, counted per literal, keyed by the warnings array they
 * were collected into. A file can hold the same id in a million rows, and a
 * million copies of one sentence is the same advice a million times.
 */
const lostPrecision = new WeakMap();

function collectLostPrecision(warnings, format, literal) {
  if (!Array.isArray(warnings) || !losesPrecision(literal)) return;
  let found = lostPrecision.get(warnings);
  if (!found) { found = new Map(); lostPrecision.set(warnings, found); }
  const seen = found.get(literal);
  if (seen) { seen.count++; return; }
  found.set(literal, { format, read: Number(literal), count: 1 });
}

/**
 * Say what a number lost on the way in, once per distinct literal.
 *
 * The count is here rather than in the message-per-occurrence because the file
 * decides how often it happens: `id: 9223372036854775807` on ten thousand rows
 * is one mistake repeated, and telling the user that ten thousand times buries
 * everything else on stderr. Quoting is the way out, and it is a way that
 * exists today in both readers — `"9223372036854775807"` comes back as the same
 * text, in all six formats, and so does `"123456789012345678.5"`, which the
 * warning had measured to keep all nineteen of its digits through CSV.
 */
function reportLostPrecision(warnings) {
  if (!Array.isArray(warnings)) return;
  const found = lostPrecision.get(warnings);
  if (!found) return;
  lostPrecision.delete(warnings);
  for (const [literal, { format, read, count }] of found) {
    const where = count === 1 ? '1 place' : `${count} places`;
    warnings.push(
      `${format}: ${literal} is written with more detail than a JavaScript number ` +
      `keeps, so it was read as ${read} in ${where} — the output holds a ` +
      'different value than the input. Write it in quotes ("' + literal + '") ' +
      'to keep every digit.'
    );
  }
}

function escapeSQLString(val) {
  return String(val).replace(/'/g, "''");
}

/**
 * A SQL identifier — a column name or a table name — is quoted with `"`, and a
 * `"` inside it is escaped by *doubling* it, the same way `''` doubles inside a
 * string literal. The value side already did this (`escapeSQLString`), and the
 * identifier side did not: it wrapped the name in quotes and hoped.
 *
 * Measured against sqlite3, which is the reader these files are written for:
 * a column named `a"b` produced `("a"b")` and `Parse error near "b": syntax
 * error`; `--table 'my"table'` produced the same for the table name. Transmute
 * exited 0 with empty stderr both times, so the user got a file that cannot be
 * imported and no word about it. `--table` is a flag the user types, so this is
 * one stray quote away from an ordinary command.
 *
 * The `;` and `--` around it are *not* a hole, and were measured rather than
 * assumed: inside a quoted identifier they are ordinary characters, and a value
 * containing `'; DROP TABLE secret; --` is already doubled to `''` and imports
 * with both tables intact. A `"` also cannot be used to inject — it closes the
 * identifier early, but then the column list's `(` is never closed, so the
 * statement stops parsing and the rest of the line is rejected. It is not
 * injection, it is a file that does not import. That is the smaller claim, so
 * this is the smaller fix.
 */
function sqlIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
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

/**
 * A table cell is a fixed-width box drawn with `|`, `+` and `-`, and read by a
 * terminal — so it is the one cell in this tool where the *spelling* of a
 * character decides what the reader sees. Measured on the real binary, four
 * ordinary characters in ordinary data each broke that box at exit 0 with empty
 * stderr:
 *
 *   "line1\nline2"  the row became two physical lines and the frame lost a
 *                   border, so one record read as two rows
 *   "a\rb"          a carriage return returns the cursor to column 0, so `b`
 *                   overwrote the row's own left border and the value before it
 *   "a\tb"          `displayWidth` counts a tab as one column, but a terminal
 *                   advances to the next tab stop — up to eight — so the right
 *                   border sat where the text did not end
 *   "x|y"           a bare `|` reads as the box's own column separator, so the
 *                   cell looked like two columns
 *
 * and one more that is not about geometry: a cell whose whole content is `+---+`
 * poses as a border line, which is the only way *data* in this format can
 * impersonate the frame around it.
 *
 * The three that move the cursor or break the line have no literal spelling —
 * a terminal cannot show a newline inside a line — so they are written as the
 * escape the reader already knows (`\n`, `\r`, `\t`, and `\xNN` for any other
 * C0 control character or DEL, which are invisible rather than merely wide). A
 * `|` is escaped as `\|`, which is what a Markdown table does with the same
 * character for the same reason. `+` and `-` are *not* escaped per character,
 * because that would turn every date into `2026\-09\-26`; only a cell made
 * entirely of them has its first character escaped, which is the one shape that
 * can be mistaken for a border.
 *
 * The cost is deliberate and worth naming: a nested value is written as compact
 * JSON by `cellValue`, so `["x|y"]` becomes `["x\|y"]`, which is no longer
 * parseable JSON. That trade is right here and wrong everywhere else, because a
 * table cell is never read by a machine — there is no `table` reader — while the
 * frame it sits in is the one thing the reader relies on. `json` is the format
 * for a value a program has to read back, and it escapes nothing by choice.
 *
 * Both the header and the rows go through this one function, and the width is
 * measured on its *output*, so the padding cannot disagree with what is
 * printed — the same reason `displayWidth` and `cellValue` exist at all.
 */
const TABLE_CONTROL_ESCAPES = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

function tableCell(val) {
  const text = cellValue(val);
  let out = '';
  for (const ch of text) {
    const named = TABLE_CONTROL_ESCAPES[ch];
    if (named !== undefined) { out += named; continue; }
    const cp = ch.codePointAt(0);
    out += (cp < 0x20 || cp === 0x7f)
      ? '\\x' + cp.toString(16).padStart(2, '0')
      : ch;
  }
  out = out.replace(/\|/g, '\\|');
  // A cell that is nothing but the frame's own characters is the one value that
  // can be read as a border line, and a leading `\` is something no line of the
  // frame can start with.
  if (/^[-+]{3,}$/.test(text.trim())) out = '\\' + out;
  return out;
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
 *
 * The first row is asked the same guarded question as every other one, because
 * `Object.keys(null)` throws and a JSON array may hold `null` as its first
 * element — which used to take CSV, table and SQL down with a JavaScript error
 * message, while JSON, XML and YAML wrote the file. The loop below already
 * skipped such a row; only the seed of the union did not.
 */
function unionKeys(data) {
  const keys = [];
  const seen = new Set();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
    }
  }
  return keys;
}

const serializers = {
  sql: (data, opts = {}) => {
    const tableName = opts.tableName || 'my_table';
    if (!Array.isArray(data)) data = [data];
    assertWritable(data, 'sql');
    const cols = unionKeys(data);
    // "No columns" is the only reason there is nothing to write. The guard used
    // to ask whether the *first row* was an object, so a file whose first row
    // was a string or a number — `["Alice", {"a":1}]`, which one `map` step
    // makes — returned an empty string and every record in the file was gone.
    // The file was written, exit 0, empty stderr.
    if (cols.length === 0) {
      reportNonRecordRows(data, 'sql', opts.warnings);
      return '';
    }
    const colList = cols.map(c => sqlIdentifier(c)).join(', ');
    const lines = [`-- Generated by Transmute`, `INSERT INTO ${sqlIdentifier(tableName)} (${colList}) VALUES`];
    // Every value is written as a literal, and the same literal is what the
    // backslash rule below reads, so that rule cannot fall behind the writer.
    const literals = data.map(row => cols.map(c => sqlValue(readField(row, c))));
    reportSQLBackslashes(cols, literals, opts.warnings);
    const rows = literals.map(cells => `  (${cells.join(', ')})`);
    reportNonRecordRows(data, 'sql', opts.warnings);
    return lines[0] + '\n' + lines[1] + '\n' + rows.join(',\n') + ';';
  },

  json: (data, pretty = true) => {
    // JSON escapes every character the other five refuse, so it is the route out
    // of all of them — and it is the one writer that answers `null` to a value
    // that is not finite, which is why it needs the walk too.
    assertWritable(data, 'json');
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  },
  csv: (data, opts = {}) => {
    if (data.length === 0) return '';
    assertWritable(data, 'csv');
    const headers = unionKeys(data);
    // The reader trims every field it did not read as quoted, so a cell written
    // bare comes back with its edge spaces gone — `"  x  "` became `"x"` in a
    // plain two-column export. Quoting is the fix for that, and the one place
    // in CSV where quoting does work.
    //
    // One column needs the empty case as well, because it is the one shape
    // where a record can be a line with nothing on it: RFC 4180 lets a file
    // carry blank lines between records and the reader drops them, so a record
    // whose only value was empty was written as a line the reader ate. The row
    // was gone, exit 0, empty stderr, and the rows left looked complete.
    // `""` and `" "` are the RFC's own way to spell a record holding one empty
    // or blank field, and the two spellings the reader can tell from a blank
    // line — which is why the reader asks whether a field was quoted rather
    // than only what it contained.
    const oneColumn = headers.length === 1;
    const lines = [headers.map(h => csvCell(h, oneColumn)).join(',')];
    for (const row of data) {
      lines.push(headers.map(h => csvCell(readField(row, h), oneColumn)).join(','));
    }
    reportCSVTypeLoss(data, headers, opts.warnings);
    reportAbsentFields(data, headers, 'csv', opts.warnings);
    reportNonRecordRows(data, 'csv', opts.warnings);
    return lines.join('\n');
  },
  yaml: (data) => {
    if (!Array.isArray(data)) data = [data];
    assertWritable(data, 'yaml');
    // A YAML document ends with a line break, and here it is not a nicety: for
    // a value ending in one, the block scalar's last line break *is* the last
    // byte of the file, and a file without it reads back without it. Measured
    // with PyYAML: `- v: |\n    a\n    b` is `a\nb` and `- v: |\n    a
    // b\n` is `a\nb\n`, so a writer that ends the document anywhere else loses
    // the last character of every value that ends in a line break.
    return data.map(item => {
      // A record is a mapping; the dash carries the first line and the keys
      // sit in the column the reader will look for them in.
      if (!isYAMLPlainObject(item)) return `- ${formatYAMLValue(item)}`;
      return writeYAMLMapping(Object.entries(item), 2, '- ').join('\n');
    }).join('\n') + '\n';
  },
  xml: (data, opts = {}) => {
    if (!Array.isArray(data)) data = [data];
    assertWritable(data, 'xml');
    const rootName = opts.rootName || 'data';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
    for (const row of data) {
      if (typeof row !== 'object' || row === null) {
        xml += `  <item>${escapeXML(String(row))}</item>\n`;
      } else if (Array.isArray(row)) {
        // A record's own boundary is information. A file whose records are
        // lists must not turn into one element per member, so a row that is a
        // list takes the numbered spelling — and that is the same spelling a
        // list inside a list takes, for the same reason.
        xml += `${writeXMLNumbered('item', row, 1)}\n`;
      } else {
        xml += `${writeXMLElement('item', row, 1)}\n`;
      }
    }
    xml += `</${rootName}>`;
    reportXMLListShape(data, opts.warnings);
    reportXMLNulls(data, opts.warnings);
    return xml;
  },
  table: (data, opts = {}) => {
    if (data.length === 0) return '(empty)';
    assertWritable(data, 'table');
    const headers = unionKeys(data);
    // Only the rows below are printed, so only they decide how wide a column
    // is. Measuring the whole file made every printed line as wide as the
    // widest cell in a file the table never shows.
    const maxRows = 20;
    const shown = data.length > maxRows ? data.slice(0, maxRows) : data;
    // The cells are escaped first, so a column is as wide as what is *printed*.
    // Measuring the raw value and printing the escaped one pads by the length
    // of the escape instead of the width of the cell, which is the bug this
    // same loop already had once, for CJK width.
    const cells = shown.map(row => headers.map(h => tableCell(readField(row, h))));
    const headCells = headers.map(tableCell);
    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      let width = displayWidth(headCells[i]);
      for (const row of cells) {
        const w = displayWidth(row[i]);
        if (w > width) width = w;
      }
      return width;
    });
    // Build separator
    const sep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Header
    const header = '| ' + headCells.map((c, i) => padDisplay(c, colWidths[i])).join(' | ') + ' |';
    const headerSep = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';
    // Rows (first 20)
    const rows = cells.map(row =>
      '| ' + row.map((c, i) => padDisplay(c, colWidths[i])).join(' | ') + ' |'
    );
    let output = [headerSep, header, headerSep, ...rows, headerSep];
    if (data.length > maxRows) {
      output.push(`... ${data.length - maxRows} more rows`);
    }
    output.push(`(${data.length} rows, ${headers.length} columns)`);
    reportAbsentFields(data, headers, 'table', opts.warnings);
    reportNonRecordRows(data, 'table', opts.warnings);
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
        if (hasField(item, f)) setField(picked, f, item[f]);
      }
      return picked;
    });
  },
  omit: (data, params) => {
    const fields = new Set(Array.isArray(params.fields) ? params.fields : [params.fields]);
    return data.map(item => {
      const omitted = {};
      for (const [k, v] of Object.entries(item)) {
        if (!fields.has(k)) setField(omitted, k, v);
      }
      return omitted;
    });
  },
  sort: (data, params) => {
    const by = params.by;
    const dir = params.dir === 'desc' ? -1 : 1;
    return [...data].sort((a, b) => {
      const va = readField(a, by), vb = readField(b, by);
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
      const key = by ? readField(item, by) : stableKey(item);
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
      const key = readField(item, by) ?? '(null)';
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
        setField(renamed, hasField(mapping, k) ? mapping[k] : k, v);
      }
      return renamed;
    });
  },
  flatten: (data, params) => {
    const field = params.field;
    const result = [];
    for (const item of data) {
      const arr = readField(item, field);
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
          setField(out, name, fn(item, i));
        } catch {
          setField(out, name, null);
        }
      }
      return out;
    });
  },
  join: (data, params) => {
    const rows = Array.isArray(params.with) ? params.with : [];
    const on = params.on;
    // A row without the join field has no key to match on, so it is not indexed
    // and cannot be matched. Both halves used to stringify a missing key to
    // `"undefined"`, which matched every left row to the *last* right-hand
    // record, so a join on a field nobody has invented a value for all of them
    // — while the warning said the rows were dropped, which is the opposite of
    // what the file said afterwards.
    const key = (row) => {
      const value = readField(row, on);
      return value === undefined ? undefined : String(value);
    };
    const index = new Map();
    for (const row of rows) {
      const k = key(row);
      if (k !== undefined && !index.has(k)) index.set(k, row);
    }
    const keepMissing = params.keep === 'left' || params.keep === 'all';
    const prefix = params.prefix ?? '';
    const result = [];
    for (const item of data) {
      const own = key(item);
      const match = own === undefined ? undefined : index.get(own);
      if (match) {
        const merged = { ...item };
        for (const [k, v] of Object.entries(match)) {
          // The guard has to ask about the name we are about to write, not the
          // one on the right. It asked about the unprefixed one, so a join that
          // passed a `prefix` — which exists precisely to survive a collision —
          // dropped the field anyway and still exited 0. `docs/cli.md` and the
          // join guide both promise that a prefix prevents the collision. It
          // asked with `in`, which walks the prototype chain, so a right-hand
          // field named `toString` or `__proto__` was dropped as if the left
          // row had it, and the write that followed was an assignment — a
          // prototype write for that one name. `hasField` and `setField` are
          // the same two calls `pick` and `rename` use.
          const target = prefix + k;
          if (k !== on && !hasField(merged, target)) setField(merged, target, v);
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

/**
 * Name the columns whose values are written as text and read back as a number
 * or a boolean.
 *
 * The rule is not written out here — it *is* `coerceCSVValue`, the same
 * function the CSV parser calls — so this cannot promise something the reader
 * does not do. That matters more than it looks: a warning about a type change
 * is worthless if it guesses the type, and the guess is exactly where a second
 * copy of the rule would go wrong.
 *
 * Quoting is not the fix, and that was measured rather than assumed: the
 * reader takes the quotes off a field before it coerces it, so `"true"` comes
 * back as the boolean `true` while `"0074"` comes back as the string `0074`.
 * RFC 4180 has no way to say *this cell is a string*, which is why the answer
 * is a warning naming the columns and not a rewrite of the file. Writing the
 * strings bare is still right: a spreadsheet is the most likely next hop, and
 * there a number usually is what the user meant.
 */
function reportCSVTypeLoss(data, headers, warnings) {
  if (!Array.isArray(warnings)) return;
  const lost = [];
  for (const h of headers) {
    let count = 0;
    for (const row of data) {
      const val = readField(row, h);
      if (typeof val === 'string' && typeof coerceCSVValue(val) !== 'string') count++;
    }
    if (count > 0) lost.push(`"${h}" (${count})`);
  }
  if (lost.length === 0) return;
  warnings.push(
    `csv: ${lost.length} of ${headers.length} columns hold values that are written as text and read back as a number or a boolean: ` +
    `${lost.join(', ')}. Quoting does not prevent it; json, yaml and xml keep the strings, ` +
    'and sql keeps every one of them except a number, which it writes as a number.'
  );
}

/**
 * Name the values that a MySQL or MariaDB import does not read back.
 *
 * `escapeSQLString` doubles a quote, and that is the whole of it. A backslash
 * inside a string literal is an ordinary character in the SQL these files are
 * written for, and that was measured rather than assumed: sqlite3 3.50.6 imports
 * a file holding `C:\Users\Ada`, `a\nb` and a value *ending* in a backslash, and
 * returns all three as text with every character intact.
 *
 * MySQL and MariaDB read the same file differently, and not by a little: `\` is
 * an escape character there unless `NO_BACKSLASH_ESCAPES` is set, so `C:\Users\Ada`
 * imports as `C:UsersAda` and `a\nb` imports with a line break in it. A value
 * that ends in a backslash closes nothing — `'end\'` leaves the statement
 * unfinished, so the file does not import at all.
 *
 * There is no spelling that is right in both dialects, which is why this is a
 * warning and not a rewrite: `\\` is the correct literal on MySQL and a doubled
 * backslash everywhere else. A file whose every value is free of backslashes —
 * which is nearly all of them — is left alone, so the rule costs nothing on the
 * input where there is nothing to say.
 *
 * The literals are the ones the file was written with, so a backslash inside a
 * nested value written as a JSON string literal is counted as well, and a number
 * or a boolean never is.
 */
function reportSQLBackslashes(cols, literals, warnings) {
  if (!Array.isArray(warnings)) return;
  const found = [];
  for (let c = 0; c < cols.length; c++) {
    let count = 0;
    for (const cells of literals) {
      if (typeof cells[c] === 'string' && cells[c].includes('\\')) count++;
    }
    if (count > 0) found.push(`"${cols[c]}" (${count})`);
  }
  if (found.length === 0) return;
  warnings.push(
    `sql: ${found.length} of ${cols.length} columns hold a value with a backslash, ` +
    `which MySQL and MariaDB read as an escape: ${found.join(', ')}. sqlite3 and ` +
    'PostgreSQL read it as written; on MySQL import with ' +
    "SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES', or the value changes on the way in."
  );
}

/**
 * A row that is not a record, counted and named on stderr by the three formats
 * that have one shape: a header and a row of cells under it.
 *
 * A JSON array does not have to hold records. `["Alice", {"a":1}]` is valid,
 * `[[1,2], {"a":1}]` is valid, and one `map` step makes both — which is why
 * `count`, `head`, `tail`, `filter`, `map` and a `unique` without `by` are
 * allowed to hand such rows on instead of stopping. A row with no fields of its
 * own has no cell to be written in, so `csv` and `table` gave it empty cells and
 * `sql` gave it NULLs, all of it at exit 0 with an empty stderr and a value that
 * was no longer in the file. `["Alice", "Bob"]` — no records at all — wrote a
 * two-byte CSV that reads back as an empty array, and the table printed a box
 * with no columns in it.
 *
 * It cannot be a column instead. A row with no fields has no name to hang a
 * column on, and inventing one is a convention every other reader would have to
 * know to see the data at all — the trade `reportXMLListShape` refuses for the
 * three list shapes XML has no answer for. So the file keeps the shape the
 * format has, and the loss is said here, once per run, the way T14's long row
 * is said: the values are not lost *silently*, which is the part that was
 * wrong.
 *
 * A **list** is the one kind whose members do survive. `Object.keys` on a list
 * is its positions, so `[1,2]` became columns `0` and `1` for the whole file
 * and reads back as `{"0":1,"1":2}` — `reportXMLListShape`'s rule for a list of
 * one, in the same words: the members are kept and the list around them is not.
 */
/**
 * A field that is not in a row, and a field that is `null`, counted per column
 * and named on stderr by the two formats that write a flat row of cells.
 *
 * The union of keys is what makes the table and the file square, and the price
 * is a cell with nothing in it. RFC 4180 has no way to say *this cell holds no
 * value*: the cell is empty, and the reader — this one and every other — reads
 * an empty cell as an empty **string**. So `[{"a":1,"qty":3},{"a":4}]` wrote
 * `qty` as a blank that came back as `""`, exit 0, empty stderr. An explicit
 * `null` took the same road, which is the worse half: the value *was* there and
 * a different value came back, so an import that trusts the file writes `''`
 * into a column the user meant to leave empty.
 *
 * `sql` is not in this list, and that is the point of the word "flat": it
 * writes `NULL`, which is SQL's own name for a value that is not there, and the
 * file says it out loud. `json`, `yaml` and `xml` keep the difference because
 * they can: an absent key is absent and a null is a key holding null. Only the
 * two formats that cannot say it are named here.
 *
 * A row that is not a record is skipped, because `reportNonRecordRows` counts
 * it already and has the better sentence for it.
 */
function reportAbsentFields(data, headers, format, warnings) {
  if (!Array.isArray(warnings)) return;
  const records = [];
  // A column that only a row which is not a record put there — the positions of
  // a list, which `Object.keys` spells `0`, `1` — is not a field of the records
  // that lack it, and `reportNonRecordRows` already says the list became those
  // columns. Counting them here would name the same loss twice, in two
  // sentences, and the second one would blame a record for not having a field
  // it was never going to have.
  const recordKeys = new Set();
  for (const row of data) {
    if (!isYAMLPlainObject(row)) continue;
    records.push(row);
    for (const key of Object.keys(row)) recordKeys.add(key);
  }
  if (records.length === 0) return;
  const missing = [];
  const nulls = [];
  for (const h of headers) {
    if (!recordKeys.has(h)) continue;
    let absent = 0;
    let nullCount = 0;
    for (const row of records) {
      if (!hasField(row, h)) absent++;
      else if (row[h] === null) nullCount++;
    }
    if (absent > 0) missing.push(`"${h}" (${absent} of ${records.length})`);
    if (nullCount > 0) nulls.push(`"${h}" (${nullCount} of ${records.length})`);
  }
  if (missing.length === 0 && nulls.length === 0) return;
  const readBack = format === 'csv'
    ? 'Those cells are written empty and read back as an empty string, which is a value and not an absence.'
    : 'Those cells are shown empty, and nothing on the screen says which of the two it was.';
  const facts = [];
  if (missing.length > 0) {
    facts.push(
      `${missing.length} of ${headers.length} columns ${missing.length === 1 ? 'is' : 'are'} not in every row: ${missing.join(', ')}`
    );
  }
  if (nulls.length > 0) {
    facts.push(
      `${nulls.length} of ${headers.length} columns ${nulls.length === 1 ? 'holds' : 'hold'} an explicit null: ${nulls.join(', ')}`
    );
  }
  warnings.push(
    `${format}: ${facts.join('; ')}. ${readBack} sql writes NULL instead; json and yaml keep the difference, xml writes the text null and names the columns on its own.`
  );
}

function reportNonRecordRows(data, format, warnings) {
  if (!Array.isArray(warnings)) return;
  const shown = [];
  let count = 0;
  for (const [index, row] of data.entries()) {
    if (isYAMLPlainObject(row)) continue;
    count++;
    if (shown.length < 3) shown.push(`row ${index + 1} ${describeRowKind(row)}`);
  }
  if (count === 0) return;
  const one = count === 1;
  const list = shown.length === count
    ? shown.join(' and ')
    : `${shown.join(', ')} and ${count - shown.length} more`;
  // What the format did with the row is the fact the user needs, and it is not
  // the same in all three: an empty cell is a value that is not there, NULL is
  // the same claim in SQL, and a file with no columns at all is the whole file.
  const noColumns = unionKeys(data).length === 0;
  const effect = format === 'sql'
    ? (noColumns
      ? 'there are no records to make columns from, so the file is empty and every row in it is gone'
      : `${one ? 'it was' : 'they were'} written as NULL`)
    : (noColumns
      ? 'there are no records to make a header from, so the file holds no rows and every value in it is gone'
      : `${one ? 'it was written as an empty cell' : 'they were written as empty cells'}`);
  const listNote = describeListColumns(data);
  const lost = noColumns ? '' : ', so a value that is not a record is not in the file';
  warnings.push(
    `${format}: ${count} of ${data.length} rows ${one ? 'is not a record' : 'are not records'} ` +
    `(${list}); ${effect}${lost}.${listNote} json, yaml and xml keep ${one ? 'it' : 'them'}.`
  );
}

/** How a row that is not a record should be named in a warning. */
function describeRowKind(row) {
  if (row === null) return 'is null';
  if (Array.isArray(row)) return `is a list of ${row.length} member${row.length === 1 ? '' : 's'}`;
  if (row === undefined) return 'is undefined';
  if (typeof row === 'string') return `is a string (${JSON.stringify(row.length > 24 ? row.slice(0, 24) + '…' : row)})`;
  return `is a ${typeof row} (${String(row)})`;
}

/**
 * What a list row's positions did to the header, which is not always the same
 * thing.
 *
 * `Object.keys` on a list is its positions, so `[1,2]` named the columns `0` and
 * `1` for the whole file: the members are kept, the list around them is gone,
 * and that is the sentence below — T45's rule for a list of one, in the same
 * words, because the file did exactly that.
 *
 * It stops being true the moment a record has a field of the same name, and a
 * JSON array can hold records whose keys are strings, so `{"0":"rec"}` beside
 * `["list"]` is a file a user can have. The column then was *not* named after a
 * position: it is a field the record has, and the list's first member is written
 * into it next to the record's own value. Two rows' values in one cell, and one
 * value on the way back — so the sentence names the columns and says the values
 * meet there. The old sentence did not, and it was the same mistake T50 found in
 * a warning about its own output: a line that describes a file the writer did not
 * write.
 */
function describeListColumns(data) {
  const recordKeys = new Set();
  const listPositions = new Set();
  for (const row of data) {
    if (Array.isArray(row)) {
      for (let i = 0; i < row.length; i++) listPositions.add(String(i));
    } else if (isYAMLPlainObject(row)) {
      for (const key of Object.keys(row)) recordKeys.add(key);
    }
  }
  if (listPositions.size === 0) return '';
  const shared = [...listPositions].filter(position => recordKeys.has(position));
  if (shared.length === 0) {
    return ' A list was written as columns named after its positions, so it reads back as an object.';
  }
  const one = shared.length === 1;
  const names = shared.map(position => `"${position}"`).join(one ? '' : ' and ');
  return ` Column${one ? '' : 's'} ${names} ${one ? 'is' : 'are'} a record's own field ` +
    'and a position in a list, so the two values are written into the same column ' +
    'and read back as one.';
}

/**
 * The two list shapes XML has no way to carry, counted per field and named on
 * stderr. The twin of `reportCSVTypeLoss`, and for the same reason: the file
 * cannot say what it lost, so it is said here or nowhere.
 *
 * A list is repeated elements of the same name, and that is a complete answer
 * for every list whose members are not themselves lists. These two are the rest:
 *
 * - An **empty list** has no repeated element to write, and an empty element is
 *   exactly what an empty object is. `<v/>` reads back as `{}`, so the field
 *   survives and its type does not. Distinguishing them needs a marker
 *   attribute, and a marker is a convention every other reader would have to
 *   know about to see the list at all — a worse trade than saying so.
 * - A **list inside a list** cannot be told from an object with one repeated
 *   child: `[[1,2]]` and `{"v":[1,2]}` are different JSON and would be the same
 *   document. Here the numbered `<field name="0">` spelling is kept, so the
 *   structure at least stays visible in the file, and this warning is what
 *   makes it something other than a quiet corruption.
 * - A **list of exactly one member** is one element, and one element is what a
 *   scalar is. `<v>7</v>` is `7` and `<v><sku>A</sku></v>` is `{"sku":"A"}`, so
 *   `[7]` comes back as `"7"`. The member is not lost — only the fact that it
 *   was a list of one — and no attribute can carry that fact, because anything
 *   that distinguishes it has to be on the element that a plain value also
 *   uses.
 *
 * The counts are per field, so a file with 40 000 rows says "v" once and not
 * 40 000 times — the same rule the CSV warning follows.
 */
function reportXMLListShape(data, warnings) {
  if (!Array.isArray(warnings)) return;
  const empty = new Map();
  const nested = new Map();
  const single = new Map();
  const note = (map, field) => map.set(field, (map.get(field) || 0) + 1);
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const member of value) walk(member);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [field, member] of Object.entries(value)) {
      if (Array.isArray(member)) {
        if (member.length === 0) note(empty, field);
        else if (member.length === 1) note(single, field);
        if (member.some((m) => Array.isArray(m))) note(nested, field);
      }
      walk(member);
    }
  };
  walk(data);
  const list = (map) => [...map].map(([field, n]) => `"${field}" (${n})`).join(', ');
  if (empty.size > 0) {
    warnings.push(
      `xml: ${empty.size} field(s) hold an empty list, which XML has no shape for: ${list(empty)}. ` +
      'Each was written as an empty element and reads back as {} — the field is there, the list is not. ' +
      'An empty list cannot be told from an empty object in XML without a convention, and this format has none.'
    );
  }
  if (single.size > 0) {
    warnings.push(
      `xml: ${single.size} field(s) hold a list of one, which XML writes as the single value it is: ${list(single)}. ` +
      'It reads back as that value, not as a list of one — the value is kept, the list around it is not.'
    );
  }
  if (nested.size > 0) {
    warnings.push(
      `xml: ${nested.size} field(s) hold a list inside a list, which XML cannot tell from an object with a ` +
      `repeated child: ${list(nested)}. It was written as numbered <field name="0"> children, ` +
      'which only this tool reads back, and not as the list it was.'
    );
  }
}

/**
 * A `null` in the data, counted per field and named on stderr by the `xml`
 * writer, because XML has no spelling for a value that is not there.
 *
 * The other five formats all have one, and each of them was measured on the file
 * it writes rather than on what it is supposed to do. `json` and `yaml` keep the
 * difference: an absent key is absent, and a null is a key holding null.
 * `sql` writes `NULL`, which is SQL's own word for it. `csv` and `table` write an
 * empty cell that reads back as `""`, and `reportAbsentFields` says so with the
 * same trade. **`xml` is the one that said nothing, and what it does is worse than
 * an empty cell**: `String(null)` is the four letters `null`, so
 * `{"nul":null}` became `<nul>null</nul>` and came back as `{"nul":"null"}` — an
 * absence turned into a value, exit 0, empty stderr. A file that a downstream
 * job reads as "this field has the text null in it" is not a file with a blank
 * in it; the difference is the whole point of having a null.
 *
 * There is no spelling that fixes it. `<nul/>` is what an empty string is, and
 * leaving the element out is what a field the record does not have is — both
 * are already other values in the same file, and `xsi:nil` is a convention every
 * reader would have to know before the file meant anything. So the file keeps
 * the shape XML has and the loss is said here, once per run, the way
 * `reportXMLListShape` says its three: the values are not lost *silently*, which
 * is the part that was wrong.
 *
 * An attribute and the element's own text are the other two places a null can
 * sit, and they are counted under the name they carry (`@id`, `#text`) because
 * that is the name they come back with. A null row has no field around it, so
 * it is counted as `item` — the tag it was written under, and the field the
 * reader hands back.
 */
function reportXMLNulls(data, warnings) {
  if (!Array.isArray(warnings)) return;
  const nulls = new Map();
  const note = (field) => nulls.set(field, (nulls.get(field) || 0) + 1);
  const walk = (value, field) => {
    if (value === null) {
      note(field === null ? 'item' : field);
      return;
    }
    if (Array.isArray(value)) {
      for (const member of value) walk(member, field);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [name, member] of Object.entries(value)) {
      if (member === null) {
        note(name);
        continue;
      }
      walk(member, name);
    }
  };
  walk(data, null);
  if (nulls.size === 0) return;
  const list = [...nulls].map(([field, n]) => `"${field}" (${n})`).join(', ');
  warnings.push(
    `xml: ${nulls.size} field(s) hold an explicit null, which XML has no spelling for: ${list}. ` +
    'Each was written as text and reads back as a string — the element "null", an attribute "" — ' +
    'so a value stands where the file had an absence. json and yaml keep the difference; no spelling in this format can.'
  );
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
 * Is this record a comment?
 *
 * A line whose first field begins with `#` is one, and the question is asked in
 * exactly one place because three readers of a CSV file need the same answer:
 * the format detector (which has always skipped such a line to find the first
 * line that says something), the delimiter detection, and the reader itself.
 * They disagreed, and the reader was the one that lost data.
 *
 * `quoted` is the guard that makes the rule safe: a `#` that opens a quoted
 * field is data, and so is a `#` on the second line of a quoted field, which
 * never ends a record in the first place. So a record counts as a comment only
 * when nothing in it was read as quoted.
 */
function csvComment(values, quoted) {
  return !quoted && values.length > 0 && values[0].startsWith('#');
}

/**
 * The lines of a file, with the comment lines left out, as far as the
 * delimiter detector is concerned. This is a line-level question and not the
 * record-level one above, because the detector reads a file before the reader
 * has split it: it must see the same `#` lines the reader will skip.
 */
function csvDataLines(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const kept = lines.filter(line => !csvComment([line.trim()], false));
  return kept.length > 0 ? kept : lines;
}

/**
 * Pick the delimiter from the first line. Excel in Denmark, Germany and most of
 * the rest of Europe writes `;` by default, so a comma-only reader silently
 * collapses such a file into a single column. A tie — and a line with no
 * delimiter at all — keeps `,`, so single-column and comma files are unchanged.
 *
 * The line is the first one that is not a comment, because the line above the
 * header is the one a file is most likely to open with — `# exported`, a
 * `#`-prefixed title, a note about where the export came from. Read from the
 * comment instead, `# note` above a `;` file wins every comparison and the
 * whole file collapses into one column of text.
 */
function detectDelimiter(text) {
  const firstLine = csvDataLines(text)[0] || '';
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

function csvCommentWarning(count, records) {
  const first = records.find(r => csvComment(r.values, r.quoted));
  const shown = first ? first.values.join(' ') : '';
  const clipped = shown.length > 40 ? shown.slice(0, 40) + '…' : shown;
  return `${count} CSV line${count > 1 ? 's' : ''} starting with # ` +
    `${count > 1 ? 'were' : 'was'} skipped as comments (first: "${clipped}"); ` +
    `they hold no fields, so a file that uses # as part of a column name needs ` +
    `its own name quoted.`;
}

function duplicateHeaderWarning(name, columns, differing, rowCount) {
  const positions = columns.map(i => i + 1);
  const shown = `${positions.slice(0, -1).join(', ')} and ${positions[positions.length - 1]}`;
  const times = columns.length === 2 ? 'twice' : `${columns.length} times`;
  const rows = `${differing} of ${rowCount} row${rowCount === 1 ? '' : 's'}`;
  return `CSV: the header names "${name}" ${times} (columns ${shown}); ` +
    `they hold different values in ${rows}, so only the last of them is kept and the ` +
    `values in the others are gone. One of those names is a mistake in the input.`;
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
  let recordQuoted = false;

  const endField = () => {
    if (quoted) recordQuoted = true;
    record.push(quoted ? field : field.trim());
    field = '';
    quoted = false;
  };
  const endRecord = () => {
    endField();
    records.push({ values: record, quoted: recordQuoted });
    record = [];
    recordQuoted = false;
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

  // RFC 4180 allows blank lines between records; the first real record is the
  // header. A record that was *quoted* is not one of them: `""` is a record
  // holding one empty field, and dropping it because its value happens to be
  // empty is how a one-column export lost every row whose value was empty.
  //
  // A comment line is a third kind: it is a real record by RFC 4180, and it was
  // read as one, so the header became `# exported 2026-09-28` and every real
  // column name in the file was data. The format detector has skipped such lines
  // since it learned to ask what a YAML file looks like, so the reader and the
  // detector disagreed about the same byte of the same file.
  const skipped = records.filter(r => csvComment(r.values, r.quoted));
  const recordsWithIndex = records.filter(
    r => !(r.values.length === 1 && r.values[0] === '' && !r.quoted) && !csvComment(r.values, r.quoted)
  );
  if (skipped.length > 0 && Array.isArray(opts.warnings)) {
    opts.warnings.push(csvCommentWarning(skipped.length, records));
  }
  if (recordsWithIndex.length === 0) return [];
  const headers = recordsWithIndex[0].values.map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h));

  const rows = [];
  const headerNames = new Set(headers);
  const extraNames = new Map();
  const extraLines = new Set();
  // A header that names two columns the same can only produce one field, and
  // the reader has always kept the last of them. T43 quoted a header the writer
  // would otherwise have trimmed into a collision, so this tool could no longer
  // write that file — but every other tool still can, and a spreadsheet export
  // with `order` in column 1 and column 3 is ordinary. The two are then compared
  // the way JSON and YAML duplicates are: as the reader read them, so an
  // identical repeat (`1` and `1.0`, `a` and ` a`) stays silent and only a real
  // difference in the data is worth a line.
  const repeated = new Map();
  headers.forEach((h, idx) => {
    if (!repeated.has(h)) repeated.set(h, []);
    repeated.get(h).push(idx);
  });
  const differingRows = new Map();
  for (let r = 1; r < recordsWithIndex.length; r++) {
    const values = recordsWithIndex[r].values;
    const row = {};
    const read = [];
    headers.forEach((h, idx) => {
      const value = idx < values.length ? coerceCSVValue(values[idx]) : '';
      read.push(value);
      setField(row, h, value);
    });
    for (const [name, columns] of repeated) {
      if (columns.length < 2) continue;
      // Compared at their own positions, not through the record: `row[name]`
      // holds the last of the two by now, which is the very value that is in
      // danger of being compared against itself.
      const [first, ...rest] = columns.map(idx => read[idx]);
      if (rest.some(value => value !== first)) {
        differingRows.set(name, (differingRows.get(name) || 0) + 1);
      }
    }
    if (values.length > headers.length) {
      extraLines.add(r + 1);
      for (let idx = headers.length; idx < values.length; idx++) {
        // One name per field position, not per value: a file where 900 rows
        // are too long must not produce 1800 columns.
        if (!extraNames.has(idx)) extraNames.set(idx, extraColumnName(idx, headerNames));
        setField(row, extraNames.get(idx), coerceCSVValue(values[idx]));
      }
    }
    rows.push(row);
  }
  if (extraLines.size > 0 && Array.isArray(opts.warnings)) {
    opts.warnings.push(extraFieldsWarning(rows.length, extraLines, extraNames.values()));
  }
  // One warning per repeated name, not one per row: a 10,000-row export must not
  // print 10,000 lines, and the user can only act on the header anyway.
  if (rows.length > 0 && Array.isArray(opts.warnings)) {
    for (const [name, columns] of repeated) {
      if (columns.length < 2) continue;
      const differing = differingRows.get(name);
      if (!differing) continue;
      opts.warnings.push(duplicateHeaderWarning(name, columns, differing, rows.length));
    }
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
  // A value that opens with `#` is a comment line to the reader in this file,
  // so writing it bare wrote a file this tool could not read back: a column
  // called `#id` became a comment, the header it sat in became the comment's
  // own second field, and every column in the file was lost. The reader trims
  // an unquoted field before deciding, so leading whitespace counts too.
  // A `#` anywhere else is ordinary text and stays bare.
  if (/^\s*#/.test(val)) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/**
 * One CSV cell, for the header line and for the value line alike.
 *
 * The value line got this rule in T41 and the header line never did, and the
 * gap is the whole fourth end of this tool's writer — measured on the real
 * binary, exit 0 and empty stderr in all three cases:
 *
 *   header " a "    written bare, and the reader trims every field it did not
 *                   read as quoted, so the column came back named `a`
 *   header "  "     written as a line holding two spaces, and RFC 4180 lets a
 *   header ""       file carry blank lines between records — which is the rule
 *                   the reader follows, correctly, for *records*. The header is
 *                   the first record, so it was eaten: the only data line
 *                   became the header and the file read back as **zero rows**
 *   headers " a"    both written bare and both trimmed to `a`, so two columns
 *          "a "     became one. The second value overwrote the first and a
 *                   whole column of data was gone, with nothing on stderr
 *
 * The third is the one that costs data, and it needs no exotic input: a
 * spreadsheet export with a stray trailing space in one column name is the
 * ordinary shape of it. Quoting is the same fix T41 measured for values, and
 * it is the only one available — RFC 4180 has no escape that says *this field
 * is exactly these spaces*, so the file has to carry the quotes.
 *
 * `oneColumn` covers the blank-line case: a one-column file whose only header is
 * empty is the shape where a record *is* a line with nothing on it, and `""` is
 * the RFC's own way to spell a field that is present and empty. The reader asks
 * whether a field was quoted rather than what it held, so it can tell the two
 * apart — but only if the writer quotes.
 */
function csvCell(val, oneColumn) {
  const cell = cellValue(val);
  if (cell !== cell.trim() || (oneColumn && cell === '')) {
    return '"' + cell.replace(/"/g, '""') + '"';
  }
  return escapeCSV(cell);
}

function parseYAMLValue(val, ctx) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') {
    // The one place a YAML scalar becomes a number, so it is the one place a
    // value that cannot be held can be noticed. The JSON reader cannot do it
    // this way — `JSON.parse` has already rounded by the time it returns — which
    // is why that one walks the text instead.
    if (ctx) collectLostPrecision(ctx.warnings, 'YAML', val.trim());
    return num;
  }
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

  const lines = joinYAMLFlowLines(tokenizeYAML(text));

  // A directive line starts with `%` in the first column — `%YAML 1.2`,
  // `%TAG !e! tag:example.com,2000:`. Kubernetes manifests, Ansible playbooks
  // and a good deal of CI config open with one, and a plain scalar can never
  // begin with `%` because it is a YAML indicator, so a line like that is only
  // ever a directive. The reader counted it as the document instead, so
  // everything under it was never read: `%YAML 1.2`, `---`, a mapping came out
  // as the one string "%YAML 1.2", and the "2 documents" warning pointed at a
  // second document the file does not have.
  let start = skipYAMLBlanks(lines, 0);
  while (start < lines.length && isYAMLDirective(lines[start])) {
    start = skipYAMLBlanks(lines, start + 1);
  }

  // `---` opens the document; anything before it that is not a document is
  // not read at all, and every further one is a document this tool does not
  // read. Saying so beats silently using the first half of the file.
  if (start < lines.length && lines[start].content === '---') {
    start = skipYAMLBlanks(lines, start + 1);
  }

  // A directive is only allowed *before* the document, so one that stands
  // after data is not a value to keep. In a mapping it already failed loudly,
  // but in a sequence it ended the document and took the rest of the file with
  // it: `- a`, `%YAML 1.2`, `- b` read as the single record "a", exit 0, empty
  // stderr. One check, so every shape of document says the same thing, and it
  // stops at the first document's own end marker — a directive in a *later*
  // document is not this tool's business, it is not read either way.
  for (let i = start; i < lines.length; i++) {
    if (lines[i].blank || isYAMLComment(lines[i].content)) continue;
    if (lines[i].indent === 0 && (lines[i].content === '---' || lines[i].content === '...')) break;
    if (isYAMLDirective(lines[i])) {
      throw new SyntaxError(`YAML line ${lines[i].no}: a directive ("${lines[i].content}") is only allowed before the document, not inside it`);
    }
  }
  const extra = lines.slice(start)
    .filter(l => !l.blank && l.indent === 0 && (l.content === '---' || l.content === '...')).length;
  if (extra > 0 && opts && Array.isArray(opts.warnings)) {
    opts.warnings.push(`YAML: ${extra + 1} documents in file, only the first was read`);
  }
  if (start >= lines.length) return finishYAML(lines, []);

  const ctx = {
    warnings: (opts && opts.warnings) || null,
    // Anchors are names for values, and the names live as long as the document
    // does. `pending` holds the name of an anchor whose value is still being
    // read, which is the only way a value can hold itself.
    anchors: new Map(),
    pending: new Set()
  };

  // A flow collection can be the whole document: `{a: 1, b: two}` or `[1, 2]`
  // on the root line. The block reader below does not know that syntax, so it
  // took `{a` for a key and the file's content came out as one field holding
  // the text `1, b: two}` — exit 0, empty stderr, a conversion of a document
  // nobody wrote. `parseYAMLFlow` is the reader for this syntax and already read
  // the very same line correctly one level down, so the root gets it too, and so
  // does any block that starts with one.
  const flow = yamlFlowLine(lines, start, ctx);
  if (flow) {
    return finishYAML(lines, Array.isArray(flow.value) ? flow.value : [flow.value]);
  }

  // The shapes a document can have for a pipeline: a sequence (one record per
  // item), a mapping (one record), or a run of bare scalars (one record per
  // line). The last one is not YAML, but the reader above it accepted it and
  // data in the wild is shaped that way.
  //
  // A line that is nothing but `&name` is none of the three: it is the node
  // under it, and the block reader is the one that knows how to read that. It
  // used to be a bare scalar — the string "&k" — and the mapping or the list
  // below it was never read, so a file that names its own top level came out as
  // the two characters meant to name it, exit 0 and an empty stderr.
  if (!isYAMLSequenceEntry(lines[start].content) && !splitYAMLKey(lines[start].content) &&
      !isYAMLExplicitKey(lines[start].content) && !yamlBareProperties(lines[start].content)) {
    const records = [];
    for (let i = start; i < lines.length; i++) {
      if (lines[i].blank || isYAMLComment(lines[i].content)) continue;
      if (lines[i].content === '---' || lines[i].content === '...') break;
      if (isYAMLSequenceEntry(lines[i].content) || splitYAMLKey(lines[i].content) ||
          isYAMLExplicitKey(lines[i].content) || yamlBareProperties(lines[i].content)) break;
      // A scalar in this run may still carry a name: `&x 1` is the number 1 with
      // a name on it, the same answer the value in a mapping gives it, and the
      // string "&x 1" is the one this line used to be read as. An alias *is* the
      // whole node, so `*k` stands in for what `k` names — and a name that was
      // never given is the error every other reader of an alias gives.
      const prop = readYAMLProperties(stripYAMLComment(lines[i].content).replace(/\s+$/, ''), lines[i].no);
      if (!prop) records.push(parseYAMLScalar(lines[i].content));
      else if (prop.alias) records.push(readYAMLAlias(prop.alias, ctx, lines[i].no));
      else records.push(attachYAMLProperties(prop, parseYAMLScalar(prop.rest, ctx), ctx, lines[i].no));
    }
    return finishYAML(lines, records);
  }

  const parsed = parseYAMLBlock(lines, start, lines[start].indent, ctx);
  refuseOutsideRootBlock(lines, parsed.end, lines[start].indent, lines[start].no);
  return finishYAML(
    lines,
    Array.isArray(parsed.value) ? parsed.value : parsed.value === null ? [] : [parsed.value]
  );
}

/**
 * Is there a line that stands outside the block the document opened?
 *
 * A block that is not the root one is read by a caller that knows what is
 * around it, so a line less indented than the block is simply where that block
 * ends — the caller reads the sibling as the next thing. The root has no caller,
 * and there is nothing left to read: the first line of a document sets how far
 * the whole document is indented, so a line at *less* indentation is not a
 * sibling of what came before, it is a second document that starts without a
 * `---` between them. PyYAML answers `expected '<document start>', but found
 * '<block mapping start>'` to exactly that, and this reader took the first block
 * and stopped: `  a: 1` then ` b: 2` came back as `{"a": 1}` — the key `b`
 * gone, exit 0, an empty stderr, and nothing anywhere saying a line was
 * dropped. `  - 1` then `- 2` lost the number the same way.
 *
 * So the question is asked once, here, and it is asked of the same block
 * reader's own answer: everything the block did not consume but the document
 * did write. A `---` or `...` at column 0 is not a line outside the block — it
 * is the end of this document and the start of a next one, which is read as
 * far as it is read and named as a warning above.
 */
function refuseOutsideRootBlock(lines, from, rootIndent, rootNo) {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].blank || isYAMLComment(lines[i].content)) continue;
    if (lines[i].indent === 0 && (lines[i].content === '---' || lines[i].content === '...')) return;
    if (lines[i].indent >= rootIndent) return;
    throw new SyntaxError(
      `YAML line ${lines[i].no}: this line is less indented than the line the document ` +
      `began on, so it cannot be a line of the same document — line ${rootNo} opens it at ` +
      `${rootIndent} space${rootIndent === 1 ? '' : 's'} and this one stands at ${lines[i].indent}`
    );
  }
}

/**
 * Split a document into lines that remember their indentation, their source
 * line number and whether they are blank. Comments are deliberately *not*
 * stripped here: a `#` inside a block scalar is data, and stripping it early
 * would quietly rewrite every shell snippet a config file carries. Trailing
 * whitespace is trimmed for the same reason and on the same rule — it is not
 * whitespace inside a block scalar — but it is kept as `raw`, because the only
 * reader of `raw` is the block scalar path and a fixed-width column, a padded
 * shell snippet and a `- <TAB>` recipe all live there.
 */
function tokenizeYAML(text) {
  return text.split(/\r\n|\n|\r/).map((line, i) => {
    // Indentation is spaces, and only spaces. A tab that opens a line is not
    // whitespace to a parser, it is a character that cannot start a token:
    // PyYAML answers "found character '\t' that cannot start any token" and
    // refuses the file, and this read `v: |` with a tab under it as the value
    // 'a\nb\n' — a file no real parser opens, read here as a value, exit 0,
    // empty stderr.
    //
    // The same character is why `lead` used to be `/^[ \t]*/`, and the other
    // half of that regex was worse than the silence above: inside a block
    // scalar the tab is *content*, the indentation has already begun, and
    // eating the tab as indentation handed the dedent a column that was not
    // there. `{"v":"x\n\ty"}` was written as `|-` with `    <TAB>y` on the
    // second line and read back as `'x\n y'` — this tool's own writer, its own
    // reader, one tab lost in a round trip nobody had to ask for.
    if (line[0] === '\t') {
      throw new SyntaxError(
        `YAML line ${i + 1}: a tab character cannot start a line — YAML indents ` +
        `with spaces, so this line is indented with a character no parser accepts`
      );
    }
    const lead = /^ */.exec(line)[0];
    const body = line.slice(lead.length);
    const content = body.replace(/\s+$/, '');
    return {
      indent: lead.length,
      content,
      raw: body,
      // A tab that is not a token start but not content either: it sits inside a
      // plain scalar, right after a `:`, after a `- `, inside a flow collection,
      // or in the whitespace this line's own trailing trim just ate. Where the
      // token starts, PyYAML answers "found character '\t' that cannot start any
      // token" and refuses the file, and this read it as a value — `v:\t1` came
      // back as `{"v": 1}`, `a\tb: 1` as the key `a\tb`, `-\ta` as "a" and
      // `v: {\t"a": 1\t}` as a mapping, all with exit 0 and an empty stderr.
      //
      // It is recorded rather than thrown, because the same character is legal
      // in exactly two places and only the block scalar path can see them: inside
      // a quoted scalar, and on a line of a `|` block, where the indentation has
      // already begun and the tab is the data. `readYAMLBlockScalar` clears the
      // mark on the lines it collected, and `finishYAML` asks the question once
      // the document is read.
      tabAt: yamlTabTokenStart(content, body.slice(content.length)),
      blank: content.trim() === '',
      no: i + 1
    };
  });
}

/**
 * Where the first tab in `content` sits that a parser cannot read, or -1 when
 * there is none: outside every quoted scalar and before any comment. The walk is
 * `stripYAMLComment`'s, because it is the same question asked in the other
 * direction — a `#` only starts a comment when nothing is open, and a tab inside
 * a comment is text, exactly as it is inside a quote.
 *
 * `tail` is the whitespace the line's own trailing trim removed, and a tab in
 * *it* was swallowed before any reader saw it: `v: 1<TAB>` read as `{"v": 1}`
 * while PyYAML refuses the file, because the tab is then the next token.
 */
function yamlTabTokenStart(content, tail) {
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\t') return i;
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(content[i - 1]))) return -1;
  }
  return tail && tail.includes('\t') ? content.length : -1;
}

/**
 * How deep a flow collection is at the end of `text`. The walk is
 * `stripYAMLComment`'s, because it is the same question: a `#` that starts a
 * comment hides the rest of the line, so `a: {b: 1  # }` is a collection that is
 * still open with a comment after it, and not a closed one. A negative depth
 * means a closing bracket nobody opened, which is left to the flow reader — it
 * is the one that has the error to give.
 */
function yamlFlowDepth(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) break;
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth;
}

/**
 * The value a line carries, asked the way the readers ask it: the part after
 * the key's colon, or the part after a sequence dash. It is asked here without
 * `splitYAMLKey`, because that one reads the key's properties and so can name a
 * line and complain about a name — questions that belong to the reader and not
 * to a walk that only wants to know whether a `|` stands on the line. The colon
 * is therefore found the way `splitYAMLKey` finds it: a space or the end of the
 * line after it, so `12:30` and `a:b` are not keys. Only the block scalar marker
 * is looked for in the answer, and it is looked for generously — `v: &x |`
 * keeps its `&x` and is read as the header it is.
 */
function yamlLineValue(content) {
  if (!content || isYAMLComment(content) || isYAMLSequenceEntry(content)) {
    return isYAMLSequenceEntry(content) ? content.replace(/^-(?:[ \t]+|$)/, '') : null;
  }
  if (content[0] === '"' || content[0] === "'") {
    const quoted = readYAMLQuoted(content, 0);
    if (!quoted) return null;
    const after = content.slice(quoted.end);
    return /^[ \t]*:([ \t]|$)/.test(after) ? after.replace(/^[ \t]*:[ \t]*/, '') : null;
  }
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '#' && i > 0 && /\s/.test(content[i - 1])) return null;
    if (ch === ':' && (i === content.length - 1 || /\s/.test(content[i + 1]))) {
      return content.slice(i + 1).replace(/^[ \t]+/, '');
    }
  }
  return null;
}

/**
 * The lines that are a block scalar's own text, and so data rather than
 * syntax. A block scalar is the one place in a YAML file where an unbalanced
 * `[` is a letter and not a bracket — `v: |` with `a: [1` under it is a value,
 * and a reader that joined those lines would be rewriting the value. The walk
 * is `readYAMLBlockScalar`'s: a header takes the lines that follow it until one
 * comes back to its own indentation or the file runs out.
 */
function yamlBlockScalarLines(lines) {
  const body = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].blank) continue;
    const value = yamlLineValue(lines[i].content);
    if (!value || !/[|>](?:[+-][1-9]?|[1-9][+-]?)?[ \t]*(?:#.*)?$/.test(value)) continue;
    for (let j = i + 1; j < lines.length && (lines[j].blank || lines[j].indent > lines[i].indent); j++) {
      body.add(j);
    }
  }
  return body;
}

/**
 * A flow collection may be written over several lines. `a: {`, `  b: 1`, `}` is
 * three lines and one value, and the hand-wrapped lists in a CI config, a
 * compose file or a Kubernetes manifest are written that way because one long
 * line stops being readable. This reader reads one line at a time, so the
 * continuation was an indentation it could not explain: eleven of the twelve
 * measured files were *refused* — "unexpected indentation", on files PyYAML
 * reads — and the twelfth, `- {a:` + `    1}`, came out as a field called `{a`.
 *
 * A line break inside a flow is separation and not content, the same folding a
 * quoted scalar gets, so the lines are joined with one space and the one-line
 * reader reads them. That is why every rule about a flow that took three lines
 * to write is the rule that took one: the same quotes, the same comments, the
 * same anchors, the same explicit keys.
 *
 * Two rules keep everything that reads today reading the same. A line that
 * continues the collection is one indented under the line that opened it, or
 * one that is nothing but the collection's own closing punctuation — a `}` may
 * sit at the indentation its `{` was written at, which is how the mapping is
 * written when the writer counts its own braces. And a collection that is still
 * open when such lines run out is left exactly as it was, so a stray bracket in
 * a file meant to be read as text is still read as text.
 */
function joinYAMLFlowLines(lines) {
  const block = yamlBlockScalarLines(lines);
  const out = lines.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i].blank || block.has(i)) continue;
    if (yamlFlowDepth(out[i].content) <= 0) continue;
    const host = out[i];
    const taken = [];
    const takenAt = [];
    let end = -1;
    for (let j = i + 1; j < out.length; j++) {
      if (block.has(j)) break;
      const line = out[j];
      // A blank line and a comment of its own end the run: the first is not
      // text, and the second would swallow the closing bracket behind it,
      // because a `#` hides the rest of the line from everyone who reads it.
      if (line.blank || isYAMLComment(line.content)) break;
      const text = stripYAMLComment(line.content).trim();
      if (text === '') break;
      const closing = line.indent > host.indent ? text : /^[,\]}]+$/.test(text) ? text : null;
      if (closing === null) break;
      taken.push(closing);
      takenAt.push(j);
      if (yamlFlowDepth(`${host.content} ${closing}`) <= 0) { end = j; break; }
    }
    if (end < 0) continue;
    host.content = [host.content, ...taken].join(' ');
    host.raw = [host.raw, ...taken].join(' ');
    // The lines that were taken keep their number and their tab mark, so a tab
    // that cannot start a token is still refused on the line it is written on.
    for (const j of takenAt) out[j] = { ...out[j], blank: true };
    i = end;
  }
  return out;
}

/**
 * The one place a tab is refused, asked after the document is read so the block
 * scalar path has had its say about which tabs are content. Every return below
 * `tokenizeYAML` goes through here, so a new document shape cannot start
 * accepting a tab by being read differently.
 */
function finishYAML(lines, value) {
  const bad = lines.find(l => l.tabAt >= 0);
  if (bad) {
    throw new SyntaxError(
      `YAML line ${bad.no}: found character '\\t' that cannot start any token — ` +
      `a tab is not separation in YAML, so it is only a character inside a quoted ` +
      `scalar, inside a comment, or on a line of a block scalar`
    );
  }
  return value;
}

function isYAMLComment(content) {
  return content.startsWith('#');
}

/**
 * A directive line: `%` in the first column. `%` is a YAML indicator, so no
 * plain scalar starts with one and an indented `%` belongs to whatever block
 * holds it (a `|` scalar carrying a shell snippet, a `100% off` value), which is
 * why this is the one place that asks for the indentation.
 */
function isYAMLDirective(line) {
  return line.indent === 0 && line.content.startsWith('%');
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
 * A line that opens an *explicit* mapping key: `? x`, alone or with its value
 * under it. `?` is a YAML indicator, so a plain scalar never starts with one, and
 * this is the only position where it can mean a key.
 *
 * An explicit key is the one key YAML spells out in front of, and it is what
 * `!!set` is written on. The reader had no notion of one, so what it did with the
 * line depended on what stood around it: `? x` + `: 1` was refused with
 * "unexpected indentation" — PyYAML answers `{x: 1}` — while `? x` with nothing
 * after it was read as the invented text `"? x"`, exit 0, an empty stderr, and in
 * a sequence `- ? x` gave a record whose only field was called `"? x"`.
 */
function isYAMLExplicitKey(content) {
  return content === '?' || /^\?\s/.test(content);
}

/**
 * A line that carries only the value of the explicit key above it: a `:` with a
 * space or the end of the line after it, exactly the rule that decides a key's
 * colon, so `12:30` and `a:b` stay the plain scalars they look like.
 */
function isYAMLMappingValue(content) {
  return content === ':' || /^:\s/.test(content);
}

/**
 * Find the `:` that ends a mapping key, or null when the line is not a
 * mapping entry. A colon only ends a key when a space or the end of the line
 * follows it, which is what keeps `12:30` and `a:b` the plain scalars they
 * look like.
 */
function splitYAMLKey(content, no) {
  if (!content || content === '-' || isYAMLComment(content)) return null;
  // A line that opens a sequence entry is not a mapping entry, whatever else is
  // on it. `- <<: *b` read as a field called `- <<` gave a file a field nobody
  // wrote and lost the list the line was opening.
  if (isYAMLSequenceEntry(content)) return null;
  // A `?` in front of a key is the indicator that spells the key out, not part of
  // the name. `? x : 1` is the entry `x: 1` and `? : 1` the one with the key left
  // out, and reading their colon as an ordinary key separator named a field `? x`
  // — a name no file writes, exit 0, an empty stderr, on the spelling that says
  // out loud what the key is. The same entry over two lines (`? x` and `: 1`) and
  // the same entry in a flow collection (`{? x : 1}`) were both read already; the
  // one written on a single line was the only one left behind. Every caller of
  // this function asks `isYAMLExplicitKey` right next to it, so handing the line
  // on is what they were already asking for.
  if (isYAMLExplicitKey(content)) return null;
  if (content[0] === '"' || content[0] === "'") {
    const quoted = readYAMLQuoted(content, 0);
    if (!quoted) return null;
    const after = content.slice(quoted.end).replace(/^[ \t]*/, '');
    if (!after.startsWith(':')) return null;
    return { key: quoted.value, rawKey: quoted.value, rest: after.slice(1).replace(/^[ \t]+/, ''), keyProp: null };
  }
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '#' && i > 0 && /\s/.test(content[i - 1])) return null;
    if (ch === ':' && (i === content.length - 1 || /\s/.test(content[i + 1]))) {
      // A key carries the same properties a value does: `&k b: 2` names the
      // field `b` and `!!str a: 1` asks for it to be a string, so they are
      // handed back with the key instead of ending up inside its name.
      const raw = content.slice(0, i).trim();
      const keyProp = readYAMLProperties(raw, no, 'key');
      return {
        key: keyProp ? keyProp.rest : raw,
        rawKey: raw,
        rest: content.slice(i + 1).replace(/^[ \t]+/, ''),
        keyProp
      };
    }
  }
  return null;
}

/**
 * A file the reader refuses, said in a way the flow reader must not swallow.
 * `parseYAMLFlow` catches everything and answers "this text is not a flow
 * collection", so the caller reads the line as the text it was written with —
 * the right answer for `a: [not a collection]`, which is a list of one text. But
 * a file that is *wrong* cannot be answered that way: it came back as its own
 * text, every field in it gone and nothing on stderr. So the refusals carry their
 * own type and the catch passes those on.
 *
 * Eleven places throw this, and every one of them already said the same thing in
 * the block reader: a reference with no anchor (`readYAMLAlias`), a node named
 * twice or both named and a reference (`readYAMLProperties`), a tag that asks for
 * a number the text is not or stands on a whole table (`applyYAMLTag`), and a
 * table or a list where a field name belongs (`refuseCollectionKey`). The block
 * reader has no catch, so it never needed the type; the flow reader does, and it
 * was swallowing all eleven, so a `{b: !!int "x"}` or a `{b: *nope}` came back as
 * the text `{b: !!int "x"}` with every field of the document gone and an empty
 * stderr — the same file written in two lines was refused with the same words.
 * Measured 2026-09-28, 22 files: 16 read a file the judge refused, and the block
 * reader refused every one of the 16 that had a block spelling.
 *
 * A half-open quote is deliberately *not* one of them: `readYAMLQuoted` answers
 * "this is a typo, not a reason to throw away the rest of a file" and the block
 * reader has always gone on reading the text, so the flow reader goes on too.
 */
class YAMLRefusal extends SyntaxError {}

/**
 * `&name`, `*name` and `!tag` are properties of the node they stand in front of,
 * not the node itself. PyYAML reads `a: &x 1` as the number 1 with a name
 * attached to it, `b: *x` as that same 1 written a second time, and `a: !!str 1`
 * as the *string* "1" — a tag is the one thing in YAML that deliberately changes
 * a type. Here all three came out as the value's own text — `&x 1`, `*x` and
 * `!!str 1`, three strings, exit 0, an empty stderr — and a file whose anchor or
 * tag sat above a block was refused outright, because `a: &x` reads as a
 * finished line and the block under it was then an unexpected indentation.
 * Eighteen of twenty measured files disagreed with PyYAML that way, and the
 * tags alone were wrong in thirteen of twenty-seven.
 *
 * A plain scalar never starts with `&`, `*` or `!`, so a property in this
 * position always means what it means in YAML. Each name runs to the first
 * space, comment or flow indicator, and what is left of the line is the node the
 * property was put on. They may stand in any order and more than one of them may
 * be there — `&x !!str 1` and `!!str &x 1` are the same node — so this reads
 * them off in a loop instead of once.
 *
 * `subject` is what the properties stand on, because a key says `one key can
 * only carry one tag` and a value says `one value`, and telling a user their
 * key is a value is the kind of small untrue thing this file does not do.
 */
function readYAMLProperties(raw, no, subject = 'value') {
  const where = no ? `YAML line ${no}: ` : '';
  let rest = raw;
  let anchor = null;
  let alias = null;
  let tag = null;
  let m;
  while ((m = /^([&*])([^\s#[\]{},]+)(?:[ \t]+(.*))?$/.exec(rest) ||
             /^(!)(<[^>\s]*>|[^\s#[\]{},]+)?(?:[ \t]+(.*))?$/.exec(rest))) {
    // The tag is kept with its `!` so a warning can name it the way the file
    // wrote it: `!custom` and `!<tag:example.com,2026>` are both one tag.
    const name = m[1] === '!' ? (m[2] ? `!${m[2]}` : '!') : m[2];
    if (m[1] === '&') {
      if (anchor || alias) {
        throw new YAMLRefusal(`${where}one node can only be named once, but "${rest}" names it twice`);
      }
      anchor = name;
    } else if (m[1] === '*') {
      if (alias || anchor) {
        throw new YAMLRefusal(`${where}one node cannot be both named and be a reference, but "${rest}" is both`);
      }
      alias = name;
    } else {
      if (tag) {
        throw new YAMLRefusal(`${where}one ${subject} can only carry one tag, but "${rest}" carries two`);
      }
      tag = name;
    }
    rest = (m[3] || '').replace(/^[ \t]+/, '');
  }
  if (!anchor && !alias && !tag) return null;
  return { anchor, alias, tag, rest };
}

/**
 * Is this line nothing but properties — `&k`, `!tag`, `&k !!str`, each of them
 * with a comment behind it and no text of its own? Such a line is not a scalar.
 * It is the node that *follows*: an anchor with no value of its own names
 * whatever stands under it, and a tag with no value of its own says the type of
 * that same node. `&k` above a mapping names the mapping, and `!tag` above a
 * value says what the value is.
 *
 * It was read as a scalar, because that is all there was on the line — and then
 * the rest of the file was never read at all. `&k` + `a: 1` + `b: 2` came out as
 * the one string "&k", exit 0, an empty stderr, in a file PyYAML reads as
 * `{a: 1, b: 2}`: the whole document replaced by the two characters that were
 * meant to name it. Under a key it was worse — `a:` + `  &k` + `  b: 1` died
 * with "unexpected indentation", so the one writing that shape had no file at
 * all. Both spellings put a name on a block, and they are the shapes a file that
 * wants to refer to its own top level is written in.
 *
 * An alias is the one property that is not: `*k` *is* the whole node, so a line
 * carrying one is complete and `yamlBareProperties` says no to it.
 */
function yamlBareProperties(content) {
  if (!content || isYAMLComment(content)) return null;
  const raw = stripYAMLComment(content).replace(/\s+$/, '');
  if (!raw) return null;
  const prop = readYAMLProperties(raw);
  if (!prop || prop.alias || prop.rest !== '') return null;
  return prop;
}

/**
 * Hand a value the name and the type the properties in front of it asked for, and
 * put the name in the document so `*name` later on finds it. The two readers that
 * already did this inline — the mapping's and the sequence's — ask the same
 * question here, so the value under a bare `&name` is named the way a value
 * written as `&name 1` is.
 */
function attachYAMLProperties(prop, value, ctx, no) {
  const tagged = prop.tag ? applyYAMLTag(prop.tag, value, ctx, no) : value;
  if (prop.anchor) {
    ctx.anchors.set(prop.anchor, tagged);
    ctx.pending.delete(prop.anchor);
  }
  return tagged;
}

/**
 * Does this tag belong in the name of the key it stands on? A carried tag does,
 * because it is the type the file asked for — `? !!str` with nothing behind it is
 * the empty string, and `? !!null` is `null`, which is what PyYAML reads both as.
 * A tag this tool cannot carry does too, because naming the key is the one place
 * the warning is given: `!custom: 1` is the field `!custom`, and `? !custom` is
 * that same field.
 *
 * A bare `!` is neither. It is the non-specific tag — it asks for no type at
 * all, so it says nothing about the key and is not part of its name. `? !` is
 * the key left out, which is `null`, and `? ! x` is the key `x`; both are what
 * PyYAML reads, and naming a key `!` gave a name no JSON file has.
 */
function yamlTagNamesKey(tag) {
  return !!tag && tag !== '!';
}

/**
 * The short name of a tag: `!!str` and `!<tag:yaml.org,2002:str>` are both `str`.
 * Anything else has no name JSON knows, and is dropped with a word about it.
 */
function yamlTagName(tag) {
  const short = /^!+(?:<)?(?:tag:yaml\.org,2002:)?([A-Za-z]+)>?$/.exec(tag);
  return short ? short[1].toLowerCase() : null;
}

// `y` and `n` are not in this set on purpose: YAML 1.1 once had them, but the
// core schema left them out because a Norwegian county code reads the same, and
// PyYAML's own resolver agrees — `!!bool y` is an error there, not a `true`.
/** The tags whose result is a JSON scalar — the ones that are applied. */
const CARRIED_YAML_TAGS = new Set(['str', 'int', 'float', 'bool', 'null']);
/**
 * The name a key that was not written gets. A JSON object has no key that is
 * not a string, so the key YAML calls `null` — `?` on a line of its own, `? : 1`,
 * `{? : 1}` — has to be spelled, and this is the spelling this reader already
 * uses twice: `scalarKeyName` gives it to a reference to a value that holds
 * nothing, and a file that wrote `null: 1` gets it because the name is the text
 * it was written with. Both spellings come back as the same field, so the tool's
 * own writer keeps the entry a round trip: `null: 1` in, `null: 1` out.
 *
 * Before this the empty key was read as the empty name `''`, which no file
 * writes — and it could not tell a key left out (`?`) from a key written as an
 * empty string (`? ""`), so the two YAML keeps apart arrived as the same field.
 */
const YAML_NULL_KEY = 'null';
/**
 * Is this key the one YAML leaves out? `?` and `? : 1` write nothing in front of
 * the colon, and `~` is the other spelling of nothing — all three are the same
 * key, and none of them is a field called `~`, which is a name no JSON file has.
 * `""` is not one of them: that is a key written as the empty string, and YAML
 * keeps the two apart, so the test has to know whether the key was quoted.
 */
function yamlKeyLeftOut(rawName, quoted) {
  return !quoted && (rawName === '' || rawName === '~');
}
/**
 * The name a key is written with, read the way every other key is read — which
 * means the text *inside* the quotes, and the quotes only if the file wrote
 * none. It is asked of the text that is left after the key's `&name` and `!tag`,
 * so a key that carries properties is read like a key that does not: `&k "x": 1`
 * is the field `x` and not a field called `"x"`, and `!!int "1": 2` is the field
 * `1` instead of a `!!int` handed the two quote characters, which refused a
 * valid file with "is not a whole number". `written` is the text the file wrote
 * and `quoted` says whether those quotes were there, which is the same question
 * `yamlKeyLeftOut` asks.
 */
function yamlKeyText(text) {
  const quoted = text && (text[0] === '"' || text[0] === "'") ? readYAMLQuoted(text, 0) : null;
  return { written: quoted ? quoted.value : text, raw: text, quoted };
}
const YAML_TRUE = new Set(['yes', 'true', 'on']);
const YAML_FALSE = new Set(['no', 'false', 'off']);

/**
 * What a tag asks of a value. The five tags whose result is a JSON scalar are
 * applied, because that is the type the file wrote down and JSON can carry it —
 * a tag that changes a type is the one thing in YAML that means to. Every other
 * tag (`!!binary`, `!!timestamp`, `!!set`, `!something` of an application's own)
 * is read as it was written and *named on stderr*, because a type the file
 * promised and this file cannot deliver is a value that changes without a word.
 *
 * `subject` is what the tag stands on, so a tag on a key is named as a tag on a
 * key: a field called `!custom x` is a name this tool invented, and the warning
 * is the one place a reader learns that no other reader would call it that.
 */
function applyYAMLTag(tag, value, ctx, no, raw, subject = 'value') {
  const where = no ? `YAML line ${no}: ` : '';
  const name = yamlTagName(tag);
  // A bare `!` is the non-specific tag: it asks for no type at all, so there is
  // nothing to carry and nothing to say. PyYAML reads `a: !` as an empty value.
  if (tag === '!') return value;
  if (!CARRIED_YAML_TAGS.has(name)) {
    if (ctx && Array.isArray(ctx.warnings)) {
      ctx.warnings.push(
        `${where}the tag "${tag}" is not a type JSON carries, so the ${subject} was read ` +
        `as it was written${name ? '' : ' and the tag is gone'}; something that reads ` +
        'this file with that tag will not get the same value'
      );
    }
    return value;
  }
  if (value !== null && typeof value === 'object') {
    throw new YAMLRefusal(
      `${where}a "${tag}" tag can only stand on one value, not on a ${Array.isArray(value) ? 'list' : 'table'}`
    );
  }
  // `!!str` asks for the text, so the text is what is read: `!!str 01` is the two
  // characters "01", not the number 1 written as "1" and turned back into a
  // string. Going through the value would lose exactly the digits and the
  // leading zeros the tag was written to keep — and every other tag needs the
  // same text, since `!!int "1"` is a number the file wrote in quotes.
  const written = raw === undefined || raw === null ? null : stripYAMLComment(raw).trim();
  let text;
  if (written && !blockScalarHeader(written) && written[0] !== '[' && written[0] !== '{') {
    if (written[0] === '"' || written[0] === "'") {
      const quoted = readYAMLQuoted(written, 0);
      text = quoted ? quoted.value : written;
    } else {
      text = written;
    }
  } else {
    text = value === null ? '' : String(value);
  }
  if (name === 'str') return text;
  if (name === 'bool') {
    const low = text.toLowerCase();
    if (YAML_TRUE.has(low)) return true;
    if (YAML_FALSE.has(low)) return false;
    throw new YAMLRefusal(`${where}"${text}" is not a yes/no value, so "!!bool" has nothing to make of it`);
  }
  if (name === 'null') {
    if (text === '' || text === '~' || text.toLowerCase() === 'null') return null;
    throw new YAMLRefusal(`${where}"${text}" is not empty, so "!!null" has nothing to make of it`);
  }
  const digits = text.replace(/_/g, '');
  if (name === 'int') {
    const int = /^[-+]?(0b[01]+|0o[0-7]+|0x[0-9a-fA-F]+|\d+)$/.exec(digits);
    if (!int) {
      throw new YAMLRefusal(`${where}"${text}" is not a whole number, so "!!int" has nothing to make of it`);
    }
    const body = digits.replace(/^[-+]/, '');
    const radix = /^0b/.test(body) ? 2 : /^0o/.test(body) ? 8 : /^0x/.test(body) ? 16 : 10;
    const cut = radix === 10 ? body : body.slice(2);
    const num = Number((digits[0] === '-' ? '-' : '') + parseInt(cut, radix));
    if (ctx) collectLostPrecision(ctx.warnings, 'YAML', digits);
    return num;
  }
  if (digits === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(digits)) {
    throw new YAMLRefusal(`${where}"${text}" is not a number, so "!!float" has nothing to make of it`);
  }
  const num = Number(digits);
  if (!isFinite(num)) {
    throw new YAMLRefusal(
      `${where}"!!float" asked for a number JSON cannot hold, and JSON has no way to write infinity or NaN`
    );
  }
  if (ctx) collectLostPrecision(ctx.warnings, 'YAML', digits);
  return num;
}

/**
 * The value a `*name` stands for, as a copy. Two keys sharing an anchor are two
 * independent values once they are JSON, so renaming one must not reach into the
 * other — the same rule the writers follow.
 */
function readYAMLAlias(name, ctx, no) {
  const where = no ? `YAML line ${no}: ` : '';
  if (ctx.pending.has(name)) {
    throw new YAMLRefusal(
      `${where}&${name} points at itself, and a value that holds itself is not one JSON can carry`
    );
  }
  if (!ctx.anchors.has(name)) {
    throw new YAMLRefusal(
      `${where}found undefined alias '${name}' — an anchor is written &${name} and has to be named before it is used`
    );
  }
  return copyYAMLValue(ctx.anchors.get(name));
}

function copyYAMLValue(value) {
  if (Array.isArray(value)) return value.map(copyYAMLValue);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = copyYAMLValue(value[key]);
    return copy;
  }
  return value;
}

/**
 * Is this key the merge key? `<<` written bare is, and `<<` written in quotes is
 * the field name `<<`. PyYAML keeps the quoted one as an ordinary key, and the
 * block reader merged it anyway: a field the file wrote was thrown away and the
 * anchor's fields took its place, with nothing on stderr. Both readers ask this
 * of the key's own written text, so they cannot answer it differently.
 */
function isYAMLMergeKey(name, quoted) {
  return name === '<<' && !quoted;
}

/**
 * Copy the fields a `<<` names into the mapping being read. A field the mapping
 * writes itself wins, and between two merges the first to carry a field wins —
 * the two rules PyYAML applies, asked here once so the block and the flow
 * spelling of the same line cannot answer them in different orders.
 */
function mergeYAMLFields(map, fields, seen, merged) {
  for (const field of Object.keys(fields)) {
    if (seen.has(field) || merged.has(field)) continue;
    merged.add(field);
    setField(map, field, fields[field]);
  }
}

/**
 * The fields a `<<:` merge key names: one reference, a mapping written in line,
 * or a list of either. In a list the first mapping to carry a field wins, so a
 * later anchor cannot overwrite an earlier one.
 *
 * A merge that cannot be done is a `YAMLRefusal` and not a plain `SyntaxError`,
 * because a merge key now stands in two spellings and only one of them runs
 * inside a collection that catches. The flow reader's `catch` answers "this is
 * not a flow collection" to everything else, which sent `{<<: [1, 2]}` back as
 * the text the line was written with — the whole file as one string, exit 0, an
 * empty stderr, for a file PyYAML refuses. This type is the one it passes on.
 */
function readYAMLMerge(text, ctx, no) {
  const fields = {};
  const take = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new YAMLRefusal(
        `YAML line ${no}: a merge key ("<<") can only merge a mapping into this one, not ${JSON.stringify(value)}`
      );
    }
    for (const key of Object.keys(value)) {
      if (!(key in fields)) fields[key] = value[key];
    }
  };
  const body = stripYAMLComment(text).trim();
  // A mapping written in line is a merge the file can mean as well as a name:
  // PyYAML reads `a: {<<: {x: 1}, d: 2}` as the two fields `x` and `d`, and this
  // reader refused the same `<<` in block style — a valid file turned away, the
  // one class that means the tool does not work for whoever wrote the file.
  if (body.startsWith('{')) {
    const inline = parseYAMLFlow(body, ctx);
    if (!inline.ok || !inline.value || typeof inline.value !== 'object' || Array.isArray(inline.value)) {
      throw new YAMLRefusal(
        `YAML line ${no}: a merge key ("<<") takes a reference or a list of them, not "${body}"`
      );
    }
    take(inline.value);
    return fields;
  }
  if (body.startsWith('[')) {
    const flow = parseYAMLFlow(body, ctx);
    if (!flow.ok || !Array.isArray(flow.value)) {
      throw new YAMLRefusal(
        `YAML line ${no}: a merge key ("<<") takes a reference or a list of them, not "${body}"`
      );
    }
    for (const item of flow.value) {
      const ref = typeof item === 'string' ? /^\*([^\s#[\]{},]+)$/.exec(item) : null;
      take(ref ? readYAMLAlias(ref[1], ctx, no) : item);
    }
    return fields;
  }
  const prop = readYAMLProperties(body, no);
  if (!prop || prop.anchor || !prop.alias || prop.tag || prop.rest !== '') {
    throw new YAMLRefusal(
      `YAML line ${no}: a merge key ("<<") takes a reference or a list of them, not "${body}"`
    );
  }
  take(readYAMLAlias(prop.alias, ctx, no));
  return fields;
}

/**
 * Refuse a key that opens a flow collection — `? [x, y]`, `{a: 1} : 1`,
 * `{? {b: 1} : 1}`, `{{b: 1}: 1}`. A table or a list standing where a field name
 * belongs is the rule `scalarKeyName` states for a reference that holds one, in
 * the same words, because it is the same rule: **a JSON object has no key that is
 * not a string.**
 *
 * Asked of the key's own written text, after its `&name` and `!tag` are off and
 * before its quotes are read, so `? "[x, y]"` is still the key `[x, y]` — a
 * quoted key is text — and only the bare `[x, y]` is a list where a name goes.
 * Returns the text so the two call sites are one line each, which is what keeps
 * the question from being answered two ways.
 *
 * PyYAML refuses all of these files with `found unhashable key`. Twenty spellings
 * measured 2026-09-28 through `run(text, 'yaml')`, 0 of 20 in agreement: two of
 * them read the collection as the *name* of a field the file never wrote, so
 * `? {a: 1}` + `: 1` came back as two fields — `null` and `{a` — and the six
 * written inside a flow collection came back as the line's own text, taking every
 * field of the document with it.
 */
function refuseCollectionKey(text, no) {
  if (!text || (text[0] !== '[' && text[0] !== '{')) return text;
  const where = no ? `YAML line ${no}: ` : '';
  throw new YAMLRefusal(
    `${where}a field name is text, and a ${text[0] === '[' ? 'list' : 'table'} is not`
  );
}

/**
 * A field name that came from a reference: a JSON key is a string, so a name that
 * is a table or a list is refused here instead of being written as `[object
 * Object]` in a file the user then keys on.
 */
function scalarKeyName(value, no, ctx) {
  if (value !== null && typeof value === 'object') {
    throw new SyntaxError(
      `YAML line ${no}: a field name is text, and a reference to a ${Array.isArray(value) ? 'list' : 'table'} is not`
    );
  }
  return value === null ? YAML_NULL_KEY : String(value);
}

/**
 * A line that is one whole flow collection and nothing else: `{a: 1}` or `[1, 2]`
 * with the closing bracket on the same line, and no other line behind it. Such a
 * line is a node, not the first line of a block mapping — the block reader reads
 * the colon inside the collection as a key separator, so `{a: 1}` came out as the
 * field `{a` with the text `1}` for a value, and the field `{a` is a name no file
 * writes. `parseYAMLFlow` reads this syntax and the condition it is asked under
 * is what keeps it from swallowing the lines under it: the flow has to *close* on
 * the line (`parseYAMLFlow` only says ok when it consumed the whole line) and
 * nothing may follow it.
 */
function yamlFlowLine(lines, i, ctx) {
  const content = lines[i].content;
  if (content[0] !== '{' && content[0] !== '[') return null;
  const flow = parseYAMLFlow(stripYAMLComment(content).trim(), ctx);
  if (!flow.ok) return null;
  for (let j = i + 1; j < lines.length; j++) {
    if (!lines[j].blank && !isYAMLComment(lines[j].content)) return null;
  }
  return flow;
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
  // A block that opens with a whole flow collection is that collection, and the
  // flow reader is the one that knows the syntax — the same line read as a
  // mapping became the field `{a` with the text `1}` for a value.
  const flow = yamlFlowLine(lines, i, ctx);
  if (flow) return { value: flow.value, end: lines.length };
  if (splitYAMLKey(content, lines[i].no) || isYAMLExplicitKey(content)) {
    return parseYAMLMapping(lines, i, lines[i].indent, ctx);
  }
  // A line that is nothing but `&name` or `!tag` is the node under it, not a
  // scalar, so the block that follows is read here — at its own indentation,
  // because the name was written on a line of its own and says nothing about how
  // far the node under it reaches. `&k` and then a mapping two levels in is the
  // same document as `&k` and a mapping level in, and a name on a line cannot
  // outrank the block it names.
  const bare = yamlBareProperties(content);
  if (bare) {
    if (bare.anchor) ctx.pending.add(bare.anchor);
    const j = skipYAMLBlanks(lines, i + 1);
    if (j >= lines.length) {
      if (bare.anchor) ctx.pending.delete(bare.anchor);
      return { value: attachYAMLProperties(bare, null, ctx, lines[i].no), end: j };
    }
    const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
    return { value: attachYAMLProperties(bare, child.value, ctx, lines[i].no), end: child.end };
  }
  return parseYAMLFoldedScalar(lines, i, lines[i].indent);
}

function parseYAMLMapping(lines, start, indent, ctx) {
  const map = {};
  const seen = new Map();
  const merged = new Set();
  // `k: 1` followed by `k: 2` is the classic YAML trap: the second line wins
  // with nothing to show for it, and the first value is simply gone. The key
  // is kept, the run succeeds, and the collision is named. A field that arrived
  // through a `<<` merge is not one of these: the document never wrote it twice,
  // and PyYAML answers `base: &b` / `k: 1` / `child:` / `<<: *b` / `k: 2` with
  // `{"k": 2}` and no word about a collision — the written field is the one that
  // counts, in either order.
  const set = (key, value, no) => {
    if (seen.has(key)) {
      noteDuplicateKey(ctx.warnings, 'YAML', key, seen.get(key), { value, line: no });
    } else {
      seen.set(key, { value, line: no });
    }
    setField(map, key, value);
  };
  let i = start;
  while (i < lines.length) {
    if (lines[i].blank || isYAMLComment(lines[i].content)) { i++; continue; }
    if (lines[i].indent < indent) break;
    if (lines[i].content === '---' || lines[i].content === '...') break;
    if (lines[i].indent > indent) {
      throw new SyntaxError(`YAML line ${lines[i].no}: unexpected indentation`);
    }
    const split = splitYAMLKey(lines[i].content, lines[i].no);
    if (!split) {
      if (!isYAMLExplicitKey(lines[i].content)) {
        throw new SyntaxError(`YAML line ${lines[i].no}: expected "key: value", got "${lines[i].content}"`);
      }
      // `? x` and the `: value` under it are one entry, written out. A key with
      // no value of its own is a key holding nothing, which is `null` — the same
      // answer `x:` gets — and it is what a `!!set` is written as.
      const keyNo = lines[i].no;
      // The key may be quoted, so the `#` is only a comment when it stands in
      // the open — the same question `stripYAMLComment` asks everywhere else.
      const afterQuestion = stripYAMLComment(lines[i].content.slice(1)).replace(/^[ \t]+/, '').replace(/\s+$/, '');
      // `? x : 1` writes the whole entry on the line, and `? : 1` writes it with
      // the key left out. The colon is the one that ends a key, whatever stood in
      // front of it, so the text after the `?` is asked the same question every
      // other key is asked instead of being taken as the name whole — which is
      // what named a field `? x : 1` and lost both the key and the value.
      const inline = splitYAMLKey(afterQuestion, keyNo);
      // The properties are the ones `splitYAMLKey` read off the line, and not a
      // second reading of what is left: it has already taken `&k` and `!custom`
      // off the key, so reading them again found nothing. That is what lost the
      // anchor on `? &k x : 1` — a line this reader accepts, whose `*k` two lines
      // down was then an undefined alias and the whole file refused — and what
      // dropped the tag on `? !custom x : 1` with nothing on stderr, while the
      // same key written over two lines was named and warned about.
      const keyText = inline ? inline.key : afterQuestion;
      const written = inline ? inline.rawKey : afterQuestion;
      const keyProp = inline ? inline.keyProp : (keyText ? readYAMLProperties(keyText, keyNo, 'key') : null);
      // A key that opens a collection is a table or a list where a field name
      // belongs, and it is refused here — before the text is read as a name, which
      // is what named a field `{a` and then named a second field `null` beside it
      // (`? {a: 1}` + `: 1` gave two fields, neither of them in the file). PyYAML
      // refuses the same file with `found unhashable key`.
      refuseCollectionKey(keyProp ? keyProp.rest : keyText, keyNo);
      // A key written as nothing at all is the key YAML leaves out, which is
      // `null`, and a quoted key is the text inside its quotes — the same answer
      // `k: v` gives. `? ""` is the second of the two, so the empty name and the
      // empty string stay apart. The quotes are looked for *after* the `&name`
      // and the `!tag`, because a key that carries either of them is quoted just
      // as often: `? &k "x"` is the field `x`, and it used to be a field called
      // `"x"` — a name with two quote characters in it that no JSON file has.
      const quotedKey = yamlKeyText(keyProp ? keyProp.rest : keyText).quoted;
      const rawName = quotedKey
        ? quotedKey.value
        : keyText
          ? (keyProp ? keyProp.rest : keyText)
          : '';
      // The alias is asked about before the key left out, because an alias *is*
      // the whole key and leaves no text behind it: `? *z` is a key named after
      // the value `z` holds, and testing for the missing key first called it a
      // key YAML never wrote. This is the order the flow reader asks in, and the
      // reason is the same there.
      //
      // The tag is asked about before the key left out for the same reason: a
      // tag is a property of the node, and the node is there even when no text
      // stands behind the tag. Asking the missing key first answered `null` for
      // `? !custom` and `a: {? !custom : 1}` and never reached the tag, so those
      // two spellings dropped it *without a word* while the four that carry text
      // are named and warned about. PyYAML has no answer to compare — it refuses
      // the file — so the question is which of this reader's own six spellings
      // is right, and the `k: v` line above already answers it: `!custom: 1` is
      // the field `!custom` with a warning. A tag that asks for a type JSON
      // carries is asked the same way, and it is PyYAML's own answer: `!!str`
      // with no text behind it is the empty string, `!!null` is `null`, and
      // `!!int` has no whole number to make of nothing and says so.
      const name = keyProp && keyProp.alias
        ? scalarKeyName(readYAMLAlias(keyProp.alias, ctx, keyNo), keyNo, ctx)
        : keyProp && yamlTagNamesKey(keyProp.tag) && CARRIED_YAML_TAGS.has(yamlTagName(keyProp.tag))
          ? String(applyYAMLTag(keyProp.tag, rawName, ctx, keyNo, rawName, 'key'))
          : keyProp && yamlTagNamesKey(keyProp.tag)
            ? String(applyYAMLTag(keyProp.tag, written, ctx, keyNo, written, 'key'))
            : yamlKeyLeftOut(rawName, quotedKey)
              ? YAML_NULL_KEY
              : rawName;
      if (keyProp && keyProp.anchor) ctx.anchors.set(keyProp.anchor, name);
      const named = value => {
        if (!keyProp || !keyProp.anchor) return value;
        ctx.anchors.set(keyProp.anchor, value);
        return value;
      };

      // The value on the same line as the key, which is what `? x : 1` and
      // `? :` write. Everything below here reads the value from the next line,
      // which is the other spelling of the same entry.
      if (inline) {
        const rest = inline.rest;
        if (rest === '' || isYAMLComment(rest)) {
          const k = skipYAMLBlanks(lines, i + 1);
          if (k < lines.length && lines[k].indent > indent) {
            const child = parseYAMLBlock(lines, k, lines[k].indent, ctx);
            set(name, named(child.value), keyNo);
            i = child.end;
            continue;
          }
          set(name, named(null), keyNo);
          i++;
          continue;
        }
        const block = blockScalarHeader(rest);
        if (block) {
          const child = readYAMLBlockScalar(lines, i + 1, indent, block);
          set(name, named(child.value), keyNo);
          i = child.end;
          continue;
        }
        set(name, named(parseYAMLScalar(rest, ctx)), keyNo);
        i++;
        continue;
      }

      // The value stands on its own line, at the key's indentation or the one
      // level a sequence entry pushed it to. A deeper line with no `:` is the
      // key's own block (`? |` and the text under it), which is a key, so a
      // block here becomes a key that is not text and is refused by name.
      const j = skipYAMLBlanks(lines, i + 1);
      const valueLine = j < lines.length && lines[j].indent >= indent &&
        isYAMLMappingValue(lines[j].content) ? j : -1;
      if (valueLine >= 0) {
        const rest = lines[valueLine].content.slice(1).replace(/^[ \t]+/, '');
        if (rest === '' || isYAMLComment(rest)) {
          const k = skipYAMLBlanks(lines, valueLine + 1);
          if (k < lines.length && lines[k].indent > lines[valueLine].indent) {
            const child = parseYAMLBlock(lines, k, lines[k].indent, ctx);
            set(name, named(child.value), valueLine === i ? keyNo : lines[valueLine].no);
            i = child.end;
            continue;
          }
          set(name, named(null), lines[valueLine].no);
          i = valueLine + 1;
          continue;
        }
        const block = blockScalarHeader(rest);
        if (block) {
          const child = readYAMLBlockScalar(lines, valueLine + 1, lines[valueLine].indent, block);
          set(name, named(child.value), lines[valueLine].no);
          i = child.end;
          continue;
        }
        ctx.line = lines[valueLine].no;
        set(name, named(parseYAMLScalar(rest, ctx)), lines[valueLine].no);
        i = valueLine + 1;
        continue;
      }
      if (j < lines.length && lines[j].indent > indent) {
        const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
        set(name, named(child.value), keyNo);
        i = child.end;
        continue;
      }
      set(name, named(null), keyNo);
      i++;
      continue;
    }
    const { key, keyProp } = split;
    // The same refusal the `?` line and the flow reader make, asked of the one
    // path that is left: a key that opens a collection is a table or a list where
    // a field name belongs. `{a: 1}: 2` at the root is the spelling the flow
    // reader never sees, and it used to be read as the field `{a` holding the
    // text `1}: 2` — the whole line as a value, split in two.
    refuseCollectionKey(keyProp ? keyProp.rest : key, lines[i].no);
    // A key written `~: 1` is the key YAML leaves out, the same one `?` and
    // `? : 1` write — not a field called `~`. `splitYAMLKey` has already read a
    // quoted key as the text inside its quotes, so only the bare spelling can be
    // the missing one, and `"": 1` stays the empty string.
    const quotedKey = lines[i].content[0] === '"' || lines[i].content[0] === "'";
    // Whether the key was written in quotes is the same question on both sides of
    // the `keyProp` branch below, and the merge key is asked of it, so it is
    // asked once and the two spellings carry one answer.
    let keyQuoted = quotedKey;
    let name = !keyProp && yamlKeyLeftOut(key, quotedKey) ? YAML_NULL_KEY : key;
    if (keyProp) {
      // A name can stand on the key too: `&k b: 2` names the field `b`, and
      // `*x: 2` takes the field name from the value it points at. A JSON field
      // name is a string, so a key that is not one is refused here.
      //
      // A tag is the other half, and a key is the one node a tag cannot change:
      // `!!str a: 1` asks for a field called `a`, while a tag this tool cannot
      // resolve stays inside the name it was written in. That is T69's measured
      // decision for a `%TAG` handle, and it holds here — splitting `!e!foo`
      // into a namespace and a local name would invent a shape nobody wrote.
      // PyYAML has no answer to ask for: it refuses the whole file, so the name
      // is *named* on stderr instead, which is the one thing it cannot do.
      //
      // The tag is applied to the text the key was written with, quotes read
      // away: `!!int "1": 2` is the field `1`, and it used to be refused with
      // "is not a whole number" because it was handed the `"1"` with its quotes.
      const keyText = yamlKeyText(keyProp.rest);
      keyQuoted = Boolean(keyText.quoted);
      name = keyProp.alias
        ? scalarKeyName(readYAMLAlias(keyProp.alias, ctx, lines[i].no), lines[i].no, ctx)
        : CARRIED_YAML_TAGS.has(yamlTagName(keyProp.tag))
          ? String(applyYAMLTag(keyProp.tag, keyText.written, ctx, lines[i].no, keyText.raw, 'key'))
          : keyProp.tag
            ? String(applyYAMLTag(keyProp.tag, split.rawKey, ctx, lines[i].no, split.rawKey, 'key'))
            // An anchor names the key node and does not rename it, so `&k ~: 1`
            // is the key YAML leaves out — the same field `~: 1` and `&k ~`
            // written over two lines already gave, and not a field called `~`.
            : yamlKeyLeftOut(keyText.written, keyText.quoted)
              ? YAML_NULL_KEY
              : keyText.written;
      if (keyProp.anchor) ctx.anchors.set(keyProp.anchor, name);
    }

    if (isYAMLMergeKey(name, keyQuoted)) {
      mergeYAMLFields(map, readYAMLMerge(split.rest, ctx, lines[i].no), seen, merged);
      i++;
      continue;
    }

    // The value may carry properties: `&name` names it, `*name` stands in for
    // one named before, `!!str` asks for a type. Either way they come off first,
    // so the value itself is read exactly as it is without them.
    const prop = readYAMLProperties(split.rest, lines[i].no);
    if (prop && prop.alias) {
      const aliased = readYAMLAlias(prop.alias, ctx, lines[i].no);
      set(name, prop.tag ? applyYAMLTag(prop.tag, aliased, ctx, lines[i].no) : aliased, lines[i].no);
      i++;
      continue;
    }
    if (prop && prop.anchor) ctx.pending.add(prop.anchor);
    const rest = prop ? prop.rest : split.rest;
    const named = value => {
      const tagged = prop && prop.tag ? applyYAMLTag(prop.tag, value, ctx, lines[i].no, rest) : value;
      if (prop && prop.anchor) {
        ctx.anchors.set(prop.anchor, tagged);
        ctx.pending.delete(prop.anchor);
      }
      return tagged;
    };

    if (rest === '' || isYAMLComment(rest)) {
      // No value on the line, so the block underneath owns it — or it is null.
      const j = skipYAMLBlanks(lines, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
        set(name, named(child.value), lines[i].no);
        i = child.end;
        continue;
      }
      // A sequence may sit at the same indentation as the key that owns it,
      // which is how most hand-written config files are written.
      if (j < lines.length && lines[j].indent === indent && isYAMLSequenceEntry(lines[j].content)) {
        const child = parseYAMLSequence(lines, j, indent, ctx);
        set(name, named(child.value), lines[i].no);
        i = child.end;
        continue;
      }
      set(name, named(null), lines[i].no);
      i++;
      continue;
    }

    const block = blockScalarHeader(rest);
    if (block) {
      const child = readYAMLBlockScalar(lines, i + 1, indent, block);
      set(name, named(child.value), lines[i].no);
      i = child.end;
      continue;
    }

    ctx.line = lines[i].no;
    set(name, named(parseYAMLScalar(rest, ctx)), lines[i].no);
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

    // `- &name a` and `- *name` name the entry, they are not it, and `!!str`
    // asks for a type. The properties come off before anything else, so an
    // entry that carries one is read exactly as it is without it — including the
    // bare `- &name` that owns the block below.
    const prop = readYAMLProperties(inner, lines[i].no);
    if (prop && prop.alias) {
      const aliased = readYAMLAlias(prop.alias, ctx, lines[i].no);
      arr.push(prop.tag ? applyYAMLTag(prop.tag, aliased, ctx, lines[i].no) : aliased);
      i++;
      continue;
    }
    if (prop && prop.anchor) ctx.pending.add(prop.anchor);
    const body = prop ? prop.rest : inner;
    const named = value => {
      const tagged = prop && prop.tag ? applyYAMLTag(prop.tag, value, ctx, lines[i].no, body) : value;
      if (prop && prop.anchor) {
        ctx.anchors.set(prop.anchor, tagged);
        ctx.pending.delete(prop.anchor);
      }
      return tagged;
    };

    if (body === '' || isYAMLComment(body)) {
      const j = skipYAMLBlanks(lines, i + 1);
      if (j < lines.length && lines[j].indent > indent) {
        const child = parseYAMLBlock(lines, j, lines[j].indent, ctx);
        arr.push(named(child.value));
        i = child.end;
        continue;
      }
      arr.push(named(null));
      i++;
      continue;
    }

    // `- key: value` opens a mapping whose lines are indented to the column
    // the key starts in, so the entry is rewritten in place as that block. The
    // rewrite carries the source line's tab mark with it, because the tab the
    // rewrite removes is the very tab PyYAML refuses: `-\ta` read as "a" and
    // `-\ta: 1` read as `{"a": 1}`, both exit 0 and an empty stderr. Dropping
    // the mark here did not un-tab the line, it un-recorded it — which is how
    // three of the measured files slipped through a check that had already found
    // them. So the line remembers where it came from, not what it became.
    const childIndent = indent + 1 + lead;
    const block = blockScalarHeader(body);
    if (block) {
      const child = readYAMLBlockScalar(lines, i + 1, indent, block);
      arr.push(named(child.value));
      i = child.end;
      continue;
    }
    // `- {a: 1}` and `- [1, 2]` are the other two ways a list is written with
    // tables or lists in it, and the rewrite below is for the third
    // (`- key: value`). Read as that rewrite, the entry was not a record with
    // one field: it was a record with a field called `{a` holding `1` — a name
    // nobody wrote, in a file PyYAML reads as a list of one table. So the flow
    // is asked first, with the same reader every other place asks.
    const flow = flowValue(body, ctx);
    if (flow !== undefined) {
      arr.push(named(flow));
      i++;
      continue;
    }
    lines[i] = { indent: childIndent, content: body, blank: false, no: lines[i].no, tabAt: lines[i].tabAt };
    ctx.line = lines[i].no;
    const child = parseYAMLBlock(lines, i, childIndent, ctx);
    arr.push(named(child.value));
    i = child.end;
  }
  return { value: arr, end: i };
}

/** A run of bare scalars with no dash and no key, folded the way YAML folds. */
function parseYAMLFoldedScalar(lines, start, indent) {
  const parts = [];
  let i = start;
  while (i < lines.length && !lines[i].blank && lines[i].indent === indent) {
    if (isYAMLSequenceEntry(lines[i].content) || splitYAMLKey(lines[i].content) ||
        isYAMLExplicitKey(lines[i].content)) break;
    parts.push(parseYAMLScalar(lines[i].content));
    i++;
  }
  return { value: parts.length === 1 ? parts[0] : parts.join(' '), end: i };
}

/**
 * `key: |` and `key: >`, with the chomping indicators `-` (drop the final
 * newline) and `+` (keep every one), and the indentation indicator — a digit
 * saying how far in the block's own lines sit, counted from this line's
 * indentation. `|` keeps line breaks, `>` folds them into spaces the way prose
 * does.
 *
 * The two indicators may come in either order (`|2-` and `|-2` name the same
 * header), and the digit is a single 1-9: `|0`, `|02` and `|12` are not
 * headers, so a file using one is rejected the way PyYAML rejects it rather
 * than guessed at here.
 */
function blockScalarHeader(value) {
  const m = /^[|>]((?:[+-][1-9]?|[1-9][+-]?)?)[ \t]*(?:#.*)?$/.exec(value.trim());
  if (!m) return null;
  const flags = m[1];
  const digit = /\d/.exec(flags);
  return {
    style: m[0][0],
    chomp: flags.includes('-') ? '-' : flags.includes('+') ? '+' : 'clip',
    indent: digit ? Number(digit[0]) : null
  };
}

function readYAMLBlockScalar(lines, start, parentIndent, header) {
  const collected = [];
  let i = start;
  while (i < lines.length && (lines[i].blank || lines[i].indent > parentIndent)) {
    collected.push(lines[i]);
    i++;
  }
  // The collected lines are the block's data, so a tab on one of them is the
  // value and not a token: `{"v":"x\n\ty"}` is written as `|-` with four spaces
  // and a tab on the second line, and the tab is the only copy of that data.
  for (const l of collected) l.tabAt = -1;

  // A block's own lines start at the block's indentation, and there are two ways
  // to say where that is. A digit on the marker says it outright — `|2` is two
  // spaces in from this line's own indentation — and a file that then indents
  // less is an error here rather than a guess. Without a digit the *first* line
  // says it, and the first line is the only line that can, because it is the one
  // every line after it is measured against. That is the whole reason the
  // indicator exists: a block whose first line sits deeper than the rest cannot
  // be written without one, since the first line would open an indentation the
  // rest of the block is under.
  //
  // "The first line" means the first line with text on it — with one thing on
  // top. A line of nothing but spaces *above* that line claims the indentation
  // too, and the deeper of the two wins: PyYAML reads `v: |`, six spaces, `  a`
  // and `  b` as a file it refuses, because six spaces is deeper than the text
  // and the text is under the block, and it reads `v: |`, six spaces, then `a`
  // and `b` at eight as '\na\nb\n', because the text went deeper and the six
  // spaces dedent to nothing. Below the first line with text the rule is the
  // other way round, and this is T74's: a line of nothing but spaces down there
  // is content (`a`, six spaces, `b` is 'a\n      \nb'). An empty line is empty
  // at both ends — it is not the first line of anything, and it says nothing.
  //
  // Taking the *minimum* indentation instead — which is what this did, because
  // the minimum is the only answer that keeps every line inside the block — is
  // why `v: |` followed by six spaces and `    b` came back as `'  a\nb\n'`:
  // a file no real parser accepts, read here as a value, exit 0, empty stderr.
  const declared = header.indent === null ? null : parentIndent + header.indent;
  let shared = Infinity;
  if (declared !== null) shared = declared;
  else {
    const firstText = collected.findIndex(l => !l.blank);
    if (firstText !== -1) {
      shared = collected[firstText].indent;
      for (let k = 0; k < firstText; k++) shared = Math.max(shared, collected[k].indent);
    }
  }

  // A line under the block's own indentation is not a line of the block: it is a
  // sibling of the block's parent, and a block scalar is a single scalar, so a
  // parser looking for the end of the block finds a mapping start or a scalar
  // where the value should be. PyYAML answers "expected <block end>, but found"
  // and refuses the file. So does this, naming the line that is under the block
  // and the line that set its indentation.
  const under = collected.find(l => !l.blank && l.indent < shared);
  if (under) {
    throw new SyntaxError(
      declared !== null
        ? `YAML line ${under.no}: block scalar header says ${header.indent} spaces of ` +
          `indentation, but this line is indented ${under.indent}`
        : `YAML line ${under.no}: the first line of this block is indented ${shared}, ` +
          `but this line is indented ${under.indent} — the first line sets the block's ` +
          `indentation, so this line is under it, not in it`
    );
  }

  // The block is one piece of text first and a value second, because that is
  // the order the format works in: chomping is defined on the trailing line
  // breaks of the text, and a line of nothing but spaces is *content* inside a
  // literal block (`a`, ` `, `b` is three lines) while it is still a line of
  // nothing but spaces here — so `raw` decides, and `content` never gets a vote.
  const dedented = collected.map(l => {
    // A line of nothing at all is an empty line. A line of nothing but *spaces*
    // at the block's own level is one too, because those spaces are the
    // indentation. A tab is neither: it is content wherever the indentation has
    // begun, so `x`, a tab, `y` is 'x\n\ty\n' (PyYAML) and not 'x\n\ny'.
    if (l.blank && l.indent <= shared && !l.raw.includes('\t')) return '';
    return ' '.repeat(Math.max(0, l.indent - shared)) + l.raw;
  });

  let text;
  if (header.style === '>') {
    // Folding is about the *break*, not the line, and the question is how many
    // breaks lie between two lines that both have content. One break folds to a
    // space; a run of b breaks folds to b-1 line breaks, because the first is
    // the one the fold spends. So a run of empty lines is not "one break spent
    // once" however long it is — measured with PyYAML, `one`,`two`,``,``,
    // `three` is 'one two\n\nthree' and this used to read 'one two\nthree', so
    // two empty lines lost a line break, silently, in the commonest chomping
    // there is (clip is what `>` names when no indicator follows it).
    //
    // Nothing folds next to a line indented *deeper* than the block: that line
    // is content the format keeps whole, and it keeps the breaks on both sides
    // of it, so the run of b breaks there stays b (PyYAML: `b`, ``, `c` is
    // 'b\nc' with b plain, and 'b\n\nc' with b deeper). The test is the dedented
    // line's own leading space, because that is exactly "more indented than this
    // block", and it is the same question the indicator answers from the other
    // direction.
    //
    // The file's own trailing newline is not an empty line inside the block but
    // the break that ends the last one, so the tail is counted as it stands:
    // `>+` with one empty line after it keeps two breaks, because the empty line
    // has a break of its own *and* the file has one after it. Leading breaks are
    // kept whole for the same reason — there is nothing in front of them to fold
    // with. A line of nothing but spaces is content, not an empty line (PyYAML:
    // `a`, ` `, `b` is 'a\n \nb', not `a   b`), so it is a line like any other
    // and it is deeper than the block, which is the same question again.
    const moreIndented = s => s.startsWith(' ');
    const pieces = [];
    let breaks = 0;
    text = '';
    for (const line of dedented) {
      if (line === '') { breaks++; continue; }
      if (pieces.length === 0) {
        text = '\n'.repeat(breaks) + line;
      } else {
        const prev = pieces[pieces.length - 1];
        const foldable = breaks === 0 && !moreIndented(prev) && !moreIndented(line);
        if (foldable) text += ' ';
        else if (moreIndented(prev) || moreIndented(line)) text += '\n'.repeat(breaks + 1);
        else text += '\n'.repeat(breaks);
        text += line;
      }
      pieces.push(line);
      breaks = 0;
    }
    text += '\n'.repeat(breaks);
  } else {
    text = dedented.join('\n');
  }

  // The break that ends the block's last line belongs to the block, so it is
  // there unless that line is also the last line of the file: a block at the
  // end of a file with no trailing newline has no final break to keep.
  if (collected.length > 0 && collected[collected.length - 1] !== lines[lines.length - 1]) {
    text += '\n';
  }

  // strip drops every trailing break, clip keeps the one the file has (and
  // invents none), keep keeps them all. The `+` used to add a break of its own,
  // so `|+` ended up with one line break more than the file it was reading, on
  // a file with no trailing whitespace at all.
  const stripped = text.replace(/\n+$/, '');
  if (header.chomp === '-') text = stripped;
  else if (header.chomp === '+') return { value: text, end: i };
  else text = stripped ? stripped + (text.endsWith('\n') ? '\n' : '') : '';

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

/**
 * A value that is written as a flow collection where it stands, or `undefined`
 * when it is written any other way — the caller's own path, untouched. Every
 * reader that can meet a collection asks it this, so `[a, b]` and `{k: v}` mean
 * the same thing in a mapping's value, in a sequence entry and on the
 * document's first line, and mean it over several lines too once
 * `joinYAMLFlowLines` has put the lines back together.
 */
function flowValue(text, ctx) {
  const body = stripYAMLComment(text).trim();
  if (body[0] !== '[' && body[0] !== '{') return undefined;
  const flow = parseYAMLFlow(body, ctx);
  return flow.ok ? flow.value : undefined;
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
  return parseYAMLValue(value, ctx);
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

  /**
   * What ends a plain — unquoted — node inside a flow collection. The brackets
   * and the comma always end it, and a colon ends it only when what follows says
   * so: a space, a comma, the bracket that closes the collection, or the end of
   * the text. A colon on its own is the character in `http://x/y`, `host:5432`
   * and `12:30`, and taking it for a separator meant `{url: http://x/y}` and
   * `a: [host:5432]` came back as the text they were written with — a mapping and
   * a list that a hand-written config, a compose file and a health check all
   * write, each of them lost with an empty stderr.
   *
   * A key asks the same question as a value, because PyYAML does: `{b: c:d}` is
   * the field `b` with the value `c:d`, and `{b:c: 1}` is the field `b:c`.
   */
  const endsFlowNode = (at) => {
    const ch = text[at];
    if (ch === ',' || ch === ']' || ch === '}') return true;
    if (ch !== ':') return false;
    const next = text[at + 1];
    return next === undefined || next === ' ' || next === '\t' ||
      next === ',' || next === ']' || next === '}';
  };

  const scalar = () => {
    skipSpace();
    if (text[i] === '"' || text[i] === "'") {
      const quoted = readYAMLQuoted(text, i);
      if (!quoted) throw new SyntaxError('unclosed quote');
      i = quoted.end;
      return quoted.value;
    }
    let raw = '';
    const from = i;
    while (i < text.length && !endsFlowNode(i)) raw += text[i++];
    const body = raw.trim();
    // A flow item may name itself too — `[*a, *b]` is how a file shares one list
    // between two keys, and reading `*a` as the three characters `*a` puts a
    // name where the list was. The properties are taken off before the item is
    // read, and an alias standing alone *is* the item.
    const prop = readYAMLProperties(body, ctx.line);
    if (prop) {
      if (prop.alias) {
        // An alias stands for the whole node and leaves no text behind it, so
        // there is nothing to read again and nothing to rewind to.
        const aliased = readYAMLAlias(prop.alias, ctx, ctx.line);
        const tagged = prop.tag ? applyYAMLTag(prop.tag, aliased, ctx, ctx.line, prop.rest) : aliased;
        if (prop.anchor) ctx.anchors.set(prop.anchor, tagged);
        return tagged;
      }
      // The value is read from the source, from just past the properties, and
      // the text handed to the tag is what that value was written with.
      //
      // The text above is a *cut* of the node, because `endsFlowNode` stops at the
      // first comma or bracket — and a comma or a bracket is exactly what a value
      // behind a property is allowed to hold. `!!int [1, 2]` left `!!int [1`, so
      // the tag was told `"[1" is not a whole number`, naming a value the file
      // never wrote, and `!!str "x, y"` kept the half of the text in front of the
      // comma. The block reader has taken the properties off before it reads the
      // value since T82, so a tag on a collection is now refused in the same
      // words on both sides — both refusals come from `applyYAMLTag`.
      const valueFrom = from + body.length - prop.rest.length;
      i = valueFrom;
      const held = prop.rest === '' ? null : value();
      const written = text.slice(valueFrom, i);
      const tagged = prop.tag ? applyYAMLTag(prop.tag, held, ctx, ctx.line, written) : held;
      if (prop.anchor) ctx.anchors.set(prop.anchor, tagged);
      return tagged;
    }
    return parseYAMLValue(body, ctx);
  };

  const value = () => {
    skipSpace();
    if (text[i] === '[') return sequence(ctx);
    if (text[i] === '{') return mapping(ctx);
    return scalar();
  };

  // A value that is not written is not the empty string. `{b: }` and
  // `{b: {c: }}` are the two ways a config file leaves a field out, and the
  // block reader has answered `null` for both all along — `parseYAMLScalar('')`
  // is that answer in one line — so the flow reader is the only one of the
  // three that invented `""` for a value the file never carried.
  const mappingValue = () => {
    skipSpace();
    if (i >= text.length || text[i] === ',' || text[i] === '}') return null;
    return value();
  };

  /**
   * One key of a flow collection, as the text it is written with. A quoted key
   * is read as one run, so a `,` or a `}` inside its quotes is the text the
   * quotes say it is and not the end of the collection: `{? "a, b" : 1}` is a
   * key called `a, b`, and reading it as two keys loses a field nobody split.
   */
  const readFlowKey = () => {
    if (text[i] === '"' || text[i] === "'") {
      const from = i;
      const quoted = readYAMLQuoted(text, i);
      if (!quoted) throw new SyntaxError('unclosed quote');
      i = quoted.end;
      return text.slice(from, quoted.end);
    }
    let raw = '';
    while (i < text.length && !endsFlowNode(i)) raw += text[i++];
    return raw.trim();
  };

  /**
   * The field name a flow key stands for, asked the same three questions the
   * block reader asks of one: a quoted key is the text inside its quotes, a key
   * may name an alias and hand the value over, and a key written as nothing at
   * all is the key YAML leaves out rather than a missing one.
   *
   * It is the same reader for `{x: 1}` and for `{? x : 1}`, because a flow key is
   * a flow key — the `?` says how it was written down, not what it is. So
   * `{&z x : 1}` registers `x` and `*z` later resolves, and `{*z : 2}` takes
   * the value the anchor holds as the field's name.
   */
  const flowKeyName = (keyText) => {
    const keyProp = keyText ? readYAMLProperties(keyText, ctx.line, 'key') : null;
    // The same question the block reader asks before it names a key, asked here
    // because both flow paths — `{? {b: 1} : 1}` and `[? [x, y]]` — come through
    // this one place, so the two readers cannot answer it differently. Without it
    // the flow reader gave up on the whole line and the document came back as the
    // text it was written with, every field in it lost and nothing on stderr.
    refuseCollectionKey(keyProp ? keyProp.rest : keyText, ctx.line);
    // The quotes are looked for after the `&name` and the `!tag`, for the same
    // reason the block reader looks for them there: `{&k "x": 1}` is the field
    // `x`, and it used to be a field called `"x"`.
    const quoted = yamlKeyText(keyProp ? keyProp.rest : keyText).quoted;
    const rawName = quoted
      ? quoted.value
      : keyText
        ? (keyProp ? keyProp.rest : keyText)
        : '';
    // The alias is asked about first, because an alias *is* the whole key and
    // leaves no text behind it: `{*z : 2}` is a field named after the value `z`
    // holds, and testing for the empty name first would call it a field with
    // no name at all. The tag is asked about next, before the key left out, for
    // the reason the block reader gives in the same words: a tag is a property
    // of the node and the node is there without text behind it, so `!custom`
    // alone is the field `!custom` with a warning — as `!custom: 1` already was
    // — and not the key left out, which dropped the tag with nothing on stderr.
    const name = keyProp && keyProp.alias
      ? scalarKeyName(readYAMLAlias(keyProp.alias, ctx, ctx.line), ctx.line, ctx)
      : keyProp && yamlTagNamesKey(keyProp.tag) && CARRIED_YAML_TAGS.has(yamlTagName(keyProp.tag))
        ? String(applyYAMLTag(keyProp.tag, rawName, ctx, ctx.line, rawName, 'key'))
        : keyProp && yamlTagNamesKey(keyProp.tag)
          ? String(applyYAMLTag(keyProp.tag, keyText, ctx, ctx.line, keyText, 'key'))
          : yamlKeyLeftOut(rawName, quoted)
            ? YAML_NULL_KEY
            : rawName;
    if (keyProp && keyProp.anchor) ctx.anchors.set(keyProp.anchor, name);
    // The quotes travel with the name, because one question is asked of both: a
    // `<<` written bare is the merge key and a `<<` written in quotes is the
    // field name `<<`, and the block reader answers the same way.
    return { name, quoted: Boolean(quoted) };
  };

  /**
   * A `?` that opens a node is the explicit key — the same indicator
   * `isYAMLExplicitKey` recognises between the lines, in the same two places: in
   * front of a mapping key, and in front of a sequence entry. `{? x : 1}` is the
   * post `{x: 1}` written out, and `[? x, y]` is a list of one-key posts, so a
   * `!!set` reads the same on one line as it does over four.
   *
   * Everywhere else the character is text and stays it: `b?c`, `c?x` and the
   * quoted `"? x"` all keep it. So does a value — `{b: ? x}` is read here as the
   * text `? x` and refused by PyYAML, and that leniency is the trade this
   * reader has made since the first flow collection (see the note on
   * `&base.image`): a converter's job is to read the files people have.
   */
  const isExplicitKey = () => {
    skipSpace();
    return text[i] === '?';
  };

  // The entry after an explicit key: `: v` when the line carries one, and
  // nothing when it does not. `? x` on a line of its own is a key holding
  // nothing, which is `null` — the answer `x:` gives, and the one a `!!set` is
  // written with.
  const explicitKeyValue = () => {
    skipSpace();
    if (text[i] !== ':') return null;
    i++;
    return mappingValue();
  };

  const sequence = (ctx) => {
    i++;
    const out = [];
    skipSpace();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      if (isExplicitKey()) {
        i++;
        skipSpace();
        const { name } = flowKeyName(readFlowKey());
        // An explicit key in a sequence is a one-key post, which is what PyYAML
        // hands back and what a `!!set` written on one line has to be.
        const post = {};
        setField(post, name, explicitKeyValue());
        out.push(post);
      } else {
        out.push(value());
      }
      skipSpace();
      if (text[i] === ',') {
        i++;
        // A comma before the bracket ends the collection, it does not open one
        // more entry: `[1, ]` is the one element `[1]`, and reading the empty
        // tail as a value put a second element in a list the file wrote one.
        skipSpace();
        if (text[i] === ']') { i++; return out; }
        continue;
      }
      if (text[i] === ']') { i++; return out; }
      // Nothing is left that could end this entry or the next one, so the
      // collection is not a collection that runs off its line — the file stops in
      // the middle of one. `[1, 2` and `- [1, 2` are documents PyYAML refuses, and
      // reading them as the text they were written with put the collection's own
      // contents in a field and lost every other field in the file with it.
      throw new YAMLRefusal('expected , or ] in flow sequence');
    }
  };

  const mapping = (ctx) => {
    i++;
    const out = {};
    const seen = new Map();
    // The two rules a `<<` merge obeys, the same two the block reader obeys and
    // the same two `mergeYAMLFields` applies: a field the mapping writes itself
    // wins, and between two merges the first to carry a field wins.
    const merged = new Set();
    skipSpace();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      const explicit = isExplicitKey();
      if (explicit) { i++; skipSpace(); }
      const { name: key, quoted } = flowKeyName(readFlowKey());
      let valueRead;
      // Where the value starts, so a merge key can be handed the value as the
      // file wrote it. The value is read either way — the collection has to know
      // where it ends — but a merge is decided from the written text and not
      // from the value, because `<<` merges a *name* and the block reader asks
      // that question of the text as well.
      let valueFrom = -1;
      if (explicit) {
        valueRead = explicitKeyValue();
      } else {
        skipSpace();
        if (text[i] !== ':') throw new SyntaxError('expected : in flow mapping');
        i++;
        skipSpace();
        valueFrom = i;
        valueRead = mappingValue();
      }
      // A `<<` written bare is the merge key, in a flow mapping as much as in a
      // block one. It was an ordinary field here, so `{<<: *b, d: 2}` came back
      // with a field called `<<` holding the anchor's own mapping — a key no
      // file means by it, in the spelling a hand-written config and a compose
      // file use when they share one block between two services.
      //
      // Only the `key: value` spelling asks it, and that is the block reader's
      // own limit: `? <<` is the explicit form, where PyYAML refuses the file
      // and the block reader reads it as the field `<<`, so the two agree.
      if (!explicit && isYAMLMergeKey(key, quoted)) {
        mergeYAMLFields(out, readYAMLMerge(text.slice(valueFrom, i), ctx, ctx.line), seen, merged);
      } else {
        // A flow mapping is one fragment of one line, so it has no line number to
        // give; the key and both values are what the reader needs.
        if (seen.has(key)) {
          noteDuplicateKey(ctx && ctx.warnings, 'YAML', key, seen.get(key), { value: valueRead, line: 0 });
        } else {
          seen.set(key, { value: valueRead, line: 0 });
        }
        setField(out, key, valueRead);
      }
      skipSpace();
      if (text[i] === ',') {
        i++;
        // The same rule as in a flow sequence: a comma before the brace ends the
        // mapping, it does not open one more entry. `{b: 1, }` is the one field
        // `{b: 1}`, and reading the empty tail as an entry failed the whole
        // collection, so a valid line came back as the text it was written with.
        skipSpace();
        if (text[i] === '}') { i++; return out; }
        continue;
      }
      if (text[i] === '}') { i++; return out; }
      // The counterpart of the sequence's rule, and it is the same question: a
      // flow mapping that is still open when the text runs out is a file broken
      // in the middle of a table, not a field whose value is a table. `a: {b: 1`
      // and `a: {b` are documents PyYAML refuses.
      throw new YAMLRefusal('expected , or } in flow mapping');
    }
  };

  try {
    const parsed = value();
    skipSpace();
    return i === text.length ? { ok: true, value: parsed } : { ok: false };
  } catch (err) {
    // "This is not a flow collection" is the answer every caller wants, and it is
    // why this catch is here. "This file is wrong" is not that answer — that one
    // has to reach the user, or a bad tag, an unknown alias and a collection
    // standing where a key belongs all come back as the line's own text.
    if (err instanceof YAMLRefusal) throw err;
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
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return formatYAMLNumber(val);
  if (typeof val === 'string') {
    if (val.includes('\n') || val.trim() === '') return JSON.stringify(val);
    return needsYAMLQuotes(val) ? JSON.stringify(val) : val;
  }
  return JSON.stringify(val);
}

/**
 * A number spelled the way a YAML reader reads it back. `String(val)` gives the
 * shortest form that round-trips in JavaScript, and that form is looser than
 * YAML's: `1e-7`, `1e+21` and `5e-324` all come out bare, and YAML 1.1's float
 * production wants a `.` and a *signed* exponent, so a conforming reader takes
 * every one of them as a **string** — a number written to look like a number and
 * read as text. The missing piece is added and nothing else is touched, so the
 * numbers that already round-trip keep the spelling they had. YAML 1.2 accepts
 * the result as well, which makes it the one form every reader agrees on.
 *
 * A float that happens to be integral (`1.0`) is left alone on purpose: by the
 * time a value is a number, `1.0` and `1` are the same number, so writing `1.0`
 * would invent a float identity the input may never have had.
 */
function formatYAMLNumber(val) {
  // The exponent's sign is required by the pattern, not added by a branch:
  // Number::toString always prints one (`1e+21`, `1e-7`), so a guard for a
  // missing sign would be code no input can reach and no test can kill.
  const parts = /^(-?[0-9.]*)([eE])([+-][0-9]+)$/.exec(String(val));
  if (!parts) return String(val);
  const mantissa = parts[1].includes('.') ? parts[1] : `${parts[1]}.0`;
  return `${mantissa}e${parts[3]}`;
}

/**
 * The plain scalars a YAML 1.1 reader resolves to something that is not a
 * string, transcribed from the resolver PyYAML actually ships (`add_implicit_
 * resolver` in `yaml/resolver.py`) rather than from what YAML 1.2 or
 * JavaScript thinks a number is. YAML 1.1's vocabulary is the one a pipeline
 * meets: it has four more words for `true` (`yes`, `no`, `on`, `off`), it lets
 * an integer carry underscores, it reads a clock time as base 60, and it reads a
 * date as a timestamp. Each production is written out whole — including the parts
 * we do not need, like the signed branches — because a partial transcription
 * quotes the wrong things in both directions.
 *
 * `<<` and `=` are here for a different reason: they are the `merge` and `value`
 * tags, and neither has a constructor, so a reader that meets one refuses the
 * **whole document** rather than returning something odd. `<<` as a key is
 * already excluded by the plain-key rule below, but as a value it was written
 * bare, and PyYAML then raised `ConstructorError` on a file Transmute had
 * produced with exit 0.
 *
 * The empty string is the `null` production's last branch in PyYAML and is left
 * out here: both callers have already refused it before they get this far.
 */
const YAML_1_1_RESOLVES_ELSEWHERE = [
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
  /^(?:~|null|Null|NULL)$/,
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/,
  /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/,
  /^(?:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]|[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?(?:[Tt]|[ \t]+)[0-9][0-9]?:[0-9][0-9]:[0-9][0-9](?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9][0-9]?(?::[0-9][0-9])?))?)$/,
  /^(?:<<|=)$/,
];

function needsYAMLQuotes(value) {
  if (value === '') return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/:\s/.test(value) || /:$/.test(value)) return true;
  if (/#/.test(value)) return true;
  if (/[\t\r]/.test(value)) return true;
  // `true`, `false`, `null` and `~` are the four the number and word rules
  // already happened to catch. The rest of YAML 1.1's vocabulary is not a word
  // a JavaScript `Number()` refuses, so it has to be named.
  if (YAML_1_1_RESOLVES_ELSEWHERE.some(resolves => resolves.test(value))) return true;
  return !isNaN(Number(value));
}

function formatYAMLKey(key) {
  const name = String(key);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.\-/ ]*$/.test(name)) return JSON.stringify(name);
  // A key is a scalar, so it obeys the same rule: `yes` reads back as `True` and
  // a Danish postal code reads back as the *octal* 60, and the record then has a
  // field under a name the input never had. The plain-key rule above already
  // excludes `<<`, the merge key, and everything with a colon in it.
  if (YAML_1_1_RESOLVES_ELSEWHERE.some(resolves => resolves.test(name))) return JSON.stringify(name);
  return name;
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

  // A block scalar is the only readable way to keep line breaks, and it has no
  // escape at all, so it is also the one spelling that cannot hold a carriage
  // return: YAML normalizes `#x0D#x0A`, `#x0D` and `#x0A` all to a single `#x0A`
  // in the content of a line break (YAML 1.2 §5.4), and `#x0A` is all a block
  // scalar can say. A value carrying `\r` therefore loses it in every reader —
  // measured: `a\r\nb` written as `|-` came back `a\nb` from PyYAML *and* from
  // this tool's own reader, at exit 0 with empty stderr. The quoted spelling
  // below already carries it, and this is the path a lone `\r` already takes.
  if (typeof value === 'string' && value.includes('\n') && !value.includes('\r') && value.trim() !== '') {
    // A block scalar is the only way to keep line breaks. A quoted string
    // would need \n escapes, and hand-folding them is how a value gets
    // quietly rewritten; the marker says what the trailing newline does.
    const marker = value.endsWith('\n\n') ? '|+' : value.endsWith('\n') ? '|' : '|-';
    // The last character comes off only for the two markers that keep a
    // trailing line break, because the block's own line breaks put it back.
    // `|-` tells the reader to *remove* the block's trailing break, so the
    // lines written below are the whole value — taking one character off them
    // is not a newline to recover but a character to lose. Measured with
    // PyYAML, which read `a\nb` written as `|-` back as `a`, and `a\nb\nc\nd`
    // as `a\nb\nc`: exit 0, empty stderr, and this tool's own reader agreed,
    // so a round trip through Transmute hid it as completely as any other.
    //
    // The body is written two spaces in from the key, so a value whose *first*
    // line starts with a space is the one case a plain marker cannot carry: a
    // reader takes that space for the indentation and then finds the rest of
    // the block under-indented, and refuses the file. Measured with PyYAML,
    // which raised a ParserError on `" a\nb"` written as `|-` with a line at
    // five spaces and the next at four — a file this tool wrote, that its own
    // reader read back and no other YAML reader could open. The indicator says
    // where the block really starts, so the space stays data.
    const lead = /^[ ]/.test(value) ? String(pad.length - indent) : '';
    const body = marker === '|-' ? value : value.slice(0, -1);
    return [head + ' ' + marker + lead, ...body.split('\n').map(line => pad + line)];
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
 * A list written out as numbered children, `<field name="0">`, for the two
 * cases repeated elements cannot spell: a list whose members are lists, and a
 * record that is itself a list. Both need a boundary that an element name
 * cannot carry, and both keep the index in an attribute so the structure stays
 * visible in the file instead of being flattened into it.
 *
 * It is one function for both, because they are one rule: when the count of
 * things matters, the count goes somewhere a reader can see. Two copies of it
 * would be free to disagree, which is how the numbered spelling and the
 * repeated one ended up meaning different things in the first place.
 */
function writeXMLNumbered(openTag, members, depth) {
  const pad = '  '.repeat(depth);
  const inner = members
    .map((member, i) => writeXMLElement(String(i), member, depth + 1, String(i)))
    .join('\n');
  return `${pad}<${openTag}>\n${inner}\n${pad}</${openTag}>`;
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

function writeXMLElement(tag, value, depth, key = null) {  const pad = '  '.repeat(depth);
  // A JSON key is free text; an XML tag name is not. `first name`, `2fa`,
  // `a/b` and an empty key are all things a CSV header row or an API response
  // contains, and writing one as a tag name produced a file that no XML parser
  // accepts — this one included, which then read its own output back as a
  // record with no fields at all. A key that is not a legal name travels in a
  // `name` attribute on `<field>` instead, which is legal everywhere, and
  // `readFieldName` puts it back on the way in.
  const carried = key !== null && !writesAsXMLName(key);
  const name = carried ? ` name="${escapeXMLAttr(key)}"` : '';
  const safeTag = carried ? 'field' : tag;
  // A list is repeated elements of the same name. It is the one shape XML has
  // for one, it is what XML documents actually look like, and it is the shape
  // `parseElement` already turns back into a list, so nothing has to invent a
  // convention to read it.
  //
  // It used to be written as numbered `<field name="0">` children instead,
  // which is a list wearing an object's clothes: the index that says *which
  // member* lived in an attribute, because an element name cannot say it twice
  // in a row. A reader that maps element name to value then keeps the **last**
  // member and loses the rest — `{"v":[1,2,3]}` came back as one value, `3` —
  // and every other tool in the world does exactly that. The list is also lost
  // for this tool: `[1,2,3]` read back as `{"0":"1","1":"2","2":"3"}`.
  if (Array.isArray(value)) {
    // Zero members still has to leave the field behind, so an empty list is an
    // empty element rather than nothing at all. `reportXMLListShape` says on
    // stderr that it comes back as `{}`.
    if (value.length === 0) return `${pad}<${safeTag}${name}/>`;
    // A list inside a list is the one list with no XML shape: `[[1,2]]` and
    // `{"v":[1,2]}` would be the same document, because both are one element
    // with two children of the same name. Repeated elements would flatten it
    // into one list of four, quietly. So it keeps the numbered spelling, where
    // the index lives in an attribute, and the structure stays visible in the
    // file instead of being lost in it.
    if (value.some((member) => Array.isArray(member))) {
      return writeXMLNumbered(`${safeTag}${name}`, value, depth);
    }
    return value.map((member) => writeXMLElement(tag, member, depth, key)).join('\n');
  }
  if (typeof value !== 'object' || value === null) return `${pad}<${safeTag}${name}>${escapeXML(String(value))}</${safeTag}>`;
  const entries = Object.entries(value);
  // An attribute name follows the same rules as a tag name, and the `@` prefix
  // does not launder them: `@2fa` and a bare `@` wrote `<item 2fa="x">` and
  // `<item ="x">`, which no parser reads. Those go out as child elements through
  // the same `field` marker, so the record still comes back with the key it had.
  //
  // A carried key takes the same road, for the same reason and one step
  // further: the element's one attribute slot already holds `name`, so a member
  // carrying `@name` of its own wrote `<field name="0" name="x"/>` — two `name`
  // attributes on one element, which expat refuses to parse at all, so the file
  // was not merely lossy but unreadable outside this tool.
  const asAttribute = ([k]) => !carried && k.startsWith('@') && writesAsXMLName(k.slice(1));
  const attrs = entries.filter(asAttribute).map(([k, v]) => ` ${k.slice(1)}="${escapeXMLAttr(String(v ?? ''))}"`).join('');
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
 * The same escaping, for an attribute value, plus the three whitespaces XML
 * takes away on the way in.
 *
 * Attribute-value normalization (XML 1.0 3.3.3) replaces every literal tab,
 * newline and carriage return in an attribute with a space, before any parser
 * sees the value — and a character reference is appended as it stands, so
 * `&#9;` is the one spelling that survives. Measured on the file this tool
 * wrote: `note="a<TAB>b"` read back as `a b` in every real parser, and as
 * `a\tb` in this one, which decodes references and does not normalize. Where
 * this reader is the more faithful of the two, the file is what lies — and the
 * file is what the user hands to somebody else.
 *
 * Element text is deliberately left literal. A parser keeps a tab and a
 * newline in an element's content, so escaping them there would only make the
 * file harder to read than the reader that has to read it.
 */
function escapeXMLAttr(val) {
  return escapeXML(val)
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

// The C0 controls, by the names `cat -v` and a terminal agree on. A file that
// carries one of these is unreadable in an editor, so the name is what makes the
// error message actionable instead of just a number.
const C0_NAMES = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL',
  'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3',
  'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

/**
 * The first character in `str` that the target format cannot represent, or `null`.
 *
 * `refuses` is the rule for one output format; the walk itself is shared.
 * Iterating with `for...of` walks code points, so a valid surrogate pair arrives
 * as one character above #xFFFF and is allowed by both XML and YAML, while a lone
 * one arrives alone and is refused by both.
 */
function firstUnrepresentable(str, refuses) {
  for (const ch of str) {
    if (refuses(ch.codePointAt(0))) return ch;
  }
  return null;
}

/* XML 1.0, `Char`, written out rather than approximated:

     Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]

   So tab, newline and carriage return are in, and #x0-#x8, #xB, #xC, #xE-#x1F,
   #xFFFE, #xFFFF and a lone surrogate are out. */
function xmlRefuses(cp) {
  if (cp === 0x9 || cp === 0xa || cp === 0xd) return false;
  if (cp >= 0x20 && cp <= 0xd7ff) return false;
  if (cp >= 0xe000 && cp <= 0xfffd) return false;
  if (cp >= 0x10000 && cp <= 0x10ffff) return false;
  return true;
}

/* YAML 1.2, `c-printable` — the same list a YAML reader checks before it parses
   anything, and the reason PyYAML answers `unacceptable character #x0000` while
   accepting a tab:

     c-printable ::= #x9 | #xA | #xD | [#x20-#x7E] | #x85 | [#xA0-#xD7FF]
                   | [#xE000-#xFFFD] | [#x10000-#x10FFFF]

   YAML has no escape for these either: `\0` is not a YAML escape, so quoting the
   scalar does not make room. */
function yamlRefuses(cp) {
  if (cp === 0x9 || cp === 0xa || cp === 0xd || cp === 0x85) return false;
  if (cp >= 0x20 && cp <= 0x7e) return false;
  if (cp >= 0xa0 && cp <= 0xd7ff) return false;
  if (cp >= 0xe000 && cp <= 0xfffd) return false;
  if (cp >= 0x10000 && cp <= 0x10ffff) return false;
  return true;
}

/* CSV, SQL and the text table have no character set to consult, but they all
   write text, and a NUL ends the record for every reader of them. Python's csv
   module raises `line contains NUL`, SQLite reports `unrecognized token: "'a"`
   inside the literal, and `file(1)` answers `data` rather than `CSV text`. No
   quoting helps in any of the three. */
function nulRefuses(cp) {
  return cp === 0;
}

/* A lone surrogate is a different kind of impossible. A NUL is a real character
   that these formats cannot carry; a lone surrogate is not a character any file
   can hold at all — it is half of a UTF-16 pair whose other half never arrived,
   and UTF-8 has no encoding of it. `fs.writeFileSync` and the browser's `Blob`
   both put U+FFFD in its place without a word, so the value that comes out is a
   *different* value from the one that went in, and no reader can tell. YAML and
   XML refuse it by their own specifications; these three refuse it because there
   is nowhere to put it.

   It is reachable from ordinary input, because JSON's `\udXXX` escape produces
   one: `[{"note":"a\ud800b"}]` is a valid JSON file, seven ASCII bytes of
   punctuation around an escape, and it parses. */
function loneSurrogateRefuses(cp) {
  return cp >= 0xd800 && cp <= 0xdfff;
}

function textRefuses(cp) {
  return nulRefuses(cp) || loneSurrogateRefuses(cp);
}

/* One rule per output format, plus the words the refusal is written in.

   `json` has no *character* rule on purpose: it escapes every one of them
   (`"a\u0000b"`, `"a\ud800b"`), which is what makes it the route out of every
   character refusal below. It is in the table for the second kind of impossible
   instead, which no format can carry and which JSON answers worst of all — see
   `nonFiniteWhy` below.

   `why` is a function of the character, not of the format alone, because these
   formats refuse two different kinds of impossible and a reader who is told the
   wrong reason is left guessing. A NUL is dropped by the format's own rules; a
   lone surrogate is replaced with a different character by the encoder. */
const UNWRITABLE = {
  xml:   { refuses: xmlRefuses,   label: 'XML 1.0',      why: () => 'a numeric character reference is refused by the same rule', out: 'CSV, JSON, SQL or YAML', nonFinite: 'every XML element is text, so a parser reads the word and not a number' },
  yaml:  { refuses: yamlRefuses,  label: 'YAML 1.2',     why: () => 'YAML has no escape for it either',                         out: 'JSON', nonFinite: "a YAML reader takes the bare word for a string and not a float — YAML's own spelling is .inf, so the number would change type" },
  csv:   { refuses: textRefuses,  label: 'CSV',          why: (ch) => textWhy(ch, 'a NUL ends the record for every reader of CSV'), out: 'JSON', nonFinite: 'a CSV cell is text, so what a reader gets back is the word and not the number' },
  sql:   { refuses: textRefuses,  label: 'SQL',          why: (ch) => textWhy(ch, 'a NUL ends the string literal'),            out: 'JSON', nonFinite: "it would be written as a string literal, and SQLite stores that with type text" },
  table: { refuses: textRefuses,  label: 'a text table', why: (ch) => textWhy(ch, 'a NUL ends the cell for every reader'),      out: 'JSON', nonFinite: 'a cell in a text table is text, so the number would be printed as a word' },
  json:  { refuses: null,         label: 'JSON',         why: () => 'JSON escapes every character above',                       out: 'CSV, SQL or YAML', nonFinite: 'JSON has no form for it, so the number is written as null — a different value, and one that reads as nothing there at all' },
};

/* A number that is not finite is not a number at all as far as a file is
   concerned, and it is the one value here that *every* writer got wrong in a
   different way. Measured on these six writers, from an input any JSON tool
   accepts (`1e400` is a legal literal) and from an ordinary pipeline
   (`add ratio 1/0`):

     json   -> null        the value is replaced, not written
     yaml   -> Infinity    PyYAML reads it as str; YAML's float form is `.inf`
     sql    -> 'Infinity'  SQLite: typeof = text
     csv    -> Infinity    a cell is text
     table  -> Infinity    a cell is text
     xml    -> <Infinity>  an element is text

   All six at exit 0 with empty stderr, so the number silently became a string in
   five formats and became `null` in the sixth. Unlike a NUL or a lone surrogate
   this is not a question of a format's rules — there is no output format here
   that carries a value which is not finite, so there is no way out to name, and
   the message says so instead of pointing at an escape that does not exist. */
function nonFiniteRefuses(value) {
  return typeof value === 'number' && !Number.isFinite(value);
}

/* The sentence for the character in hand: the format's own reason for a NUL, and
   the one reason every encoder shares for a lone surrogate. */
function textWhy(ch, forNul) {
  return loneSurrogateRefuses(ch.codePointAt(0))
    ? 'a lone surrogate has no UTF-8 encoding, so every writer puts U+FFFD in its place — a different value from the one you gave it'
    : forNul;
}

function describeChar(ch) {
  const cp = ch.codePointAt(0);
  const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  if (cp <= 0x1f) return `${hex} (${C0_NAMES[cp]})`;
  if (cp === 0xfffe) return `${hex} (a permanently unassigned character)`;
  if (cp === 0xffff) return `${hex} (a permanently unassigned character)`;
  if (cp >= 0xd800 && cp <= 0xdfff) return `${hex} (half of a surrogate pair — the other half is missing)`;
  return hex;
}

/**
 * Refuse data the target format has no room for, before any of it is written.
 *
 * A control character inside a value is ordinary data: a NUL left by a
 * fixed-width export, a bell from a terminal capture, the vertical tab in a
 * legacy file. Every writer here escapes what its format can escape — `&`, `<`,
 * `>`, `"` and `'` in XML, `\n` in CSV — and writes everything else through
 * untouched, so a character the format cannot hold lands in the file raw. The
 * result names a format it is not, and this tool's own reader is lenient enough
 * to read the file back, so a round trip through Transmute hid it completely.
 * Exit was 0 and stderr was empty.
 *
 * There is no way to keep these characters in the format that was asked for,
 * which is why the run stops instead of inventing an answer. For XML a numeric
 * character reference is not a way out either: `&#0;` is refused by the very
 * production above, so an entity would not make the file valid. Dropping the
 * character would be the silent data loss that T13 and T30 exist to remove, and a
 * file that claims to be YAML 1.2 and is not is worse than no file at all.
 *
 * The refusal belongs to the *target*, never to the data, which is why the rules
 * live in one table instead of one guard per writer. An earlier version of this
 * comment claimed that "CSV, SQL, JSON and YAML all hold a NUL faithfully". That
 * was measured from the wrong side — it asked whether the character survived the
 * write, not whether anything could read the file. Python's `csv` module raises
 * `line contains NUL`, SQLite reports `unrecognized token` inside the literal,
 * PyYAML answers `unacceptable character #x0000`, and `file(1)` calls all three
 * `data` rather than text. Only JSON escapes them all, which is why it is the
 * route out of every refusal, and why it is the one format with no rule.
 *
 * A second kind of impossible arrived later and is not a question of a format's
 * rules at all. A lone surrogate cannot be encoded in UTF-8, so it cannot appear
 * in a file of any format; every writer here substitutes U+FFFD for it silently.
 * XML and YAML were already refusing it, because their grammars exclude it, but
 * CSV, SQL and the text table had no rule and wrote the substitute out as if it
 * were the data: exit 0, empty stderr, and a value that had quietly become a
 * different value. Asking "can a reader read this file" was the right question
 * for a NUL and the wrong one for a surrogate — the right question there is "can
 * this character exist in the file at all", and for a surrogate the answer is no
 * whatever the format. It now gets the same refusal, for the same reason and
 * with the same escape route out, as the NUL beside it.
 *
 * A third kind is not about characters at all. A number that is not finite —
 * `Infinity`, `-Infinity`, `NaN` — is a value no file of any of these formats
 * carries as a number: JSON writes `null` in its place, which is data loss, and
 * the five text formats write the bare word, which every one of their readers
 * hands back as a string. All six did that at exit 0 with empty stderr, and two
 * ordinary ways in reach it: a legal JSON literal (`1e400`) and an `add`
 * expression that divides by zero. This is why `json` is in the table after all —
 * it is the route out of every *character* refusal and the worst answer to this
 * one, so the message names no escape at all.
 */
function assertWritable(data, format) {
  const rule = UNWRITABLE[format];
  if (!rule) return;
  const rows = Array.isArray(data) ? data : [data];
  for (const [index, row] of rows.entries()) {
    const at = Array.isArray(data) ? `row ${index + 1}` : 'the input';
    scanWritable(row, at, rule);
  }
}

function scanWritable(value, at, rule) {
  if (nonFiniteRefuses(value)) {
    throw new Error(
      `${rule.label} cannot write ${String(value)}, which is in ${at}. ` +
      `There is no way to keep it: ${rule.nonFinite}. ` +
      `No format here carries a value that is not finite, so fix the number before ` +
      `converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.`
    );
  }
  if (typeof value === 'string') {
    // `json` has no character rule — it escapes them all — so the walk stops at
    // the value check above when the target is JSON.
    if (!rule.refuses) return;
    const bad = firstUnrepresentable(value, rule.refuses);
    if (bad !== null) {
      throw new Error(
        `${rule.label} cannot write ${describeChar(bad)}, which is in ${at}. ` +
        `There is no way to keep it: ${rule.why(bad)}. ` +
        `Write ${rule.out} instead, or remove the character before converting.`
      );
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanWritable(item, `${at}[${i}]`, rule));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    // A key is checked too: in XML a key that is not a legal tag name travels in
    // a `name` attribute (see `writeXMLElement`), and in YAML and CSV it is a
    // scalar beside the values — text like any other.
    scanWritable(key, `the field name ${JSON.stringify(key)} in ${at}`, rule);
    scanWritable(item, `${at}, field ${JSON.stringify(key)}`, rule);
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
    if (step.op === 'rename') rejectSharedRenameTargets(step.mapping, at);
  });
  return pipeline;
}

/**
 * Two fields cannot become one name.
 *
 * `rename` writes into a fresh object, so two mapping values that are the same
 * string are two writes to one key: the second replaces the first in every row,
 * and the output has one field where the pipeline asked for two. Nothing in the
 * file says a value is gone. This is knowable from the pipeline alone, before a
 * single byte is read, and it holds for every input — so it is a bad pipeline
 * (exit 2) and not a warning about the data, which is the line T26 drew between
 * an assumption about data and a step that cannot do its job.
 */
function rejectSharedRenameTargets(mapping, at) {
  if (!isPlainObject(mapping)) return;
  const firstSource = new Map();
  for (const [from, to] of Object.entries(mapping)) {
    if (typeof to !== 'string') continue;
    const other = firstSource.get(to);
    if (other !== undefined) {
      throw pipelineError(
        `${at} (rename): "${from}" and "${other}" are both renamed to "${to}", so one of the ` +
        'two values is dropped from every row. Rename them one at a time, or use map to keep both.'
      );
    }
    firstSource.set(to, from);
  }
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
  join:    (field, rows, params) => (keepsUnmatched(params)
    ? 'neither side has it, so every row was kept unchanged'
    : 'neither side has it, so every row was dropped')
};

function fieldList(val) {
  return Array.isArray(val) ? val : [val];
}

/** `keep: left` and `keep: all` keep the rows a join cannot match. */
function keepsUnmatched(params) {
  return params.keep === 'left' || params.keep === 'all';
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
  const right = step.op === 'join' && Array.isArray(step.with)
    ? step.with.filter(isPlainObject)
    : [];
  for (const field of names(step)) {
    if (typeof field !== 'string') continue;
    // `join` is the one step with a field on two sides, and the two mistakes are
    // not the same: a key only one side has cannot match anything, and a join
    // that cannot match anything either drops every row or hands back the file
    // unchanged, both exit 0 and both silent. So the side that has the field is
    // named, because "the key is not on the left" and "the key is not on the
    // right" are different typos in a pipeline and the fix for each is different
    // too. Before this, only the case where *neither* side had it said anything.
    if (right.length > 0) {
      const rightHas = right.some(r => hasField(r, field));
      if (present.has(field)) {
        if (!rightHas) {
          warnings.push(`join: no record on the right has a field named "${field}"; it is on the left, so no row could match`);
        }
      } else if (rightHas) {
        warnings.push(`join: no record on the left has a field named "${field}"; it is on the right, so no row could match`);
      } else {
        warnings.push(`join: no record has a field named "${field}"; ${FIELD_EFFECTS.join(field, data.length, step)}`);
      }
      continue;
    }
    if (present.has(field)) continue;
    warnings.push(`${step.op}: no record has a field named "${field}"; ${FIELD_EFFECTS[step.op](field, data.length, step)}`);
  }
}

/**
 * Say that a rename lands on a name the records already have.
 *
 * `{"town":"city"}` on records that have both fields is a reasonable pipeline —
 * the next file may only have `town` — so the run succeeds and writes its
 * output, exactly as a field name no record has does. What it does not do is
 * keep quiet about the value that is gone: `rename` writes into a fresh object,
 * so the record's own `city` is replaced, and the output holds one `city` where
 * the input held two fields with a value each.
 *
 * A target that is itself renamed away is not a collision. `{a: b, b: a}` swaps
 * the two values, and the record's `b` becomes its `a`, so no value is lost and
 * there is nothing to warn about.
 */
function reportRenameCollisions(data, step, warnings) {
  if (!Array.isArray(warnings) || step.op !== 'rename' || !isPlainObject(step.mapping)) return;
  const mapping = step.mapping;
  const sources = new Set(Object.keys(mapping));
  const records = data.filter(isPlainObject);
  if (records.length === 0) return;
  const target = new Map();
  for (const [from, to] of Object.entries(mapping)) {
    if (typeof to === 'string' && !target.has(to)) target.set(to, from);
  }
  const hits = [];
  for (const [name, from] of target) {
    if (sources.has(name)) continue;
    const rows = records.filter(row => hasField(row, name)).length;
    if (rows > 0) hits.push(`"${from}" → "${name}" (${rows} of ${records.length})`);
  }
  if (hits.length === 0) return;
  const one = hits.length === 1;
  warnings.push(
    `rename: ${one ? 'a renamed name is' : `${hits.length} renamed names are`} already a field in the ` +
    `records — ${hits.join(one ? '' : ', ')}. The value that was in ${one ? 'that field' : 'those fields'} ` +
    'is not in the output.'
  );
}

/**
 * A list member that carries a name the row already had writes over it.
 *
 * `flatten` builds each expanded row as `{ ...item, [field]: undefined, ...sub }`,
 * so the member gets the last word on every name it shares with the row, and
 * the row's own value is gone from the output. Nothing said so: exit 0, empty
 * stderr, and an output that looked complete — worse, the *other* warning this
 * step's output can trigger made it look more complete, because it names the
 * columns that are missing from some rows and not the one that was overwritten
 * in all of them. `{id: 1, name: "outer", tags: [{name: "inner", weight: 10}]}`
 * came out as `name: "inner"`, and the warning said `weight` was in 2 of 3
 * rows, which is true and says nothing about the value that was lost.
 *
 * A member named after `field` itself is the control that keeps this rule from
 * being too broad. The list is what `flatten` removes, so a member that carries
 * the list's own name replaces a value the step was asked to take away, and
 * nothing the row held is lost. That is the same reason `{a: b, b: a}` does not
 * warn in `reportRenameCollisions`: a step doing the only thing it can do with a
 * name is not a collision.
 *
 * A warning and not an error, by T26's line: whether a member collides depends
 * on the data, and the next file may not collide at all. So the run succeeds and
 * writes its output, and one line on stderr says which value is not in it.
 */
function reportFlattenCollisions(data, step, warnings) {
  if (!Array.isArray(warnings) || step.op !== 'flatten' || typeof step.field !== 'string') return;
  const field = step.field;
  const hits = new Map();
  let records = 0;
  for (const item of data) {
    if (!isPlainObject(item)) continue;
    records++;
    const list = readField(item, field);
    if (!Array.isArray(list)) continue;
    // Counted per record, not per member: the denominator is records, and a row
    // whose list carries `sku` three times still has one `sku` to lose. Counting
    // members there printed `(3 of 1)`, which is a number no reader can place.
    const seen = new Set();
    for (const member of list) {
      if (!isPlainObject(member)) continue;
      for (const name of Object.keys(member)) {
        if (name === field || !hasField(item, name) || seen.has(name)) continue;
        seen.add(name);
        hits.set(name, (hits.get(name) ?? 0) + 1);
      }
    }
  }
  if (hits.size === 0) return;
  const names = [...hits.keys()];
  const one = names.length === 1;
  const shown = names.map((n) => `"${n}" (${hits.get(n)} of ${records})`);
  warnings.push(
    `flatten: ${one ? 'a list member is' : `${names.length} list members are`} already a field in the ` +
    `records — ${shown.join(one ? '' : ', ')} from the "${field}" list. ` +
    `The value${one ? '' : 's'} that ${one ? 'was' : 'were'} in ` +
    `${one ? 'that field' : 'those fields'} ${one ? 'is' : 'are'} not in the output.`
  );
}

/**
 * A joined field the left row already has a name for is dropped.
 *
 * `join` writes a right-hand field only when `!hasField(merged, target)`, so the
 * left row's value stays and the joined value is simply not in the output. That
 * was true of every join the tool has ever run, and nothing said so: exit 0,
 * empty stderr, and a file that looks like the join the user asked for. It is
 * the same class `reportRenameCollisions` and `reportFlattenCollisions` close,
 * on the one remaining path that *reads a name on one side and writes it on the
 * other*. `docs/cli.md` and the join guide both promise the behaviour in prose
 * — "the existing name wins and the other side's value is dropped" — so the
 * user is not misinformed, they are simply never told on the run that it
 * happened. `pick`, `omit`, `sort`, `unique` and `group` are measured clean on
 * this same axis, so `join` and `add` were the two left, and `add` overwrites
 * on purpose: the user named the field they wanted written.
 *
 * A `prefix` is the documented way out, and it is the case that matters most
 * here: `prefix: "x_"` on a left row that already has `x_name` drops the value
 * just the same. The docs say "pick a prefix that is not already in use", which
 * is advice the user cannot act on without reading every left row, so the
 * message names the prefixed name that was taken.
 *
 * Two controls keep this from being too broad. A right-hand field named after
 * the join key is skipped on purpose and loses nothing — the left row already
 * holds that value under the same name by definition of the match. And a right
 * value *equal* to the left one loses nothing either, which is the same reason
 * `{a: b, b: a}` does not warn in `reportRenameCollisions`.
 *
 * A warning and not an error, by T26's line: whether a join collides depends on
 * the data, and the same pipeline against the next file may not collide at all.
 */
function reportJoinCollisions(data, step, warnings) {
  if (!Array.isArray(warnings) || step.op !== 'join') return;
  const rows = Array.isArray(step.with) ? step.with.filter(isPlainObject) : [];
  if (rows.length === 0) return;
  const on = step.on;
  const prefix = typeof step.prefix === 'string' ? step.prefix : '';
  const key = row => {
    const value = readField(row, on);
    return value === undefined ? undefined : String(value);
  };
  const index = new Map();
  for (const row of rows) {
    const k = key(row);
    if (k !== undefined && !index.has(k)) index.set(k, row);
  }
  const hits = new Map();
  let matched = 0;
  for (const item of data) {
    if (!isPlainObject(item)) continue;
    const own = key(item);
    if (own === undefined) continue;
    const match = index.get(own);
    if (!match) continue;
    matched++;
    const seen = new Set();
    for (const [k, v] of Object.entries(match)) {
      const target = prefix + k;
      if (k === on || !hasField(item, target)) continue;
      if (stableKey(item[target]) === stableKey(v)) continue;
      seen.add(target);
      hits.set(target, (hits.get(target) ?? 0) + 1);
    }
  }
  if (hits.size === 0) return;
  const names = [...hits.keys()];
  const one = names.length === 1;
  const shown = names.map(n => `"${n}" (${hits.get(n)} of ${matched})`);
  warnings.push(
    (prefix ? `join: with prefix "${prefix}", ` : 'join: ') +
    `${one ? 'a joined field is' : `${names.length} joined fields are`} already a field in the ` +
    `left records — ${shown.join(one ? '' : ', ')}. ` +
    `The value${one ? '' : 's'} that would have gone there ${one ? 'is' : 'are'} not in the output.`
  );
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
    // One sentence per literal that lost precision, after the parse has seen
    // every row, so a value repeated across a file is counted instead of
    // repeated.
    reportLostPrecision(warnings);

    // Transform
    for (const [index, step] of pipeline.entries()) {
      // Against the data as it is here, not against the file as it arrived: a
      // field `add` or `map` just created is present from this step on, and one
      // `rename` removed is gone from it.
      requireRecords(data, step, index);
      reportMissingFields(data, step, warnings);
      reportRenameCollisions(data, step, warnings);
      reportFlattenCollisions(data, step, warnings);
      reportJoinCollisions(data, step, warnings);
      data = operations[step.op](data, step);
      if (!Array.isArray(data)) data = [data];
    }

    // Serialize
    if (!serializers[outputFormat]) return { error: `Unknown output format: ${outputFormat}` };
    // These four writers have to be told where the warnings go: they are the
    // formats where the file itself cannot say what it lost, so the columns and
    // fields it renames on the way out, and the rows it cannot write at all, are
    // named here or nowhere. `json` and `yaml` need no channel — they can carry
    // every value these three refuse.
    const text = WarnsOnWrite.has(outputFormat)
      ? serializers[outputFormat](data, { warnings, tableName: opts.tableName })
      : serializers[outputFormat](data);

    return { data, text, warnings };
  } catch (err) {
    return { error: err.message, warnings, usage: err.usage === true };
  }
}

/**
 * The writers whose file cannot say what it lost, so they are told where the
 * warnings go. `table` and `sql` were missing from this set and from the call
 * site alike, which is why a row they wrote as an empty cell or a NULL said
 * nothing — the channel ended two formats short of the file.
 */
const WarnsOnWrite = new Set(['csv', 'table', 'sql', 'xml']);

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
    // The reader asks the same question about the same line, in `csvComment`,
    // because a detector that skips what the reader keeps is a detector that
    // routes a file to the wrong reader.
    const firstLine = trimmed.split('\n')
      .map(l => l.trim())
      .find(l => l && !csvComment([l], false) && l !== '---') || '';
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
