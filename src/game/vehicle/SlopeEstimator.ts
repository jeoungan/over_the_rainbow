const MAX_SLOPE_DEGREES = 75;

export function estimateSlopeDegrees(rotationRadians: number): number {
  const wrappedDegrees = wrapDegrees((rotationRadians * 180) / Math.PI);
  const nearestSurfaceAngle = Math.abs(wrappedDegrees) > 90 ? 180 - Math.abs(wrappedDegrees) : wrappedDegrees;
  return Math.min(MAX_SLOPE_DEGREES, Math.abs(nearestSurfaceAngle));
}

function wrapDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
