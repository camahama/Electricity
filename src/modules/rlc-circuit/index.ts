import type { ModuleRenderContext } from "../../config/modules.js";
import { createPackageCredit } from "../../components/packageCredit.js";
import {
  capacitorVoltageAt,
  computeRlcModel,
  inductorVoltageAt,
  resistorVoltageAt,
  sourceVoltageAt,
  type SeriesRlcModel,
} from "./physics/seriesRlc.js";

const SCOPE_SIZE = 460;
const PHASOR_WIDTH = 360;
const PHASOR_HEIGHT = 460;
const TIME_SCALE_STEPS = [0.5e-3, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3];
const VOLTAGE_SCALE_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
const RESISTANCE_STEPS = [0, 1, 10, 20, 50, 100, 200, 500, 1000];
const INDUCTANCE_STEPS = [0, 10, 20, 50, 100, 200, 500, 1000];
const CAPACITANCE_STEPS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, Infinity];
const SOURCE_VOLTAGE_STEPS = [1, 2, 5, 10, 20, 50];
const ANIMATION_SLOWDOWN = 100;
const SCOPE_SAMPLES_PER_PERIOD = 64;
const SCOPE_MAX_SAMPLES = 6000;
const SCOPE_TRACE_OPTIONS = ["source", "R", "L", "C"] as const;

type ScopeTrace = (typeof SCOPE_TRACE_OPTIONS)[number];
type ScopeChannel = "channel1" | "channel2";
type ScopeTraceDetails = {
  amplitude: number;
  subscript: string | null;
  voltageAt: (time: number) => number;
  waveClass: string;
  legendClass: string;
  labelClass: string;
};

type RlcState = {
  resistance: number;
  capacitance: number;
  inductance: number;
  sourceVoltage: number;
  frequency: number;
  timeScale: number;
  channel1VoltageScale: number;
  channel2VoltageScale: number;
  diagramExpanded: boolean;
  timeRunning: boolean;
  animationTime: number;
  channel1Trace: ScopeTrace;
  channel2Trace: ScopeTrace;
};

const state: RlcState = {
  resistance: 100,
  capacitance: 10e-6,
  inductance: 100e-3,
  sourceVoltage: 10,
  frequency: 50,
  timeScale: 5e-3,
  channel1VoltageScale: 5,
  channel2VoltageScale: 5,
  diagramExpanded: false,
  timeRunning: false,
  animationTime: 0,
  channel1Trace: "source",
  channel2Trace: "R",
};

