// Test + coverage config. Kept separate from vite.config.js (the framework
// build file) so the "hostile" per-file coverage gate lives on its own.
// Vitest resolves this file ahead of vite.config.js and we merge the vite
// plugins (react, yaml) back in so test transforms match the real build.
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Never discover tests inside git worktrees (subagents create them under
      // .claude/worktrees/); they duplicate the suite and break coverage counts.
      exclude: [...configDefaults.exclude, '.claude/**', '**/.claude/**'],
      coverage: {
        provider: 'v8',
        // Coverage universe = shipped runtime only. src/main.jsx is the browser
        // dev-preview entry (absent from package.json "files"), never published,
        // and unit-testing a Vite mount harness has ~zero value — excluded by
        // scoping, not by threshold waiver.
        include: ['src/**/*.js', 'src/**/*.jsx', 'bin/**/*.js'],
        exclude: ['src/main.jsx'],
        reporter: ['text', 'html', 'lcov', 'json-summary'],
        // Per-file, no averaging: every file in the universe must clear the bar
        // on its own. The `**` glob applies it to all files; the one documented
        // exception below is scoped and justified, not a global relaxation.
        thresholds: {
          '**': {
            lines: 90,
            functions: 90,
            statements: 90,
            branches: 85
          },
          // validateContent.js's mapAjvErrors() formats a message for EVERY
          // JSON-Schema violation keyword (required/type/enum/const/minimum/
          // minLength/oneOf/additionalProperties). Every keyword line carries a
          // `path: instancePath || '(root)'` secondary branch; covering all of
          // them needs a root-level error of each keyword — a combinatorial
          // matrix of formatting-only code with negligible bug risk. Its lines/
          // functions/statements still hold the full 90%; only the branch bar is
          // scoped, and the real validation paths are all exercised.
          'src/pdf/validateContent.js': {
            lines: 90,
            functions: 90,
            statements: 90,
            branches: 80
          }
        }
      }
    }
  })
)
