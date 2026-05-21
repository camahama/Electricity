import { createPackageCredit } from "../../components/packageCredit.js";
import {
  computeElectricFieldAtPoint,
  createPotentialGrid,
  DEFAULT_POTENTIAL_CUTOFF,
  DEFAULT_POTENTIAL_SCALE,
} from "./physics/potentialGrid.js";
import { createFieldLineOverlayFromPotentialGrid } from "./visualization/fieldLineOverlay.js";
import { createEquipotentialOverlay } from "./visualization/equipotentialOverlay.js";

const GRID_WIDTH = 900;
const GRID_HEIGHT = 700;
const BASE_CHARGE_RADIUS = 18;
const HEATMAP_POSITIVE = [220, 50, 47];
const HEATMAP_NEGATIVE = [38, 93, 171];
const HEATMAP_NEUTRAL = [248, 248, 246];
const FIELD_LINE_COLOR = [40, 40, 40];
const EQUIPOTENTIAL_COLOR = [20, 20, 20];
const electrostaticsState = {
  selectedChargeSign: 1,
  charges: [],
  probePoint: null,
  probeEnabled: false,
};
const pointerState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false,
  draggedCharge: null,
};

export { createPotentialGrid } from "./physics/potentialGrid.js";
export { createFieldLineOverlay } from "./visualization/fieldLineOverlay.js";
export { createFieldLineOverlayFromPotentialGrid } from "./visualization/fieldLineOverlay.js";
export { createEquipotentialOverlay } from "./visualization/equipotentialOverlay.js";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function interpolateChannel(start, end, factor) {
  return Math.round(start + (end - start) * factor);
}

function blendColors(baseColor, overlayColor, opacity) {
  return [
    Math.round(baseColor[0] * (1 - opacity) + overlayColor[0] * opacity),
    Math.round(baseColor[1] * (1 - opacity) + overlayColor[1] * opacity),
    Math.round(baseColor[2] * (1 - opacity) + overlayColor[2] * opacity),
  ];
}

function createDisplayPotentialGrid(pointCharges) {
  const grid = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH));

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let potential = 0;

      for (const pointCharge of pointCharges) {
        const distance = Math.hypot(x - pointCharge.x, y - pointCharge.y);

        if (distance === 0) {
          potential = pointCharge.charge > 0 ? DEFAULT_POTENTIAL_CUTOFF : -DEFAULT_POTENTIAL_CUTOFF;
          break;
        }

        potential += (pointCharge.charge * DEFAULT_POTENTIAL_SCALE) / distance;
      }

      grid[y][x] = clamp(
        potential,
        -DEFAULT_POTENTIAL_CUTOFF,
        DEFAULT_POTENTIAL_CUTOFF,
      );
    }
  }

  return grid;
}

function findDisplayCutoff(displayGrid) {
  const magnitudes = [];

  for (let y = 0; y < displayGrid.length; y += 4) {
    for (let x = 0; x < displayGrid[y].length; x += 4) {
      magnitudes.push(Math.abs(displayGrid[y][x]));
    }
  }

  magnitudes.sort((left, right) => left - right);
  const percentileIndex = Math.floor(0.99 * (magnitudes.length - 1));
  return Math.max(4, magnitudes[percentileIndex] ?? 4);
}

function colorForPotential(value, displayCutoff) {
  const normalizedMagnitude = clamp(Math.abs(value) / displayCutoff, 0, 1);
  const intensity = normalizedMagnitude ** 0.55;

  if (value > 0) {
    return [
      interpolateChannel(HEATMAP_NEUTRAL[0], HEATMAP_POSITIVE[0], intensity),
      interpolateChannel(HEATMAP_NEUTRAL[1], HEATMAP_POSITIVE[1], intensity),
      interpolateChannel(HEATMAP_NEUTRAL[2], HEATMAP_POSITIVE[2], intensity),
    ];
  }

  if (value < 0) {
    return [
      interpolateChannel(HEATMAP_NEUTRAL[0], HEATMAP_NEGATIVE[0], intensity),
      interpolateChannel(HEATMAP_NEUTRAL[1], HEATMAP_NEGATIVE[1], intensity),
      interpolateChannel(HEATMAP_NEUTRAL[2], HEATMAP_NEGATIVE[2], intensity),
    ];
  }

  return [...HEATMAP_NEUTRAL];
}

