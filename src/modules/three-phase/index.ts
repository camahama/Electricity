import type { ModuleRenderContext } from "../../config/modules.js";
import { createPackageCredit } from "../../components/packageCredit.js";
import {
  angle,
  calculateBranchCurrents,
  calculateLineAndNeutralCurrents,
  type Complex,
  magnitude,
  resistiveImpedanceFromPower,
} from "./physics/index.js";

const V_PHASE_RMS = 230;
const MAX_PHASE_POWER_W = 2000;
const MAX_DELTA_POWER_W = 3000;
const GRID_MAX_AMP = 20;
const CURRENT_TICKS_A = [5, 10, 15, 20];
const WAVE_SAMPLES = 220;
const WAVE_CYCLES = 1.25;
const PERIOD_MS = 20;
const ROTATION_HZ = 0.3;
const ROTATION_OMEGA = 2 * Math.PI * ROTATION_HZ;
const IMAGE_URL = `${import.meta.env.BASE_URL}images/3fas.jpg`;
const IMAGE_SIZE = { width: 2809, height: 1859 };

const LOAD_COLORS = {
  p1: "#cc3333",
  p2: "#168a3b",
  p3: "#2560c7",
  p12: "#ffd84d",
  p23: "#b02992",
  p31: "#b75a10",
} as const;

type LoadKey = keyof typeof LOAD_COLORS;

const LOADS = [
  { key: "p1", sub: "1", suffixKey: "p1Suffix", max: MAX_PHASE_POWER_W, kind: "phase" },
  { key: "p2", sub: "2", suffixKey: "p2Suffix", max: MAX_PHASE_POWER_W, kind: "phase" },
  { key: "p3", sub: "3", suffixKey: "p3Suffix", max: MAX_PHASE_POWER_W, kind: "phase" },
  { key: "p12", sub: "12", suffixKey: "p12Suffix", max: MAX_DELTA_POWER_W, kind: "delta" },
  { key: "p23", sub: "23", suffixKey: "p23Suffix", max: MAX_DELTA_POWER_W, kind: "delta" },
  { key: "p31", sub: "31", suffixKey: "p31Suffix", max: MAX_DELTA_POWER_W, kind: "delta" },
] as const;

const LOAD_HOTSPOTS = [
  { key: "p12", sub: "12", left: 53.1, top: 23.7, width: 13.2, height: 9.2 },
  { key: "p23", sub: "23", left: 53.0, top: 43.5, width: 13.2, height: 9.2 },
  { key: "p31", sub: "31", left: 62.1, top: 51.6, width: 13.2, height: 9.2 },
  { key: "p1", sub: "1", left: 85.1, top: 34.2, width: 12.8, height: 9.0 },
  { key: "p2", sub: "2", left: 76.5, top: 60.5, width: 12.8, height: 9.0 },
  { key: "p3", sub: "3", left: 69.1, top: 76.9, width: 12.8, height: 9.0 },
] as const;

type ThreePhaseState = Record<LoadKey, number> & {
  isRunning: boolean;
  timePhase: number;
  rafId: number | null;
  lastFrameMs: number;
  animationToken: number;
};

const state: ThreePhaseState = {
  p1: 0,
  p2: 0,
  p3: 0,
  p12: 0,
  p23: 0,
  p31: 0,
  isRunning: false,
  timePhase: 0,
  rafId: null,
  lastFrameMs: 0,
  animationToken: 0,
};

