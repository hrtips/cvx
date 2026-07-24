// Cross-cutting check: the Node content loader must find the profile photo by
// listing the directory (not by probing lowercase names with existsSync), so
// uppercase extensions like profile.JPG resolve on case-sensitive filesystems
// (Linux) exactly as they do in the browser path.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { loadContent } from '../src/pdf/loadContent.js'

const dirs = []

function contentDirWith(imageNames) {
  const dir = mkdtempSync(join(tmpdir(), 'cvx-photo-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'images'))
  for (const name of imageNames) {
    writeFileSync(join(dir, 'images', name), 'placeholder')
  }
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('loadContent profile-photo probe', () => {
  it('finds an uppercase extension', () => {
    const dir = contentDirWith(['profile.JPG'])
    expect(basename(loadContent(dir).profilePhoto)).toBe('profile.JPG')
  })

  it('keeps the shared extension precedence (jpg over png)', () => {
    const dir = contentDirWith(['profile.png', 'profile.jpg'])
    expect(basename(loadContent(dir).profilePhoto)).toBe('profile.jpg')
  })

  it('ignores files that are not profile.<ext>', () => {
    const dir = contentDirWith(['avatar.jpg', 'profile.txt'])
    expect(loadContent(dir).profilePhoto).toBeNull()
  })

  it('returns null when images/ is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvx-photo-'))
    dirs.push(dir)
    expect(loadContent(dir).profilePhoto).toBeNull()
  })
})