function createPlateCapacitorPreset() {
  const charges = [];
  const positiveX = Math.round(GRID_WIDTH * 0.3);
  const negativeX = Math.round(GRID_WIDTH * 0.7);
  const startY = Math.round(GRID_HEIGHT * 0.18);
  const spacingY = Math.round(GRID_HEIGHT * 0.045);

  for (let index = 0; index < 15; index += 1) {
    const y = startY + spacingY * index;
    charges.push({ x: positiveX, y, charge: 1 });
    charges.push({ x: negativeX, y, charge: -1 });
  }

  return charges;
}

function createDipolePreset() {
  return [
    {
      x: Math.round(GRID_WIDTH * 0.47),
      y: Math.round(GRID_HEIGHT * 0.5),
      charge: -1,
    },
    {
      x: Math.round(GRID_WIDTH * 0.53),
      y: Math.round(GRID_HEIGHT * 0.5),
      charge: 1,
    },
  ];
}

function createChargeButtonContent(charge, label) {
  const icon = document.createElement("span");
  icon.className = `charge-button-icon ${charge > 0 ? "positive" : "negative"}`;
  icon.textContent = `${charge > 0 ? "+" : ""}${charge}`;

  const text = document.createElement("span");
  text.className = "charge-button-label";
  text.textContent = label;

  return [icon, text];
}

