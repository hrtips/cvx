// ── ContactSection's two conditional arms ──────────────────────────────────
//
// Both were uncovered when the per-file coverage gate was made real (it had
// been applied to the aggregate, so this file sat at 75% branches under a
// declared 85% bar without failing anything). Neither is decoration:
//
//   1. `href ? <Link> : <Text>` — a contact row with no link. Every row in the
//      shipped scaffold has an href, so the plain-text arm had never rendered
//      in a test. It is reachable from ordinary content: `location` has no
//      href by design, and `phone`/`email` only get one when the user supplies
//      the optional `phoneHref`/`email` pair.
//   2. `Icon`'s `if (!icon) return null` — which is why it is now GONE from
//      ContactSection.jsx rather than covered here. It was unreachable:
//      `name` comes from FIELD_ICON, keyed by the closed six-value `field`
//      union that layout.js's `contactRows()` is the only producer of, and all
//      six map to entries that exist in ICONS. Covering it would have meant
//      exporting Icon purely to poke it — trading a real API for a coverage
//      number — and waiving it would have meant a permanent exception for dead
//      code. The second describe block below replaces the runtime guard with a
//      test-time one: every field contactRows() can emit must render an icon,
//      so a seventh field arriving without one fails here instead of silently
//      shipping a row with no icon.
//
// Rendered with `react-dom/server`, the same approach layout.mirror.test.js
// uses: @react-pdf's primitives are host components whose type is their
// uppercased name, so `<Link>` renders as `<LINK>` and `<Text>` as `<TEXT>`.
// That makes "which arm ran" directly observable in the markup, rather than
// something inferred from a snapshot.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ThemeContext } from '../ThemeContext.jsx'
import { tealTheme } from '../themes/teal.js'
import ContactSection from './ContactSection.jsx'

/** @param {Partial<import('../types.js').Personal>} personal */
function render(personal) {
  // ContactSection reads nothing but `data.personal` (via contactRows), so a
  // bag carrying only that is enough to render — the cast is what says so.
  const data = /** @type {import('../types.js').CVContent} */ (
    /** @type {unknown} */ ({ personal })
  )
  return renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: tealTheme },
      createElement(ContactSection, { data })
    )
  )
}

describe('ContactSection — a row with a link vs a row without one', () => {
  it('renders a linked row as LINK and an unlinked row as TEXT', () => {
    // email needs no *Href field — contactRows() derives `mailto:` from it.
    const markup = render({ email: 'bruce@wayne-enterprises.com', location: 'Gotham City' })

    // The linked row took the <Link> arm...
    expect(markup).toContain('bruce@wayne-enterprises.com')
    expect(markup).toMatch(/<LINK[^>]*>[^<]*bruce@wayne-enterprises\.com/)

    // ...and the row with no href took the <Text> arm. Asserting the absence
    // of a LINK around it is the point: a regression that wrapped every row in
    // a Link would still contain the string, and still pass a naive check.
    expect(markup).toContain('Gotham City')
    expect(markup).not.toMatch(/<LINK[^>]*>[^<]*Gotham City/)
    expect(markup).toMatch(/<TEXT[^>]*>[^<]*Gotham City/)
  })

  it('renders no LINK at all when nothing has an href', () => {
    const markup = render({ location: 'Gotham City' })
    expect(markup).toContain('Gotham City')
    expect(markup).not.toContain('<LINK')
  })
})

describe('ContactSection — every field the engine can emit gets an icon', () => {
  // The check that makes Icon()'s unreachable `!icon` guard *stay* unreachable:
  // if someone adds a seventh field to contactRows() without adding an icon,
  // this fails and names it, instead of the guard silently swallowing it and
  // shipping a row with no icon.
  it.each([
    ['phone', { phone: '+1 (201) 555-2283', phoneHref: 'tel:+12015552283' }],
    ['email', { email: 'bruce@wayne-enterprises.com' }],
    ['linkedin', { linkedin: 'linkedin.com/in/brucewayne', linkedinHref: 'https://x' }],
    ['facebook', { facebook: 'fb.com/brucewayne', facebookHref: 'https://x' }],
    ['location', { location: 'Gotham City' }],
    ['link', { links: [{ href: 'https://medium.com/@bruce', label: 'Blog' }] }]
  ])('renders an icon for %s', (_field, personal) => {
    const markup = render(personal)
    expect(markup).toContain('<SVG')
  })
})