export function renderThreePhaseModule({ t, language = "en" }: ModuleRenderContext): HTMLElement {
  stopAnimation();

  const page = document.createElement("main");
  page.className = "page-shell three-phase-shell";

  const content = document.createElement("section");
  content.className = "module-page module-page-wide three-phase-page";

  const layout = document.createElement("div");
  layout.className = "three-phase-layout";

  const header = element("header", "three-phase-panel three-phase-header");
  const headerText = element("div", "three-phase-header-text");
  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "module-menu-button";
  backLink.textContent = t("common.menuButton");
  headerText.append(element("h1", "module-title", t("modules.threePhase.title")));
  const headerDescription = element("p", "module-description", t("modules.threePhase.description"));
  const headerInfo = element("div", "module-header-info");
  headerInfo.append(headerDescription, backLink);

  const mainLayout = element("div", "three-phase-main-layout");
  const leftColumn = element("div", "three-phase-left-column");
  const rightColumn = element("div", "three-phase-right-column");
  const controlsPanel = element("article", "three-phase-panel three-phase-controls");
  const slidersColumn = document.createElement("div");
  slidersColumn.className = "three-phase-sliders";

  const phaseHeading = element("h2", "three-phase-panel-title", t("modules.threePhase.phaseLoadsHeading"));
  const phaseSliders = element("div", "three-phase-slider-group");
  const deltaHeading = element("h2", "three-phase-panel-title", t("modules.threePhase.lineLoadsHeading"));
  const deltaSliders = element("div", "three-phase-slider-group");

  const currentStrip = element("div", "three-phase-current-strip");
  const floatingTooltip = element("div", "three-phase-floating-tooltip");
  const diagram = createCircuitDiagram(t, language);
  const circuitModal = createCircuitModal(t);

  const visualizationPanel = element("article", "three-phase-panel three-phase-visualization");
  const visualizationStage = element("div", "three-phase-viz-stage");
  const svgMount = document.createElement("div");
  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "three-phase-run-button";

  function update() {
    const computed = computeCurrents();
    renderCurrentStrip(currentStrip, computed.currents, t, language);
    updateCircuitTooltips(diagram, computed.branchCurrents, t, language, floatingTooltip);
    svgMount.replaceChildren(createLinkedDiagrams([...computed.currents.lineCurrents, computed.currents.neutralCurrent], state.timePhase, t));
    runButton.textContent = state.isRunning ? t("modules.threePhase.stopTime") : t("modules.threePhase.startTime");
    runButton.setAttribute("aria-pressed", String(state.isRunning));
  }

  for (const load of LOADS) {
    const slider = createLoadSlider({
      base: "P",
      subscript: load.sub,
      suffix: t(`modules.threePhase.${load.suffixKey}`),
      color: LOAD_COLORS[load.key],
      max: load.max,
      value: state[load.key],
      onChange(value) {
        state[load.key] = value;
        update();
      },
    });

    if (load.kind === "phase") {
      phaseSliders.append(slider);
    } else {
      deltaSliders.append(slider);
    }
  }

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "three-phase-reset-button";
  resetButton.textContent = t("modules.threePhase.resetButton");
  resetButton.addEventListener("click", () => {
    for (const load of LOADS) {
      state[load.key] = 0;
    }
    phaseSliders.replaceChildren();
    deltaSliders.replaceChildren();
    for (const load of LOADS) {
      const slider = createLoadSlider({
        base: "P",
        subscript: load.sub,
        suffix: t(`modules.threePhase.${load.suffixKey}`),
        color: LOAD_COLORS[load.key],
        max: load.max,
        value: state[load.key],
        onChange(value) {
          state[load.key] = value;
          update();
        },
      });
      (load.kind === "phase" ? phaseSliders : deltaSliders).append(slider);
    }
    update();
  });

  function toggleAnimation() {
    if (state.isRunning) {
      stopAnimation();
      update();
      return;
    }

    state.isRunning = true;
    state.lastFrameMs = performance.now();
    state.animationToken += 1;
    const animationToken = state.animationToken;
    const tick = (now: number) => {
      if (!state.isRunning || animationToken !== state.animationToken) {
        return;
      }

      const dt = (now - state.lastFrameMs) / 1000;
      state.lastFrameMs = now;
      state.timePhase = (state.timePhase + dt * ROTATION_OMEGA) % (2 * Math.PI);
      update();

      if (state.isRunning && animationToken === state.animationToken) {
        state.rafId = requestAnimationFrame(tick);
      }
    };
    state.rafId = requestAnimationFrame(tick);
    update();
  }

  runButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleAnimation();
  });

  runButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleAnimation();
  });

  slidersColumn.append(
    phaseHeading,
    phaseSliders,
    deltaHeading,
    deltaSliders,
    resetButton,
  );

  controlsPanel.append(slidersColumn);
  header.append(headerText, headerInfo);
  leftColumn.append(controlsPanel);
  controlsPanel.append(diagram.figure);
  visualizationStage.append(runButton, svgMount);
  visualizationPanel.append(visualizationStage, currentStrip);
  mainLayout.append(leftColumn, visualizationPanel);
  layout.append(header, mainLayout);
  content.append(layout, createPackageCredit(t), floatingTooltip, circuitModal.dialog);
  page.append(content);
  update();

  return page;
}

