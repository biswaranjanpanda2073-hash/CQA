import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const customJdk = 'C:\\Users\\biswa\\.gemini\\antigravity-ide\\brain\\95f61990-9706-4a97-95e5-4dc55ddf1a94\\scratch\\jdk-21.0.6+7';
const env = { ...process.env };
if (existsSync(customJdk)) {
  env.JAVA_HOME = customJdk;
  env.PATH = `${resolve(customJdk, 'bin')};${env.PATH}`;
}

const dataDir = resolve(process.cwd(), 'emulator-data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const args = [
  'firebase',
  'emulators:start',
  '--only',
  'auth,functions,firestore,storage',
  `--import=${dataDir}`,
  `--export-on-exit=${dataDir}`
];

console.log('[Emulator] Starting Firebase Emulator Suite with isolated local storage...');
const child = spawn(npxCmd, args, { stdio: 'inherit', env, shell: true });

child.on('exit', (code) => {
  process.exit(code || 0);
});
