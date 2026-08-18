// ── Layout Loader ───────────────────────────────────────────────────────────
// Normalizes a parsed layout YAML into the format CVDocument expects.
//
// YAML items can be:
//   - "summary"             → string key (passed through)
//   - "experience:continued"→ string key with modifier (passed through)
//   - { spacer: 27 }        → YAML object → normalized to "spacer:27"
//   - { experience: { max: 2 } } → YAML object → future: section config
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a single slot item from YAML into a string key.
 */
function normalizeItem(/** @type {import('./types.js').RawLayoutSlot} */ item) {
  if (typeof item === 'string') return item

  if (typeof item === 'object' && item !== null) {
    const keys = Object.keys(item)
    if (keys.length === 1) {
      const key = keys[0]
      const val = item[key]

      // { spacer: 27 } → "spacer:27"
      if (key === 'spacer' && typeof val === 'number') {
        return `spacer:${val}`
      }

      // { experience: { continued: true } } → "experience:continued"
      //
      // RV13: `val !== null` is load-bearing. `typeof null === 'object'`, and a
      // slot written `- spacer:` (the value simply left off) parses to
      // `{ spacer: null }` — so this read threw a raw TypeError out of
      // `normalizeLayout`, out of `validateContent`, and all the way to the CLI,
      // which reported exit 64 (USAGE error — "your command was wrong") for a
      // content problem, with "Cannot read properties of null" and no file or
      // field path. A malformed slot is a finding, not a crash; the
      // `slot-not-renderable` check downstream is what names it.
      if (val !== null && typeof val === 'object' && val.continued) {
        return `${key}:continued`
      }

      // { sectionName: {} } or { sectionName: config } → just the key
      return key
    }
  }

  return String(item)
}

/**
 * Normalize a slot array (sidebar or main) from parsed YAML.
 */
function normalizeSlot(/** @type {unknown} */ items) {
  if (!Array.isArray(items)) return []
  return items.map(normalizeItem)
}

/**
 * Normalize a full page definition.
 */
function normalizePage(/** @type {import('./types.js').RawLayoutPage | null | undefined} */ page) {
  if (!page) return null
  const result = /** @type {import('./types.js').LayoutPage} */ ({})
  if (page.sidebar) result.sidebar = normalizeSlot(page.sidebar)
  if (page.main) result.main = normalizeSlot(page.main)
  return result
}

/**
 * Normalize a parsed layout YAML into the format CVDocument expects.
 *
 * Input (parsed YAML):
 *   { template: 'two-column', geometry: {...}, pages: { first: {...}, continuation: {...}, last: {...} } }
 *
 * Output:
 *   { template: 'two-column', first: {...}, continuation: {...}, last: {...} }
 */
export function normalizeLayout(/** @type {import('./types.js').RawLayout} */ parsed) {
  const result =
    /** @type {{ template: string, spacing?: import('./types.js').LayoutSpacing, first?: import('./types.js').LayoutPage | null, continuation?: import('./types.js').LayoutPage | null, last?: import('./types.js').LayoutPage | null }} */ ({
      template: parsed.template ?? 'two-column'
    })

  // D11: template-declared spacing rides through untouched — `resolveDocument`
  // applies it to the theme. Carried explicitly rather than by spreading
  // `parsed`, because this object is a whitelist: a key that is not plumbed
  // here does not exist, however valid it looks in the YAML.
  if (parsed.spacing && typeof parsed.spacing === 'object') result.spacing = parsed.spacing

  const pages = parsed.pages ?? parsed
  if (pages.first) result.first = normalizePage(pages.first)
  if (pages.continuation) result.continuation = normalizePage(pages.continuation)
  if (pages.last) result.last = normalizePage(pages.last)

  return /** @type {import('./types.js').NormalizedLayout} */ (result)
}
