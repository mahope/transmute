import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const commandPrefix = String.raw`(?:^|[;&|]\s*|\$\(\s*)\s*(?:if\s+[^;\n]+;\s*then\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)?(?:sudo(?:\s+-\S+)*\s+)?`;
const runner = String.raw`(?:npx(?:\s+(?:--(?:yes|no-install|quiet)|-y|--package(?:=\S+|\s+\S+)?|-p(?:\s+\S+)?))*\s+|npm\s+exec(?:\s+(?:--yes|-y|--package(?:=\S+|\s+\S+)?))*\s+(?:--\s+)?|pnpm\s+(?:exec|dlx)(?:\s+--?[^\s]+)*\s+(?:--\s*)?|yarn\s+dlx(?:\s+--?[^\s]+)*\s+|bun(?:x|\s+x)(?:\s+--?[^\s]+)*\s+)?`;
const packageRunner = String.raw`(?:npm|pnpm|yarn|bun)\s+(?:(?:--?[\w-]+)(?:=\S+)?\s+)*(?:run\s+)?`;
const toolPath = String.raw`(?:/?(?:[\w.-]+/)*)`;
const wranglerPattern = String.raw`${runner}${toolPath}wrangler(?:@[^\s]+)?`;
const wranglerPagesPattern = new RegExp(String.raw`${commandPrefix}${wranglerPattern}\s+(?:--[\w-]+(?:=\S+)?\s+)*pages\s+deploy\b`, 'im');
const vercelPattern = new RegExp(String.raw`${commandPrefix}${runner}${toolPath}vercel(?:@[^\s]+)?(?:\s+(?:deploy\b|--prod\b)|(?!\s+(?:inspect|logs|project|projects|whoami|version|help)\b)(?:\s|$))`, 'im');
const shellDeployPattern = new RegExp(String.raw`${commandPrefix}(?:(?:ba|z)?sh)\s+-c\b[\s\S]*?(?:${wranglerPattern}\s+pages\s+deploy\b|${runner}${toolPath}netlify(?:-cli|\.cli)?\s+deploy\b|${runner}${toolPath}vercel(?:\s+deploy\b|\s+--prod\b)|${runner}${toolPath}firebase(?:-tools)?(?:\s+(?:--?[\w-]+)(?:=\S+)?)*\s+(?:hosting:)?deploy\b|${packageRunner}[\w.-]*deploy(?:[-_.:][\w.-]+)?(?:\s|$))`, 'im');

const deployCommands = [
  ['Cloudflare', new RegExp(String.raw`${commandPrefix}${wranglerPattern}\s+(?:(?:--[\w-]+(?:=\S+)?|[\w-]+)\s+)*(?:[\w-]+[-_])?deploy\b`, 'im')],
  ['Netlify', new RegExp(String.raw`${commandPrefix}${runner}${toolPath}netlify(?:-cli|\.cli)?(?:@[^\s]+)?\s+deploy\b`, 'im')],
  ['Vercel', vercelPattern],
  ['Firebase', new RegExp(String.raw`${commandPrefix}${runner}${toolPath}firebase(?:-tools)?(?:@[^\s]+)?\s+(?:(?:--?[\w-]+(?:=[^\s]+)?|\S+)\s+)*(?:hosting:)?deploy\b`, 'im')],
  ['Serverless', new RegExp(String.raw`${commandPrefix}${runner}${toolPath}serverless(?:@[^\s]+)?\s+deploy\b`, 'im')],
  ['Fly.io', new RegExp(String.raw`${commandPrefix}${toolPath}(?:flyctl|fly)(?:\s+deploy\b|\s+apps\s+deploy\b)`, 'im')],
  ['Azure', new RegExp(String.raw`${commandPrefix}${toolPath}az(?:\s+[^;&|\n]+)*\s+deploy\b`, 'im')],
  ['AWS', new RegExp(String.raw`${commandPrefix}${toolPath}aws\s+(?:s3\s+sync|cloudformation\s+deploy)\b`, 'im')],
  ['Google Cloud', new RegExp(String.raw`${commandPrefix}${toolPath}gcloud\s+(?:app|functions|run)\s+deploy\b`, 'im')],
  ['Kubernetes', new RegExp(String.raw`${commandPrefix}${toolPath}kubectl\s+(?:apply|rollout|set\s+image)\b`, 'im')],
  ['Helm', new RegExp(String.raw`${commandPrefix}${toolPath}helm\s+(?:install|upgrade)\b`, 'im')],
  ['package deploy script', new RegExp(String.raw`${commandPrefix}${packageRunner}(?:[\w.-]*[-_.:])?deploy(?:[-_.:][\w.-]+)?(?:\s|$)`, 'im')],
  ['deploy script', new RegExp(String.raw`${commandPrefix}(?:(?:ba|z)?sh\s+)?(?:\.{0,2}\/)?(?:[\w.-]+\/)*[\w.-]*deploy(?![\w.-]*(?:check|verify|test))[\w.-]*(?:\s|$)`, 'im')],
  ['shell deploy script', shellDeployPattern],
  ['make deploy', new RegExp(String.raw`${commandPrefix}${toolPath}make\s+deploy(?:\s|$)`, 'im')],
];

