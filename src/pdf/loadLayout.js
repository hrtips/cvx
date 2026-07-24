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
function normalizeItem(item) {
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
      if (typeof val === 'object' && val.continued) {
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
function normalizeSlot(items) {
  if (!Array.isArray(items)) return []
  return items.map(normalizeItem)
}

/**
 * Normalize a full page definition.
 */
function normalizePage(page) {
  if (!page) return null
  const result = {}
  if (page.sidebar) result.sidebar = normalizeSlot(page.sidebar)
  if (page.main)    result.main    = normalizeSlot(page.main)
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
export function normalizeLayout(parsed) {
  const result = {
    template: parsed.template ?? 'two-column',
  }

  const pages = parsed.pages ?? parsed
  if (pages.first)        result.first        = normalizePage(pages.first)
  if (pages.continuation) result.continuation = normalizePage(pages.continuation)
  if (pages.last)         result.last         = normalizePage(pages.last)

  return result
}
