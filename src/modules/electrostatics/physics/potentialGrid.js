export const DEFAULT_GRID_WIDTH = 500;
export const DEFAULT_GRID_HEIGHT = 500;
export const DEFAULT_POTENTIAL_CUTOFF = 100;
export const DEFAULT_POTENTIAL_SCALE = 100;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function validatePointCharge(pointCharge, index) {
  if (!Number.isInteger(pointCharge.charge) || pointCharge.charge === 0) {
    throw new TypeError(
      `Point charge at index ${index} must have a non-zero integer charge.`,
    );
  }

  if (!Number.isFinite(pointCharge.x) || !Number.isFinite(pointCharge.y)) {
    throw new TypeError(
      `Point charge at index ${index} must have finite x and y coordinates.`,
    );
  }
}

/**
 * Computes an integer potential field from a list of point charges.
 *
 * Assumption:
 * Potential is modeled as sum(charge * scale / distance), rounded to the
 * nearest integer and clamped to +/- cutoff. Grid points that coincide with a
 * charge position are treated as singularities and clamp immediately.
 */
export function createPotentialGrid(pointCharges, options = {}) {
  if (!Array.isArray(pointCharges)) {
    throw new TypeError("Point charges must be provided as an array.");
  }

  const {
    width = DEFAULT_GRID_WIDTH,
    height = DEFAULT_GRID_HEIGHT,
    cutoff = DEFAULT_POTENTIAL_CUTOFF,
    scale = DEFAULT_POTENTIAL_SCALE,
  } = options;

  if (!Number.isInteger(width) || width <= 0) {
    throw new TypeError("Grid width must be a positive integer.");
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new TypeError("Grid height must be a positive integer.");
  }

  if (!Number.isInteger(cutoff) || cutoff <= 0) {
    throw new TypeError("Potential cutoff must be a positive integer.");
  }

  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new TypeError("Potential scale must be a positive finite number.");
  }

  pointCharges.forEach(validatePointCharge);

  const grid = Array.from({ length: height }, () => new Array(width));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let totalPotential = 0;

      for (const pointCharge of pointCharges) {
        const deltaX = x - pointCharge.x;
        const deltaY = y - pointCharge.y;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance === 0) {
          totalPotential = pointCharge.charge > 0 ? cutoff : -cutoff;
          break;
        }

        totalPotential += (pointCharge.charge * scale) / distance;
      }

      grid[y][x] = clamp(
        Math.round(totalPotential),
        -cutoff,
        cutoff,
      );
    }
  }

  return grid;
}
