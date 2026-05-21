import type { ModuleRenderContext } from "../../config/modules.js";
import { createPackageCredit } from "../../components/packageCredit.js";

const SVG_WIDTH = 1040;
const SVG_HEIGHT = 520;
const PHASOR_CENTER = { x: 210, y: 260 };
const PHASOR_RADIUS = 150;
const WAVE_LEFT = 470;
const WAVE_RIGHT = 990;
const WAVE_CENTER_Y = 260;
const WAVE_AMPLITUDE_SCALE = 135 / 325;
const TIME_SCALE_MS = 18;
const MANUAL_TIME_MAX_MS = 30;
const ANIMATION_SLOWDOWN = 100;

type PhasorState = {
  amplitude: number;
  frequency: number;
  phaseDegrees: number;
  timeMs: number;
  manualTimeMs: number;
  running: boolean;
};

const state: PhasorState = {
  amplitude: 325,
  frequency: 50,
  phaseDegrees: 30,
  timeMs: 0,
  manualTimeMs: 0,
  running: false,
};

export function renderPhasorDiagramModule({ t }: ModuleRenderContext): HTMLElement {
  const page = document.createElement("main");
  page.className = "page-shell phasor-shell";

  const content = element("section", "module-page module-page-wide phasor-page");
  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "module-menu-button";
  backLink.textContent = t("common.menuButton");

  const header = element("header", "phasor-header");
  const headerInfo = element("div", "module-header-info");
  headerInfo.append(element("p", "module-description", t("modules.phasorDiagram.description")), backLink);
  header.append(
    element("h1", "module-title", t("modules.phasorDiagram.title")),
    headerInfo,
  );

  const layout = element("div", "phasor-layout");
  const controls = element("aside", "phasor-controls");
  const stage = element("section", "phasor-stage");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const playButton = document.createElement("button");
  let timeInput: HTMLInputElement | null = null;
  let timeValueLabel: HTMLElement | null = null;
  let animationFrame: number | null = null;
  let lastFrameMs = 0;

  svg.setAttribute("viewBox", `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
  svg.setAttribute("class", "phasor-diagram");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("modules.phasorDiagram.diagramLabel"));

  playButton.type = "button";
  playButton.className = "phasor-play-button";
  playButton.addEventListener("click", toggleRunning);

  function update() {
    renderControls();
    renderPlayButton();
    renderDiagram();
  }

  function toggleRunning() {
    if (state.running) {
      stopRunning();
      return;
    }

    state.running = true;
    lastFrameMs = performance.now();
    renderPlayButton();
    animationFrame = requestAnimationFrame(tick);
  }

  function stopRunning() {
    state.running = false;
    state.timeMs = 0;
    state.manualTimeMs = 0;
    if (animationFrame != null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    renderPlayButton();
    syncTimeControl();
    renderDiagram();
  }

  function tick(now: number) {
    if (!state.running) {
      return;
    }
    const deltaMs = now - lastFrameMs;
    lastFrameMs = now;
    state.timeMs += deltaMs / ANIMATION_SLOWDOWN;
    renderDiagram();
    syncTimeControl();
    animationFrame = requestAnimationFrame(tick);
  }

  function renderControls() {
    controls.replaceChildren();
    controls.append(
      element("h2", "phasor-panel-title", t("modules.phasorDiagram.controlsTitle")),
      sliderRow(t("modules.phasorDiagram.amplitude"), "Û", "V", 50, 400, 5, state.amplitude, (value) => {
        state.amplitude = value;
        renderDiagram();
      }),
      sliderRow(t("modules.phasorDiagram.frequency"), "f", "Hz", 10, 100, 0.1, state.frequency, (value) => {
        state.frequency = value;
        if (!state.running) {
          state.timeMs = state.manualTimeMs;
        }
        renderDiagram();
        syncTimeControl();
      }),
      sliderRow(t("modules.phasorDiagram.phase"), "φ", "°", -180, 180, 1, state.phaseDegrees, (value) => {
        state.phaseDegrees = value;
        renderDiagram();
      }),
      sliderRow(t("modules.phasorDiagram.time"), "t", "ms", 0, MANUAL_TIME_MAX_MS, 0.1, displayTimeMs(), (value) => {
        state.manualTimeMs = value;
        state.timeMs = value;
        renderDiagram();
      }, (input, valueLabel) => {
        timeInput = input;
        timeValueLabel = valueLabel;
      }),
      playButton,
      formulaCard(),
    );
  }

  function sliderRow(
    labelText: string,
    quantity: string,
    unit: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (value: number) => void,
    onCreate?: (input: HTMLInputElement, valueLabel: HTMLElement) => void,
  ): HTMLElement {
    const row = element("label", "phasor-slider-row");
    const top = element("span", "phasor-slider-top");
    const label = element("span", "");
    label.append(labelText, " ", element("span", "phasor-slider-quantity", quantity));
    const valueLabel = element("strong", "", `${formatNumber(value)} ${unit}`);
    top.append(label, valueLabel);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener("input", () => {
      const nextValue = Number(input.value);
      valueLabel.textContent = `${formatNumber(nextValue)} ${unit}`;
      onInput(nextValue);
    });
    onCreate?.(input, valueLabel);
    row.append(top, input);
    return row;
  }

  function renderPlayButton() {
    playButton.textContent = state.running ? t("modules.phasorDiagram.pause") : t("modules.phasorDiagram.play");
  }

  function syncTimeControl() {
    if (timeInput != null) {
      timeInput.max = String(MANUAL_TIME_MAX_MS);
      timeInput.value = String(displayTimeMs());
    }
    if (timeValueLabel != null) {
      timeValueLabel.textContent = `${formatNumber(displayTimeMs())} ms`;
    }
  }

  function formulaCard(): HTMLElement {
    const card = element("div", "phasor-formula");
    const formula = element("p", "");
    formula.append("u(t) = Û · ", element("span", "phasor-upright", "sin"), "(ωt + φ)");
    card.append(formula, element("span", "", t("modules.phasorDiagram.formulaHint")));
    return card;
  }

  function renderDiagram() {
    svg.replaceChildren();
    svg.append(createGrid(), createAxes(), createWaveformTicks(), createRmsGuide(), createPhasorCircle(), createWaveform(), createProjectionGuides(), createLabels());
  }

  function createAxes(): SVGElement {
    const group = svgGroup("phasor-axes");
    appendArrow(group, 45, PHASOR_CENTER.y, 385, PHASOR_CENTER.y);
    appendArrow(group, PHASOR_CENTER.x, 430, PHASOR_CENTER.x, 80);
    appendArrow(group, WAVE_LEFT, WAVE_CENTER_Y, WAVE_RIGHT + 25, WAVE_CENTER_Y);
    appendArrow(group, WAVE_LEFT, 430, WAVE_LEFT, 80);
    group.append(axisUnitLabel(PHASOR_CENTER.x - 45, 68, "u", "V"));
    group.append(axisUnitLabel(WAVE_LEFT - 42, 68, "u", "V"));
    group.append(axisUnitLabel(WAVE_RIGHT - 38, WAVE_CENTER_Y + 56, "t", "ms"));
    return group;
  }

  function createGrid(): SVGElement {
    const group = svgGroup("phasor-grid");
    for (let x = WAVE_LEFT; x <= WAVE_RIGHT; x += 55) {
      appendLine(group, x, 86, x, 430, "phasor-grid-line");
    }
    for (let y = 95; y <= 425; y += 55) {
      appendLine(group, WAVE_LEFT, y, WAVE_RIGHT, y, "phasor-grid-line");
    }
    return group;
  }

  function createPhasorCircle(): SVGElement {
    const group = svgGroup("phasor-circle-layer");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(PHASOR_CENTER.x));
    circle.setAttribute("cy", String(PHASOR_CENTER.y));
    circle.setAttribute("r", String(PHASOR_RADIUS));
    circle.setAttribute("class", "phasor-reference-circle");
    group.append(circle);

    const startAngle = phaseRadians();
    const currentAngle = totalAngle();
    const start = pointOnPhasor(startAngle);
    const current = pointOnPhasor(currentAngle);
    const projection = voltageY(currentVoltage());

    appendLine(group, PHASOR_CENTER.x, PHASOR_CENTER.y, start.x, start.y, "phasor-phase-line");
    appendArrow(group, PHASOR_CENTER.x, PHASOR_CENTER.y, current.x, current.y, "phasor-vector", 16, 10);
    appendSignedArc(group, PHASOR_CENTER.x, PHASOR_CENTER.y, 58, 0, normalizedSignedAngle(startAngle), "phasor-phase-arc");
    appendSignedArc(group, PHASOR_CENTER.x, PHASOR_CENTER.y, 58, startAngle, positiveCycleAngle(currentAngle - startAngle), "phasor-omega-arc");
    appendLine(group, current.x, current.y, PHASOR_CENTER.x, projection, "phasor-projection-line");
    appendLine(group, PHASOR_CENTER.x, PHASOR_CENTER.y, PHASOR_CENTER.x, projection, "phasor-instant-voltage");
    const phaseLabel = arcLabelPosition(0, normalizedSignedAngle(startAngle), 76);
    group.append(svgText(phaseLabel.x, phaseLabel.y, "φ", "phasor-symbol small"));
    if (state.timeMs > 2) {
      const omegaLabel = labelBesideLine(start, -18);
      group.append(svgText(omegaLabel.x, omegaLabel.y, "ωt", "phasor-symbol small"));
    }
    group.append(svgText(PHASOR_CENTER.x - 58, projection + 6, "u(t)", "phasor-symbol small phasor-instant-label"));
    return group;
  }

  function createWaveform(): SVGElement {
    const group = svgGroup("phasor-waveform-layer");
    const points: string[] = [];
    for (let x = WAVE_LEFT - 70; x <= WAVE_RIGHT + 30; x += 3) {
      const time = (x - WAVE_LEFT) / timeScale();
      const voltage = state.amplitude * Math.sin(2 * Math.PI * state.frequency * (time / 1000) + phaseRadians());
      points.push(`${x.toFixed(1)},${voltageY(voltage).toFixed(1)}`);
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${points.join(" L ")}`);
    path.setAttribute("class", "phasor-waveform");
    group.append(path);

    const currentX = timeX(state.timeMs);
    if (currentX <= WAVE_RIGHT + 25) {
      appendLine(group, currentX, WAVE_CENTER_Y, currentX, voltageY(currentVoltage()), "phasor-time-line");
      appendPoint(group, currentX, voltageY(currentVoltage()), 5, "phasor-wave-point");
    }
    return group;
  }

  function createProjectionGuides(): SVGElement {
    const group = svgGroup("phasor-guides");
    const current = pointOnPhasor(totalAngle());
    const waveX = timeX(state.timeMs);
    const y = voltageY(currentVoltage());
    appendLine(group, current.x, current.y, WAVE_LEFT, y, "phasor-guide-line");
    appendLine(group, WAVE_LEFT, y, WAVE_RIGHT, y, "phasor-guide-line");
    if (waveX <= WAVE_RIGHT) {
      appendLine(group, waveX, WAVE_CENTER_Y, waveX, y, "phasor-guide-line");
    }
    return group;
  }

  function createLabels(): SVGElement {
    const group = svgGroup("phasor-label-layer");
    const { startX, endX } = visiblePeakInterval();
    appendDimension(group, startX, 101, endX, 101, periodLabel);
    appendDimension(group, startX, WAVE_CENTER_Y, startX, voltageY(state.amplitude), "Û");
    return group;
  }

  function createWaveformTicks(): SVGElement {
    const group = svgGroup("phasor-ticks");
    const voltageTicks = [-300, -200, -100, 0, 100, 200, 300];
    for (const voltage of voltageTicks) {
      const y = voltageY(voltage);
      if (y < 90 || y > 430) {
        continue;
      }
      appendLine(group, WAVE_LEFT - 7, y, WAVE_LEFT + 7, y, "phasor-tick");
      group.append(svgText(WAVE_LEFT - 14, y + 6, String(voltage), "phasor-tick-label phasor-y-tick-label"));
    }

    const visibleTimeMs = (WAVE_RIGHT - WAVE_LEFT) / timeScale();
    const tickStep = timeTickStep(visibleTimeMs);
    for (let time = 0; time <= visibleTimeMs; time += tickStep) {
      if (time === 0) {
        continue;
      }
      const x = timeX(time);
      appendLine(group, x, WAVE_CENTER_Y - 7, x, WAVE_CENTER_Y + 7, "phasor-tick");
      group.append(svgText(x, WAVE_CENTER_Y + 32, String(Math.round(time)), "phasor-tick-label phasor-x-tick-label"));
    }
    return group;
  }

  function createRmsGuide(): SVGElement {
    const group = svgGroup("phasor-rms-layer");
    const rmsVoltage = state.amplitude / Math.SQRT2;
    const y = voltageY(rmsVoltage);
    const { startX, endX } = visiblePeakInterval();
    appendLine(group, WAVE_LEFT, y, WAVE_RIGHT, y, "phasor-rms-line");
    appendRmsLabel(group, (startX + endX) / 2, y - 10, rmsVoltage);
    return group;
  }

  function currentVoltage(): number {
    return state.amplitude * Math.sin(totalAngle());
  }

  function totalAngle(): number {
    return 2 * Math.PI * state.frequency * (state.timeMs / 1000) + phaseRadians();
  }

  function phaseRadians(): number {
    return (state.phaseDegrees * Math.PI) / 180;
  }

  function arcLabelPosition(startAngle: number, signedDelta: number, radius: number): { x: number; y: number } {
    const angle = startAngle + signedDelta / 2;
    return {
      x: PHASOR_CENTER.x + Math.cos(angle) * radius,
      y: PHASOR_CENTER.y - Math.sin(angle) * radius,
    };
  }

  function labelBesideLine(end: { x: number; y: number }, offset: number): { x: number; y: number } {
    const dx = end.x - PHASOR_CENTER.x;
    const dy = end.y - PHASOR_CENTER.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = 0.45;
    return {
      x: PHASOR_CENTER.x + dx * along - (dy / length) * offset,
      y: PHASOR_CENTER.y + dy * along + (dx / length) * offset,
    };
  }

  function periodMs(): number {
    return 1000 / state.frequency;
  }

  function timeScale(): number {
    return TIME_SCALE_MS;
  }

  function timeTickStep(visibleTimeMs: number): number {
    if (visibleTimeMs <= 40) {
      return 5;
    }
    if (visibleTimeMs <= 90) {
      return 10;
    }
    if (visibleTimeMs <= 180) {
      return 20;
    }
    return 50;
  }

  function displayTimeMs(): number {
    return state.running ? state.timeMs : state.manualTimeMs;
  }

  function pointOnPhasor(angle: number): { x: number; y: number } {
    const radius = Math.min(PHASOR_RADIUS, state.amplitude * WAVE_AMPLITUDE_SCALE);
    return {
      x: PHASOR_CENTER.x + Math.cos(angle) * radius,
      y: PHASOR_CENTER.y - Math.sin(angle) * radius,
    };
  }

  function voltageY(voltage: number): number {
    return WAVE_CENTER_Y - voltage * WAVE_AMPLITUDE_SCALE;
  }

  function timeX(timeMs: number): number {
    return WAVE_LEFT + timeMs * timeScale();
  }

  function visiblePeakInterval(): { startX: number; endX: number } {
    const period = periodMs();
    const peakTime = ((90 - state.phaseDegrees + 360) % 360 / 360) * period;
    const periodPixels = period * timeScale();
    let startX = timeX(peakTime);
    while (startX < WAVE_LEFT + 18) {
      startX += periodPixels;
    }
    while (startX + periodPixels > WAVE_RIGHT - 18 && startX - periodPixels >= WAVE_LEFT + 18) {
      startX -= periodPixels;
    }
    return { startX, endX: startX + periodPixels };
  }

  stage.append(svg);
  layout.append(controls, stage);
  content.append(header, layout, createPackageCredit(t));
  page.append(content);
  update();

  return page;
}

