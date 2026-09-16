/**
 * `npm run data` entry point. Subcommands land in CP-01:
 *   fetch  — pull json/ from theographic-bible-metadata at the SHA in data.lock
 *   build  — normalize, index, gate, and write apps/web/public/data/
 *   gate   — run the sanity gate against an existing build
 */
import { VERSION } from '@theographic/core';

const [, , command = 'build'] = process.argv;

switch (command) {
  case 'fetch':
  case 'build':
  case 'gate':
    console.log(
      `@theographic/data ${command}: not implemented yet (core ${VERSION}). See docs/checkpoints/CP-01-data-pipeline.md`,
    );
    break;
  default:
    console.error(`unknown command: ${command}`);
    process.exit(2);
}
