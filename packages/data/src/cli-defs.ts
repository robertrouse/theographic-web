/**
 * `npm run data:definitions -- <command>` — the generated-definitions pipeline.
 *
 *   submit  [--kind person|place|event] [--limit N] [--slugs a,b] [--dry-run N]
 *           [--preview]        build the batch; --preview prints the requests'
 *                              user messages instead of submitting (no network)
 *   collect <batchId> [--poll-ms N] [--out path]
 *                              wait for the batch, check every result, merge into
 *                              the definitions file (or --out)
 *   check   [path]             run the citation checker over a definitions file
 *   ground  <slug>             print one entity's grounding as the model sees it
 *
 * Credentials: `new Anthropic()` reads ANTHROPIC_API_KEY or an `ant auth login`
 * profile. Nothing here prints or stores a key.
 */
import { parseArgs } from 'node:util';
import { checkDefinition } from './definitions/check.js';
import { buildGroundContext, ground, kindOf, type GroundKind } from './definitions/ground.js';
import { definitionsPath, readDefinitions } from './definitions/merge.js';
import { buildUserMessage, SYSTEM_PROMPT } from './definitions/prompt.js';
import {
  collect,
  readRecord,
  sdkBatchClient,
  selectTargets,
  submit,
  type SelectOptions,
} from './definitions/run.js';
import { loadNormalized } from './load.js';
import { NormalizeError } from './normalize.js';

const log = (s: string): void => console.log(s);

export interface DefsArgs {
  command: string;
  positional: string[];
  kind?: GroundKind;
  limit?: number;
  slugs?: string[];
  dryRun?: number;
  preview: boolean;
  pollMs?: number;
  out?: string;
}

const KINDS: ReadonlySet<string> = new Set(['person', 'place', 'event']);

export function parseDefsArgs(argv: string[]): DefsArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      kind: { type: 'string' },
      limit: { type: 'string' },
      slugs: { type: 'string' },
      'dry-run': { type: 'string' },
      preview: { type: 'boolean', default: false },
      'poll-ms': { type: 'string' },
      out: { type: 'string' },
    },
  });
  const [command = 'help', ...positional] = positionals;
  const int = (name: string, v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  if (values.kind !== undefined && !KINDS.has(values.kind)) {
    throw new Error(`--kind must be person, place or event`);
  }
  const out: DefsArgs = { command, positional, preview: values.preview };
  if (values.kind !== undefined) out.kind = values.kind as GroundKind;
  const limit = int('limit', values.limit);
  if (limit !== undefined) out.limit = limit;
  if (values.slugs !== undefined) {
    out.slugs = values.slugs
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const dryRun = int('dry-run', values['dry-run']);
  if (dryRun !== undefined) out.dryRun = dryRun;
  const pollMs = int('poll-ms', values['poll-ms']);
  if (pollMs !== undefined) out.pollMs = pollMs;
  if (values.out !== undefined) out.out = values.out;
  return out;
}

function selectOptions(a: DefsArgs): SelectOptions {
  const o: SelectOptions = {};
  if (a.kind) o.kind = a.kind;
  if (a.limit !== undefined) o.limit = a.limit;
  if (a.slugs) o.slugs = a.slugs;
  if (a.dryRun !== undefined) o.dryRun = a.dryRun;
  return o;
}

async function main(argv: string[]): Promise<number> {
  const a = parseDefsArgs(argv);
  if (a.command === 'help') {
    console.log('commands: submit | collect <batchId> | check [path] | ground <slug>');
    return 0;
  }
  let n;
  try {
    ({ n } = await loadNormalized(log));
  } catch (e) {
    if (e instanceof NormalizeError) {
      console.error(`normalize: ${e.message}`);
      return 1;
    }
    throw e;
  }
  const ctx = buildGroundContext(n);
  const file = a.out ?? definitionsPath();

  switch (a.command) {
    case 'ground': {
      const slug = a.positional[0];
      if (!slug) throw new Error('ground <slug>');
      const kind = kindOf(slug, ctx);
      if (!kind) throw new Error(`unknown slug ${slug}`);
      console.log(buildUserMessage(ground(kind, slug, ctx)));
      return 0;
    }
    case 'submit': {
      const existing = await readDefinitions(file);
      const opts = { ...selectOptions(a), existing };
      if (a.preview) {
        const targets = selectTargets(ctx, opts);
        console.log(`--- system (${SYSTEM_PROMPT.length} chars) ---\n${SYSTEM_PROMPT}\n`);
        for (const t of targets) {
          console.log(
            `--- ${t.kind} ${t.slug} ---\n${buildUserMessage(ground(t.kind, t.slug, ctx))}\n`,
          );
        }
        console.log(`${targets.length} request(s); none submitted (--preview)`);
        return 0;
      }
      const { record } = await submit(sdkBatchClient(), ctx, { ...opts, log });
      console.log(`next: npm run data:definitions -- collect ${record.batchId}`);
      return 0;
    }
    case 'collect': {
      const batchId = a.positional[0];
      if (!batchId) throw new Error('collect <batchId>');
      const record = await readRecord(batchId);
      const opts: Parameters<typeof collect>[3] = { log, mergeInto: file };
      if (a.pollMs !== undefined) opts.pollMs = a.pollMs;
      const r = await collect(sdkBatchClient(), ctx, record, opts);
      console.log(
        `${r.rows.length} rows; ${r.failed.length} failed checks; ${r.missing.length} missing`,
      );
      for (const f of r.failed) console.log(`  FAIL ${f.slug}: ${f.problems.join('; ')}`);
      for (const m of r.missing) console.log(`  MISSING ${m.slug}: ${m.reason}`);
      const u = r.usage;
      console.log(
        `usage: ${u.input} input (+${u.cacheRead} cache read, ${u.cacheWrite} cache write), ${u.output} output tokens`,
      );
      return r.missing.length > 0 ? 1 : 0;
    }
    case 'check': {
      const path = a.positional[0] ?? file;
      const rows = await readDefinitions(path);
      let failures = 0;
      for (const row of rows) {
        const c = checkDefinition(row, ctx);
        if (!c.ok) {
          failures++;
          console.log(`  FAIL ${row.slug}: ${c.problems.join('; ')}`);
        }
      }
      console.log(`${rows.length} rows checked, ${failures} failure(s) in ${path}`);
      return failures > 0 ? 1 : 0;
    }
    default:
      console.error(`unknown command: ${a.command}`);
      return 2;
  }
}

// Only run when executed directly, so tests can import `parseDefsArgs`.
if (process.argv[1] && /cli-defs\.(ts|js)$/.test(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