function appendArrow(
  parent: SVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  className = "phasor-axis",
  headSize = 10,
  shortenBy = 0,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const lineEndX = x2 - Math.cos(angle) * shortenBy;
  const lineEndY = y2 - Math.sin(angle) * shortenBy;
  appendLine(parent, x1, y1, lineEndX, lineEndY, className);
  const left = `${x2 - Math.cos(angle - Math.PI / 6) * headSize},${y2 - Math.sin(angle - Math.PI / 6) * headSize}`;
  const right = `${x2 - Math.cos(angle + Math.PI / 6) * headSize},${y2 - Math.sin(angle + Math.PI / 6) * headSize}`;
  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  head.setAttribute("points", `${x2},${y2} ${left} ${right}`);
  head.setAttribute("class", `${className} arrowhead`);
  parent.append(head);
}

function appendDimension(
  parent: SVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  textContent: string | (() => SVGTextElement),
): void {
  appendLine(parent, x1, y1, x2, y2, "phasor-dimension");
  const text = typeof textContent === "function" ? textContent() : svgText(0, 0, textContent, "phasor-dimension-label");
  text.setAttribute("x", String((x1 + x2) / 2 + 8));
  text.setAttribute("y", String((y1 + y2) / 2 - 8));
  parent.append(text);
}

