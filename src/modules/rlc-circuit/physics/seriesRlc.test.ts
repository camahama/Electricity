import assert from "node:assert/strict";
import test from "node:test";
import { capacitorVoltageAt, computeRlcModel, inductorVoltageAt, resistorVoltageAt, sourceVoltageAt } from "./seriesRlc.js";

test("computes a series RLC model from component values", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 100e-3,
    capacitance: 10e-6,
    sourceVoltage: 10,
    frequency: 50,
  });

  assertAlmostEqual(model.omega, 100 * Math.PI);
  assertAlmostEqual(model.impedance, 303.823, 1e-3);
  assertAlmostEqual(model.currentAmplitude, 0.0329139, 1e-7);
  assertAlmostEqual(model.resistorVoltageAmplitude, 3.29139, 1e-5);
  assertAlmostEqual(model.inductorVoltageAmplitude, 1.03402, 1e-5);
  assertAlmostEqual(model.capacitorVoltageAmplitude, 10.4768, 1e-4);
});

test("source amplitude is the phasor sum of resistor and reactive voltages", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 100e-3,
    capacitance: 10e-6,
    sourceVoltage: 10,
    frequency: 50,
  });

  const reactiveVoltage = model.inductorVoltageAmplitude - model.capacitorVoltageAmplitude;
  assertAlmostEqual(Math.hypot(model.resistorVoltageAmplitude, reactiveVoltage), model.sourceVoltageAmplitude);
});

test("time-domain source and resistor voltages use the calculated phase", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 100e-3,
    capacitance: 10e-6,
    sourceVoltage: 10,
    frequency: 50,
  });

  assert.equal(sourceVoltageAt(model, 0), 0);
  assertAlmostEqual(resistorVoltageAt(model, 0), model.resistorVoltageAmplitude * Math.sin(model.phase));
});

test("time-domain inductor and capacitor voltages are quarter-cycle shifted from the resistor voltage", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 100e-3,
    capacitance: 10e-6,
    sourceVoltage: 10,
    frequency: 50,
  });

  assertAlmostEqual(inductorVoltageAt(model, 0), model.inductorVoltageAmplitude * Math.sin(model.phase + Math.PI / 2));
  assertAlmostEqual(capacitorVoltageAt(model, 0), model.capacitorVoltageAmplitude * Math.sin(model.phase - Math.PI / 2));
});

test("supports a pure resistor by setting L to zero and C to infinity", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 0,
    capacitance: Infinity,
    sourceVoltage: 10,
    frequency: 50,
  });

  assert.equal(model.impedance, 100);
  assert.equal(model.currentAmplitude, 0.1);
  assert.equal(model.resistorVoltageAmplitude, 10);
  assert.equal(model.inductorVoltageAmplitude, 0);
  assert.equal(model.capacitorVoltageAmplitude, 0);
});

test("supports a pure inductor by setting R to zero and C to infinity", () => {
  const model = computeRlcModel({
    resistance: 0,
    inductance: 100e-3,
    capacitance: Infinity,
    sourceVoltage: 10,
    frequency: 50,
  });

  assertAlmostEqual(model.impedance, 31.4159, 1e-4);
  assertAlmostEqual(model.currentAmplitude, 0.31831, 1e-5);
  assertAlmostEqual(model.inductorVoltageAmplitude, 10);
  assert.equal(model.resistorVoltageAmplitude, 0);
  assert.equal(model.capacitorVoltageAmplitude, 0);
});

test("supports a pure capacitor by setting R and L to zero", () => {
  const model = computeRlcModel({
    resistance: 0,
    inductance: 0,
    capacitance: 10e-6,
    sourceVoltage: 10,
    frequency: 50,
  });

  assertAlmostEqual(model.impedance, 318.31, 1e-2);
  assertAlmostEqual(model.currentAmplitude, 0.0314159, 1e-7);
  assertAlmostEqual(model.capacitorVoltageAmplitude, 10);
  assert.equal(model.resistorVoltageAmplitude, 0);
  assert.equal(model.inductorVoltageAmplitude, 0);
});

test("treats zero capacitance as an open capacitor", () => {
  const model = computeRlcModel({
    resistance: 100,
    inductance: 100e-3,
    capacitance: 0,
    sourceVoltage: 10,
    frequency: 50,
  });

  assert.equal(model.impedance, Infinity);
  assert.equal(model.currentAmplitude, 0);
  assert.equal(model.resistorVoltageAmplitude, 0);
  assert.equal(model.inductorVoltageAmplitude, 0);
  assert.equal(model.capacitorVoltageAmplitude, 10);
});

function assertAlmostEqual(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}
