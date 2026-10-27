import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
let revision = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? ''
if (!revision) {
  try { revision = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { revision = 'local' }
}
const builtAt = new Date().toISOString()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_LABEL__: JSON.stringify(`v${version} · ${revision.slice(0, 7)}`),
    __BUILD_TIME__: JSON.stringify(builtAt),
  },
})