export function renderRlcCircuitModule({ t, language = "en" }: ModuleRenderContext): HTMLElement {
  const page = document.createElement("main");
  page.className = "page-shell rlc-shell";

  const content = element("section", "module-page module-page-wide rlc-page");
  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "module-menu-button";
  backLink.textContent = t("common.menuButton");

  const header = element("header", "rlc-header");
  const headerInfo = element("div", "module-header-info");
  headerInfo.append(element("p", "module-description", t("modules.rlcCircuit.description")), backLink);
  header.append(
    element("h1", "module-title", t("modules.rlcCircuit.title")),
    headerInfo,
  );

  const layout = element("div", "rlc-layout");
  const controls = element("aside", "rlc-controls");
  const stage = element("section", "rlc-stage");
  const display = element("div", "rlc-display");
  const scopeBox = element("div", "rlc-scope-box");
  const phasorBox = element("div", "rlc-phasor-box");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const phasorSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const scopeKnobs = element("div", "rlc-scope-knobs");
  const timeButton = document.createElement("button");
  const readout = element("div", "rlc-readout");
  let pendingFrame: number | null = null;
  let animationFrame: number | null = null;
  let animationStartMs = 0;

  svg.setAttribute("viewBox", `0 0 ${SCOPE_SIZE} ${SCOPE_SIZE}`);
  svg.setAttribute("class", "rlc-scope");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("modules.rlcCircuit.scopeLabel"));
  phasorSvg.setAttribute("viewBox", `0 0 ${PHASOR_WIDTH} ${PHASOR_HEIGHT}`);
  phasorSvg.setAttribute("class", "rlc-phasor");
  phasorSvg.setAttribute("role", "img");
  phasorSvg.setAttribute("aria-label", t("modules.rlcCircuit.phasorLabel"));
  timeButton.type = "button";
  timeButton.className = "rlc-time-button";
  timeButton.addEventListener("click", toggleTime);

  function update() {
    renderControls();
    renderScopeKnobs();
    renderTimeButton();
    updateDiagrams();
  }

  function updateDiagrams() {
    if (pendingFrame != null) {
      cancelAnimationFrame(pendingFrame);
    }
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      renderScope();
      renderPhasor();
      renderReadout();
    });
  }

  function updateKnobs() {
    renderScopeKnobs();
    updateDiagrams();
  }

  function updateScopeTrace(channel: ScopeChannel, trace: ScopeTrace) {
    setChannelTrace(channel, trace);
    renderScopeKnobs();
    updateDiagrams();
  }

  function toggleTime() {
    if (state.timeRunning) {
      stopTime();
      return;
    }
    state.timeRunning = true;
    animationStartMs = performance.now();
    renderTimeButton();
    animationFrame = requestAnimationFrame(tickTime);
  }

  function stopTime() {
    state.timeRunning = false;
    state.animationTime = 0;
    if (animationFrame != null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    renderTimeButton();
    renderScope();
    renderPhasor();
  }

  function tickTime(timestamp: number) {
    if (!page.isConnected) {
      state.timeRunning = false;
      animationFrame = null;
      return;
    }
    state.animationTime = (timestamp - animationStartMs) / 1000 / ANIMATION_SLOWDOWN;
    renderScope();
    renderPhasor();
    animationFrame = requestAnimationFrame(tickTime);
  }

  function renderTimeButton() {
    timeButton.textContent = state.timeRunning ? t("modules.rlcCircuit.stopTime") : t("modules.rlcCircuit.startTime");
  }

  function updateDiagramButton() {
    renderControls();
    renderReadout();
  }

  function renderControls() {
    controls.replaceChildren();
    controls.append(element("h2", "rlc-panel-title", t("modules.rlcCircuit.controlsTitle")));
    controls.append(
      steppedSlider(controlLabel(t("modules.rlcCircuit.resistance"), "R"), state.resistance, RESISTANCE_STEPS, "Ω", (value) => {
        state.resistance = value;
        updateDiagrams();
      }),
      steppedSlider(controlLabel(t("modules.rlcCircuit.inductance"), "L"), state.inductance * 1000, INDUCTANCE_STEPS, "mH", (value) => {
        state.inductance = value / 1000;
        updateDiagrams();
      }),
      steppedSlider(controlLabel(t("modules.rlcCircuit.capacitance"), "C"), state.capacitance * 1_000_000, CAPACITANCE_STEPS, "µF", (value) => {
        state.capacitance = value === Infinity ? Infinity : value / 1_000_000;
        updateDiagrams();
      }),
      steppedSlider(controlLabel(t("modules.rlcCircuit.sourceVoltage"), "Û"), state.sourceVoltage, SOURCE_VOLTAGE_STEPS, "V", (value) => {
        state.sourceVoltage = value;
        updateDiagrams();
      }),
      slider(controlLabel(t("modules.rlcCircuit.frequency"), "f"), state.frequency, 1, 1000, 1, "Hz", (value) => {
        state.frequency = value;
        updateDiagrams();
      }),
      renderCircuitDiagram(t("modules.rlcCircuit.expandDiagram")),
      readout,
    );
  }

  function renderScope() {
    svg.replaceChildren();
    const model = computeRlcModel(state);
    const channel1 = scopeTraceDetails(model, state.channel1Trace);
    const channel2 = scopeTraceDetails(model, state.channel2Trace);
    const plot = { x: 44, y: 28, width: 370, height: 350 };
    const centerY = plot.y + plot.height / 2;
    const totalTime = state.timeScale * 10;
    const channel1VoltsPerPixel = state.channel1VoltageScale / (plot.height / 8);
    const channel2VoltsPerPixel = state.channel2VoltageScale / (plot.height / 8);

    appendRect(svg, plot.x, plot.y, plot.width, plot.height, "rlc-scope-screen");
    for (let index = 0; index <= 10; index += 1) {
      const x = plot.x + (plot.width * index) / 10;
      appendLine(svg, x, plot.y, x, plot.y + plot.height, "rlc-scope-grid");
    }
    for (let index = 0; index <= 8; index += 1) {
      const y = plot.y + (plot.height * index) / 8;
      appendLine(svg, plot.x, y, plot.x + plot.width, y, "rlc-scope-grid");
    }
    appendLine(svg, plot.x, centerY, plot.x + plot.width, centerY, "rlc-scope-axis");

    const channel1Path: string[] = [];
    const channel2Path: string[] = [];
    const visiblePeriods = Math.max(1, model.frequency * totalTime);
    const sampleCount = Math.min(SCOPE_MAX_SAMPLES, Math.ceil(Math.max(plot.width, visiblePeriods * SCOPE_SAMPLES_PER_PERIOD)));
    for (let index = 0; index <= sampleCount; index += 1) {
      const fraction = index / sampleCount;
      const tValue = fraction * totalTime + state.animationTime;
      const x = plot.x + plot.width * fraction;
      const channel1Y = centerY - finiteVoltage(channel1.voltageAt(tValue)) / channel1VoltsPerPixel;
      const channel2Y = centerY - finiteVoltage(channel2.voltageAt(tValue)) / channel2VoltsPerPixel;
      channel1Path.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${channel1Y.toFixed(2)}`);
      channel2Path.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${channel2Y.toFixed(2)}`);
    }

    appendPath(svg, channel1Path.join(" "), channel1.waveClass);
    appendPath(svg, channel2Path.join(" "), channel2.waveClass);
    appendScopeLegend(svg, plot.x, plot.y + plot.height + 30, t("modules.rlcCircuit.channel1"), channel1);
    appendScopeLegend(svg, plot.x + 188, plot.y + plot.height + 30, t("modules.rlcCircuit.channel2"), channel2);
  }

  function renderScopeKnobs() {
    scopeKnobs.replaceChildren(
      knob(t("modules.rlcCircuit.timeScale"), state.timeScale, TIME_SCALE_STEPS, (value) => {
        state.timeScale = value;
        updateKnobs();
      }, (value) => `${formatNumber(value * 1000)} ms/div`),
      scopeChannelControl("channel1", t("modules.rlcCircuit.channel1")),
      scopeChannelControl("channel2", t("modules.rlcCircuit.channel2")),
    );
  }

  function scopeTraceDetails(model: SeriesRlcModel, trace: ScopeTrace): ScopeTraceDetails {
    if (trace === "source") {
      return {
        amplitude: model.sourceVoltageAmplitude,
        subscript: null,
        voltageAt: (time: number) => sourceVoltageAt(model, time),
        waveClass: "rlc-wave-source",
        legendClass: "rlc-scope-legend-source",
        labelClass: "rlc-scope-label source",
      };
    }
    if (trace === "L") {
      return {
        amplitude: model.inductorVoltageAmplitude,
        subscript: "L",
        voltageAt: (time: number) => inductorVoltageAt(model, time),
        waveClass: "rlc-wave-inductor",
        legendClass: "rlc-scope-legend-inductor",
        labelClass: "rlc-scope-label inductor",
      };
    }
    if (trace === "C") {
      return {
        amplitude: model.capacitorVoltageAmplitude,
        subscript: "C",
        voltageAt: (time: number) => capacitorVoltageAt(model, time),
        waveClass: "rlc-wave-capacitor",
        legendClass: "rlc-scope-legend-capacitor",
        labelClass: "rlc-scope-label capacitor",
      };
    }
    return {
      amplitude: model.resistorVoltageAmplitude,
      subscript: "R",
      voltageAt: (time: number) => resistorVoltageAt(model, time),
      waveClass: "rlc-wave-resistor",
      legendClass: "rlc-scope-legend-resistor",
      labelClass: "rlc-scope-label resistor",
    };
  }

  function scopeChannelControl(channel: ScopeChannel, labelText: string) {
    const wrapper = element("div", "rlc-channel-control");
    wrapper.append(
      element("span", "rlc-channel-label", labelText),
      knob(null, channelVoltageScale(channel), VOLTAGE_SCALE_STEPS, (value) => {
        setChannelVoltageScale(channel, value);
        updateKnobs();
      }, formatVoltageScale),
      scopeTraceToggle(channel),
    );
    return wrapper;
  }

  function scopeTraceToggle(channel: ScopeChannel) {
    const wrapper = element("div", "rlc-channel-toggle");
    const activeIndex = SCOPE_TRACE_OPTIONS.indexOf(channelTrace(channel));
    wrapper.style.setProperty("--active-index", String(activeIndex));
    wrapper.append(element("span", "rlc-channel-thumb"));
    SCOPE_TRACE_OPTIONS.forEach((trace) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = trace === channelTrace(channel) ? "active" : "";
      button.append(richHtmlSymbol("u", trace === "source" ? undefined : trace));
      button.addEventListener("click", () => updateScopeTrace(channel, trace));
      wrapper.append(button);
    });
    return wrapper;
  }

  function channelTrace(channel: ScopeChannel): ScopeTrace {
    return channel === "channel1" ? state.channel1Trace : state.channel2Trace;
  }

  function setChannelTrace(channel: ScopeChannel, trace: ScopeTrace): void {
    if (channel === "channel1") {
      state.channel1Trace = trace;
    } else {
      state.channel2Trace = trace;
    }
  }

  function channelVoltageScale(channel: ScopeChannel): number {
    return channel === "channel1" ? state.channel1VoltageScale : state.channel2VoltageScale;
  }

  function setChannelVoltageScale(channel: ScopeChannel, value: number): void {
    if (channel === "channel1") {
      state.channel1VoltageScale = value;
    } else {
      state.channel2VoltageScale = value;
    }
  }

  function renderPhasor() {
    phasorSvg.replaceChildren();
    const model = computeRlcModel(state);
    const origin = { x: PHASOR_WIDTH / 2, y: PHASOR_HEIGHT / 2 };
    const scopePlotHeight = 370;
    const channel1 = scopeTraceDetails(model, state.channel1Trace);
    const channel2 = scopeTraceDetails(model, state.channel2Trace);
    const phasorVoltageScale = channel1.amplitude >= channel2.amplitude ? state.channel1VoltageScale : state.channel2VoltageScale;
    const scale = scopePlotHeight / 8 / phasorVoltageScale;
    const timeAngle = -model.omega * state.animationTime;
    appendRect(phasorSvg, 16, 28, PHASOR_WIDTH - 32, PHASOR_HEIGHT - 56, "rlc-phasor-screen");
    for (let index = 0; index <= 8; index += 1) {
      const x = 16 + ((PHASOR_WIDTH - 32) * index) / 8;
      const y = 28 + ((PHASOR_HEIGHT - 56) * index) / 8;
      appendLine(phasorSvg, x, 28, x, PHASOR_HEIGHT - 28, "rlc-phasor-grid");
      appendLine(phasorSvg, 16, y, PHASOR_WIDTH - 16, y, "rlc-phasor-grid");
    }
    appendLine(phasorSvg, 34, origin.y, PHASOR_WIDTH - 34, origin.y, "rlc-phasor-axis");
    appendLine(phasorSvg, origin.x, 48, origin.x, PHASOR_HEIGHT - 48, "rlc-phasor-axis");
    drawPhasor(phasorSvg, origin, model.resistorVoltageAmplitude, timeAngle, scale, "rlc-phasor-ur", "u", "R", 8, !state.timeRunning);
    drawPhasor(
      phasorSvg,
      origin,
      model.inductorVoltageAmplitude,
      timeAngle - Math.PI / 2,
      scale,
      "rlc-phasor-ul",
      "u",
      "L",
      -48,
      !state.timeRunning,
    );
    drawPhasor(
      phasorSvg,
      origin,
      model.capacitorVoltageAmplitude,
      timeAngle + Math.PI / 2,
      scale,
      "rlc-phasor-uc",
      "u",
      "C",
      -48,
      !state.timeRunning,
    );
    drawPhasor(phasorSvg, origin, model.sourceVoltageAmplitude, model.phase + timeAngle, scale, "rlc-phasor-u", "u", null, 8, !state.timeRunning);
  }

  function renderReadout() {
    const model = computeRlcModel(state);
    readout.replaceChildren(
      readoutCard(readoutLabel("Î"), `${formatNumber(model.currentAmplitude)} A`),
      readoutCard(readoutLabel("φ"), `${formatNumber((-model.phase * 180) / Math.PI)}°`),
      readoutCard(readoutLabel("Z"), `${formatNumber(model.impedance)} Ω`),
      readoutCard(readoutLabel("f", "res"), `${formatNumber(model.resonanceFrequency)} Hz`),
    );
  }

  function slider(
    labelContent: string | Node,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onInput: (value: number) => void,
  ) {
    const row = element("label", "rlc-slider");
    const headerRow = element("span", "rlc-slider-header");
    const valueLabel = element("strong", "", `${formatNumber(value, language)} ${unit}`);
    headerRow.append(labelNode(labelContent), valueLabel);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener("input", () => {
      const nextValue = Number(input.value);
      valueLabel.textContent = `${formatNumber(nextValue, language)} ${unit}`;
      onInput(nextValue);
    });
    row.append(headerRow, input);
    return row;
  }

  function steppedSlider(
    labelContent: string | Node,
    value: number,
    steps: number[],
    unit: string,
    onInput: (value: number) => void,
  ) {
    const row = element("label", "rlc-slider");
    const index = Math.max(0, steps.findIndex((step) => step === value));
    const headerRow = element("span", "rlc-slider-header");
    const valueLabel = element("strong", "", `${formatNumber(value, language)} ${unit}`);
    headerRow.append(labelNode(labelContent), valueLabel);
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(steps.length - 1);
    input.step = "1";
    input.value = String(index);
    input.addEventListener("input", () => {
      const nextValue = steps[Number(input.value)];
      valueLabel.textContent = `${formatNumber(nextValue, language)} ${unit}`;
      onInput(nextValue);
    });
    row.append(headerRow, input);
    return row;
  }

  function renderCircuitDiagram(label: string) {
    const wrapper = element("div", "rlc-circuit-block");
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.diagramExpanded ? "rlc-circuit-diagram expanded" : "rlc-circuit-diagram";
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      state.diagramExpanded = !state.diagramExpanded;
      updateDiagramButton();
    });
    const diagram = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    diagram.setAttribute("viewBox", "0 0 430 190");
    diagram.setAttribute("class", "rlc-circuit-svg");
    drawCircuitDiagram(diagram);
    button.append(diagram);
    wrapper.append(button, renderCircuitEquation());
    return wrapper;
  }

  function renderCircuitEquation() {
    const equation = element("div", "rlc-circuit-equation");
    equation.append(
      richHtmlSymbol("i"),
      textNode("(t)="),
      richHtmlSymbol("u", "R"),
      textNode("(t)/"),
      richHtmlSymbol("R"),
      textNode(", "),
      richHtmlSymbol("Î"),
      textNode(" = Û/"),
      richHtmlSymbol("R"),
    );
    return equation;
  }

  function knob(
    labelText: string | null,
    value: number,
    steps: number[],
    onChange: (value: number) => void,
    format: (value: number) => string,
  ) {
    const wrapper = element("div", "rlc-knob-control");
    const index = Math.max(0, steps.findIndex((step) => step === value));
    const angle = -135 + (270 * index) / (steps.length - 1);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rlc-knob";
    button.style.setProperty("--knob-angle", `${angle}deg`);
    button.addEventListener("click", (event) => {
      const rect = button.getBoundingClientRect();
      const direction = event.clientX < rect.left + rect.width / 2 ? -1 : 1;
      const nextIndex = Math.min(steps.length - 1, Math.max(0, index + direction));
      onChange(steps[nextIndex]);
    });
    if (labelText != null) {
      wrapper.append(element("span", "rlc-knob-label", labelText));
    }
    wrapper.append(button, element("strong", "rlc-knob-value", format(value)));
    return wrapper;
  }

  scopeBox.append(svg, scopeKnobs);
  phasorBox.append(phasorSvg, timeButton);
  display.append(scopeBox, phasorBox);
  stage.append(display);
  layout.append(controls, stage);
  content.append(header, layout, createPackageCredit(t));
  page.append(content);
  update();
  return page;
}