function computeCurrents() {
  const yImpedances: [Complex | null, Complex | null, Complex | null] = [
    resistiveImpedanceFromPower(state.p1, V_PHASE_RMS),
    resistiveImpedanceFromPower(state.p2, V_PHASE_RMS),
    resistiveImpedanceFromPower(state.p3, V_PHASE_RMS),
  ];
  const vLineRms = V_PHASE_RMS * Math.sqrt(3);
  const deltaImpedances: [Complex | null, Complex | null, Complex | null] = [
    resistiveImpedanceFromPower(state.p12, vLineRms),
    resistiveImpedanceFromPower(state.p23, vLineRms),
    resistiveImpedanceFromPower(state.p31, vLineRms),
  ];

  return {
    currents: calculateLineAndNeutralCurrents({ yImpedances, deltaImpedances, voltageRms: V_PHASE_RMS }),
    branchCurrents: calculateBranchCurrents({ yImpedances, deltaImpedances, voltageRms: V_PHASE_RMS }),
  };
}

function stopAnimation() {
  state.animationToken += 1;
  if (state.rafId != null) {
    cancelAnimationFrame(state.rafId);
  }
  state.rafId = null;
  state.isRunning = false;
  state.timePhase = 0;
}

function createLoadSlider(args: {
  base: string;
  subscript: string;
  suffix: string;
  color: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const row = document.createElement("label");
  row.className = "three-phase-slider-row";

  const label = element("span", "three-phase-load-label");
  label.innerHTML = symbolMarkup(args.base, args.subscript, args.suffix);
  label.style.color = args.color;

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = String(args.max);
  input.step = "10";
  input.value = String(args.value);
  input.style.accentColor = args.color;

  const value = element("strong", "three-phase-load-value", `${args.value.toFixed(0)} W`);
  value.style.color = args.color;

  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    value.textContent = `${nextValue.toFixed(0)} W`;
    args.onChange(nextValue);
  });

  row.append(label, input, value);
  return row;
}

function createCircuitDiagram(t: ModuleRenderContext["t"], language: string) {
  const figure = createCircuitFigure(t, "three-phase-circuit three-phase-circuit-thumbnail");
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "three-phase-circuit-open";
  openButton.setAttribute("aria-label", t("modules.threePhase.expandDiagram"));
  openButton.textContent = t("modules.threePhase.expandDiagram");
  figure.append(openButton);

  figure.addEventListener("click", () => {
    document.querySelector<HTMLDialogElement>(".three-phase-circuit-modal")?.showModal();
  });

  figure.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.querySelector<HTMLDialogElement>(".three-phase-circuit-modal")?.showModal();
    }
  });

  figure.tabIndex = 0;
  figure.setAttribute("role", "button");
  figure.setAttribute("aria-label", t("modules.threePhase.expandDiagram"));

  const hotspots = new Map<LoadKey, HTMLElement>();
  for (const hotspot of LOAD_HOTSPOTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "three-phase-load-hotspot";
    button.style.setProperty("--load-left", `${hotspot.left}%`);
    button.style.setProperty("--load-top", `${hotspot.top}%`);
    button.style.setProperty("--load-width", `${hotspot.width}%`);
    button.style.setProperty("--load-height", `${hotspot.height}%`);
    button.style.setProperty("--load-color", LOAD_COLORS[hotspot.key]);
    button.setAttribute("aria-label", `i${hotspot.sub}`);
    hotspots.set(hotspot.key, button);
    figure.append(button);
  }

  return { figure, hotspots, language };
}

function createCircuitFigure(t: ModuleRenderContext["t"], className: string) {
  const figure = document.createElement("figure");
  figure.className = className;
  figure.style.setProperty("--image-width", String(IMAGE_SIZE.width));
  figure.style.setProperty("--image-height", String(IMAGE_SIZE.height));

  const image = document.createElement("img");
  image.className = "three-phase-circuit-image";
  image.src = IMAGE_URL;
  image.alt = t("modules.threePhase.imageAlt");
  figure.append(image);

  return figure;
}

function createCircuitModal(t: ModuleRenderContext["t"]) {
  const dialog = document.createElement("dialog");
  dialog.className = "three-phase-circuit-modal";

  const modalContent = element("div", "three-phase-circuit-modal-content");
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "three-phase-circuit-close";
  closeButton.textContent = t("modules.threePhase.closeDiagram");

  const figure = createCircuitFigure(t, "three-phase-circuit three-phase-circuit-full");

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  modalContent.append(closeButton, figure);
  dialog.append(modalContent);

  return { dialog };
}

