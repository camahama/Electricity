function createBooleanGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(false));
}

function markPixel(grid, x, y) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = true;
  }
}

function normalizeLevels(levels, potentialGrid) {
  if (Array.isArray(levels) && levels.length > 0) {
    return [...levels];
  }

  let minimum = Infinity;
  let maximum = -Infinity;

  for (const row of potentialGrid) {
    for (const value of row) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }

  const generatedLevels = [];

  for (let level = Math.ceil(minimum / 10) * 10; level <= maximum; level += 10) {
    if (level !== 0) {
      generatedLevels.push(level);
    }
  }

  return generatedLevels;
}

function interpolatePoint(x1, y1, v1, x2, y2, v2, level) {
  const denominator = v2 - v1;

  if (denominator === 0) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  const t = (level - v1) / denominator;

  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  };
}

function findEdgeIntersections(x, y, topLeft, topRight, bottomRight, bottomLeft, level) {
  const intersections = [];

  if ((topLeft < level && topRight >= level) || (topLeft >= level && topRight < level)) {
    intersections.push(interpolatePoint(x, y, topLeft, x + 1, y, topRight, level));
  }

  if ((topRight < level && bottomRight >= level) || (topRight >= level && bottomRight < level)) {
    intersections.push(interpolatePoint(x + 1, y, topRight, x + 1, y + 1, bottomRight, level));
  }

  if ((bottomLeft < level && bottomRight >= level) || (bottomLeft >= level && bottomRight < level)) {
    intersections.push(interpolatePoint(x, y + 1, bottomLeft, x + 1, y + 1, bottomRight, level));
  }

  if ((topLeft < level && bottomLeft >= level) || (topLeft >= level && bottomLeft < level)) {
    intersections.push(interpolatePoint(x, y, topLeft, x, y + 1, bottomLeft, level));
  }

  return intersections;
}

function drawDashedSegment(grid, start, end, options) {
  const { dashPeriod, dashLength, thickness, dashOffset } = options;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) {
    return;
  }

  const samples = Math.max(1, Math.ceil(length * 2));

  for (let sample = 0; sample <= samples; sample += 1) {
    const t = sample / samples;
    const x = start.x + t * deltaX;
    const y = start.y + t * deltaY;
    const dashCoordinate = Math.floor(x * 1.7 + y * 1.3) + dashOffset;
    const dashIndex = ((dashCoordinate % dashPeriod) + dashPeriod) % dashPeriod;

    if (dashIndex >= dashLength) {
      continue;
    }

    const centerX = Math.round(x);
    const centerY = Math.round(y);
    const radius = Math.max(0, Math.floor((thickness - 1) / 2));

    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        markPixel(grid, centerX + offsetX, centerY + offsetY);
      }
    }

    if (thickness % 2 === 0) {
      markPixel(grid, centerX + 1, centerY);
      markPixel(grid, centerX, centerY + 1);
    }
  }
}

/**
 * Rasterizes thin dashed equipotential contours using a marching-squares style
 * interpolation of level crossings in each grid cell.
 */
export function createEquipotentialOverlay(potentialGrid, options = {}) {
  const height = potentialGrid.length;
  const width = potentialGrid[0]?.length ?? 0;

  if (height === 0 || width === 0) {
    throw new TypeError("Potential grid must be a non-empty matrix.");
  }

  const overlay = createBooleanGrid(width, height);
  const levels = normalizeLevels(options.levels, potentialGrid);
  const dashPeriod = options.dashPeriod ?? 10;
  const dashLength = options.dashLength ?? 5;
  const thickness = options.thickness ?? 1;

  for (const level of levels) {
    const dashOffset = Math.abs(level) % dashPeriod;

    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const topLeft = potentialGrid[y][x];
        const topRight = potentialGrid[y][x + 1];
        const bottomRight = potentialGrid[y + 1][x + 1];
        const bottomLeft = potentialGrid[y + 1][x];

        const intersections = findEdgeIntersections(
          x,
          y,
          topLeft,
          topRight,
          bottomRight,
          bottomLeft,
          level,
        );

        if (intersections.length === 2) {
          drawDashedSegment(overlay, intersections[0], intersections[1], {
            dashPeriod,
            dashLength,
            thickness,
            dashOffset,
          });
        }

        if (intersections.length === 4) {
          drawDashedSegment(overlay, intersections[0], intersections[1], {
            dashPeriod,
            dashLength,
            thickness,
            dashOffset,
          });
          drawDashedSegment(overlay, intersections[2], intersections[3], {
            dashPeriod,
            dashLength,
            thickness,
            dashOffset,
          });
        }
      }
    }
  }

  return overlay;
}