function readoutCard(labelContent: Node, valueText: string): HTMLElement {
  const card = element("div", "rlc-readout-card");
  const label = element("span", "rlc-readout-label");
  label.append(labelContent);
  card.append(label, element("strong", "", valueText));
  return card;
}

function appendRect(
  parent: SVGElement,
  x: number,
  y: number,
  width: number,
  height: number,
  className: string,
  radius = 14,
): void {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", String(radius));
  rect.setAttribute("class", className);
  parent.append(rect);
}

function appendLine(parent: SVGElement, x1: number, y1: number, x2: number, y2: number, className: string): void {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", className);
  parent.append(line);
}

function appendPath(parent: SVGElement, d: string, className: string): void {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("class", className);
  parent.append(path);
}

function svgTspan(textContent: string, className: string): SVGTSpanElement {
  const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  if (className.length > 0) {
    tspan.setAttribute("class", className);
  }
  tspan.textContent = textContent;
  return tspan;
}

function appendScopeLegend(
  parent: SVGElement,
  x: number,
  y: number,
  channelLabel: string,
  trace: ScopeTraceDetails,
): void {
  appendLine(parent, x, y - 5, x + 24, y - 5, trace.legendClass);
  const label = richScopeLabel(
    x + 34,
    y,
    "Û",
    trace.subscript,
    "",
    `: ${formatNumber(trace.amplitude)} V`,
    trace.labelClass,
  );
  label.prepend(svgTspan(`${channelLabel} `, ""));
  parent.append(label);
}

