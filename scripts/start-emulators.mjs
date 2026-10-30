import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const jdkCandidates = [
  'C:\\Users\\biswa\\.gemini\\antigravity-ide\\scratch\\jdk21\\jdk-21.0.4+7',
  'C:\\Users\\biswa\\.gemini\\antigravity-ide\\brain\\95f61990-9706-4a97-95e5-4dc55ddf1a94\\scratch\\jdk-21.0.6+7'
];
const customJdk = jdkCandidates.find(p => existsSync(p)) || '';
const env = { ...process.env };
if (customJdk) {
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
  'auth,firestore,storage',
  `--import=${dataDir}`,
  `--export-on-exit=${dataDir}`
];

console.log('[Emulator] Starting Firebase Emulator Suite with isolated local storage...');
const child = spawn(npxCmd, args, { stdio: 'inherit', env, shell: true });

// Start local Functions Express server on port 5001
const serverProcess = spawn('node', ['functions/server.js'], { stdio: 'inherit', env, shell: true });

child.on('exit', (code) => {
  serverProcess.kill();
  process.exit(code || 0);
});

serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`[Server] Functions API server exited with code ${code}`);
  }
});
