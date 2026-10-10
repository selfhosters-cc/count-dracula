// ES module face for Motion's self-contained UMD build (it sets globalThis.Motion when loaded).
import './motion.umd.js'

export const { animate } = globalThis.Motion
