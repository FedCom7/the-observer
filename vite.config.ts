import { spawn } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * While the dev server runs, refresh public/data with the collectors:
 * once at start, then every 30 minutes. In production a scheduled
 * GitHub Actions job does the same (see .github/workflows/collect.yml).
 */
function collectors(): Plugin {
  let timer: NodeJS.Timeout | undefined;
  const run = () => {
    const child = spawn(process.execPath, ['scripts/collect/index.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.on('close', () => console.log(`[collect] ${new Date().toLocaleTimeString('en-GB')} ${out.replace(/\s+/g, ' ').trim()}`));
  };
  return {
    name: 'observer-collectors',
    apply: 'serve',
    configureServer() {
      run();
      // Every 30 minutes, or every 5 on US election night (3-4 Nov 2026, Rome time).
      let last = Date.now();
      timer = setInterval(() => {
        const t = Date.now();
        const night = t >= Date.parse('2026-11-03T12:00:00+01:00') && t < Date.parse('2026-11-05T12:00:00+01:00');
        if (t - last >= (night ? 5 : 30) * 60e3) { last = t; run(); }
      }, 60e3);
    },
    buildEnd() {
      clearInterval(timer);
    },
  };
}

export default defineConfig({
  plugins: [react(), collectors()],
});