function drawCircuitDiagram(parent: SVGElement): void {
  appendLine(parent, 42, 78, 82, 78, "rlc-circuit-line");
  appendLine(parent, 322, 78, 360, 78, "rlc-circuit-line");
  appendRect(parent, 82, 58, 70, 40, "rlc-circuit-resistor", 0);
  appendLine(parent, 152, 78, 196, 78, "rlc-circuit-line");
  for (let index = 0; index < 4; index += 1) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const x = 196 + index * 20;
    path.setAttribute("d", `M ${x} 78 A 10 10 0 0 1 ${x + 20} 78`);
    path.setAttribute("class", "rlc-circuit-line");
    parent.append(path);
  }
  appendLine(parent, 276, 78, 300, 78, "rlc-circuit-line");
  appendLine(parent, 306, 52, 306, 104, "rlc-circuit-capacitor");
  appendLine(parent, 322, 52, 322, 104, "rlc-circuit-capacitor");
  appendLine(parent, 72, 78, 72, 35, "rlc-circuit-voltage-mark");
  appendLine(parent, 162, 78, 162, 35, "rlc-circuit-voltage-mark");
  parent.append(centeredRichLabel(117, 30, "u", "R", "", "rlc-circuit-label"));
  appendLine(parent, 360, 96, 360, 134, "rlc-circuit-current");
  appendArrowHead(parent, { x: 360, y: 96 }, { x: 360, y: 134 }, "rlc-circuit-current", 1.45);
  parent.append(centeredRichLabel(386, 120, "i", null, "(t)", "rlc-circuit-label"));
  parent.append(centeredRichLabel(117, 124, "R", null, "", "rlc-circuit-label"));
  parent.append(centeredRichLabel(236, 124, "L", null, "", "rlc-circuit-label"));
  parent.append(centeredRichLabel(314, 124, "C", null, "", "rlc-circuit-label"));
  appendLine(parent, 42, 78, 42, 152, "rlc-circuit-line");
  appendLine(parent, 360, 78, 360, 152, "rlc-circuit-line");
  appendLine(parent, 42, 152, 166, 152, "rlc-circuit-line");
  appendLine(parent, 234, 152, 360, 152, "rlc-circuit-line");
  appendCircle(parent, 174, 152, 5, "rlc-circuit-terminal");
  appendCircle(parent, 226, 152, 5, "rlc-circuit-terminal");
  parent.append(centeredRichLabel(200, 180, "u", null, "(t)", "rlc-circuit-label"));
}