export function renderElectrostaticsModule({ t }) {
  const page = document.createElement("main");
  page.className = "page-shell";

  const content = document.createElement("section");
  content.className = "module-page module-page-wide electrostatics-page";

  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "module-menu-button";
  backLink.textContent = t("common.menuButton");

  const title = document.createElement("h1");
  title.className = "module-title";
  title.textContent = t("modules.electrostatics.title");

  const description = document.createElement("p");
  description.className = "module-description";
  description.textContent = t("modules.electrostatics.description");

  const header = document.createElement("header");
  header.className = "electrostatics-header";

  const headerInfo = document.createElement("div");
  headerInfo.className = "module-header-info";

  const layout = document.createElement("div");
  layout.className = "electrostatics-layout";

  const sidebar = document.createElement("div");
  sidebar.className = "electrostatics-sidebar";

  const controls = document.createElement("aside");
  controls.className = "electrostatics-controls";

  const controlsTitle = document.createElement("h2");
  controlsTitle.className = "electrostatics-panel-title";
  controlsTitle.textContent = t("modules.electrostatics.controlsTitle");

  const controlsText = document.createElement("p");
  controlsText.className = "electrostatics-help";
  controlsText.textContent = t("modules.electrostatics.instructions");

  const selectionGroup = document.createElement("div");
  selectionGroup.className = "charge-selector";
  selectionGroup.setAttribute("role", "group");
  selectionGroup.setAttribute("aria-label", t("modules.electrostatics.controlsTitle"));

  const positiveButton = document.createElement("button");
  positiveButton.type = "button";
  positiveButton.className = "charge-type-button charge-type-positive charge-symbol-button";
  positiveButton.append(...createChargeButtonContent(1, t("modules.electrostatics.positiveCharge")));

  const negativeButton = document.createElement("button");
  negativeButton.type = "button";
  negativeButton.className = "charge-type-button charge-type-negative charge-symbol-button";
  negativeButton.append(...createChargeButtonContent(-1, t("modules.electrostatics.negativeCharge")));

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "reset-button";
  resetButton.textContent = t("modules.electrostatics.resetCharges");

  const presetTitle = document.createElement("h3");
  presetTitle.className = "electrostatics-subtitle";
  presetTitle.textContent = t("modules.electrostatics.presetsTitle");

  const presetButtons = document.createElement("div");
  presetButtons.className = "preset-buttons";

  const plateCapacitorButton = document.createElement("button");
  plateCapacitorButton.type = "button";
  plateCapacitorButton.className = "preset-button";
  plateCapacitorButton.textContent = t("modules.electrostatics.presetPlateCapacitor");

  const dipoleButton = document.createElement("button");
  dipoleButton.type = "button";
  dipoleButton.className = "preset-button";
  dipoleButton.textContent = t("modules.electrostatics.presetDipole");

  const board = document.createElement("section");
  board.className = "electrostatics-board";

  const boardHeader = document.createElement("div");
  boardHeader.className = "electrostatics-board-header";

  const boardTitle = document.createElement("h2");
  boardTitle.className = "electrostatics-panel-title";
  boardTitle.textContent = t("modules.electrostatics.boardTitle");

  const boardToolbar = document.createElement("div");
  boardToolbar.className = "electrostatics-board-toolbar";

  const probeToggleLabel = document.createElement("label");
  probeToggleLabel.className = "toggle-control";

  const probeToggle = document.createElement("input");
  probeToggle.type = "checkbox";
  probeToggle.checked = electrostaticsState.probeEnabled;
  probeToggle.setAttribute("aria-label", t("modules.electrostatics.fieldProbeToggle"));

  const probeToggleText = document.createElement("span");
  probeToggleText.textContent = t("modules.electrostatics.fieldProbeToggle");

  const canvasFrame = document.createElement("div");
  canvasFrame.className = "electrostatics-canvas-frame";

  const canvas = document.createElement("canvas");
  canvas.className = "electrostatics-canvas";
  canvas.width = GRID_WIDTH;
  canvas.height = GRID_HEIGHT;
  canvas.setAttribute("aria-label", t("modules.electrostatics.canvasLabel"));

  const boardHint = document.createElement("p");
  boardHint.className = "electrostatics-board-hint";
  boardHint.textContent = t("modules.electrostatics.boardHint");

  const context = canvas.getContext("2d");
  const dragThreshold = 6;

  function getChargeRadius(charge) {
    return BASE_CHARGE_RADIUS * Math.cbrt(Math.abs(charge));
  }

  function drawGridBackground() {
    context.fillStyle = "#fbfcfe";
    context.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    drawGridOverlay();
  }

  function drawGridOverlay() {
    for (let index = 0; index <= GRID_WIDTH; index += 50) {
      context.beginPath();
      context.strokeStyle = index % 100 === 0 ? "#d6deea" : "#e8edf5";
      context.lineWidth = 1;
      context.moveTo(index + 0.5, 0);
      context.lineTo(index + 0.5, GRID_HEIGHT);
      context.stroke();
    }

    for (let index = 0; index <= GRID_HEIGHT; index += 50) {
      context.beginPath();
      context.moveTo(0, index + 0.5);
      context.lineTo(GRID_WIDTH, index + 0.5);
      context.stroke();
    }
  }

  function renderLiveField() {
    if (electrostaticsState.charges.length === 0) {
      drawGridBackground();
      return;
    }

    const displayGrid = createDisplayPotentialGrid(electrostaticsState.charges);
    const displayCutoff = findDisplayCutoff(displayGrid);
    const fieldLineOverlay = createFieldLineOverlayFromPotentialGrid(displayGrid, {
      autoFill: false,
      lineCount: 28,
      stepSize: 0.8,
      maxSteps: 1800,
      seedSearchStep: 14,
      minSeedDistance: 28,
      maxOverlapRatio: 1,
      minStreamlineLength: 60,
      maxSeedAttempts: 220,
      arrowLength: 7,
      netCharge: electrostaticsState.charges.reduce((sum, charge) => sum + charge.charge, 0),
    });
    const equipotentialOverlay = createEquipotentialOverlay(displayGrid, {
      levels: [-16, -12, -8, -6, -4, -2, -1, 0, 1, 2, 4, 6, 8, 12, 16],
      dashPeriod: 12,
      dashLength: 5,
      thickness: 1,
    });
    const imageData = context.createImageData(GRID_WIDTH, GRID_HEIGHT);
    let offset = 0;

    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        let color = colorForPotential(displayGrid[y][x], displayCutoff);

        if (fieldLineOverlay[y][x]) {
          color = blendColors(color, FIELD_LINE_COLOR, 0.72);
        }

        if (equipotentialOverlay[y][x]) {
          color = blendColors(color, EQUIPOTENTIAL_COLOR, 0.95);
        }

        imageData.data[offset] = color[0];
        imageData.data[offset + 1] = color[1];
        imageData.data[offset + 2] = color[2];
        imageData.data[offset + 3] = 255;
        offset += 4;
      }
    }

    context.putImageData(imageData, 0, 0);
    drawGridOverlay();
  }

  function drawCharge(charge) {
    const radius = getChargeRadius(charge.charge);
    const isPositive = charge.charge > 0;

    context.beginPath();
    context.fillStyle = isPositive ? "#d93d37" : "#2560c7";
    context.strokeStyle = "#203045";
    context.lineWidth = 2;
    context.arc(charge.x, charge.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.max(14, radius * 0.9)}px "Avenir Next", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      `${charge.charge > 0 ? "+" : ""}${charge.charge}`,
      charge.x,
      charge.y + 1,
    );
  }

  function drawFieldProbe() {
    if (!electrostaticsState.probePoint) {
      return;
    }

    const { x, y } = electrostaticsState.probePoint;
    const field = computeElectricFieldAtPoint(
      electrostaticsState.charges,
      x,
      y,
      { scale: DEFAULT_POTENTIAL_SCALE },
    );

    if (field.magnitude < 1e-6) {
      return;
    }

    const arrowLength = clamp(18 + field.magnitude * 162, 18, 320);
    const directionX = field.x / field.magnitude;
    const directionY = field.y / field.magnitude;
    const tipX = x + directionX * arrowLength;
    const tipY = y + directionY * arrowLength;
    const wingLength = 10;
    const wingAngle = Math.PI / 7;

    context.beginPath();
    context.strokeStyle = "#132238";
    context.lineWidth = 2.5;
    context.moveTo(x, y);
    context.lineTo(tipX, tipY);
    context.stroke();

    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(
      tipX - wingLength * (directionX * Math.cos(wingAngle) - directionY * Math.sin(wingAngle)),
      tipY - wingLength * (directionY * Math.cos(wingAngle) + directionX * Math.sin(wingAngle)),
    );
    context.moveTo(tipX, tipY);
    context.lineTo(
      tipX - wingLength * (directionX * Math.cos(wingAngle) + directionY * Math.sin(wingAngle)),
      tipY - wingLength * (directionY * Math.cos(wingAngle) - directionX * Math.sin(wingAngle)),
    );
    context.stroke();

    context.beginPath();
    context.fillStyle = "#132238";
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  }

  function findChargeAtPoint(x, y) {
    return electrostaticsState.charges.find((charge) => (
      Math.hypot(charge.x - x, charge.y - y) <= getChargeRadius(charge.charge)
    ));
  }

  function updateSelectionButtons() {
    positiveButton.classList.toggle("active", electrostaticsState.selectedChargeSign > 0);
    negativeButton.classList.toggle("active", electrostaticsState.selectedChargeSign < 0);
  }

  function redrawCanvas() {
    renderLiveField();
    electrostaticsState.charges.forEach(drawCharge);
    drawFieldProbe();
  }

  function placeChargeAt(x, y) {
    const existingCharge = findChargeAtPoint(x, y);

    if (existingCharge) {
      existingCharge.charge += electrostaticsState.selectedChargeSign;

      if (existingCharge.charge === 0) {
        electrostaticsState.charges = electrostaticsState.charges.filter(
          (charge) => charge !== existingCharge,
        );
      }
    } else {
      electrostaticsState.charges.push({
        x,
        y,
        charge: electrostaticsState.selectedChargeSign,
      });
    }

    redrawCanvas();
  }

  function loadPreset(charges) {
    electrostaticsState.charges = charges.map((charge) => ({ ...charge }));
    redrawCanvas();
  }

  function clampCanvasCoordinate(value) {
    return Math.round(value);
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: clamp(clampCanvasCoordinate((event.clientX - rect.left) * scaleX), 0, GRID_WIDTH - 1),
      y: clamp(clampCanvasCoordinate((event.clientY - rect.top) * scaleY), 0, GRID_HEIGHT - 1),
    };
  }

  function resetPointerState() {
    pointerState.pointerId = null;
    pointerState.startX = 0;
    pointerState.startY = 0;
    pointerState.moved = false;
    pointerState.draggedCharge = null;
    canvas.classList.remove("is-dragging");
  }

  positiveButton.addEventListener("click", () => {
    electrostaticsState.selectedChargeSign = 1;
    updateSelectionButtons();
  });

  negativeButton.addEventListener("click", () => {
    electrostaticsState.selectedChargeSign = -1;
    updateSelectionButtons();
  });

  resetButton.addEventListener("click", () => {
    electrostaticsState.charges = [];
    redrawCanvas();
  });

  probeToggle.addEventListener("change", () => {
    electrostaticsState.probeEnabled = probeToggle.checked;

    if (!electrostaticsState.probeEnabled) {
      electrostaticsState.probePoint = null;
    }

    redrawCanvas();
  });

  plateCapacitorButton.addEventListener("click", () => {
    loadPreset(createPlateCapacitorPreset());
  });

  dipoleButton.addEventListener("click", () => {
    loadPreset(createDipolePreset());
  });

  canvas.addEventListener("pointerdown", (event) => {
    const { x, y } = getCanvasPoint(event);
    const existingCharge = findChargeAtPoint(x, y);

    pointerState.pointerId = event.pointerId;
    pointerState.startX = x;
    pointerState.startY = y;
    pointerState.moved = false;
    pointerState.draggedCharge = existingCharge ?? null;

    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const { x, y } = getCanvasPoint(event);
    if (electrostaticsState.probeEnabled) {
      electrostaticsState.probePoint = { x, y };
    } else {
      electrostaticsState.probePoint = null;
    }

    if (pointerState.pointerId !== event.pointerId || !pointerState.draggedCharge) {
      if (electrostaticsState.probeEnabled) {
        redrawCanvas();
      }
      return;
    }
    const distance = Math.hypot(x - pointerState.startX, y - pointerState.startY);

    if (distance > dragThreshold) {
      pointerState.moved = true;
    }

    if (!pointerState.moved) {
      return;
    }

    pointerState.draggedCharge.x = x;
    pointerState.draggedCharge.y = y;
    canvas.classList.add("is-dragging");
    redrawCanvas();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    const { x, y } = getCanvasPoint(event);

    if (pointerState.draggedCharge) {
      if (!pointerState.moved) {
        placeChargeAt(x, y);
      }
    } else {
      placeChargeAt(x, y);
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    resetPointerState();
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    resetPointerState();
  });

  canvas.addEventListener("pointerleave", () => {
    electrostaticsState.probePoint = null;
    redrawCanvas();
  });

  updateSelectionButtons();
  redrawCanvas();

  selectionGroup.append(positiveButton, negativeButton);
  presetButtons.append(plateCapacitorButton, dipoleButton);
  probeToggleLabel.append(probeToggle, probeToggleText);
  boardToolbar.append(probeToggleLabel);
  controls.append(
    controlsTitle,
    controlsText,
    selectionGroup,
    resetButton,
    presetTitle,
    presetButtons,
  );
  boardHeader.append(boardTitle, boardToolbar);
  canvasFrame.append(canvas);
  board.append(boardHeader, canvasFrame, boardHint);
  headerInfo.append(description, backLink);
  header.append(title, headerInfo);
  sidebar.append(controls);
  layout.append(sidebar, board);
  content.append(header, layout, createPackageCredit(t));
  page.append(content);

  return page;
}
