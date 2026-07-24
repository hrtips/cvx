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

// Eagerly import all YAML files in this directory
const yamlModules = import.meta.glob('./*.yaml', { eager: true })

const content = {}
let config = {}

for (const [path, mod] of Object.entries(yamlModules)) {
  // "./personal.yaml" → "personal"
  const key = path.replace('./', '').replace('.yaml', '')
  const data = mod.default ?? mod

  if (key === 'config') {
    config = data
  } else {
    content[key] = data
  }
}

// Named exports for backward compatibility
const { personal, summary, experience, achievements, education, competencies, referees, keywords } = content

// Profile photo — auto-detect the extension, matching the Node export path.
// Any profile.<ext> in images/ is picked up; highest-precedence one wins.
const photoModules = import.meta.glob('./images/profile.*', { eager: true })
const photoPath = pickProfilePhoto(Object.keys(photoModules))
const profilePhoto = photoPath ? (photoModules[photoPath].default ?? photoModules[photoPath]) : null

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
