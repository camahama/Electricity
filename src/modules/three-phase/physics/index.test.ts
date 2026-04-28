import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLineAndNeutralCurrents,
  magnitude,
  resistiveImpedanceFromPower,
} from "./index.js";

test("balanced Y loads cancel neutral current", () => {
  const voltageRms = 230;
  const impedance = resistiveImpedanceFromPower(1000, voltageRms);
  const result = calculateLineAndNeutralCurrents({
    yImpedances: [impedance, impedance, impedance],
    voltageRms,
  });

  assert.ok(magnitude(result.neutralCurrent) < 1e-10);
});

test("open loads produce zero current", () => {
  const result = calculateLineAndNeutralCurrents({
    yImpedances: [null, null, null],
    deltaImpedances: [null, null, null],
    voltageRms: 230,
  });

  assert.deepEqual(result.lineCurrents, [
    { re: 0, im: 0 },
    { re: 0, im: 0 },
    { re: 0, im: 0 },
  ]);
  assert.deepEqual(result.neutralCurrent, { re: 0, im: 0 });
});
