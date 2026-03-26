import test from "node:test";
import assert from "node:assert/strict";

import {
  createPotentialGrid,
  DEFAULT_POTENTIAL_CUTOFF,
} from "./potentialGrid.js";

test("creates a grid with the requested dimensions", () => {
  const grid = createPotentialGrid([], { width: 4, height: 3 });

  assert.equal(grid.length, 3);
  assert.equal(grid[0].length, 4);
  assert.deepEqual(grid, [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
});

test("clamps the potential at the exact charge location", () => {
  const grid = createPotentialGrid([{ x: 1, y: 1, charge: 2 }], {
    width: 3,
    height: 3,
  });

  assert.equal(grid[1][1], DEFAULT_POTENTIAL_CUTOFF);
});

test("supports negative charges", () => {
  const grid = createPotentialGrid([{ x: 1, y: 1, charge: -2 }], {
    width: 3,
    height: 3,
  });

  assert.equal(grid[1][1], -DEFAULT_POTENTIAL_CUTOFF);
  assert.equal(grid[1][2], -100);
});

test("adds contributions from multiple point charges", () => {
  const grid = createPotentialGrid(
    [
      { x: 0, y: 0, charge: 1 },
      { x: 4, y: 0, charge: 1 },
    ],
    { width: 5, height: 1 },
  );

  assert.deepEqual(grid[0], [100, 100, 100, 100, 100]);
});

test("rejects invalid charge magnitudes", () => {
  assert.throws(
    () => createPotentialGrid([{ x: 2, y: 2, charge: 1.5 }], { width: 5, height: 5 }),
    /non-zero integer charge/,
  );
});
