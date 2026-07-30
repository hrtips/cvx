// ── Content Auto-Discovery ──────────────────────────────────────────────────
// Scans cv-content/*.yaml and loads all content files dynamically.
// Used by Node export scripts. For Vite/browser, see cv-content/index.js.
//
// Content files are loaded by filename (minus .yaml extension):
//   personal.yaml  → data.personal
//   experience.yaml → data.experience
//   config.yaml    → data.config (special: not passed as content)
//
// Any new .yaml file dropped in cv-content/ is automatically picked up.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { load } from 'js-yaml'
import { normalizeContent } from './normalizeContent.js'
import { pickProfilePhoto } from './profilePhoto.js'

/**
 * Load all YAML content from a directory.
 *
 * @param {string} contentDir  Absolute path to cv-content/
 * @returns {{ config: import('./types.js').CVConfig, content: import('./types.js').CVContent, profilePhoto: string | null }}
 *   - config: parsed config.yaml
 *   - content: { personal, summary, experience, ... } — all other YAML files
 *   - profilePhoto: path to profile image (if exists)
 */
export function loadContent(contentDir) {
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.yaml'))

  /** @type {import('./types.js').CVConfig} */
  const config = {}
  /** @type {Record<string, unknown>} */
  const content = {}

  for (const file of files) {
    const key = basename(file, '.yaml')
    // NFC-normalize before anything measures/renders/glyph-checks this data
    // (review round 2, SHOULD #4) — see normalizeContent.js's module docblock.
    const parsed = normalizeContent(load(readFileSync(join(contentDir, file), 'utf-8')))

    if (key === 'config') {
      Object.assign(config, parsed)
    } else {
      content[key] = parsed
    }
  }

  // Profile photo — list the directory and let the shared picker choose, so
  // uppercase extensions (profile.JPG) work on case-sensitive filesystems and
  // precedence stays identical to the browser path (cv-content/index.js).
  /** @type {string | null} */
  let profilePhoto = null
  const imgDir = join(contentDir, 'images')
  if (existsSync(imgDir)) {
    const candidates = readdirSync(imgDir).filter((f) => f.startsWith('profile.'))
    const hit = pickProfilePhoto(candidates)
    if (hit) profilePhoto = join(imgDir, hit)
  }

  return {
    config,
    content: /** @type {import('./types.js').CVContent} */ (/** @type {unknown} */ (content)),
    profilePhoto
  }
}