function appendCircle(parent: SVGElement, cx: number, cy: number, r: number, className: string): void {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  circle.setAttribute("class", className);
  parent.append(circle);
}

function centeredRichLabel(
  x: number,
  y: number,
  symbol: string,
  subscript: string | null,
  suffix: string,
  className: string,
): SVGTextElement {
  const text = richScopeLabel(x, y, symbol, subscript, suffix, "", className);
  text.setAttribute("text-anchor", "middle");
  return text;
}

function drawPhasor(
  parent: SVGElement,
  origin: { x: number; y: number },
  magnitude: number,
  angle: number,
  scale: number,
  className: string,
  symbol: string,
  subscript: string | null,
  labelOffsetX: number,
  showLabel: boolean,
): void {
  if (!Number.isFinite(magnitude)) {
    return;
  }
  const end = {
    x: origin.x + Math.cos(angle) * magnitude * scale,
    y: origin.y + Math.sin(angle) * magnitude * scale,
  };
  const headSize = arrowHeadSize(origin, end);
  const shaftEnd = pointBeforeEnd(origin, end, headSize * 0.82);
  appendLine(parent, origin.x, origin.y, shaftEnd.x, shaftEnd.y, className);
  appendArrowHead(parent, origin, end, className);
  if (showLabel) {
    parent.append(richScopeLabel(end.x + labelOffsetX, end.y - 8, symbol, subscript, "", "", `${className} label`));
  }
}

