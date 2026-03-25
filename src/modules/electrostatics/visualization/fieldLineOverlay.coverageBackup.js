import {
  createPotentialGrid,
  DEFAULT_GRID_HEIGHT,
  DEFAULT_GRID_WIDTH,
  DEFAULT_POTENTIAL_CUTOFF,
  DEFAULT_POTENTIAL_SCALE,
} from "../physics/potentialGrid.js";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createBooleanGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(false));
}

function markPixel(grid, x, y) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = true;
  }
}

function drawLine(grid, startX, startY, endX, endY) {
  let x0 = Math.round(startX);
  let y0 = Math.round(startY);
  const x1 = Math.round(endX);
  const y1 = Math.round(endY);
  const deltaX = Math.abs(x1 - x0);
  const stepX = x0 < x1 ? 1 : -1;
  const deltaY = -Math.abs(y1 - y0);
  const stepY = y0 < y1 ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    markPixel(grid, x0, y0);

    if (x0 === x1 && y0 === y1) {
      break;
    }

    const doubledError = 2 * error;

    if (doubledError >= deltaY) {
      error += deltaY;
      x0 += stepX;
    }

    if (doubledError <= deltaX) {
      error += deltaX;
      y0 += stepY;
    }
  }
}

function edgePoint(x, y, edgeIndex, level, topLeft, topRight, bottomRight, bottomLeft) {
  if (edgeIndex === 0) {
    const denominator = topRight - topLeft;
    const t = denominator === 0 ? 0.5 : (level - topLeft) / denominator;
    return { x: x + t, y };
  }

  if (edgeIndex === 1) {
    const denominator = bottomRight - topRight;
    const t = denominator === 0 ? 0.5 : (level - topRight) / denominator;
    return { x: x + 1, y: y + t };
  }

  if (edgeIndex === 2) {
    const denominator = bottomRight - bottomLeft;
    const t = denominator === 0 ? 0.5 : (level - bottomLeft) / denominator;
    return { x: x + t, y: y + 1 };
  }

  const denominator = bottomLeft - topLeft;
  const t = denominator === 0 ? 0.5 : (level - topLeft) / denominator;
  return { x, y: y + t };
}

function segmentPairsForCell(caseIndex, centerValue, level) {
  const lookup = {
    0: [],
    1: [[3, 0]],
    2: [[0, 1]],
    3: [[3, 1]],
    4: [[1, 2]],
    5: centerValue >= level ? [[3, 2], [0, 1]] : [[3, 0], [1, 2]],
    6: [[0, 2]],
    7: [[3, 2]],
    8: [[2, 3]],
    9: [[0, 2]],
    10: centerValue >= level ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]],
    11: [[1, 2]],
    12: [[1, 3]],
    13: [[0, 1]],
    14: [[0, 3]],
    15: [],
  };

  return lookup[caseIndex] ?? [];
}

function quantizePoint(point) {
  return `${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}`;
}

