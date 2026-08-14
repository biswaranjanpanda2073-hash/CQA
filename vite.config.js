import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ─── Plugin: stamp build timestamp into sw.js on every build ───
// This guarantees the browser detects a changed SW file after each deploy.
function swTimestampPlugin() {
  return {
    name: 'sw-timestamp',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const ts = Date.now();
      let content = fs.readFileSync(swPath, 'utf-8');
      // Replace the static cache name with a timestamped one
      content = content.replace(
        /const CACHE_NAME = ['"]cqa-mes-v1['"]/,
        `const CACHE_NAME = 'cqa-mes-v${ts}'`
      );
      fs.writeFileSync(swPath, content, 'utf-8');
      console.log(`[sw-timestamp] Cache name stamped → cqa-mes-v${ts}`);
    }
  };
}

export default defineConfig({
  plugins: [react(), swTimestampPlugin()],
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    allowedHosts: true
  }
})