function finiteVoltage(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function appendArrowHead(
  parent: SVGElement,
  origin: { x: number; y: number },
  end: { x: number; y: number },
  className: string,
  widthScale = 0.58,
): void {
  const dx = end.x - origin.x;
  const dy = end.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 4) {
    return;
  }
  const ux = dx / length;
  const uy = dy / length;
  const size = arrowHeadSize(origin, end);
  const width = size * widthScale;
  const base = { x: end.x - ux * size, y: end.y - uy * size };
  const left = { x: base.x - uy * width, y: base.y + ux * width };
  const right = { x: base.x + uy * width, y: base.y - ux * width };
  const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
  head.setAttribute("d", `M ${end.x} ${end.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`);
  head.setAttribute("class", `${className} arrowhead`);
  parent.append(head);
}

function arrowHeadSize(origin: { x: number; y: number }, end: { x: number; y: number }): number {
  return Math.min(12, Math.max(7, Math.hypot(end.x - origin.x, end.y - origin.y) * 0.18));
}

function pointBeforeEnd(
  origin: { x: number; y: number },
  end: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  const dx = end.x - origin.x;
  const dy = end.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) {
    return origin;
  }
  return {
    x: end.x - (dx / length) * distance,
    y: end.y - (dy / length) * distance,
  };
}