function periodLabel(): SVGTextElement {
  const text = svgText(0, 0, "", "phasor-dimension-label");
  text.append(svgTspan("T", "symbol"), svgTspan(" = 1 / ", "value"), svgTspan("f", "symbol"));
  return text;
}

function appendRmsLabel(parent: SVGElement, x: number, y: number, rmsVoltage: number): void {
  const text = svgText(x, y, "", "phasor-rms-label");
  text.append(svgTspan("U = Û / ", "symbol"), svgTspan("√2", "value"), svgTspan(" = ", "symbol"), svgTspan(`${Math.round(rmsVoltage)} V`, "value"));
  parent.append(text);
}

function svgTspan(textContent: string, className: string): SVGTSpanElement {
  const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  tspan.setAttribute("class", className);
  tspan.textContent = textContent;
  return tspan;
}

function appendSignedArc(
  parent: SVGElement,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  signedDelta: number,
  className: string,
): void {
  const endAngle = startAngle + signedDelta;
  const start = { x: cx + Math.cos(startAngle) * radius, y: cy - Math.sin(startAngle) * radius };
  const end = { x: cx + Math.cos(endAngle) * radius, y: cy - Math.sin(endAngle) * radius };
  const delta = Math.abs(signedDelta);
  if (delta < 0.001) {
    return;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${delta > Math.PI ? 1 : 0} ${signedDelta < 0 ? 1 : 0} ${end.x} ${end.y}`);
  path.setAttribute("class", className);
  parent.append(path);
}

function normalizedSignedAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function positiveCycleAngle(angle: number): number {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
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

function appendPoint(parent: SVGElement, cx: number, cy: number, r: number, className: string): void {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  circle.setAttribute("class", className);
  parent.append(circle);
}

function svgGroup(className: string): SVGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", className);
  return group;
}

function svgText(x: number, y: number, textContent: string, className: string): SVGTextElement {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("class", className);
  text.textContent = textContent;
  return text;
}

function axisUnitLabel(x: number, y: number, quantity: string, unit: string): SVGTextElement {
  const text = svgText(x, y, "", "phasor-axis-label");
  text.append(svgTspan(`${quantity} / `, "symbol"), svgTspan(unit, "unit"));
  return text;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toString();
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
