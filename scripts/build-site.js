/**
 * build-site.js
 * Assembles the deployable landing-page tree in _site/ from site/, assets/ and docs/.
 *
 * site/ is hand-authored source, NOT a deployable tree: the images, llms.txt and
 * the two .md docs that index.html links to live elsewhere in the repo and are
 * copied in here so they aren't duplicated in git. This script is the single
 * definition of that copy-list, so GitHub Pages and Cloudflare Pages publish the
 * same bytes instead of each host carrying its own drifting copy of it.
 *
 * Every in-page reference is RELATIVE (./icon.png, ./download/…), so the output
 * works unchanged at https://hrtips.lk/cvx/, at https://hrtips.github.io/cvx/,
 * and at a domain root. Nothing here rewrites those.
 *
 * The absolute URLs that must be absolute — canonical, og:url, og:image — are
 * baked into site/*.html as the primary origin so the source files are valid on
 * their own. SITE_ORIGIN overrides them at build time for a preview deploy;
 * leave it unset for production.
 *
 * Run:  npm run build:site
 *       SITE_ORIGIN=https://preview.example/cvx/ npm run build:site
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, '_site')

/** The one origin every absolute URL in the output points at. */
const PRIMARY_ORIGIN = 'https://hrtips.lk/cvx/'

/** Trailing slash is load-bearing — these values are concatenated with paths. */
const origin = (process.env.SITE_ORIGIN || PRIMARY_ORIGIN).replace(/\/*$/, '/')

/** Verbatim copies: [source relative to repo root, destination relative to _site]. */
const COPIES = [
  ['site/cvx-i18n.js', 'cvx-i18n.js'], // EN/hi/ta/si translations loaded by index.html
  ['assets/hero-two-column.png', 'hero-two-column.png'],
  ['assets/hero-ats.png', 'hero-ats.png'],
  ['assets/brand/icons/cvx-icon-256x256.png', 'icon.png'],
  ['assets/brand/icons/cvx-icon-512x512.png', 'icon-512.png'], // the large manifest icon
  // Served from this origin so og:image/twitter:image resolve on the site itself
  // rather than on raw.githubusercontent.com, which some crawlers will not follow.
  ['assets/brand/social-preview.png', 'social-preview.png'],
  ['llms.txt', 'llms.txt'],
  // Served from THIS origin so an assistant handed the site URL can follow through
  // in one hop. raw.githubusercontent.com is a second host, which some fetchers
  // will not visit — and the instruction block on index.html links these paths.
  ['docs/ai-guide.md', 'ai-guide.md'],
  ['docs/cv-schema.md', 'cv-schema.md']
]

/** @param {string} html @returns {string} */
function applyOrigin(html) {
  return origin === PRIMARY_ORIGIN ? html : html.replaceAll(PRIMARY_ORIGIN, origin)
}

/** @param {string} relPath @param {string} contents */
function emit(relPath, contents) {
  const dest = join(OUT, relPath)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, contents)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

for (const [from, to] of COPIES) {
  const dest = join(OUT, to)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(root, from), dest)
}

emit('index.html', applyOrigin(readFileSync(join(root, 'site/index.html'), 'utf8')))

// The privacy statement is published at BOTH /privacy and /privacy/ so either form
// of the URL resolves on either host. The two live at different depths, so the
// directory copy needs its relative references walked up one level — without this
// its ./icon.png resolved to /cvx/privacy/icon.png and 404'd in production.
const privacy = applyOrigin(readFileSync(join(root, 'site/privacy.html'), 'utf8'))
emit('privacy.html', privacy)
emit('privacy/index.html', privacy.replaceAll('="./', '="../'))

// ── Generated files ───────────────────────────────────────────────────────
// Written here rather than committed so their absolute URLs always agree with
// the origin this build is for, instead of going stale in a checked-in file.

// Both pages, pointed at the primary origin so crawlers consolidate there.
const PAGES = ['', 'privacy/']
emit(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')}
</urlset>
`
)

emit('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${origin}sitemap.xml\n`)

// Relative icon/scope paths: the manifest is always served from the site root, so
// these resolve correctly under /cvx/ and at a domain root alike.
emit(
  'site.webmanifest',
  `${JSON.stringify(
    {
      name: 'CVX — the new way to write a CV',
      short_name: 'CVX',
      description:
        'Hand your old CV or LinkedIn export to an AI assistant. It asks about the gaps, then builds a designed CV PDF on your machine.',
      start_url: './',
      scope: './',
      display: 'minimal-ui',
      background_color: '#FBFAF8',
      theme_color: '#1A6070',
      icons: [
        { src: './icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
      ]
    },
    null,
    2
  )}\n`
)

console.log(`built _site/ (${COPIES.length + 6} files) at origin ${origin}`)
