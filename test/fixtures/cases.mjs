/**
 * Shared fixture cases for the Transmute CLI.
 *
 * Every documented operation has at least one case here, and every case is
 * checked three ways by the test suite:
 *
 *   1. the CLI engine (src/engine.js) and the browser engine (site/engine.js)
 *      must produce byte-identical output for the same fixture,
 *   2. the real CLI, invoked exactly as `command` spells it, must print
 *      `expected` and exit 0,
 *   3. docs/cli.md must contain both the command and its output, so the
 *      documentation cannot drift away from what the tool actually does.
 *
 * `expected` is generated with `npm run snapshots:cli`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = {
  csv: join(here, 'people.csv'),
  json: join(here, 'orders.json'),
  yaml: join(here, 'people.yaml'),
  xml: join(here, 'users.xml')
};

export const fixtureText = (format, file) => readFileSync(file || FIXTURES[format], 'utf-8');

/** A 50-record JSON payload, used to prove the free CLI has no run limits. */
export function bigDataset(records = 50) {
  const rows = [];
  for (let i = 1; i <= records; i++) {
    rows.push({ id: i, name: `person-${i}`, score: (i * 7) % 50, active: i % 3 !== 0 });
  }
  return JSON.stringify(rows, null, 2);
}

export const CASES = [
  {
    name: 'filter',
    docOutput: "    \"age\": 41,",
    op: 'filter',
    fixture: 'csv',
    pipeline: [{ op: 'filter', expr: 'item.age > 26' }],
    outputFormat: 'json',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"filter","expr":"item.age > 26"}]' --output json`
  },
  {
    name: 'map',
    docOutput: "\"label\": \"ALICE\"",
    op: 'map',
    fixture: 'json',
    pipeline: [{ op: 'map', expr: '({...item, label: item.customer.toUpperCase()})' }],
    outputFormat: 'json',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"map","expr":"({...item, label: item.customer.toUpperCase()})"}]' --output json`
  },
  {
    name: 'pick',
    docOutput: "name,city\nAlice,Aarhus",
    op: 'pick',
    fixture: 'yaml',
    pipeline: [{ op: 'pick', fields: ['name', 'city'] }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.yaml --pipe '[{"op":"pick","fields":["name","city"]}]' --output csv`
  },
  {
    name: 'omit',
    docOutput: "name,age,city\nAlice,30,Aarhus",
    op: 'omit',
    fixture: 'csv',
    pipeline: [{ op: 'omit', fields: ['zip', 'active'] }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"omit","fields":["zip","active"]}]' --output csv`
  },
  {
    name: 'sort',
    docOutput: "Carla,41,8000,true,Aarhus",
    op: 'sort',
    fixture: 'csv',
    pipeline: [{ op: 'sort', by: 'age', dir: 'desc' }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"sort","by":"age","dir":"desc"}]' --output csv`
  },
  {
    name: 'unique',
    docOutput: "name,age,zip,active,city\nAlice,30,0074,true,Aarhus",
    op: 'unique',
    fixture: 'csv',
    pipeline: [{ op: 'unique', by: 'age' }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"unique","by":"age"}]' --output csv`
  },
  {
    name: 'group',
    docOutput: "| Aarhus | 2     |",
    op: 'group',
    fixture: 'csv',
    pipeline: [{ op: 'group', by: 'city' }],
    outputFormat: 'table',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"group","by":"city"}]' --output table`
  },
  {
    name: 'count',
    docOutput: "\"count\": 3",
    op: 'count',
    fixture: 'xml',
    pipeline: [{ op: 'count' }],
    outputFormat: 'json',
    command: `transmute test/fixtures/users.xml --pipe '[{"op":"count"}]' --output json`
  },
  {
    name: 'head',
    docOutput: "name,age,zip,active,city\nAlice,30,0074,true,Aarhus",
    op: 'head',
    fixture: 'csv',
    pipeline: [{ op: 'head', n: 2 }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"head","n":2}]' --output csv`
  },
  {
    name: 'tail',
    docOutput: "Carla,41,8000,true,Aarhus\nDaniel,25,2100,true,Odense",
    op: 'tail',
    fixture: 'csv',
    pipeline: [{ op: 'tail', n: 2 }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.csv --pipe '[{"op":"tail","n":2}]' --output csv`
  },
  {
    name: 'rename',
    docOutput: "\"buyer\": \"alice\"",
    op: 'rename',
    fixture: 'json',
    pipeline: [{ op: 'rename', mapping: { customer: 'buyer', total: 'amount' } }],
    outputFormat: 'json',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"rename","mapping":{"customer":"buyer","total":"amount"}}]' --output json`
  },
  {
    name: 'flatten',
    docOutput: "id,sku,qty\n1,a-1,2",
    op: 'flatten',
    fixture: 'json',
    pipeline: [{ op: 'flatten', field: 'items' }, { op: 'pick', fields: ['id', 'sku', 'qty'] }],
    outputFormat: 'csv',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"flatten","field":"items"},{"op":"pick","fields":["id","sku","qty"]}]' --output csv`
  },
  {
    name: 'add',
    docOutput: "\"big\": true",
    op: 'add',
    fixture: 'json',
    pipeline: [{ op: 'add', fields: { lines: 'item.items.length', big: 'item.total > 100' } }],
    outputFormat: 'json',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"add","fields":{"lines":"item.items.length","big":"item.total > 100"}}]' --output json`
  },
  {
    name: 'join',
    docOutput: "| 1  | alice    | paid   |",
    op: 'join',
    fixture: 'json',
    pipeline: [{
      op: 'join',
      on: 'customer',
      keep: 'left',
      with: [
        { customer: 'alice', tier: 'gold' },
        { customer: 'bob', tier: 'silver' }
      ]
    }],
    outputFormat: 'table',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"join","on":"customer","keep":"left","with":[{"customer":"alice","tier":"gold"},{"customer":"bob","tier":"silver"}]}]' --output table`
  },
  {
    name: 'csv-to-json',
    docOutput: "\"zip\": \"0074\"",
    op: null,
    fixture: 'csv',
    pipeline: [],
    outputFormat: 'json',
    command: `transmute test/fixtures/people.csv --output json`
  },
  {
    name: 'yaml-to-csv',
    docOutput: "name,age,city\nAlice,30,Aarhus\nBob,25,Odense\nCarla,41,Aarhus",
    op: null,
    fixture: 'yaml',
    pipeline: [],
    outputFormat: 'csv',
    command: `transmute test/fixtures/people.yaml --output csv`
  },
  {
    name: 'xml-to-json',
    docOutput: "\"age\": \"30\"",
    op: null,
    fixture: 'xml',
    pipeline: [],
    outputFormat: 'json',
    command: `transmute test/fixtures/users.xml --output json`
  },
  {
    name: 'json-to-sql',
    docOutput: "INSERT INTO \"orders\" (\"id\", \"customer\", \"total\") VALUES",
    op: null,
    fixture: 'json',
    pipeline: [{ op: 'pick', fields: ['id', 'customer', 'total'] }],
    outputFormat: 'sql',
    opts: { tableName: 'orders' },
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"pick","fields":["id","customer","total"]}]' --output sql --table orders`
  },
  {
    name: 'json-to-xml',
    docOutput: "    <status>paid</status>",
    op: null,
    fixture: 'json',
    pipeline: [{ op: 'pick', fields: ['id', 'status'] }],
    outputFormat: 'xml',
    command: `transmute test/fixtures/orders.json --pipe '[{"op":"pick","fields":["id","status"]}]' --output xml`
  },
  {
    name: 'json-to-yaml',
    docOutput: "- name: Carla\n  age: 41",
    op: null,
    fixture: 'yaml',
    pipeline: [{ op: 'pick', fields: ['name', 'age'] }, { op: 'sort', by: 'age', dir: 'desc' }],
    outputFormat: 'yaml',
    command: `transmute test/fixtures/people.yaml --pipe '[{"op":"pick","fields":["name","age"]},{"op":"sort","by":"age","dir":"desc"}]' --output yaml`
  },
  {
    name: 'stdin-json',
    docOutput: "id,total\n1,120\n3,250",
    op: null,
    fixture: 'json',
    pipeline: [{ op: 'filter', expr: 'item.status === "paid"' }, { op: 'pick', fields: ['id', 'total'] }],
    outputFormat: 'csv',
    command: `cat test/fixtures/orders.json | transmute --pipe '[{"op":"filter","expr":"item.status === \\"paid\\""},{"op":"pick","fields":["id","total"]}]' --output csv`
  },
  {
    name: 'csv-semicolon',
    docOutput: '"navn": "Mette",',
    op: null,
    fixture: 'csv',
    file: join(here, 'european.csv'),
    pipeline: [{ op: 'sort', by: 'antal', dir: 'desc' }],
    outputFormat: 'json',
    command: `transmute test/fixtures/european.csv --pipe '[{"op":"sort","by":"antal","dir":"desc"}]' --output json`
  },
  {
    name: 'csv-extra-fields',
    docOutput: '"column4": "follow-up"',
    op: null,
    fixture: 'csv',
    file: join(here, 'ragged.csv'),
    pipeline: [],
    outputFormat: 'json',
    // The run succeeds and stdout is exactly the documented JSON; the parser
    // also prints one warning on stderr, which is part of the contract.
    warns: true,
    command: `transmute test/fixtures/ragged.csv --output json`
  },
  {
    name: 'csv-quoting',
    docOutput: 'a-1,"semi; colon"',
    op: null,
    fixture: 'csv',
    file: join(here, 'tricky.csv'),
    pipeline: [],
    outputFormat: 'csv',
    // A value holding any delimiter the reader recognises, plus escaped quotes,
    // is written quoted — so the output survives being read back.
    command: `transmute test/fixtures/tricky.csv --output csv`
  },
  {
    name: 'xml-entities',
    docOutput: '"name": "Tom & Jerry"',
    op: null,
    fixture: 'xml',
    file: join(here, 'entities.xml'),
    pipeline: [],
    outputFormat: 'json',
    // The five predefined entities and numeric references are decoded on the
    // way in, so the escape never compounds across a round trip.
    command: `transmute test/fixtures/entities.xml --output json`
  },
  {
    name: 'yaml-nested',
    docOutput: '"rpm": 600',
    op: null,
    fixture: 'yaml',
    file: join(here, 'nested.yaml'),
    pipeline: [],
    outputFormat: 'json',
    // Three levels of mappings and sequences, a block scalar and a quoted
    // string. A line-for-line reader kept only the two top-level lists, so
    // the whole `service` block was missing from a run that exited 0.
    command: `transmute test/fixtures/nested.yaml --output json`
  }
];
