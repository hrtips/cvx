// Test + coverage config. Kept separate from vite.config.js (the framework
// build file) so the "hostile" per-file coverage gate lives on its own.
// Vitest resolves this file ahead of vite.config.js and we merge the vite
// plugins (react, yaml) back in so test transforms match the real build.
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        // Coverage universe = shipped runtime only. src/main.jsx is the browser
        // dev-preview entry (absent from package.json "files"), never published,
        // and unit-testing a Vite mount harness has ~zero value — excluded by
        // scoping, not by threshold waiver.
        include: ['src/**/*.js', 'src/**/*.jsx', 'bin/**/*.js'],
        exclude: ['src/main.jsx'],
        reporter: ['text', 'html', 'lcov', 'json-summary'],
        // Per-file, no exceptions: every file in the universe must clear the bar
        // on its own — no global averaging to hide a weak file behind strong ones.
        thresholds: {
          perFile: true,
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85
        }
      }
    }
  })
)
