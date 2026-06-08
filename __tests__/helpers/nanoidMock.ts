// Deterministic CJS stub for nanoid (which ships pure ESM in v5).
// We need a stable identifier scheme so collision-avoidance loops terminate
// quickly. Each call returns a unique left-padded counter.
let counter = 0
export function nanoid(size = 10): string {
  counter += 1
  const base = `id${counter.toString().padStart(8, '0')}`
  return base.slice(0, size).padEnd(size, 'x')
}
// Backwards-compatible default + named exports
module.exports = { nanoid }
module.exports.default = { nanoid }
module.exports.nanoid = nanoid
