import { readFile } from 'node:fs/promises';
import { parseClipboard, evaluateRepeatRoute, optimizeBudget } from './engine.mjs';

try {
  const [command, file, ...extra] = process.argv.slice(2);
  if (!['intake', 'repeat', 'optimize'].includes(command) || !file || extra.length) {
    throw new Error('Usage: node poe2-crafting-engine/cli.mjs <intake|repeat|optimize> <input-file>');
  }
  const text = await readFile(file, 'utf8');
  const result = command === 'intake' ? parseClipboard(text)
    : command === 'repeat' ? evaluateRepeatRoute(JSON.parse(text.replace(/^\uFEFF/, '')))
    : optimizeBudget(JSON.parse(text.replace(/^\uFEFF/, '')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
