const TWO_PI = Math.PI * 2;

export type SeriesRlcValues = {
  resistance: number;
  capacitance: number;
  inductance: number;
  sourceVoltage: number;
  frequency: number;
};

export type SeriesRlcModel = {
  omega: number;
  impedance: number;
  currentAmplitude: number;
  phase: number;
  sourceVoltageAmplitude: number;
  frequency: number;
  resistorVoltageAmplitude: number;
  inductorVoltageAmplitude: number;
  capacitorVoltageAmplitude: number;
  resonanceFrequency: number;
};

export function computeRlcModel(values: SeriesRlcValues): SeriesRlcModel {
  const omega = TWO_PI * values.frequency;
  const inductiveReactance = omega * values.inductance;
  const capacitiveReactance = capacitanceReactance(omega, values.capacitance);
  const reactance = inductiveReactance - capacitiveReactance;
  const impedance = Math.hypot(values.resistance, reactance);
  const currentAmplitude = impedance === 0 ? Infinity : values.sourceVoltage / impedance;
  const phase = -Math.atan2(reactance, values.resistance);
  const voltageAmplitudes = componentVoltageAmplitudes(
    values.sourceVoltage,
    currentAmplitude,
    values.resistance,
    inductiveReactance,
    capacitiveReactance,
  );

  return {
    omega,
    impedance,
    currentAmplitude,
    phase,
    sourceVoltageAmplitude: values.sourceVoltage,
    frequency: values.frequency,
    resistorVoltageAmplitude: voltageAmplitudes.resistor,
    inductorVoltageAmplitude: voltageAmplitudes.inductor,
    capacitorVoltageAmplitude: voltageAmplitudes.capacitor,
    resonanceFrequency: resonanceFrequency(values.inductance, values.capacitance),
  };
}

function capacitanceReactance(omega: number, capacitance: number): number {
  if (capacitance === 0) {
    return Infinity;
  }
  if (!Number.isFinite(capacitance)) {
    return 0;
  }
  return 1 / (omega * capacitance);
}

function componentVoltageAmplitudes(
  sourceVoltage: number,
  currentAmplitude: number,
  resistance: number,
  inductiveReactance: number,
  capacitiveReactance: number,
): { resistor: number; inductor: number; capacitor: number } {
  if (!Number.isFinite(capacitiveReactance)) {
    return { resistor: 0, inductor: 0, capacitor: sourceVoltage };
  }
  if (!Number.isFinite(currentAmplitude)) {
    return { resistor: 0, inductor: 0, capacitor: 0 };
  }
  return {
    resistor: currentAmplitude * resistance,
    inductor: currentAmplitude * inductiveReactance,
    capacitor: currentAmplitude * capacitiveReactance,
  };
}

function resonanceFrequency(inductance: number, capacitance: number): number {
  if (inductance === 0 && !Number.isFinite(capacitance)) {
    return NaN;
  }
  if (inductance === 0) {
    return Infinity;
  }
  if (!Number.isFinite(capacitance)) {
    return 0;
  }
  if (capacitance === 0) {
    return Infinity;
  }
  return 1 / (TWO_PI * Math.sqrt(inductance * capacitance));
}

export function sourceVoltageAt(model: SeriesRlcModel, time: number): number {
  return model.sourceVoltageAmplitude * Math.sin(model.omega * time);
}

export function resistorVoltageAt(model: SeriesRlcModel, time: number): number {
  return model.resistorVoltageAmplitude * Math.sin(model.omega * time + model.phase);
}

export function inductorVoltageAt(model: SeriesRlcModel, time: number): number {
  return model.inductorVoltageAmplitude * Math.sin(model.omega * time + model.phase + Math.PI / 2);
}

export function capacitorVoltageAt(model: SeriesRlcModel, time: number): number {
  return model.capacitorVoltageAmplitude * Math.sin(model.omega * time + model.phase - Math.PI / 2);
}