function extractContourPolylines(potentialGrid, level) {
  const height = potentialGrid.length;
  const width = potentialGrid[0]?.length ?? 0;
  const segments = [];

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const topLeft = potentialGrid[y][x];
      const topRight = potentialGrid[y][x + 1];
      const bottomRight = potentialGrid[y + 1][x + 1];
      const bottomLeft = potentialGrid[y + 1][x];
      const centerValue = (topLeft + topRight + bottomRight + bottomLeft) / 4;
      const caseIndex =
        (topLeft >= level ? 8 : 0) +
        (topRight >= level ? 4 : 0) +
        (bottomRight >= level ? 2 : 0) +
        (bottomLeft >= level ? 1 : 0);

      for (const [edgeA, edgeB] of segmentPairsForCell(caseIndex, centerValue, level)) {
        const start = edgePoint(x, y, edgeA, level, topLeft, topRight, bottomRight, bottomLeft);
        const end = edgePoint(x, y, edgeB, level, topLeft, topRight, bottomRight, bottomLeft);
        segments.push({ start, end });
      }
    }
  }

  const adjacency = new Map();
  const pointLookup = new Map();

  function connectPoint(point, segmentIndex) {
    const key = quantizePoint(point);
    pointLookup.set(key, point);
    const neighbors = adjacency.get(key) ?? [];
    neighbors.push(segmentIndex);
    adjacency.set(key, neighbors);
    return key;
  }

  const enrichedSegments = segments.map((segment, index) => ({
    ...segment,
    startKey: connectPoint(segment.start, index),
    endKey: connectPoint(segment.end, index),
    used: false,
  }));

  function walkPolyline(startSegmentIndex, startKey) {
    const polyline = [];
    let currentSegmentIndex = startSegmentIndex;
    let currentKey = startKey;

    while (currentSegmentIndex !== null) {
      const segment = enrichedSegments[currentSegmentIndex];
      if (segment.used) {
        break;
      }

      segment.used = true;
      const nextKey = segment.startKey === currentKey ? segment.endKey : segment.startKey;
      polyline.push(pointLookup.get(currentKey));
      polyline.push(pointLookup.get(nextKey));

      const nextCandidates = (adjacency.get(nextKey) ?? []).filter((index) => !enrichedSegments[index].used);
      currentSegmentIndex = nextCandidates[0] ?? null;
      currentKey = nextKey;
    }

    return polyline.filter((point, index, array) => (
      index === 0 ||
      point.x !== array[index - 1].x ||
      point.y !== array[index - 1].y
    ));
  }

  const polylines = [];

  for (let index = 0; index < enrichedSegments.length; index += 1) {
    const segment = enrichedSegments[index];
    if (segment.used) {
      continue;
    }

    polylines.push(walkPolyline(index, segment.startKey));
  }

  return polylines.filter((polyline) => polyline.length >= 2);
}

function polylineLength(polyline) {
  let total = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    total += Math.hypot(
      polyline[index].x - polyline[index - 1].x,
      polyline[index].y - polyline[index - 1].y,
    );
  }

  return total;
}

function samplePolylineAt(polyline, distance) {
  let remaining = distance;

  for (let index = 1; index < polyline.length; index += 1) {
    const segmentLength = Math.hypot(
      polyline[index].x - polyline[index - 1].x,
      polyline[index].y - polyline[index - 1].y,
    );

    if (remaining <= segmentLength) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: polyline[index - 1].x + t * (polyline[index].x - polyline[index - 1].x),
        y: polyline[index - 1].y + t * (polyline[index].y - polyline[index - 1].y),
      };
    }

    remaining -= segmentLength;
  }

  return polyline.at(-1);
}

function gradientMagnitudeAt(grid, x, y) {
  const epsilon = 1;
  const dVdx = (samplePotential(grid, x + epsilon, y) - samplePotential(grid, x - epsilon, y)) / (2 * epsilon);
  const dVdy = (samplePotential(grid, x, y + epsilon) - samplePotential(grid, x, y - epsilon)) / (2 * epsilon);
  return Math.hypot(dVdx, dVdy);
}

function chooseSeedPolylines(potentialGrid, preferredLevels) {
  const candidates = [];

  for (const level of preferredLevels) {
    const levelPolylines = extractContourPolylines(potentialGrid, level)
      .map((polyline) => ({
        level,
        polyline,
        length: polylineLength(polyline),
      }))
      .filter((entry) => entry.length > 10)
      .sort((left, right) => {
        const leftScore = left.length + contourSpan(left);
        const rightScore = right.length + contourSpan(right);
        return rightScore - leftScore;
      })
      .slice(0, 3);

    for (const polyline of levelPolylines) {
      candidates.push({
        level: polyline.level,
        polyline: polyline.polyline,
        length: polyline.length,
      });
    }
  }

  candidates.sort((left, right) => {
    const leftScore = left.length + contourSpan(left);
    const rightScore = right.length + contourSpan(right);
    return rightScore - leftScore;
  });
  return candidates.filter((candidate) => candidate.length > 10).slice(0, 16);
}

function contourSpan(entry) {
  const xs = entry.polyline.map((point) => point.x);
  const ys = entry.polyline.map((point) => point.y);
  return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
}

