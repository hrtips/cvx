/**
 * build-lib.js
 * Transform-only build for publishing: src/pdf → lib/pdf, Lato fonts → lib/fonts.
 *
 * Deliberately NOT a bundle: theme auto-discovery scans lib/pdf/themes/ with
 * fs at runtime, so the module structure must survive publishing file-for-file.
 * esbuild only strips JSX (automatic runtime — the components never import
 * React) and we retarget .jsx import specifiers to the emitted .js files.
 *
 * Run:  npm run build:lib
 */
import { transform } from 'esbuild'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'fs'
import { join, dirname, relative, extname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src', 'pdf')
const LIB = join(root, 'lib')

rmSync(LIB, { recursive: true, force: true })

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

let count = 0
for (const file of walk(SRC)) {
  const ext = extname(file)
  if (!['.js', '.jsx'].includes(ext)) continue
  if (file.endsWith('.test.js')) continue

  const { code } = await transform(readFileSync(file, 'utf8'), {
    loader: ext === '.jsx' ? 'jsx' : 'js',
    jsx: 'automatic',
    format: 'esm',
    target: 'node18',
  })
  const rewritten = code.replace(/(from\s*["'][^"']+)\.jsx(["'])/g, '$1.js$2')

  const out = join(LIB, 'pdf', relative(SRC, file)).replace(/\.jsx$/, '.js')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, rewritten)
  count++
}

const fontsOut = join(LIB, 'fonts')
mkdirSync(fontsOut, { recursive: true })
let fonts = 0
for (const f of readdirSync(join(root, 'src', 'fonts')).filter(f => f.startsWith('Lato-'))) {
  copyFileSync(join(root, 'src', 'fonts', f), join(fontsOut, f))
  fonts++
}

console.log(`✅ lib/ built: ${count} modules, ${fonts} fonts`)
