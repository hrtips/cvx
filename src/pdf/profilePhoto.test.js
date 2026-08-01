import { describe, expect, it } from 'vitest'
import { PHOTO_EXTENSIONS, pickProfilePhoto } from './profilePhoto.js'

describe('pickProfilePhoto (R9)', () => {
  it('returns null when there are no candidates', () => {
    expect(pickProfilePhoto([])).toBeNull()
    expect(pickProfilePhoto()).toBeNull()
  })

  it('picks the only available image regardless of extension', () => {
    expect(pickProfilePhoto(['./images/profile.png'])).toBe('./images/profile.png')
    expect(pickProfilePhoto(['./images/profile.webp'])).toBe('./images/profile.webp')
  })

  it('honours extension precedence when several exist', () => {
    const paths = ['./images/profile.webp', './images/profile.png', './images/profile.jpg']
    expect(pickProfilePhoto(paths)).toBe('./images/profile.jpg') // jpg outranks png/webp
  })

  it('is case-insensitive on the extension', () => {
    expect(pickProfilePhoto(['./images/profile.PNG'])).toBe('./images/profile.PNG')
  })

  it('ignores non-image matches', () => {
    expect(pickProfilePhoto(['./images/profile.txt'])).toBeNull()
  })

  it('exposes a stable precedence list', () => {
    expect(PHOTO_EXTENSIONS).toEqual(['jpg', 'jpeg', 'png', 'webp'])
  })
})