const deployActions = [
  ['actions/deploy-pages', /^actions\/deploy-pages(?:@|$)/i],
  ['Azure/web-apps-deploy', /^azure\/web-apps-deploy(?:@|$)/i],
  ['peaceiris/actions-gh-pages', /^peaceiris\/actions-gh-pages(?:@|$)/i],
  ['softprops/action-gh-pages', /^softprops\/action-gh-pages(?:@|$)/i],
  ['JamesIves/github-pages-deploy-action', /^jamesives\/github-pages-deploy-action(?:@|$)/i],
  ['nwtgck/actions-netlify', /^nwtgck\/actions-netlify(?:@|$)/i],
  ['amondnetlify/vercel-action', /^amondnetlify\/vercel-action(?:@|$)/i],
  ['FirebaseExtended/action-hosting-deploy', /^firebaseextended\/action-hosting-deploy(?:@|$)/i],
  ['crazy-max/ghaction-github-pages', /^crazy-max\/ghaction-github-pages(?:@|$)/i],
  ['Azure/functions-action', /^azure\/functions-action(?:@|$)/i],
];

function stripComment(line) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }

  return line;
}

function unquote(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function stripShellQuotedText(value) {
  const result = [];
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote === '"') {
      if (escaped) {
        result.push(character);
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      } else {
        result.push(/[;&|\n]/.test(character) ? ' ' : character);
      }
      continue;
    }

    if (quote === "'") {
      if (character === quote) {
        quote = null;
      } else {
        result.push(/[;&|\n]/.test(character) ? ' ' : character);
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else {
      result.push(character);
    }
  }

  return result.join('').replace(/\\\r?\n\s*/g, ' ');
}

function indentationOf(line) {
  return line.length - line.trimStart().length;
}

function addField(fields, key, value) {
  const normalized = unquote(value);
  if (normalized && !fields[key].includes(normalized)) {
    fields[key].push(normalized);
  }
}

function isYamlFieldLine(line) {
  return /^\s*(?:-\s*)?["']?[A-Za-z_][\w-]*["']?\s*:/.test(line);
}

function extractEnvValues(lines) {
  const values = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:-\s*)?env\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const inline = match[1].trim();
    if (inline.startsWith('{') && inline.endsWith('}')) {
      for (const entry of inline.slice(1, -1).split(',')) {
        const separator = entry.indexOf(':');
        if (separator !== -1) {
          values.push(unquote(entry.slice(separator + 1)));
        }
      }
      continue;
    }
    if (inline) {
      values.push(unquote(inline));
      continue;
    }

    const baseIndentation = indentationOf(lines[index]);
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === '') {
        continue;
      }
      if (indentationOf(line) <= baseIndentation) {
        break;
      }
      const value = line.match(/^\s*[^:#][^:]*:\s*(.*)$/)?.[1];
      if (!value) {
        continue;
      }
      if (value === '|' || value === '>') {
        const blockLines = [];
        const blockIndentation = indentationOf(lines[next]);
        for (let blockLine = next + 1; blockLine < lines.length; blockLine += 1) {
          const blockText = lines[blockLine];
          if (blockText.trim() === '') {
            blockLines.push('');
            continue;
          }
          if (indentationOf(blockText) <= blockIndentation) {
            break;
          }
          blockLines.push(blockText.trim());
        }
        values.push(blockLines.join(value === '>' ? ' ' : '\n').trim());
        next += blockLines.length;
      } else {
        values.push(unquote(value));
      }
    }
  }

  return values;
}

