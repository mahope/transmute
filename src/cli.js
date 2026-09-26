#!/usr/bin/env node

/**
 * Transmute CLI — command-line data transformation tool
 *
 * Usage:
 *   transmute input.json --pipe '[{"op":"filter","expr":"item.age > 18"}]' --output csv
 *   cat data.csv | transmute --pipe '[{"op":"head","n":5}]' --format yaml
 *   transmute input.json  (interactive preview)
 */

const fs = require('fs');
const { isUtf8 } = require('node:buffer');
const { run, parsers, validatePipeline, detectFormat } = require('./engine');
const { version } = require('../package.json');

const INPUT_FORMATS = ['json', 'csv', 'yaml', 'xml'];
const OUTPUT_FORMATS = ['json', 'csv', 'yaml', 'xml', 'table', 'sql'];

/** Delimiters accepted by --delimiter. `tab` is a name because a literal tab in a shell argument is a trap. */
const DELIMITERS = { ',': ',', ';': ';', 'tab': '\t', '|': '|' };

/**
 * Exit codes — stable and documented in docs/cli.md so scripts can branch on them.
 *   0  success
 *   1  the pipeline ran but the transformation failed
 *   2  usage error (unknown flag, bad flag value, invalid pipeline)
 *   3  input error (file missing, unreadable, unparseable, or not UTF-8)
 */
const EXIT = { ok: 0, transform: 1, usage: 2, input: 3 };

class UsageError extends Error {}
class InputError extends Error {}

/**
 * Every option carries one value, and a second one used to be answered with the
 * last — silently, exit 0 and an empty stderr, so a command that was not the
 * command the user wrote produced output that looked like what they had asked
 * for. Two `--pipe` flags is the natural way to hit it, because the help text
 * shows several steps in *one* `--pipe`. A short alias is the same flag as its
 * long name, so `-p` and `--pipe` are counted together.
 *
 * Repeating `--pipe` could be *merged* into one pipeline instead of refused,
 * but then the order of the flags would decide the order of the steps, and no
 * other option has a merge that means anything — so this would be the one flag
 * with a hidden rule, which is the thing being removed here.
 */
const OPTION_HINTS = {
  '--pipe': 'Put every step in one --pipe, as a JSON array.',
};

/** Every accepted option, mapped to the one name it is counted under. */
const OPTION_NAMES = {
  '-p': '--pipe', '--pipe': '--pipe',
  '-f': '--format', '--format': '--format',
  '-o': '--output', '--output': '--output',
  '--out': '--out',
  '--table': '--table',
  '--delimiter': '--delimiter',
};

