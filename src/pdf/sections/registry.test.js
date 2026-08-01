// renderSlot()'s defensive/diagnostic branches, which no document component
// reaches any more.
//
// Before C3a, `experience`/`experience:continued` were sometimes rendered
// without an `extra.entries` prop, so their `extra.entries ?? []` defaults were
// exercised incidentally. layout.js's coordinator now always hands a (possibly
// empty) entry array through, which is better — but it left those defaults, and
// the unknown-key warning, untested. Covered here on purpose rather than left
// to chance: a slot key that renders nothing must degrade to "nothing", never
// to a crash mid-render, because the layout key list is user-editable YAML
// (cv-content/layouts/*.yaml).
import { describe, expect, it, vi } from 'vitest'
import { renderSlot } from './registry.js'

const DATA = /** @type {import('../types.js').CVContent} */ (
  /** @type {unknown} */ ({
    personal: { name: 'Test Person' },
    summary: ['A summary bullet.'],
    experience: []
  })
)

/** renderSlot returns a union of element types; this reads props off any of them. */
function propsOf(/** @type {import('react').ReactElement | null} */ element) {
  return /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (element?.props))
}

describe('renderSlot', () => {
  it('defaults experience entries to an empty list when no `extra` is passed at all', () => {
    // Tabulated so a failure names the offending slot key.
    const observed = ['experience', 'experience:continued'].map((key) => {
      const props = propsOf(renderSlot([key], DATA)[0])
      return { key, entries: props.entries, continued: props.continued }
    })
    expect(observed).toEqual([
      { key: 'experience', entries: [], continued: false },
      { key: 'experience:continued', entries: [], continued: true }
    ])
  })

  it('passes entries through when they are supplied', () => {
    const entries = [{ role: 'R', company: 'C' }]
    expect(propsOf(renderSlot(['experience'], DATA, { entries })[0]).entries).toBe(entries)
    expect(propsOf(renderSlot(['experience:continued'], DATA, { entries })[0]).entries).toBe(
      entries
    )
  })

  it('renders a spacer of the requested height', () => {
    expect(propsOf(renderSlot(['spacer:27'], DATA)[0]).style).toEqual({ height: 27 })
  })

  it('warns once and renders nothing for an unknown slot key, instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(renderSlot(['not-a-real-section'], DATA)).toEqual([null])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('not-a-real-section')
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps keys unique across a repeated slot key so React never collides them', () => {
    const elements = renderSlot(['contact', 'contact'], DATA)
    expect(elements[0]?.key).not.toBe(elements[1]?.key)
  })
})