function extractFields(source) {
  const lines = source.split(/\r?\n/).map(stripComment);
  const fields = { uses: [], run: [], command: [], preCommands: [], postCommands: [], args: [], main: [], image: [], using: [], env: extractEnvValues(lines) };
  const flowField = /(?:^|-\s*|[{,\[]\s*)["']?(uses|run|command|preCommands|postCommands|args|main|image|using)["']?\s*:\s*(?:"([^"]+)"|'([^']+)'|([^,}\]\n]+))/gi;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:-\s*)?(uses|run|command|preCommands|postCommands|args|main|image|using)\s*:\s*(.*)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const rawValue = match[2].trim();
      let value = unquote(rawValue);

      if (rawValue.startsWith('|') || rawValue.startsWith('>')) {
        const baseIndentation = indentationOf(lines[index]);
        const blockLines = [];

        for (let next = index + 1; next < lines.length; next += 1) {
          const line = lines[next];
          if (line.trim() === '') {
            blockLines.push('');
            continue;
          }
          if (indentationOf(line) <= baseIndentation) {
            break;
          }
          blockLines.push(line.trim());
        }

        value = blockLines.join(rawValue.startsWith('>') ? ' ' : '\n').trim();
      } else if (rawValue) {
        const baseIndentation = indentationOf(lines[index]);
        const continuationLines = [];

        for (let next = index + 1; next < lines.length; next += 1) {
          const line = lines[next];
          if (line.trim() === '') {
            continue;
          }
          if (indentationOf(line) <= baseIndentation || isYamlFieldLine(line)) {
            break;
          }
          continuationLines.push(line.trim());
        }

        if (continuationLines.length > 0) {
          value = `${value.replace(/\\\s*$/, '')} ${continuationLines.join(' ')}`.trim();
        }
      }

      addField(fields, key.toLowerCase(), value);
    }

    for (const flowMatch of lines[index].matchAll(flowField)) {
      addField(fields, flowMatch[1].toLowerCase(), flowMatch[2] || flowMatch[3] || flowMatch[4]);
    }
  }

  return fields;
}