/** How often each option appears anywhere on the command line. */
function countOptions(args) {
  const counts = new Map();
  for (const arg of args) {
    const name = OPTION_NAMES[arg];
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

/**
 * Claim an option once, so the parser below stays a plain list of assignments
 * and every repeated flag is refused the same way. The count comes from the
 * whole command line, not from the claims so far: the parser stops at the first
 * repeat, and a command with three `--delimiter` flags is told three, not two.
 */
function takeOption(seen, counts, name) {
  if (seen.has(name)) {
    throw new UsageError(
      `${name} was given ${counts.get(name)} times, and only the last one would have been used. ` +
      (OPTION_HINTS[name] || 'Give each option once.')
    );
  }
  seen.add(name);
}

async function main() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let inputText = null;
  let inputFormat = null;
  let pipeline = null;
  let outputFormat = null;
  let outFile = null;
  let tableName = null;
  let delimiter = null;
  const seenOptions = new Set();
  const optionCounts = countOptions(args);

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pipe' || arg === '-p') {
      takeOption(seenOptions, optionCounts, '--pipe');
      pipeline = parsePipeline(flagValue(args, ++i, '--pipe'));
    } else if (arg === '--format' || arg === '-f') {
      takeOption(seenOptions, optionCounts, '--format');
      inputFormat = flagValue(args, ++i, '--format');
      if (!INPUT_FORMATS.includes(inputFormat)) {
        throw new UsageError(`Unknown input format: ${inputFormat} (expected ${INPUT_FORMATS.join(', ')})`);
      }
    } else if (arg === '--output' || arg === '-o') {
      takeOption(seenOptions, optionCounts, '--output');
      outputFormat = flagValue(args, ++i, '--output');
      if (!OUTPUT_FORMATS.includes(outputFormat)) {
        throw new UsageError(`Unknown output format: ${outputFormat} (expected ${OUTPUT_FORMATS.join(', ')})`);
      }
    } else if (arg === '--out') {
      takeOption(seenOptions, optionCounts, '--out');
      outFile = flagValue(args, ++i, '--out');
    } else if (arg === '--table') {
      takeOption(seenOptions, optionCounts, '--table');
      tableName = flagValue(args, ++i, '--table');
    } else if (arg === '--delimiter') {
      takeOption(seenOptions, optionCounts, '--delimiter');
      const raw = flagValue(args, ++i, '--delimiter');
      if (!Object.prototype.hasOwnProperty.call(DELIMITERS, raw)) {
        throw new UsageError(`Unknown delimiter: ${raw} (expected , ; tab or |)`);
      }
      delimiter = DELIMITERS[raw];
    } else if (arg === '--version' || arg === '-v') {
      console.log(version);
      return;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      return;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new UsageError(`Unknown option: ${arg} (run \`transmute --help\`)`);
    } else if (inputFile === null) {
      inputFile = arg;
    } else {
      throw new UsageError(`Only one input file is supported, got: ${arg}`);
    }
  }

  // An option the CLI accepts but cannot honour is the same silence as one that
  // was given twice: exit 0, an empty stderr, and output that is not what the
  // command asked for. These two are known from the flags alone, so they are
  // answered before the input is touched — a typo should not have to wait for a
  // file it was never going to be used with.
  //
  // `--out` is the sharpest of them: it was accepted, the preview ran, and the
  // file was never written, so the user asked for a file and got a table on the
  // screen instead. `--table` names a table that only SQL output has.
  if (outFile !== null && outputFormat === null) {
    throw new UsageError(
      '--out needs --output: without it Transmute prints a preview and writes no file. ' +
      'Say what the file should hold with --output json, csv, yaml, xml, table or sql.'
    );
  }
  if (tableName !== null && outputFormat !== 'sql') {
    const output = outputFormat === null ? 'a preview' : outputFormat;
    throw new UsageError(
      `--table names the table in SQL output only, but the output here is ${output}. ` +
      'Use --output sql, or drop --table.'
    );
  }

  // Read input. Both a file and a pipe are read as bytes, because the encoding
  // is decided before the text exists — see decodeText.
  if (inputFile !== null) {
    if (inputFile === '-') {
      inputText = decodeText(await readStdin(), 'stdin');
    } else if (!fs.existsSync(inputFile)) {
      throw new InputError(`File not found: ${inputFile}`);
    } else {
      let buffer;
      try {
        buffer = fs.readFileSync(inputFile);
      } catch (err) {
        throw new InputError(`Could not read ${inputFile}: ${err.message}`);
      }
      inputText = decodeText(buffer, inputFile);
    }
    if (!inputFormat) inputFormat = detectFormat(inputFile, inputText);
  } else {
    // Read from stdin (pipe)
    const buffer = await readStdin();
    if (buffer.length === 0 && process.stdin.isTTY) {
      showHelp(process.stderr);
      throw new UsageError('No input. Pass a file or pipe data on stdin.');
    }
    inputText = decodeText(buffer, 'stdin');
    if (!inputFormat) inputFormat = detectFormat(null, inputText);
  }

  // `--delimiter` is a claim about how a CSV file is *read*, and the reader is
  // the only thing that uses it: the CSV writer always writes a comma and quotes
  // a field that contains another one, so `--output csv` cannot be steered by
  // this flag. It is therefore dead unless the input is CSV, which is checked
  // here rather than above because it needs the detected input format.
  if (delimiter !== null && inputFormat !== 'csv') {
    throw new UsageError(
      `--delimiter applies to CSV input, and this input is ${inputFormat}. ` +
      'Drop it, or read the file as CSV with --format csv.'
    );
  }

  // Validate the input up front so a parse failure is an input error, not a
  // transformation error, and so nothing is written to stdout on failure.
  if (!parsers[inputFormat]) {
    throw new UsageError(`Unknown input format: ${inputFormat} (expected ${INPUT_FORMATS.join(', ')})`);
  }
  try {
    parsers[inputFormat](inputText, { delimiter });
  } catch (err) {
    throw new InputError(`Could not parse input as ${inputFormat}: ${err.message}`);
  }

  // Preview only when the user gave neither --pipe nor --output.
  if (pipeline === null && outputFormat === null) {
    showPreview(inputText, inputFormat, delimiter);
    return;
  }
  if (outputFormat === null) outputFormat = 'table';
  if (pipeline === null) pipeline = [];

  // Run pipeline. The table name is only resolved here, so a `--table` that was
  // never given is the documented default rather than a value the parser made.
  const result = run(inputText, inputFormat, pipeline, outputFormat, {
    tableName: tableName === null ? 'my_table' : tableName,
    delimiter,
  });
  if (result.error) {
    console.error(`Error: ${result.error}`);
    // A bad argument in the pipeline — an expression that is not valid
    // JavaScript — is what the user typed, so it is a usage error, not a
    // transformation that failed. Both leave stdout empty.
    process.exit(result.usage ? EXIT.usage : EXIT.transform);
  }
  // Warnings go to stderr so stdout stays exactly the data, pipeable and
  // redirectable. A CSV row with more fields than the header still succeeds —
  // the values are kept, and the user is told which column they landed in.
  for (const warning of result.warnings) {
    console.error(`Warning: ${warning}`);
  }

  if (outFile && outFile !== '-') {
    try {
      fs.writeFileSync(outFile, result.text.endsWith('\n') ? result.text : result.text + '\n', 'utf-8');
    } catch (err) {
      throw new InputError(`Could not write ${outFile}: ${err.message}`);
    }
  } else {
    console.log(result.text);
  }
}

