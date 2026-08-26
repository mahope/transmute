# Transmute

[![Tests](https://github.com/mahope/transmute/actions/workflows/build.yml/badge.svg)](https://github.com/mahope/transmute/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/badge/install-npx%20github:mahope%2Ftransmute-CB3837)](https://github.com/mahope/transmute#install--run)

Cross-platform CLI data transformer — JSON, CSV, YAML, XML. Filter, sort, map, pick, omit, unique and convert between formats. Zero dependencies, runs anywhere Node.js runs (macOS, Windows, Linux).

Part of [Transmute](https://auditedwp.pages.dev/transmute/) — the desktop data transformer.

## Install / run

```bash
npx github:mahope/transmute people.csv --output json
```

Or clone and run locally:

```bash
git clone https://github.com/mahope/transmute.git
cd transmute
npm link        # makes `transmute` available globally
```

## Usage

```bash
transmute <file> [options]
cat <file> | transmute [options]
```

Options:

- `-f, --format <type>` — input format: json, csv, yaml, xml (auto-detected)
- `-p, --pipe <json>` — transformation pipeline as a JSON array
- `-o, --output <type>` — output format: json, csv, yaml, xml, table (default: table)

## Examples

```bash
# CSV → JSON with type coercion (numbers stay numbers)
transmute people.csv -o json

# Filter and sort in one pass
transmute people.csv --pipe '[{"op":"filter","expr":"item.age > 26"},{"op":"sort","by":"age","dir":"desc"}]' -o csv

# YAML → JSON from stdin
cat config.yaml | transmute --format yaml --output json

# JSON → XML
echo '{"a":1}' | transmute --output xml
```

## Pipeline operations

| Op | Example |
|----|---------|
| filter | `{"op":"filter","expr":"item.age > 18"}` |
| map | `{"op":"map","expr":"({...item, active: true})"}` |
| pick | `{"op":"pick","fields":["name","email"]}` |
| omit | `{"op":"omit","fields":["password"]}` |
| sort | `{"op":"sort","by":"name","dir":"asc"}` |
| unique | `{"op":"unique","by":"email"}` |

## Tests

```bash
node test/test.js
```

## License

MIT
