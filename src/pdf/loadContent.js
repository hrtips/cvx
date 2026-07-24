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

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { load } from 'js-yaml'
import { PHOTO_EXTENSIONS } from './profilePhoto.js'

/**
 * Load all YAML content from a directory.
 *
 * @param {string} contentDir  Absolute path to cv-content/
 * @returns {{ config, content, profilePhoto }}
 *   - config: parsed config.yaml
 *   - content: { personal, summary, experience, ... } — all other YAML files
 *   - profilePhoto: path to profile image (if exists)
 */
export function loadContent(contentDir) {
  const files = readdirSync(contentDir).filter(f => f.endsWith('.yaml'))

  const config = {}
  const content = {}

  for (const file of files) {
    const key = basename(file, '.yaml')
    const parsed = load(readFileSync(join(contentDir, file), 'utf-8'))

    if (key === 'config') {
      Object.assign(config, parsed)
    } else {
      content[key] = parsed
    }
  }

  // Profile photo — auto-detect the extension (shared precedence with the
  // browser path via PHOTO_EXTENSIONS in profilePhoto.js).
  let profilePhoto = null
  const imgDir = join(contentDir, 'images')
  if (existsSync(imgDir)) {
    for (const ext of PHOTO_EXTENSIONS) {
      const path = join(imgDir, `profile.${ext}`)
      if (existsSync(path)) {
        profilePhoto = path
        break
      }
    }
  }

  return { config, content, profilePhoto }
}