function flagValue(args, index, name) {
  const value = args[index];
  if (value === undefined) throw new UsageError(`${name} needs a value`);
  return value;
}

/**
 * Text is UTF-8, and reading anything else as UTF-8 does not fail — every byte
 * sequence that is not valid UTF-8 decodes to U+FFFD, one per bad sequence. So a
 * Windows-1252 export came out as `M?ller` and a UTF-16 export as a field name
 * of replacement characters, both with exit 0, an empty stderr, and the mangled
 * text written to the output file where it looked perfectly healthy. That is the
 * same silence the other tasks remove, and this is the one that costs data: the
 * characters are gone, and nothing in the output says so.
 *
 * The bytes are therefore checked before they are decoded, and input that is not
 * UTF-8 is an input error (exit 3) — T27's line: a value that cannot be read at
 * all is an error, not a warning, and here not even the file is readable. There
 * is no guessing and no repair, because every wrong guess would rewrite the
 * user's bytes; the message says how to convert instead.
 *
 * A valid UTF-8 file that happens to contain U+FFFD is left alone — the check is
 * on the bytes, never on the decoded text, so the only U+FFFD that can reach the
 * output is one the file really has.
 */
function decodeText(buffer, source) {
  if (isUtf8(buffer)) return buffer.toString('utf-8');
  // Reached only on the failing path. The offset is a character position in the
  // decoded text, which is where the user has to look; `isUtf8` says nothing
  // about where, and every invalid sequence is guaranteed to produce a U+FFFD.
  const at = buffer.toString('utf-8').indexOf('\uFFFD');
  const where = at === -1 ? '' : ` (first invalid character at position ${at})`;
  throw new InputError(
    `${source} is not valid UTF-8${where}. Transmute reads text as UTF-8, so every non-ASCII ` +
    'character would be replaced with U+FFFD and the result written out as if it were correct. ' +
    'Convert the input to UTF-8 first, for example with: iconv -f iso-8859-1 -t utf-8 FILE > FILE-utf8'
  );
}

function parsePipeline(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new UsageError(`--pipe is not valid JSON: ${err.message}`);
  }
  // The rules for what a step needs live in the engine, so the browser
  // playground refuses the same pipelines this does. Here they run before the
  // input is even read: a step that cannot do its job is the user's own typo,
  // and it should not wait behind an unreadable file.
  try {
    return validatePipeline(parsed);
  } catch (err) {
    throw new UsageError(err.message);
  }
}

