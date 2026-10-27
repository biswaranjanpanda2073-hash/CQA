import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import net from 'node:net';

import { existsSync } from 'node:fs';

const isWin = process.platform === 'win32';
const env = { ...process.env };

// Auto-detect JDK 21 if JAVA_HOME is not set
if (!env.JAVA_HOME && isWin) {
  const localJdk = 'C:\\Users\\biswa\\.gemini\\antigravity-ide\\brain\\95f61990-9706-4a97-95e5-4dc55ddf1a94\\scratch\\jdk-21.0.6+7';
  if (existsSync(localJdk)) {
    env.JAVA_HOME = localJdk;
  }
}

if (env.JAVA_HOME) {
  env.PATH = `${resolve(env.JAVA_HOME, 'bin')}${isWin ? ';' : ':'}${env.PATH}`;
}

function checkPortInUse(port) {
  return new Promise((res) => {
    const server = net.createServer()
      .once('error', (err) => res(err.code === 'EADDRINUSE'))
      .once('listening', () => server.once('close', () => res(false)).close())
      .listen(port, '127.0.0.1');
  });
}

const portInUse = await checkPortInUse(8080);
let child;

if (portInUse) {
  console.log('[test:rules] Firestore emulator detected running on port 8080. Running tests directly...');
  const nodeCmd = isWin ? 'node.exe' : 'node';
  child = spawn(nodeCmd, ['tests/firestore.rules.test.js'], { stdio: 'inherit', env });
} else {
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  const scriptArg = '"node tests/firestore.rules.test.js"';
  child = spawn(
    npxCmd,
    ['firebase', 'emulators:exec', '--only', 'firestore', scriptArg],
    { stdio: 'inherit', env, shell: true }
  );
}

child.on('exit', (code) => {
  process.exit(code || 0);
});
