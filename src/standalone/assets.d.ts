// Ambient declaration for the virtual module scripts/build-standalone.js
// supplies at bundle time. It exists only inside that build, so there is no
// `cvx:assets` file for tsc to resolve — but runtime.js imports it, and an
// unresolved import there would be the one type error nobody could fix by
// writing code. Keep in step with the assetsPlugin `contents` in that script.
declare module 'cvx:assets' {
  /** The CVX version the bundle was built from. */
  export const VERSION: string
  /** Short sha256 over every embedded asset — names the extraction directory. */
  export const DIGEST: string
  /** Asset path (relative to the asset root) → base64 of its gzipped bytes. */
  export const FILES: Record<string, string>
}
