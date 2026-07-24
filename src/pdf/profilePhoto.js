// ── Profile-photo resolution ────────────────────────────────────────────────
// Single source of truth for which image extensions count as the profile photo
// and in what precedence. Shared by both content-loading paths so they never
// drift: the Node export path (src/pdf/loadContent.js) and the browser/Vite
// path (cv-content/index.js). Drop a profile.<ext> into cv-content/images/ and
// it is picked up automatically — no code change, any supported extension.
// ────────────────────────────────────────────────────────────────────────────

export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

/**
 * Given a list of available image paths/filenames, return the one whose
 * extension ranks highest in PHOTO_EXTENSIONS (case-insensitive), or null.
 *
 * @param {string[]} paths  candidate paths (e.g. ['./images/profile.png'])
 * @returns {string|null}
 */
export function pickProfilePhoto(paths = []) {
  for (const ext of PHOTO_EXTENSIONS) {
    const hit = paths.find((p) => p.toLowerCase().endsWith(`.${ext}`))
    if (hit) return hit
  }
  return null
}