function scopeText(x: number, y: number, value: string): SVGTextElement {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("class", "rlc-scope-label");
  text.textContent = value;
  return text;
}

function richScopeLabel(
  x: number,
  y: number,
  symbol: string,
  subscript: string | null,
  suffix: string,
  value: string,
  className: string,
): SVGTextElement {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("class", className);

  const symbolSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  symbolSpan.setAttribute("font-style", "italic");
  symbolSpan.textContent = symbol;
  text.append(symbolSpan);

  if (subscript != null) {
    const subscriptSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    subscriptSpan.setAttribute("font-size", "70%");
    subscriptSpan.setAttribute("baseline-shift", "sub");
    subscriptSpan.textContent = subscript;
    text.append(subscriptSpan);
  }

  const suffixSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  suffixSpan.textContent = `${suffix}${value}`;
  text.append(suffixSpan);
  return text;
}

function richHtmlSymbol(symbol: string, subscript?: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "rlc-equation-symbol";
  const symbolSpan = document.createElement("i");
  symbolSpan.textContent = symbol;
  wrapper.append(symbolSpan);
  if (subscript != null) {
    const subscriptSpan = document.createElement("sub");
    subscriptSpan.textContent = subscript;
    wrapper.append(subscriptSpan);
  }
  return wrapper;
}

function textNode(textContent: string): Text {
  return document.createTextNode(textContent);
}

function readoutLabel(symbol: string, subscript?: string): HTMLElement {
  return richHtmlSymbol(symbol, subscript);
}

function controlLabel(labelText: string, symbol: string): HTMLElement {
  const wrapper = document.createElement("span");
  const symbolIndex = labelText.lastIndexOf(symbol);
  if (symbolIndex < 0) {
    wrapper.append(textNode(labelText));
    return wrapper;
  }
  wrapper.append(textNode(labelText.slice(0, symbolIndex)));
  wrapper.append(richHtmlSymbol(symbol));
  wrapper.append(textNode(labelText.slice(symbolIndex + symbol.length)));
  return wrapper;
}

function labelNode(labelContent: string | Node): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.append(typeof labelContent === "string" ? textNode(labelContent) : labelContent);
  return wrapper;
}

function formatNumber(value: number, language = "en"): string {
  if (value === Infinity) {
    return "∞";
  }
  if (value === -Infinity) {
    return "-∞";
  }
  if (Number.isNaN(value)) {
    return "–";
  }
  return new Intl.NumberFormat(language === "sv" ? "sv-SE" : "en-US", {
    maximumSignificantDigits: 3,
  }).format(value);
}

function formatVoltageScale(value: number): string {
  if (Math.abs(value) < 1) {
    return `${formatNumber(value * 1000)} mV/div`;
  }
  return `${formatNumber(value)} V/div`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  node.className = className;
  if (textContent != null) {
    node.textContent = textContent;
  }
  return node;
}