function splitContoursIntoBands(seedPolylines) {
  if (seedPolylines.length === 0) {
    return { inner: [], middle: [], outer: [] };
  }

  const sorted = [...seedPolylines]
    .map((entry) => ({ ...entry, span: contourSpan(entry) }))
    .sort((left, right) => left.span - right.span);

  const innerCut = Math.ceil(sorted.length / 3);
  const outerCut = Math.ceil((2 * sorted.length) / 3);

  return {
    inner: sorted.slice(0, innerCut),
    middle: sorted.slice(innerCut, outerCut),
    outer: sorted.slice(outerCut),
  };
}

function createSeedPoints(seedPolylines, potentialGrid, lineCount, gradientWeight = 0.35) {
  if (seedPolylines.length === 0) {
    return [];
  }

  const perPolylineCounts = seedPolylines.map(() => 1);
  let assignedCount = perPolylineCounts.length;

  while (assignedCount < lineCount) {
    const nextIndex = perPolylineCounts
      .map((count, index) => ({
        index,
        score: seedPolylines[index].length / (count + 1),
      }))
      .sort((left, right) => right.score - left.score)[0]?.index;

    if (nextIndex === undefined) {
      break;
    }

    perPolylineCounts[nextIndex] += 1;
    assignedCount += 1;
  }

  const seeds = [];

  seedPolylines.forEach((entry, index) => {
    const count = perPolylineCounts[index];
    const segmentData = [];
    let totalLength = 0;
    let totalGradientMagnitude = 0;

    for (let pointIndex = 1; pointIndex < entry.polyline.length; pointIndex += 1) {
      const start = entry.polyline[pointIndex - 1];
      const end = entry.polyline[pointIndex];
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      const midpointX = (start.x + end.x) / 2;
      const midpointY = (start.y + end.y) / 2;
      const gradientMagnitude = gradientMagnitudeAt(potentialGrid, midpointX, midpointY);
      segmentData.push({ start, end, segmentLength, gradientMagnitude });
      totalLength += segmentLength;
      totalGradientMagnitude += gradientMagnitude;
    }

    const averageGradientMagnitude = segmentData.length === 0
      ? 1
      : Math.max(totalGradientMagnitude / segmentData.length, 1e-6);
    const cumulativeWeights = [0];
    let totalWeight = 0;

    for (const segment of segmentData) {
      const normalizedGradient = segment.gradientMagnitude / averageGradientMagnitude;
      const blendedWeight = segment.segmentLength * (
        (1 - gradientWeight) + gradientWeight * normalizedGradient
      );
      totalWeight += blendedWeight;
      cumulativeWeights.push(totalWeight);
    }

    for (let seedIndex = 0; seedIndex < count; seedIndex += 1) {
      const targetWeight = count === 1 ? totalWeight / 2 : (seedIndex / (count - 1)) * totalWeight;
      let segmentIndex = 1;

      while (segmentIndex < cumulativeWeights.length && cumulativeWeights[segmentIndex] < targetWeight) {
        segmentIndex += 1;
      }

      const leftWeight = cumulativeWeights[segmentIndex - 1] ?? 0;
      const rightWeight = cumulativeWeights[segmentIndex] ?? totalWeight;
      const localT = rightWeight === leftWeight ? 0 : (targetWeight - leftWeight) / (rightWeight - leftWeight);
      const segment = segmentData[Math.max(0, Math.min(segmentData.length - 1, segmentIndex - 1))];
      const start = segment?.start ?? entry.polyline[0];
      const end = segment?.end ?? entry.polyline.at(-1);

      seeds.push({
        x: start.x + localT * (end.x - start.x),
        y: start.y + localT * (end.y - start.y),
      });
    }
  });

  return seeds;
}

function distributeCounts(totalCount, groupCount) {
  if (groupCount === 0) {
    return [];
  }

  const base = Math.floor(totalCount / groupCount);
  let remainder = totalCount % groupCount;

  return Array.from({ length: groupCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return value;
  });
}

