/**
 * Entry point of the single-file standalone bundle (`dist/cvx.bundle.js`).
 *
 * Two static imports, and the order is the whole design: `runtime.js` writes
 * the embedded assets out and sets CVX_ASSET_ROOT, then `bin/cvx.js`'s module
 * body reads package.json from that root and its own run-as-main guard
 * dispatches the command. Nothing here calls main() — doing so would run every
 * command twice, because bin/cvx.js already dispatches when argv[1] is this
 * file, which it is.
 */

// Both imports are here for their side effects, and their ORDER is the design —
// so there is nothing to assign, and assigning something would invite a later
// reordering that breaks the bundle in a way no type checker would catch.
// oxlint-disable-next-line no-unassigned-import
import './runtime.js'
// oxlint-disable-next-line no-unassigned-import
import '../../bin/cvx.js'
