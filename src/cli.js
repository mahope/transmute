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
const path = require('path');
const { run, detectFormat } = require('./engine');

async function main() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let inputText = null;
  let inputFormat = null;
  let pipeline = [];
  let outputFormat = null;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pipe' || arg === '-p') {
      i++;
      pipeline = JSON.parse(args[i]);
    } else if (arg === '--format' || arg === '-f') {
      i++;
      inputFormat = args[i];
    } else if (arg === '--output' || arg === '-o') {
      i++;
      outputFormat = args[i];
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      return;
    } else if (!arg.startsWith('-')) {
      inputFile = arg;
    }
  }

  // Read input
  if (inputFile) {
    if (!fs.existsSync(inputFile)) {
      console.error(`Error: File not found: ${inputFile}`);
      process.exit(1);
    }
    inputText = fs.readFileSync(inputFile, 'utf-8');
    if (!inputFormat) inputFormat = detectFormat(inputFile, inputText);
  } else {
    // Read from stdin (pipe)
    const stdin = await readStdin();
    if (!stdin) {
      showHelp();
      return;
    }
    inputText = stdin;
    if (!inputFormat) inputFormat = detectFormat(null, inputText);
  }

  // Preview only when the user gave neither --pipe nor --output.
  const hasPipe = args.includes('--pipe') || args.includes('-p');
  if (!hasPipe && outputFormat === null) {
    showPreview(inputText, inputFormat);
    return;
  }
  if (outputFormat === null) outputFormat = 'table';

  // Run pipeline
  const result = run(inputText, inputFormat, pipeline, outputFormat);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
  console.log(result.text);
}

function showPreview(text, format) {
  const { run, serializers } = require('./engine');
  const result = run(text, format, []);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    return;
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
  console.log('  --output json|csv|yaml|xml|table (output format)');
  console.log('');
  console.log('Examples:');
  console.log('  transmute data.json --pipe \'[{"op":"head","n":5}]\' --output csv');
  console.log('  cat data.csv | transmute --pipe \'[{"op":"count"}]\'');
  console.log('  transmute data.yaml --pipe \'[{"op":"pick","fields":["name","email"]}]\'');
}

function showHelp() {
  console.log(`
Transmute — Data Transformer

Usage:
  transmute <file> [options]
  cat <file> | transmute [options]

Options:
  -f, --format <type>    Input format (json, csv, yaml, xml). Auto-detected.
  -p, --pipe <json>      Transformation pipeline as JSON array
  -o, --output <type>    Output format (json, csv, yaml, xml, table). Default: table
  -h, --help             Show this help

Pipeline operations:
  filter   {"op":"filter","expr":"item.age > 18"}
  map      {"op":"map","expr":"({...item, active: true})"}
  pick     {"op":"pick","fields":["name","email"]}
  omit     {"op":"omit","fields":["password"]}
  sort     {"op":"sort","by":"name","dir":"asc"}
  unique   {"op":"unique","by":"email"}
  group    {"op":"group","by":"status"}
  count    {"op":"count"}
  head     {"op":"head","n":10}
  tail     {"op":"tail","n":10}
  rename   {"op":"rename","mapping":{"old_name":"new_name"}}
  flatten  {"op":"flatten","field":"children"}

Examples:
  transmute data.json -p '[{"op":"filter","expr":"item.status === \"active\""}]'
  cat users.csv | transmute -p '[{"op":"head","n":5}]' -o json
  transmute data.yaml -p '[{"op":"sort","by":"name"},{"op":"pick","fields":["name","email"]}]' -o csv
`);
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) resolve('');
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