function showPreview(text, format, delimiter) {
  const { serializers } = require('./engine');
  // The preview is the same run the user would get, so it has to read with the
  // same delimiter. It used to call `run` without the flag, which made
  // `--delimiter` validated, accepted and thrown away whenever no `--output`
  // was given: the same command showed three columns in the preview and one in
  // the real export.
  const result = run(text, format, [], 'table', { delimiter });
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(EXIT.transform);
  }

  console.log('\n╔════════════════════════════════════╗');
  console.log('║   Transmute — Data Transformer    ║');
  console.log('╚════════════════════════════════════╝');
  console.log('');
  console.log('Input detected as: ' + format.toUpperCase());
  console.log('');
  console.log(serializers.table(result.data));
  console.log('');
  console.log('Available commands:');
  console.log('  --pipe \'[{"op":"filter","expr":"item.x > 5"},{"op":"sort","by":"name"}]\'');
  console.log('  --format json|csv|yaml|xml (input format)');
  console.log('  --output json|csv|yaml|xml|table|sql (output format)');
  console.log('  --out <file> (write the output to a file instead of stdout)');
  console.log('  --delimiter ,|;|tab   (CSV delimiter; detected from the header line when omitted)');
  console.log('  transmute users.csv --output sql --table users   # CSV to SQL INSERT statements');
  console.log('  Every option is given once — a repeated --pipe or --output is a usage error, not a merge.');
  console.log('  An option that cannot apply is a usage error: --out needs --output,');
  console.log('  --table needs --output sql, and --delimiter needs CSV input.');
  console.log('');
  console.log('Examples:');
  console.log('  transmute data.json --pipe \'[{"op":"head","n":5}]\' --output csv');
  console.log('  cat data.csv | transmute --pipe \'[{"op":"count"}]\'');
  console.log('  transmute data.yaml --pipe \'[{"op":"pick","fields":["name","email"]}]\'');
  console.log('');
  console.log('Docs: docs/cli.md — every operation with a fixture and a runnable example');
  console.log('');
}

function showHelp(stream = process.stdout) {
  const log = (line = '') => stream.write(line + '\n');
  log();
  log('Transmute — Data Transformer');
  log();
  log('Usage:');
  log('  transmute <file> [options]');
  log('  cat <file> | transmute [options]');
  log('  transmute - [options]       # read the input file from stdin');
  log();
  log('Options:');
  log('  -f, --format <type>    Input format (json, csv, yaml, xml). Auto-detected.');
  log('  -p, --pipe <json>      Transformation pipeline as JSON array');
  log('  -o, --output <type>    Output format (json, csv, yaml, xml, table, sql). Default: table');
  log('      --out <file>       Write the output to <file> instead of stdout');
  log('      --table <name>     Table name for SQL output (default: my_table)');
  log('      --delimiter <d>    CSV/TSV delimiter: , ; tab or | (default: detected from the header line)');
  log('  -v, --version          Print the version');
  log('  -h, --help             Show this help');
  log();
  log('Give each option once. Repeating one is a usage error: two --pipe flags');
  log('are not two sets of steps, so put every step in a single --pipe.');
  log('');
  log('An option that cannot do its job is a usage error as well:');
  log('  --out needs --output, or the output is a preview and no file is written');
  log('  --table needs --output sql, the only output that has a table name');
  log('  --delimiter needs CSV input, since only the reader uses it');
  log('Each of the three used to be accepted, and dropped without a word.');
  log('');
  log('Pipeline operations:');
  log('  filter   {"op":"filter","expr":"item.age > 18"}');
  log('  map      {"op":"map","expr":"({...item, active: true})"}');
  log('  pick     {"op":"pick","fields":["name","email"]}');
  log('  omit     {"op":"omit","fields":["password"]}');
  log('  sort     {"op":"sort","by":"name","dir":"asc"}');
  log('  unique   {"op":"unique","by":"email"}');
  log('  group    {"op":"group","by":"status"}');
  log('  count    {"op":"count"}');
  log('  head     {"op":"head","n":10}');
  log('  tail     {"op":"tail","n":10}');
  log('  rename   {"op":"rename","mapping":{"old_name":"new_name"}}');
  log('  flatten  {"op":"flatten","field":"children"}');
  log('  add      {"op":"add","fields":{"total":"item.price * item.qty"}}');
  log('  join     {"op":"join","on":"id","keep":"left","with":[...]}');
  log();
  log('Exit codes:');
  log('  0  success                 2  usage error (bad flag or pipeline)');
  log('  1  transformation failed   3  input error (missing, unparseable, not UTF-8)');
  log();
  log('Examples:');
  log('  transmute data.json -p \'[{"op":"filter","expr":"item.status === \\"active\\""}]\'');
  log('  cat users.csv | transmute -p \'[{"op":"head","n":5}]\' -o json');
  log('  transmute data.yaml -p \'[{"op":"sort","by":"name"},{"op":"pick","fields":["name","email"]}]\' -o csv');
  log();
}

/**
 * stdin arrives as bytes, not as text. Decoding here with `setEncoding('utf-8')`
 * is what made a piped latin-1 file come out mangled exactly like a piped file:
 * the encoding is checked in decodeText, where a file is checked too.
 */
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(Buffer.alloc(0));
    const chunks = [];
    const done = () => resolve(Buffer.concat(chunks));
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  if (err instanceof UsageError) process.exit(EXIT.usage);
  if (err instanceof InputError) process.exit(EXIT.input);
  process.exit(EXIT.transform);
});
