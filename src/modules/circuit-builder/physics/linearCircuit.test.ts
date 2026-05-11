import assert from "node:assert/strict";
import test from "node:test";
import { solveLinearCircuit } from "./linearCircuit.js";

test("solves a single battery and resistor loop", () => {
  const solution = solveLinearCircuit({
    nodes: ["ground", "n1"],
    groundNode: "ground",
    components: [
      { id: "b1", type: "battery", positiveNode: "n1", negativeNode: "ground", voltageVolts: 9 },
      { id: "r1", type: "resistor", nodeA: "n1", nodeB: "ground", resistanceOhms: 1000 },
    ],
  });

  assert.equal(solution.nodePotentials.ground, 0);
  assert.equal(solution.nodePotentials.n1, 9);
  assert.equal(current(solution, "r1"), 0.009);
  assertAlmostEqual(current(solution, "b1"), -0.009);
});

test("solves a resistor divider", () => {
  const solution = solveLinearCircuit({
    nodes: ["ground", "supply", "middle"],
    groundNode: "ground",
    components: [
      { id: "b1", type: "battery", positiveNode: "supply", negativeNode: "ground", voltageVolts: 10 },
      { id: "r1", type: "resistor", nodeA: "supply", nodeB: "middle", resistanceOhms: 1000 },
      { id: "r2", type: "resistor", nodeA: "middle", nodeB: "ground", resistanceOhms: 1000 },
    ],
  });

  assert.equal(solution.nodePotentials.supply, 10);
  assert.equal(solution.nodePotentials.middle, 5);
  assert.equal(current(solution, "r1"), 0.005);
  assert.equal(current(solution, "r2"), 0.005);
  assert.equal(current(solution, "b1"), -0.005);
});

test("merges nodes joined by ideal wires", () => {
  const solution = solveLinearCircuit({
    nodes: ["ground", "supply", "wired", "load"],
    groundNode: "ground",
    components: [
      { id: "w1", type: "wire", nodeA: "supply", nodeB: "wired" },
      { id: "b1", type: "battery", positiveNode: "supply", negativeNode: "ground", voltageVolts: 6 },
      { id: "r1", type: "resistor", nodeA: "wired", nodeB: "load", resistanceOhms: 100 },
      { id: "r2", type: "resistor", nodeA: "load", nodeB: "ground", resistanceOhms: 200 },
    ],
  });

  assert.equal(solution.nodePotentials.supply, 6);
  assert.equal(solution.nodePotentials.wired, 6);
  assert.equal(solution.nodePotentials.load, 4);
  assert.equal(current(solution, "r1"), 0.02);
  assert.equal(current(solution, "r2"), 0.02);
  assertAlmostEqual(current(solution, "w1"), 0.02, 1e-9);
});

test("normalizes numerical residue to zero", () => {
  const solution = solveLinearCircuit({
    nodes: ["ground", "n1"],
    groundNode: "ground",
    components: [
      { id: "b1", type: "battery", positiveNode: "n1", negativeNode: "ground", voltageVolts: 1e-10 },
      { id: "r1", type: "resistor", nodeA: "n1", nodeB: "ground", resistanceOhms: 1 },
    ],
  });

  assert.equal(solution.nodePotentials.n1, 0);
  assert.equal(current(solution, "r1"), 0);
  assert.equal(current(solution, "b1"), 0);
});

test("rejects floating circuits as singular", () => {
  assert.throws(
    () =>
      solveLinearCircuit({
        nodes: ["ground", "n1", "n2"],
        groundNode: "ground",
        components: [{ id: "r1", type: "resistor", nodeA: "n1", nodeB: "n2", resistanceOhms: 100 }],
      }),
    /singular/i,
  );
});

test("limits circuits to 100 connection points", () => {
  assert.throws(
    () =>
      solveLinearCircuit({
        nodes: Array.from({ length: 101 }, (_, index) => `n${index}`),
        groundNode: "n0",
        components: [],
      }),
    /at most 100/i,
  );
});

function current(solution: ReturnType<typeof solveLinearCircuit>, componentId: string): number | null {
  const result = solution.componentCurrents.find((entry) => entry.componentId === componentId);
  assert.ok(result, `Missing current result for ${componentId}`);
  return result.currentAmps;
}

function assertAlmostEqual(actual: number | null, expected: number, tolerance = 1e-12): void {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}