function hasInlinePush(value) {
  const normalized = value.replace(/["']/g, '').trim();
  if (/^push(?:\s|$)/i.test(normalized)) {
    return true;
  }
  if (!/^[\[{]/.test(normalized)) {
    return false;
  }

  let depth = 0;
  let start = 1;
  const hasPushEntry = entry => /^-?\s*push(?:\s*:|,|$)/i.test(entry.trim());

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '[' || character === '{') {
      if (depth === 0) {
        start = index + 1;
      }
      depth += 1;
      continue;
    }
    if (character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) {
        if (hasPushEntry(normalized.slice(start, index))) {
          return true;
        }
      }
      continue;
    }
    if (character === ',' && depth === 1) {
      if (hasPushEntry(normalized.slice(start, index))) {
        return true;
      }
      start = index + 1;
    }
  }

  return false;
}

function hasUnsupportedEventSyntax(value) {
  return /(?:^|\s)[&*!][^\s]+/.test(value);
}

function hasUnsupportedCommandSyntax(value) {
  return /^(?:[&*!][^\s]+)(?:\s|$)/.test(value.trim());
}

function hasPushTrigger(source) {
  const lines = source.split(/\r?\n/).map(stripComment);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(on|["']on["'])\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const inline = match[3].trim();
    if (hasUnsupportedEventSyntax(inline) || (inline && hasInlinePush(inline))) {
      return true;
    }

    const onIndentation = match[1].length;
    let eventIndentation = null;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === '') {
        continue;
      }
      const indentation = indentationOf(line);
      if (indentation <= onIndentation) {
        break;
      }
      if (eventIndentation === null) {
        eventIndentation = indentation;
      }
      if (indentation !== eventIndentation) {
        continue;
      }
      if (hasUnsupportedEventSyntax(line.trim()) || hasInlinePush(line.trim()) || /^(?:-\s*)?["']?push["']?\s*(?::|$)/i.test(line.trim())) {
        return true;
      }
    }
  }

  return false;
}

function normalizedFieldValue(value) {
  return unquote(String(value).trim()).replace(/["']/g, '').replace(/^\[|\]$/g, '').trim();
}

function hasDeployArgument(fields) {
  return fields.args.some(value => /(?:^|[\s,;\[\]])\s*deploy\b/i.test(normalizedFieldValue(value)));
}

function hasUnresolvedPagesArguments(fields) {
  return fields.args.some(value => {
    const normalized = normalizedFieldValue(value);
    return /\$\{\{/.test(normalized) || !/^project\s*,?\s*list\b/i.test(normalized);
  });
}

function isCloudflarePagesAction(value) {
  return /^cloudflare\/pages(?:-deploy)?-action(?:@|$)/i.test(value);
}

function isCloudflareWranglerAction(value) {
  return /^cloudflare\/wrangler-action(?:@|$)/i.test(value);
}

function isPagesDeployment(source, fields) {
  const cleanSource = source.split(/\r?\n/).map(stripComment).join('\n');
  if (fields.uses.some(isCloudflarePagesAction)) {
    return true;
  }
  if (fields.uses.some(isCloudflareWranglerAction) && (
    fields.command.some(value => /^pages\s+deploy\b/i.test(normalizedFieldValue(value)))
    || hasDeployArgument(fields)
    || fields.command.some(value => /^deploy\b/i.test(normalizedFieldValue(value)))
    || fields.command.some(value => /^pages\b/i.test(normalizedFieldValue(value)) && (hasDeployArgument(fields) || hasUnresolvedPagesArguments(fields)))
    || fields.command.some(value => /\$\{\{/.test(normalizedFieldValue(value)))
  )) {
    return true;
  }
  return fields.run.some(value => wranglerPagesPattern.test(stripShellQuotedText(value)))
    || fields.env.some(value => wranglerPagesPattern.test(stripShellQuotedText(value)))
    || [...fields.preCommands, ...fields.postCommands].some(value => wranglerPagesPattern.test(stripShellQuotedText(value)))
    || /(?:^|-\s*)uses\s*:\s*["']?cloudflare\/wrangler-action(?:@|$)/im.test(cleanSource)
      && /\bcommand\s*:\s*["']?pages\s+deploy\b/im.test(cleanSource);
}

function isLocalReference(value) {
  return /^\.{0,2}\//.test(value);
}

function isDeployAction(value) {
  if (deployActions.some(([, pattern]) => pattern.test(value))) {
    return true;
  }
  if (isLocalReference(value)) {
    return /(?:^|\/)deploy(?:[-_.][\w.-]*)?(?:\/|$)/i.test(value);
  }
  return /(?:^|\/)[^/]*deploy(?:[-_.][\w.-]*)?(?:@|$)/i.test(value);
}

function isNonInspectableAction(fields) {
  return fields.using.length > 0
    && !fields.using.some(value => /^composite$/i.test(normalizedFieldValue(value)));
}

function isDeployNamedValue(value) {
  return /(?:^|[/\\])deploy(?:[._/-]|$)/i.test(normalizedFieldValue(value));
}

function isNonDeployWranglerCommand(value) {
  const normalized = normalizedFieldValue(value);
  return normalized !== ''
    && !/\$\{\{/.test(normalized)
    && /^(?:d1\s+execute\s+.*\b(?:select|explain)\b|whoami|pages\s+project\s+list)\b/i.test(normalized)
    && !/\b(?:insert|update|delete|replace|drop|alter|create|truncate)\b/i.test(normalized);
}

function findDirectPushDeploy(fields) {
  for (const [name, pattern] of deployActions) {
    if (fields.uses.some(value => pattern.test(value))) {
      return name;
    }
  }

  if (fields.uses.some(isCloudflareWranglerAction)
    && (fields.command.length === 0
      || fields.command.some(value => !isNonDeployWranglerCommand(value))
      || hasDeployArgument(fields))) {
    return 'Cloudflare Wrangler action';
  }

  if (fields.uses.some(isDeployAction)) {
    return 'deploy action';
  }

  if (fields.main.some(isDeployNamedValue)) {
    return 'local deploy action';
  }

  if (fields.image.some(isDeployNamedValue)) {
    return 'container deploy action';
  }

  for (const [label, pattern] of deployCommands) {
    if ([...fields.run, ...fields.env].some(value => pattern.test(stripShellQuotedText(value)))) {
      return label;
    }
  }

  return null;
}

function inspectWorkflow(workflow, inheritedPush, resolveLocal, visited) {
  const pushEnabled = inheritedPush || hasPushTrigger(workflow.source);
  const visitKey = `${workflow.file}\0${pushEnabled}`;
  if (visited.has(visitKey)) {
    return null;
  }
  visited.add(visitKey);

  const fields = extractFields(workflow.source);
  if (fields.run.some(hasUnsupportedCommandSyntax)) {
    return { file: workflow.file, reason: 'unresolved shell command' };
  }

  if (isPagesDeployment(workflow.source, fields)) {
    return { file: workflow.file, reason: 'Cloudflare Pages deployment' };
  }

  if (pushEnabled) {
    const directDeploy = findDirectPushDeploy(fields);
    if (directDeploy) {
      return { file: workflow.file, reason: directDeploy };
    }
    if (isNonInspectableAction(fields)) {
      return { file: workflow.file, reason: 'local runtime action' };
    }
  }

  for (const reference of fields.uses) {
    if (!isLocalReference(reference)) {
      continue;
    }

    const local = resolveLocal(reference, workflow);
    if (!local) {
      if (pushEnabled) {
        return { file: workflow.file, reason: `unresolved local reference ${reference}` };
      }
      continue;
    }

    const violation = inspectWorkflow(local, pushEnabled, resolveLocal, visited);
    if (violation) {
      return violation;
    }
  }

  return null;
}

export function findWorkflowViolations(workflows, options = {}) {
  const resolveLocal = options.resolveLocal
    ?? ((reference, workflow) => workflow.localSources?.[reference] ?? null);
  const violations = [];
  const seen = new Set();

  for (const workflow of workflows) {
    const violation = inspectWorkflow(workflow, false, resolveLocal, new Set());
    if (!violation) {
      continue;
    }
    const key = `${violation.file}\0${violation.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      violations.push(violation);
    }
  }

  return violations;
}

function loadWorkflows(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map(entry => ({
      file: entry.name,
      source: readFileSync(join(directory, entry.name), 'utf8'),
    }));
}

export function createLocalResolver(root) {
  const rootPath = realpathSync(root);

  return reference => {
    if (!isLocalReference(reference)) {
      return null;
    }

    const target = resolve(root, reference);
    const targetRelative = relative(rootPath, target);
    if (targetRelative.startsWith('..') || isAbsolute(targetRelative)) {
      return null;
    }

    const candidates = [
      target,
      `${target}.yml`,
      `${target}.yaml`,
      join(target, 'action.yml'),
      join(target, 'action.yaml'),
    ];

    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue;
      }
      try {
        if (!statSync(candidate).isFile()) {
          continue;
        }
        const candidatePath = realpathSync(candidate);
        const candidateRelative = relative(rootPath, candidatePath);
        if (candidateRelative.startsWith('..') || isAbsolute(candidateRelative)) {
          return null;
        }
        return {
          file: relative(rootPath, candidatePath),
          source: readFileSync(candidatePath, 'utf8'),
        };
      } catch {
        return null;
      }
    }

    return null;
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const root = resolve(dirname(scriptPath), '..');
  const workflows = loadWorkflows(resolve(root, '.github/workflows'));
  const violations = findWorkflowViolations(workflows, { resolveLocal: createLocalResolver(root) });

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}: forbidden ${violation.reason}`);
    }
    process.exit(1);
  }

  console.log(`Workflow deploy contract: ${workflows.length} workflows passed.`);
}
