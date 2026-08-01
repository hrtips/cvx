// ── CV CONTENT ENTRY POINT (Vite) ───────────────────────────────────────────
// Auto-discovers all YAML files in this folder via import.meta.glob.
// Drop a new .yaml file here and it becomes available as a content key.
//
// To update your CV:
//   • Edit the YAML files in this folder  (cv-content/*.yaml)
//   • Drop your photo into cv-content/images/ as profile.<ext>
//     (jpg / jpeg / png / webp — auto-detected)
//   • Adjust cv-content/config.yaml for layout settings
// ─────────────────────────────────────────────────────────────────────────────

import { pickProfilePhoto } from '../src/pdf/profilePhoto.js'
import { normalizeContent } from '../src/pdf/normalizeContent.js'

// Eagerly import all YAML files in this directory. `import.meta.glob` is a
// Vite compile-time macro; ImportMeta doesn't type it, so we assert the shape.
const yamlModules = (/** @type {{ glob: (pattern: string, options?: { eager?: boolean }) => Record<string, { default?: unknown }> }} */ (/** @type {unknown} */ (import.meta))).glob('./*.yaml', { eager: true })

/** @type {Record<string, unknown>} */
const content = {}
/** @type {import('../src/pdf/types.js').CVConfig} */
let config = {}

for (const [path, mod] of Object.entries(yamlModules)) {
  // "./personal.yaml" → "personal"
  const key = path.replace('./', '').replace('.yaml', '')
  // NFC-normalize — mirrors src/pdf/loadContent.js (the Node/CLI loader) so
  // the browser preview and the CLI build never disagree on this (review
  // round 2, SHOULD #4 — see normalizeContent.js's module docblock).
  const data = normalizeContent(mod.default ?? mod)

  if (key === 'config') {
    config = /** @type {import('../src/pdf/types.js').CVConfig} */ (data)
  } else {
    content[key] = data
  }
}

// Named exports for backward compatibility
const { personal, summary, experience, achievements, education, competencies, referees, keywords } = /** @type {import('../src/pdf/types.js').CVContent} */ (/** @type {unknown} */ (content))

// Profile photo — auto-detect the extension, matching the Node export path.
// Any profile.<ext> in images/ is picked up; highest-precedence one wins.
const photoModules = (/** @type {{ glob: (pattern: string, options?: { eager?: boolean }) => Record<string, { default?: string }> }} */ (/** @type {unknown} */ (import.meta))).glob('./images/profile.*', { eager: true })
const photoPath = pickProfilePhoto(Object.keys(photoModules))
const profilePhoto = /** @type {string | null} */ (photoPath ? (photoModules[photoPath].default ?? photoModules[photoPath]) : null)

export {
  personal,
  summary,
  experience,
  achievements,
  education,
  competencies,
  referees,
  keywords,
  config,
  profilePhoto,
  content,
}
