import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const customJdk = 'C:\\Users\\biswa\\.gemini\\antigravity-ide\\brain\\95f61990-9706-4a97-95e5-4dc55ddf1a94\\scratch\\jdk-21.0.6+7';
const env = { ...process.env };
if (existsSync(customJdk)) {
  env.JAVA_HOME = customJdk;
  env.PATH = `${resolve(customJdk, 'bin')};${env.PATH}`;
}

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const scriptArg = isWin ? '"node tests/firestore.rules.test.js"' : 'node tests/firestore.rules.test.js';

const child = spawn(
  npxCmd,
  ['firebase', 'emulators:exec', '--only', 'firestore', scriptArg],
  { stdio: 'inherit', env, shell: true }
);

child.on('exit', (code) => {
  process.exit(code || 0);
});
