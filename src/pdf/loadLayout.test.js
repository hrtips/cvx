import { describe, expect, it } from 'vitest'
import { normalizeLayout } from './loadLayout.js'

describe('normalizeLayout', () => {
  it('defaults the template to two-column and reads the pages: wrapper', () => {
    const out = normalizeLayout({ pages: { first: { main: ['summary'] } } })
    expect(out.template).toBe('two-column')
    expect(out.first).toEqual({ main: ['summary'] })
    expect(out.continuation).toBeUndefined()
    expect(out.last).toBeUndefined()
  })

  it('keeps an explicit template and reads the flat form (no pages: wrapper)', () => {
    const out = normalizeLayout({ template: 'single-column', first: { main: ['header-ats'] } })
    expect(out.template).toBe('single-column')
    expect(out.first.main).toEqual(['header-ats'])
  })

  it('normalizes every slot item shape', () => {
    const out = normalizeLayout({
      pages: {
        first: {
          sidebar: ['identity-photo', { spacer: 27 }, { education: {} }, { a: 1, b: 2 }, 7],
          main: ['summary', { experience: { continued: true } }, 'experience'],
        },
        continuation: { main: [{ experience: { continued: true } }] },
        last: { sidebar: ['referees'] },
      },
    })
    expect(out.first.sidebar).toEqual(['identity-photo', 'spacer:27', 'education', '[object Object]', '7'])
    expect(out.first.main).toEqual(['summary', 'experience:continued', 'experience'])
    expect(out.continuation.main).toEqual(['experience:continued'])
    expect(out.last.sidebar).toEqual(['referees'])
  })

  it('treats a non-array slot as empty and an object page with neither slot as {}', () => {
    const out = normalizeLayout({ pages: { first: { sidebar: 'oops' }, continuation: {} } })
    expect(out.first).toEqual({ sidebar: [] })
    expect(out.continuation).toEqual({})
  })
})