function createBandSeedPoints(seedBands, potentialGrid, lineCount, gradientWeight = 0.35) {
  const bandEntries = [
    { name: "inner", entries: seedBands.inner },
    { name: "middle", entries: seedBands.middle },
    { name: "outer", entries: seedBands.outer },
  ].filter((band) => band.entries.length > 0);

  if (bandEntries.length === 0 || lineCount <= 0) {
    return [];
  }

  const counts = distributeCounts(lineCount, bandEntries.length);
  const seeds = [];

  bandEntries.forEach((band, index) => {
    seeds.push(
      ...createSeedPoints(
        band.entries,
        potentialGrid,
        counts[index],
        gradientWeight,
      ),
    );
  });

  return seeds;
}

function resamplePolyline(polyline, step = 4) {
  const totalLength = polylineLength(polyline);

  if (totalLength === 0) {
    return polyline.slice(0, 1);
  }

  const pointCount = Math.max(2, Math.ceil(totalLength / step) + 1);
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    const distance = (index / (pointCount - 1)) * totalLength;
    points.push(samplePolylineAt(polyline, distance));
  }

  return points;
}

function coverageCellKey(x, y, cellSize) {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
}

function candidateCoverage(polyline, cellSize, width, height) {
  const coveredCells = new Set();
  const sampledPoints = resamplePolyline(polyline, Math.max(2, cellSize / 2));

  for (const point of sampledPoints) {
    if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) {
      continue;
    }

    coveredCells.add(coverageCellKey(point.x, point.y, cellSize));
  }

  return coveredCells;
}

function isOuterCoverageCell(cellKey, cellSize, width, height) {
  const [cellX, cellY] = cellKey.split(":").map(Number);
  const centerX = (cellX + 0.5) * cellSize;
  const centerY = (cellY + 0.5) * cellSize;
  const normalizedX = Math.abs(centerX - width / 2) / (width / 2);
  const normalizedY = Math.abs(centerY - height / 2) / (height / 2);
  return normalizedX > 0.55 || normalizedY > 0.55;
}

function candidateSpanScore(polyline) {
  const xs = polyline.map((point) => point.x);
  const ys = polyline.map((point) => point.y);
  return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
}

function selectEvenlySpacedStreamlines(candidates, lineCount, width, height, options = {}) {
  if (lineCount <= 0 || candidates.length === 0) {
    return [];
  }

  const {
    baseCoverageWeight = 1000,
    outerCoverageWeight = 1400,
    spanWeight = 2,
    lengthWeight = 1,
  } = options;
  const cellSize = Math.max(12, Math.round(Math.min(width, height) / 18));
  const accepted = [];
  const coveredCells = new Set();
  const remaining = candidates.map((candidate) => ({
    ...candidate,
    coverage: candidateCoverage(candidate.polyline, cellSize, width, height),
    outerCoverage: new Set(),
    spanScore: candidateSpanScore(candidate.polyline),
    lengthScore: polylineLength(candidate.polyline),
  }));

  for (const candidate of remaining) {
    for (const cell of candidate.coverage) {
      if (isOuterCoverageCell(cell, cellSize, width, height)) {
        candidate.outerCoverage.add(cell);
      }
    }
  }

  while (accepted.length < lineCount && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let newCoverage = 0;
      let newOuterCoverage = 0;

      for (const cell of candidate.coverage) {
        if (!coveredCells.has(cell)) {
          newCoverage += 1;
        }
      }

      for (const cell of candidate.outerCoverage) {
        if (!coveredCells.has(cell)) {
          newOuterCoverage += 1;
        }
      }

      const score =
        newCoverage * baseCoverageWeight +
        newOuterCoverage * outerCoverageWeight +
        candidate.spanScore * spanWeight +
        candidate.lengthScore * lengthWeight;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    accepted.push(selected.polyline);

    for (const cell of selected.coverage) {
      coveredCells.add(cell);
    }
  }

  return accepted;
}

function samplePotential(grid, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return 0;
  }

  const width = grid[0].length;
  const height = grid.length;
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const top = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx;
  const bottom = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

