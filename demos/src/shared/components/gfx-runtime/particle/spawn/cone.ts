// Pure spawn math for the Point emitter. Factored out of the simulation
// loop so it's independently testable in jsdom (three.js isn't).

/**
 * Sample a direction vector inside a cone of half-angle `halfAngle`
 * around `axis`. `rng` must return values in [0, 1). Returns a unit
 * vector; if `halfAngle` is 0 returns a copy of `axis`.
 *
 * Uniform distribution over polar angle [0, halfAngle] — matches the
 * engine's `A3DParticleEmitter::GenDirection` behavior which uses
 * `_UnitRandom() * m_fAngle` (uniform in polar, not solid-angle
 * weighted).
 */
export function sampleConeDirection(
  axis: [number, number, number],
  halfAngle: number,
  rng: () => number,
): [number, number, number] {
  if (halfAngle === 0) return [...axis];

  // Build an orthonormal basis around axis. Pick a seed "up" that isn't
  // (near-)parallel to axis so `cross` produces a well-conditioned tangent.
  const up: [number, number, number] =
    Math.abs(axis[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const x = cross(up, axis);
  normalizeInPlace(x);
  const y = cross(axis, x);

  const polar = rng() * halfAngle;
  const azimuth = rng() * 2 * Math.PI;
  const sinP = Math.sin(polar);
  const cosP = Math.cos(polar);
  const ax = sinP * Math.cos(azimuth);
  const ay = sinP * Math.sin(azimuth);
  const az = cosP;

  return [
    x[0] * ax + y[0] * ay + axis[0] * az,
    x[1] * ax + y[1] * ay + axis[1] * az,
    x[2] * ax + y[2] * ay + axis[2] * az,
  ];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeInPlace(v: [number, number, number]): void {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  v[0] /= len;
  v[1] /= len;
  v[2] /= len;
}
