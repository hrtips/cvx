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
        // Per-file, no averaging, NO EXCEPTIONS: every file in the universe
        // must clear the bar on its own.
        //
        // `perFile: true` is what makes that true, and it was missing. Without
        // it a glob threshold is checked against the AGGREGATE of the files it
        // matches, so `**` was one project-wide average wearing the name of a
        // per-file rule — src/pdf/sections/ContactSection.jsx sat at 75%
        // branches under a declared 85% bar and the gate still exited 0. The
        // README has claimed "per-file, no averaging" since the hostile-build
        // track; this is the line that makes the claim true.
        //
        // There used to be a scoped waiver here dropping
        // src/pdf/validateContent.js to 80% branches. `perFile: true` also
        // made that waiver UNENFORCEABLE — every matching glob is checked
        // independently, so a file-specific entry can only ever be stricter
        // than `**`, never looser (setting its bar to 0 still failed against
        // `**`). It was earned out instead: the uncovered branches were the
        // oneOf/type-mismatch reporting path, the unreadable-file fallbacks,
        // the layout-file findings and the unforced page-overflow warning, all
        // now covered by tests in src/pdf/validateContent.test.js.
        thresholds: {
          perFile: true,
          '**': {
            lines: 90,
            functions: 90,
            statements: 90,
            branches: 85
          }
        }
      }
    }
  })
)