function gradientAt(grid, x, y) {
  const epsilon = 1;
  const dVdx = (samplePotential(grid, x + epsilon, y) - samplePotential(grid, x - epsilon, y)) / (2 * epsilon);
  const dVdy = (samplePotential(grid, x, y + epsilon) - samplePotential(grid, x, y - epsilon)) / (2 * epsilon);
  const fieldX = -dVdx;
  const fieldY = -dVdy;
  const magnitude = Math.hypot(fieldX, fieldY);

  if (magnitude < 1e-6) {
    return null;
  }

  return {
    directionX: fieldX / magnitude,
    directionY: fieldY / magnitude,
  };
}

function rk4Direction(grid, x, y, stepSize, direction) {
  const k1 = gradientAt(grid, x, y);
  if (!k1) {
    return null;
  }

  const k2 = gradientAt(
    grid,
    x + direction * 0.5 * stepSize * k1.directionX,
    y + direction * 0.5 * stepSize * k1.directionY,
  );
  if (!k2) {
    return k1;
  }

  const k3 = gradientAt(
    grid,
    x + direction * 0.5 * stepSize * k2.directionX,
    y + direction * 0.5 * stepSize * k2.directionY,
  );
  if (!k3) {
    return k2;
  }

  const k4 = gradientAt(
    grid,
    x + direction * stepSize * k3.directionX,
    y + direction * stepSize * k3.directionY,
  );
  if (!k4) {
    return k3;
  }

  const directionX = (k1.directionX + 2 * k2.directionX + 2 * k3.directionX + k4.directionX) / 6;
  const directionY = (k1.directionY + 2 * k2.directionY + 2 * k3.directionY + k4.directionY) / 6;
  const magnitude = Math.hypot(directionX, directionY);

  if (magnitude < 1e-6) {
    return null;
  }

  return {
    directionX: directionX / magnitude,
    directionY: directionY / magnitude,
  };
}

function traceStreamline(potentialGrid, seed, direction, options) {
  const { width, height, stepSize, maxSteps, stopMargin } = options;
  const points = [{ x: seed.x, y: seed.y }];
  let currentX = seed.x;
  let currentY = seed.y;

  for (let step = 0; step < maxSteps; step += 1) {
    if (
      step > 0 &&
      (
        currentX < stopMargin ||
        currentX >= width - 1 - stopMargin ||
        currentY < stopMargin ||
        currentY >= height - 1 - stopMargin
      )
    ) {
      break;
    }

    const nextDirection = rk4Direction(potentialGrid, currentX, currentY, stepSize, direction);

    if (!nextDirection) {
      break;
    }

    currentX += direction * stepSize * nextDirection.directionX;
    currentY += direction * stepSize * nextDirection.directionY;
    points.push({ x: currentX, y: currentY });
  }

  return points;
}

function mergeStreamlineParts(backwardPoints, forwardPoints) {
  const backward = [...backwardPoints].reverse();
  return [...backward.slice(0, -1), ...forwardPoints];
}

function traceBidirectionalStreamline(potentialGrid, seed, tracingOptions) {
  const backward = traceStreamline(potentialGrid, seed, -1, tracingOptions);
  const forward = traceStreamline(potentialGrid, seed, 1, tracingOptions);
  return mergeStreamlineParts(backward, forward);
}

function traceForwardStreamline(potentialGrid, seed, tracingOptions) {
  return traceStreamline(potentialGrid, seed, 1, tracingOptions);
}

function buildCandidatePolylines(potentialGrid, seeds, tracingOptions, tracer) {
  const candidates = [];

  for (const seed of seeds) {
    const polyline = tracer(potentialGrid, seed, tracingOptions);
    const length = polylineLength(polyline);

    if (polyline.length >= 2 && length > 20) {
      candidates.push({ polyline, length });
    }
  }

  return candidates;
}