function updateCircuitTooltips(
  diagram: ReturnType<typeof createCircuitDiagram>,
  currents: ReturnType<typeof calculateBranchCurrents>,
  t: ModuleRenderContext["t"],
  language: string,
  floatingTooltip: HTMLElement,
) {
  const loadCurrents: Record<LoadKey, Complex> = {
    p1: currents.yBranchCurrents[0],
    p2: currents.yBranchCurrents[1],
    p3: currents.yBranchCurrents[2],
    p12: currents.deltaBranchCurrents[0],
    p23: currents.deltaBranchCurrents[1],
    p31: currents.deltaBranchCurrents[2],
  };

  for (const hotspot of LOAD_HOTSPOTS) {
    const current = loadCurrents[hotspot.key];
    const button = diagram.hotspots.get(hotspot.key);
    if (!button) {
      continue;
    }
    const tooltipHtml = `
        <span class="three-phase-floating-tooltip-title">${symbolMarkup("i", hotspot.sub)}</span>
        <span>${t("modules.threePhase.hoverCurrentPrefix")}: ${ampLabel(magnitude(current), t, language)}</span>
        <span>${t("modules.threePhase.hoverPhasePrefix")}: ${formatDecimal(degrees(angle(current)), 1, language)}°</span>
    `;
    button.onpointerenter = () => {
      const rect = button.getBoundingClientRect();
      floatingTooltip.innerHTML = tooltipHtml;
      floatingTooltip.style.borderColor = `color-mix(in srgb, ${LOAD_COLORS[hotspot.key]} 56%, white 44%)`;
      floatingTooltip.style.setProperty("--tooltip-color", LOAD_COLORS[hotspot.key]);
      floatingTooltip.style.left = `${rect.left + rect.width / 2}px`;
      floatingTooltip.style.top = `${rect.top - 10}px`;
      floatingTooltip.classList.add("visible");
    };
    button.onpointerleave = () => {
      floatingTooltip.classList.remove("visible");
    };
    button.onfocus = () => {
      const rect = button.getBoundingClientRect();
      floatingTooltip.innerHTML = tooltipHtml;
      floatingTooltip.style.borderColor = `color-mix(in srgb, ${LOAD_COLORS[hotspot.key]} 56%, white 44%)`;
      floatingTooltip.style.setProperty("--tooltip-color", LOAD_COLORS[hotspot.key]);
      floatingTooltip.style.left = `${rect.left + rect.width / 2}px`;
      floatingTooltip.style.top = `${rect.top - 10}px`;
      floatingTooltip.classList.add("visible");
    };
    button.onblur = () => {
      floatingTooltip.classList.remove("visible");
    };
  }
}

function renderCurrentStrip(
  target: HTMLElement,
  currents: ReturnType<typeof calculateLineAndNeutralCurrents>,
  t: ModuleRenderContext["t"],
  language: string,
) {
  const entries = [
    { sub: "1", current: currents.lineCurrents[0] },
    { sub: "2", current: currents.lineCurrents[1] },
    { sub: "3", current: currents.lineCurrents[2] },
    { sub: "N", current: currents.neutralCurrent },
  ];

  target.replaceChildren(
    ...entries.map((entry) => {
      const chip = element("div", "three-phase-current-chip");
      chip.innerHTML = `
        <span class="name">${symbolMarkup("i", entry.sub)}</span>
        <span class="amp">${ampLabel(magnitude(entry.current), t, language)}</span>
        <span class="angle">${formatDecimal(degrees(angle(entry.current)), 1, language)}°</span>
      `;
      return chip;
    }),
  );
}

