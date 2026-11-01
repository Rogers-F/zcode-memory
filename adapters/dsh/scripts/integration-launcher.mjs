import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ordinary Node cannot read app.asar. Electron's Node mode supplies the ASAR
// filesystem patches. Inherit stdio: sandboxed Windows cannot open pipe handles.
const electron = process.env.DSH_INTEGRATION_ELECTRON ?? 'G:\\DeepSeek Harness\\DeepSeek Harness.exe';
const installed = process.env.DSH_INTEGRATION_ROOT ?? path.join(path.dirname(electron), 'resources', 'app.asar', 'dsh');
const plugin = process.env.DSH_INTEGRATION_PLUGIN;
if (plugin && !path.isAbsolute(plugin)) throw new Error('DSH_INTEGRATION_PLUGIN must be an absolute entry or package directory');
const root = await mkdtemp(path.join(tmpdir(), 'dsh-memory-integration-'));
const home = path.join(root, 'home');
await mkdir(home, { recursive: true });
const platformTemp = path.join(root, 'platform-temp');
await mkdir(platformTemp, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)/i.test(key) && !key.startsWith('DSH_')));
Object.assign(env, {
  ELECTRON_RUN_AS_NODE: '1',
  DSH_INTEGRATION_ROOT: installed,
  DSH_INTEGRATION_TEMP: root,
  ...(plugin ? { DSH_INTEGRATION_PLUGIN: plugin } : {}),
  DSH_HOME: path.join(home, '.dsh'),
  DSH_AGENTS_HOME: path.join(home, '.agents'),
  HOME: home,
  USERPROFILE: home,
  TMP: platformTemp,
  TEMP: platformTemp,
  TMPDIR: platformTemp,
});
const entry = fileURLToPath(new URL(process.argv.includes('--activation-only') ? '../test/integration/plugin-activation.mjs' : '../test/integration/acceptance.mjs', import.meta.url));
try {
  const child = spawn(electron, ['--expose-internals', entry, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
  const deadline = setTimeout(() => {
    console.error('Integration runtime exceeded its 120-second deadline.');
    child.kill();
  }, 120_000);
  deadline.unref();
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1));
    });
    process.exitCode = code;
  } finally { clearTimeout(deadline); }
} finally {
  // Only remove the exact mkdtemp-owned directory, never a caller-supplied path.
  if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('dsh-memory-integration-')) throw new Error('Unsafe temporary cleanup path');
  await rm(root, { recursive: true, force: true });
}
