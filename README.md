# Transmute

[![Tests](https://github.com/mahope/transmute/actions/workflows/build.yml/badge.svg)](https://github.com/mahope/transmute/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/badge/install-npx%20%40mahope%2Ftransmute-CB3837)](https://github.com/mahope/transmute#install--run)

Cross-platform CLI data transformer — JSON, CSV, YAML, XML. Filter, sort, map, pick, omit, unique and convert between formats. Zero dependencies, runs anywhere Node.js runs (macOS, Windows, Linux).

[![Tests](https://github.com/mahope/transmute/actions/workflows/build.yml/badge.svg)](https://github.com/mahope/transmute/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Transmute** is also a cross-platform **desktop app** (macOS, Windows, Linux) with a visual pipeline builder — free tier: 3 transformations per launch, [$19 one-time Pro license](https://buy.stripe.com/eVqbJ0dvdbaW55cgN9bMQ02) for up to 3 machines.

## Install / run

```bash
npx @mahope/transmute people.csv --output json
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
- `-o, --output <type>` — output format: json, csv, yaml, xml, table, sql (default: table)
- `--out <file>` — write the output to a file instead of stdout
- `--table <name>` — table name for SQL output (default `my_table`)
- `-v, --version`, `-h, --help`

Exit codes: `0` success, `1` the transformation failed, `2` usage error, `3`
input error (missing or unparseable file). Errors go to stderr; stdout stays
empty on failure, so redirects never leave half-written files behind.

**Full reference: [docs/cli.md](docs/cli.md)** — every operation with a fixture
and its exact output, the coercion rules, and script examples. The examples
are executed by `npm test`, so the docs cannot drift from the code.

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
| group | `{"op":"group","by":"city"}` |
| add | `{"op":"add","fields":{"total":"item.price * item.qty"}}` |
| join | `{"op":"join","on":"id","keep":"left","with":[...]}` |
| rename | `{"op":"rename","mapping":{"qty":"quantity"}}` |
| flatten | `{"op":"flatten","field":"items"}` |
| head / tail / count | `{"op":"head","n":5}` · `{"op":"count"}` |

## Tests

```bash
npm test        # engine unit tests, real CLI runs, and CLI-vs-browser conformance
npm run check:site
```

`npm test` also asserts that the CLI engine and the browser engine on
transmute.run produce identical output for every documented example, and that
`docs/cli.md` still matches what the code does.

## Why Transmute?

- **Private by default** — everything runs locally, your data never touches a server
- **Zero dependencies** — one Node.js file, no install bloat
- **Pipelines** — chain filter → map → sort → convert in a single pass
- **Cross-platform** — macOS, Windows, Linux

## Releasing

`npm run release -- patch` (or `minor`/`major`) bumps the version, commits and pushes the tag.
CI publishes to npm and creates the GitHub release.

## License

MIT (CLI and engine). The desktop app's Pro license is sold via Stripe; activation goes through the Mahope license server at `mahope.tools`.

Like the project? [Support open source](https://donate.stripe.com/7sYeVcbn50wieFM8gDbMQ0c).

## Open source and Pro

The CLI in this repository is open source (MIT). Transmute Desktop is a paid, closed-source app: download it from https://transmute.run/ and unlock it with your license key.