export function createFieldLineOverlayFromPotentialGrid(potentialGrid, options = {}) {
  const height = potentialGrid.length;
  const width = potentialGrid[0]?.length ?? 0;

  if (height === 0 || width === 0) {
    throw new TypeError("Potential grid must be a non-empty matrix.");
  }

  const {
    lineCount = 31,
    stepSize = 0.8,
    maxSteps = 6000,
    stopMargin = 1,
    preferredLevels = [0, -1, 1, -2, 2, -4, 4, -8, 8, -12, 12],
    netCharge = 0,
    outerPreferredLevels = [-1, 1, -2, 2, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24],
    outerCoverageWeight = 1400,
  } = options;

  const chosenContours = chooseSeedPolylines(potentialGrid, preferredLevels);
  const balancedOuterLineCount = netCharge === 0 ? Math.floor(lineCount / 3) : 0;
  const infinityLineCount = netCharge === 0 ? 0 : Math.floor(lineCount / 2);
  const outerLineCount = netCharge === 0 ? balancedOuterLineCount : infinityLineCount;
  const contourLineCount = Math.max(0, lineCount - outerLineCount);
  const outerContours = outerLineCount > 0
    ? chooseSeedPolylines(potentialGrid, outerPreferredLevels)
        .filter((entry) => {
          const xs = entry.polyline.map((point) => point.x);
          const ys = entry.polyline.map((point) => point.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const touchesOuterArea =
            minX < width * 0.15 ||
            maxX > width * 0.85 ||
            minY < height * 0.15 ||
            maxY > height * 0.85;
          return touchesOuterArea;
        })
        .slice(0, 8)
    : [];

  if (chosenContours.length === 0 && outerContours.length === 0) {
    return createBooleanGrid(width, height);
  }

  const overlay = createBooleanGrid(width, height);
  const contourBands = splitContoursIntoBands(chosenContours);
  const contourSeedCount = Math.max(contourLineCount * 5, contourLineCount);
  const seeds = contourLineCount > 0
    ? createBandSeedPoints(contourBands, potentialGrid, contourSeedCount)
    : [];
  const outerSeedCount = Math.max(outerLineCount * 4, outerLineCount);
  const outerSeeds = outerLineCount > 0
    ? createSeedPoints(outerContours, potentialGrid, outerSeedCount)
    : [];
  const tracingOptions = {
    width,
    height,
    stepSize,
    maxSteps,
    stopMargin,
  };
  const contourCandidates = buildCandidatePolylines(
    potentialGrid,
    seeds,
    tracingOptions,
    traceBidirectionalStreamline,
  );
  const outerCandidates = buildCandidatePolylines(
    potentialGrid,
    outerSeeds,
    tracingOptions,
    traceForwardStreamline,
  );
  const selectedContours = selectEvenlySpacedStreamlines(
    contourCandidates,
    contourLineCount,
    width,
    height,
    { outerCoverageWeight },
  );
  const selectedOuterContours = selectEvenlySpacedStreamlines(
    outerCandidates,
    outerLineCount,
    width,
    height,
    { outerCoverageWeight },
  );

  for (const streamline of selectedContours) {
    for (let index = 1; index < streamline.length; index += 1) {
      drawLine(
        overlay,
        streamline[index - 1].x,
        streamline[index - 1].y,
        streamline[index].x,
        streamline[index].y,
      );
    }
  }

  for (const streamline of selectedOuterContours) {
    for (let index = 1; index < streamline.length; index += 1) {
      drawLine(
        overlay,
        streamline[index - 1].x,
        streamline[index - 1].y,
        streamline[index].x,
        streamline[index].y,
      );
    }
  }

  return overlay;
}

export function createFieldLineOverlay(pointCharges, options = {}) {
  const {
    width = DEFAULT_GRID_WIDTH,
    height = DEFAULT_GRID_HEIGHT,
    cutoff = DEFAULT_POTENTIAL_CUTOFF,
    scale = DEFAULT_POTENTIAL_SCALE,
    potentialGrid,
    ...fieldLineOptions
  } = options;

  const resolvedPotentialGrid = potentialGrid ?? createPotentialGrid(pointCharges, {
    width,
    height,
    cutoff,
    scale,
  });
  const totalCharge = pointCharges.reduce((sum, pointCharge) => sum + pointCharge.charge, 0);

  return createFieldLineOverlayFromPotentialGrid(resolvedPotentialGrid, {
    ...fieldLineOptions,
    netCharge: totalCharge,
  });
}
