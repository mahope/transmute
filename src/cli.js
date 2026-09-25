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
const { run, parsers, operations, detectFormat } = require('./engine');
const { version } = require('../package.json');

const INPUT_FORMATS = ['json', 'csv', 'yaml', 'xml'];
const OUTPUT_FORMATS = ['json', 'csv', 'yaml', 'xml', 'table', 'sql'];

/**
 * Exit codes — stable and documented in docs/cli.md so scripts can branch on them.
 *   0  success
 *   1  the pipeline ran but the transformation failed
 *   2  usage error (unknown flag, bad flag value, invalid pipeline)
 *   3  input error (file missing, unreadable, or unparseable as the input format)
 */
const EXIT = { ok: 0, transform: 1, usage: 2, input: 3 };

class UsageError extends Error {}
class InputError extends Error {}

async function main() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let inputText = null;
  let inputFormat = null;
  let pipeline = null;
  let outputFormat = null;
  let outFile = null;
  let tableName = 'my_table';

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pipe' || arg === '-p') {
      pipeline = parsePipeline(flagValue(args, ++i, '--pipe'));
    } else if (arg === '--format' || arg === '-f') {
      inputFormat = flagValue(args, ++i, '--format');
      if (!INPUT_FORMATS.includes(inputFormat)) {
        throw new UsageError(`Unknown input format: ${inputFormat} (expected ${INPUT_FORMATS.join(', ')})`);
      }
    } else if (arg === '--output' || arg === '-o') {
      outputFormat = flagValue(args, ++i, '--output');
      if (!OUTPUT_FORMATS.includes(outputFormat)) {
        throw new UsageError(`Unknown output format: ${outputFormat} (expected ${OUTPUT_FORMATS.join(', ')})`);
      }
    } else if (arg === '--out') {
      outFile = flagValue(args, ++i, '--out');
    } else if (arg === '--table') {
      tableName = flagValue(args, ++i, '--table');
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

  // Read input
  if (inputFile !== null) {
    if (inputFile === '-') {
      inputText = await readStdin();
    } else if (!fs.existsSync(inputFile)) {
      throw new InputError(`File not found: ${inputFile}`);
    } else {
      try {
        inputText = fs.readFileSync(inputFile, 'utf-8');
      } catch (err) {
        throw new InputError(`Could not read ${inputFile}: ${err.message}`);
      }
    }
    if (!inputFormat) inputFormat = detectFormat(inputFile, inputText);
  } else {
    // Read from stdin (pipe)
    inputText = await readStdin();
    if (inputText === '' && process.stdin.isTTY) {
      showHelp(process.stderr);
      throw new UsageError('No input. Pass a file or pipe data on stdin.');
    }
    if (!inputFormat) inputFormat = detectFormat(null, inputText);
  }

  // Validate the input up front so a parse failure is an input error, not a
  // transformation error, and so nothing is written to stdout on failure.
  if (!parsers[inputFormat]) {
    throw new UsageError(`Unknown input format: ${inputFormat} (expected ${INPUT_FORMATS.join(', ')})`);
  }
  try {
    parsers[inputFormat](inputText);
  } catch (err) {
    throw new InputError(`Could not parse input as ${inputFormat}: ${err.message}`);
  }

  // Preview only when the user gave neither --pipe nor --output.
  if (pipeline === null && outputFormat === null) {
    showPreview(inputText, inputFormat);
    return;
  }
  if (outputFormat === null) outputFormat = 'table';
  if (pipeline === null) pipeline = [];

  // Run pipeline
  const result = run(inputText, inputFormat, pipeline, outputFormat, { tableName });
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(EXIT.transform);
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

function parsePipeline(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new UsageError(`--pipe is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new UsageError('--pipe must be a JSON array of steps, e.g. \'[{"op":"head","n":5}]\'');
  }
  for (const step of parsed) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new UsageError('--pipe steps must be objects with an "op" key');
    }
    if (!operations[step.op]) {
      throw new UsageError(`Unknown operation: ${step.op} (see \`transmute --help\`)`);
    }
  }
  return parsed;
}

function showPreview(text, format) {
  const { serializers } = require('./engine');
  const result = run(text, format, []);
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
  console.log('  transmute users.csv --output sql --table users   # CSV to SQL INSERT statements');
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
  log('  -v, --version          Print the version');
  log('  -h, --help             Show this help');
  log();
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
  log('  1  transformation failed   3  input error (missing or unparseable input)');
  log();
  log('Examples:');
  log('  transmute data.json -p \'[{"op":"filter","expr":"item.status === \\"active\\""}]\'');
  log('  cat users.csv | transmute -p \'[{"op":"head","n":5}]\' -o json');
  log('  transmute data.yaml -p \'[{"op":"sort","by":"name"},{"op":"pick","fields":["name","email"]}]\' -o csv');
  log();
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  if (err instanceof UsageError) process.exit(EXIT.usage);
  if (err instanceof InputError) process.exit(EXIT.input);
  process.exit(EXIT.transform);
});
