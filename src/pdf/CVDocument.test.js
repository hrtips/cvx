// Direct CVDocument render tests for branches renderCV() can't reach: the
// theme fallback (renderCV always injects a theme) and the single-continuation-
// page sidebar merge (needs a layout with both continuation + last pages and
// content that overflows to exactly one continuation page).
import { fileURLToPath } from 'node:url'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import CVDocument from './CVDocument.jsx'
import { registerFonts } from './fonts.js'

// fileURLToPath, not URL#pathname: on Windows the latter yields "/D:/…", whose
// leading slash makes fs resolve it against the current drive ("D:\D:\…").
registerFonts(fileURLToPath(new URL('../fonts', import.meta.url)))

const bullets = Array.from(
  { length: 6 },
  (_, i) =>
    `Bullet ${i}: a long achievement sentence that wraps and consumes vertical column space.`
)
/** @param {number} n */
const experience = (n) =>
  Array.from({ length: n }, (_, i) => ({
    role: `Engineer ${i}`,
    company: `Company ${i}`,
    period: '2020–2024',
    bullets
  }))

/** A layout with no `template` field (exercises the `?? layoutName` fallback) and
 *  both continuation + last pages (exercises the single-page sidebar merge). */
const templatelessLayout = {
  first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] },
  continuation: { sidebar: ['education'], main: ['experience:continued'] },
  last: { sidebar: ['referees'], main: ['experience:continued'] }
}

const baseData = {
  personal: { name: 'Test Person', title: 'Engineer', email: 'x@y.z' },
  summary: ['A summary bullet.'],
  education: [{ degree: 'BSc', institution: 'Uni', period: '2016' }],
  referees: [{ name: 'Ref One' }]
}

describe('CVDocument — direct render (fallback + merge branches)', () => {
  it('falls back to a default theme and a templateless layout without crashing', async () => {
    // No `theme` prop → activeTheme falls through to the layout default / teal.
    const buffer = await renderToBuffer(
      /** @type {Parameters<typeof renderToBuffer>[0]} */ (
        /** @type {unknown} */ (
          createElement(CVDocument, {
            ...baseData,
            experience: experience(6),
            config: {},
            layout: templatelessLayout
          })
        )
      )
    )
    expect(buffer.byteLength).toBeGreaterThan(1000)
  }, 30000)
})