function createLinkedDiagrams(
  currents: [Complex, Complex, Complex, Complex],
  timePhase: number,
  t: ModuleRenderContext["t"],
) {
  const pane = 340;
  const gap = 24;
  const width = pane * 2 + gap;
  const height = pane;
  const centerX = pane / 2;
  const centerY = pane / 2;
  const radius = 116;
  const waveOffsetX = pane + gap;
  const plotLeft = waveOffsetX + 36;
  const plotRight = waveOffsetX + pane - 12;
  const plotTop = 32;
  const plotBottom = pane - 32;
  const plotWidth = plotRight - plotLeft;
  const yScale = radius / GRID_MAX_AMP;
  const colors = ["#cc3333", "#168a3b", "#2560c7", "#e8edf2"];
  const labels = ["1", "2", "3", "N"];
  const drawingOrder = [3, 0, 1, 2];
  const yTicks = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
  const xTicksMs = [0, 5, 10, 15, 20, 25];

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "three-phase-viz-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("modules.threePhase.linkedAriaLabel"));

  svg.innerHTML = `
    <defs>${colors.map((color, index) => `<marker id="three-phase-arrow-${index}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`).join("")}</defs>
    ${CURRENT_TICKS_A.map((tick) => `<circle cx="${centerX}" cy="${centerY}" r="${radius * (tick / GRID_MAX_AMP)}" class="three-phase-phasor-grid" />`).join("")}
    <line x1="${centerX - radius}" y1="${centerY}" x2="${centerX + radius}" y2="${centerY}" class="three-phase-axis" />
    <line x1="${centerX}" y1="${centerY - radius}" x2="${centerX}" y2="${centerY + radius}" class="three-phase-axis" />
    ${CURRENT_TICKS_A.map((tick) => {
      const y = centerY - (tick / GRID_MAX_AMP) * radius;
      return `<line x1="${centerX - 4}" y1="${y}" x2="${centerX + 4}" y2="${y}" class="three-phase-axis" /><text x="${centerX + 8}" y="${y + 4}" class="three-phase-scale-label">${tick} A</text>`;
    }).join("")}
    <line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotBottom}" class="three-phase-axis" />
    <line x1="${plotLeft}" y1="${centerY}" x2="${plotRight}" y2="${centerY}" class="three-phase-axis" />
    ${yTicks.map((tick) => {
      const y = centerY - (tick / GRID_MAX_AMP) * radius;
      return `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" class="three-phase-wave-grid" /><text x="${waveOffsetX + 4}" y="${y + 4}" class="three-phase-scale-label">${tick} A</text>`;
    }).join("")}
    ${xTicksMs.map((tickMs) => {
      const x = plotLeft + (tickMs / (WAVE_CYCLES * PERIOD_MS)) * plotWidth;
      return `<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" class="three-phase-wave-grid" /><text x="${x - 10}" y="${height - 8}" class="three-phase-scale-label">${tickMs} ms</text>`;
    }).join("")}
    ${drawingOrder.map((index) => {
      const current = currents[index];
      const [x2, y2] = vectorEnd(current, centerX, radius, GRID_MAX_AMP, timePhase);
      const t0y = centerY - magnitude(current) * Math.sin(angle(current) + timePhase) * yScale;
      const labelY = index === 3 ? y2 + 18 : y2 - 6;
      return `
        <g>
          <line x1="${x2}" y1="${y2}" x2="${plotLeft}" y2="${t0y}" stroke="${colors[index]}" class="three-phase-phasor-dashed" />
          <line x1="${centerX}" y1="${centerY}" x2="${x2}" y2="${y2}" stroke="${colors[index]}" stroke-width="2" marker-end="url(#three-phase-arrow-${index})" />
          <text x="${x2 + 6}" y="${labelY}" fill="${colors[index]}" class="three-phase-viz-label"><tspan font-style="italic">i</tspan><tspan baseline-shift="sub" font-size="9">${labels[index]}</tspan></text>
          <path d="${waveformPath(current, timePhase, plotLeft, plotWidth, centerY, yScale)}" fill="none" stroke="${colors[index]}" stroke-width="${index === 3 ? 3 : 2}" />
          <circle cx="${plotLeft}" cy="${t0y}" r="3" fill="${colors[index]}" />
        </g>
      `;
    }).join("")}
    <text x="${plotLeft + 4}" y="${plotBottom + 16}" class="three-phase-scale-label">t=0</text>
  `;

  return svg;
}

function waveformPath(current: Complex, timePhase: number, plotLeft: number, plotWidth: number, centerY: number, yScale: number): string {
  const amp = magnitude(current);
  const phase = angle(current) + timePhase;
  const xScale = plotWidth / (WAVE_SAMPLES - 1);
  let path = "";

  for (let index = 0; index < WAVE_SAMPLES; index += 1) {
    const t = (index / (WAVE_SAMPLES - 1)) * (Math.PI * 2) * WAVE_CYCLES;
    const x = plotLeft + index * xScale;
    const y = centerY - amp * Math.sin(t + phase) * yScale;
    path += index === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return path;
}

function vectorEnd(current: Complex, center: number, radius: number, maxAmp: number, phaseOffset = 0): [number, number] {
  const amp = magnitude(current);
  const ang = angle(current) + phaseOffset;
  const r = (amp / maxAmp) * radius;
  return [center + r * Math.cos(ang), center - r * Math.sin(ang)];
}

function ampLabel(value: number, t: ModuleRenderContext["t"], language: string): string {
  return `${formatDecimal(value, 2, language)} ${t("modules.threePhase.ampUnit")}`;
}

function degrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function formatDecimal(value: number, decimals: number, language: string): string {
  const locale = language === "sv" ? "sv-SE" : "en-US";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function symbolMarkup(base: string, subscript: string, suffix = ""): string {
  return `<em>${base}</em><sub>${subscript}</sub>${suffix}`;
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
