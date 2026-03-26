import test from "node:test";
import assert from "node:assert/strict";

import { createPotentialGrid } from "../physics/potentialGrid.js";
import { createEquipotentialOverlay } from "./equipotentialOverlay.js";
import { createFieldLineOverlay } from "./fieldLineOverlay.js";

function countMarkedPixels(overlay) {
  return overlay.flat().filter(Boolean).length;
}

test("field line overlay marks pixels for a simple dipole", () => {
  const overlay = createFieldLineOverlay(
    [
      { x: 15, y: 20, charge: 1 },
      { x: 35, y: 20, charge: -1 },
    ],
    { width: 50, height: 40, seedsPerChargeUnit: 4, maxSteps: 300 },
  );

  assert.ok(countMarkedPixels(overlay) > 0);
});

test("field line overlay can cover outer regions for net charge imbalance", () => {
  const overlay = createFieldLineOverlay(
    [
      { x: 15, y: 20, charge: 2 },
      { x: 35, y: 20, charge: -1 },
    ],
    { width: 50, height: 40, lineCount: 31, stepSize: 0.8, maxSteps: 3000 },
  );

  const touchesOuterRegion = overlay
    .flatMap((row, y) => row.map((value, x) => ({ value, x, y })))
    .some(({ value, x, y }) => value && (
      x < 5 || x > 44 || y < 4 || y > 35
    ));

  assert.ok(touchesOuterRegion);
});

test("equipotential overlay marks contour pixels from a potential grid", () => {
  const grid = createPotentialGrid(
    [
      { x: 15, y: 20, charge: 1 },
      { x: 35, y: 20, charge: -1 },
    ],
    { width: 50, height: 40 },
  );

  const overlay = createEquipotentialOverlay(grid);

  assert.ok(countMarkedPixels(overlay) > 0);
});
