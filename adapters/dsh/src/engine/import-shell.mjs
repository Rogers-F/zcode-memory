// SPDX-License-Identifier: Apache-2.0
// Maintainer helper for the DSH port: regenerate the verbatim Apache-2.0 ZCode shell policy implementation.
// Only writes previously absent src/engine/shell files; never touches host configuration.
import { stripTypeScriptTypes } from 'node:module';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Pass ZCode packages/core/src/tool/handlers');
const target = new URL('./shell/', import.meta.url);
await mkdir(new URL('./guarded/', target), {recursive:true});
const files = (await readdir(root)).filter(name => name.startsWith('bash-readonly-') && name.endsWith('.ts'));
files.push('bash-command-parser.ts', 'bash-git-runtime-safety.ts', 'bash-semantics.ts', 'guarded/word.ts');
for (const file of files) {
  const source = await readFile(join(root,file), 'utf8');
  const banner = `/**\n * SPDX-License-Identifier: Apache-2.0\n * Derived from ZCode apps/zcode-cli/packages/core/src/tool/handlers/${file}.\n * Modifications: TypeScript types erased for the standalone DSH JavaScript ESM port.\n * Original runtime behavior retained. See package LICENSE/NOTICE for attribution.\n */\n`;
  await writeFile(new URL(file.replace(/\.ts$/,'.js'),target), banner + stripTypeScriptTypes(source, {mode:'strip'}), {flag:'wx'});
}
console.log(`Ported ${files.length} shell policy files.`);
for (const file of files) console.log(file);
