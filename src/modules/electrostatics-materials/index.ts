import { createFieldLineOverlayFromPotentialGrid } from "../electrostatics/visualization/fieldLineOverlay.js";

const GRID_SIZE = 750;
const DEFAULT_PIECE_SIZE = 120;
const MIN_PIECE_SIZE = 40;
const RESIZE_HANDLE_SIZE = 14;
const BASE_CHARGE_RADIUS = 18;
const POTENTIAL_CUTOFF = 100;
const SOLVER_SCALE = 5;
const SOLVER_GRID_SIZE = GRID_SIZE / SOLVER_SCALE;
const SOLVER_ITERATIONS = 140;
const HEATMAP_POSITIVE = [220, 50, 47];
const HEATMAP_NEGATIVE = [38, 93, 171];
const HEATMAP_NEUTRAL = [248, 248, 246];
const FIELD_LINE_COLOR = [35, 35, 35];

const materialsState = {
  selectedTool: "metal",
  pieces: [],
  charges: [],
  selectedObjectType: null,
  selectedObjectId: null,
};

const pointerState = {
  pointerId: null,
  mode: null,
  objectType: null,
  objectId: null,
  offsetX: 0,
  offsetY: 0,
  anchorX: 0,
  anchorY: 0,
};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function interpolateChannel(start, end, factor) {
  return Math.round(start + (end - start) * factor);
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

function blendColors(baseColor, overlayColor, opacity) {
  return [
    Math.round(baseColor[0] * (1 - opacity) + overlayColor[0] * opacity),
    Math.round(baseColor[1] * (1 - opacity) + overlayColor[1] * opacity),
    Math.round(baseColor[2] * (1 - opacity) + overlayColor[2] * opacity),
  ];
}

function createMatrix(width, height, fillValue = 0) {
  return Array.from({ length: height }, () => new Float32Array(width).fill(fillValue));
}

function clampSolverIndex(value) {
  return clamp(Math.round(value), 0, SOLVER_GRID_SIZE - 1);
}

function buildPermittivityGrid(pieces) {
  const grid = createMatrix(SOLVER_GRID_SIZE, SOLVER_GRID_SIZE, 1);

  for (const piece of pieces) {
    const startX = clampSolverIndex(piece.x / SOLVER_SCALE);
    const endX = clampSolverIndex((piece.x + piece.width) / SOLVER_SCALE);
    const startY = clampSolverIndex(piece.y / SOLVER_SCALE);
    const endY = clampSolverIndex((piece.y + piece.height) / SOLVER_SCALE);
    const epsilon = piece.type === "dielectric" ? 4 : 1;

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        grid[y][x] = epsilon;
      }
    }
  }

  return grid;
}

function buildMetalRegions(pieces) {
  const mask = Array.from({ length: SOLVER_GRID_SIZE }, () => Array(SOLVER_GRID_SIZE).fill(false));
  const regions = [];

  for (const piece of pieces.filter((entry) => entry.type === "metal")) {
    const startX = clampSolverIndex(piece.x / SOLVER_SCALE);
    const endX = clampSolverIndex((piece.x + piece.width) / SOLVER_SCALE);
    const startY = clampSolverIndex(piece.y / SOLVER_SCALE);
    const endY = clampSolverIndex((piece.y + piece.height) / SOLVER_SCALE);
    const cells = [];

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        mask[y][x] = true;
        cells.push({ x, y });
      }
    }

    regions.push(cells);
  }

  return { mask, regions };
}

function buildChargeDensityGrid(charges) {
  const grid = createMatrix(SOLVER_GRID_SIZE, SOLVER_GRID_SIZE, 0);

  for (const charge of charges) {
    const x = clampSolverIndex(charge.x / SOLVER_SCALE);
    const y = clampSolverIndex(charge.y / SOLVER_SCALE);
    grid[y][x] += charge.charge * 28;
  }

  return grid;
}

function solvePotentialField(charges, pieces) {
  const potential = createMatrix(SOLVER_GRID_SIZE, SOLVER_GRID_SIZE, 0);
  const nextPotential = createMatrix(SOLVER_GRID_SIZE, SOLVER_GRID_SIZE, 0);
  const epsilon = buildPermittivityGrid(pieces);
  const chargeDensity = buildChargeDensityGrid(charges);
  const { mask: metalMask, regions: metalRegions } = buildMetalRegions(pieces);

  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
    for (let y = 1; y < SOLVER_GRID_SIZE - 1; y += 1) {
      for (let x = 1; x < SOLVER_GRID_SIZE - 1; x += 1) {
        if (metalMask[y][x]) {
          nextPotential[y][x] = potential[y][x];
          continue;
        }

        const epsilonCenter = epsilon[y][x];
        const eastWeight = (epsilonCenter + epsilon[y][x + 1]) / 2;
        const westWeight = (epsilonCenter + epsilon[y][x - 1]) / 2;
        const southWeight = (epsilonCenter + epsilon[y + 1][x]) / 2;
        const northWeight = (epsilonCenter + epsilon[y - 1][x]) / 2;
        const denominator = eastWeight + westWeight + southWeight + northWeight;
        const source = chargeDensity[y][x] / epsilonCenter;

        nextPotential[y][x] = (
          eastWeight * potential[y][x + 1] +
          westWeight * potential[y][x - 1] +
          southWeight * potential[y + 1][x] +
          northWeight * potential[y - 1][x] +
          source
        ) / denominator;
      }
    }

    for (const region of metalRegions) {
      let boundarySum = 0;
      let boundaryCount = 0;

      for (const cell of region) {
        const neighbors = [
          { x: cell.x + 1, y: cell.y },
          { x: cell.x - 1, y: cell.y },
          { x: cell.x, y: cell.y + 1 },
          { x: cell.x, y: cell.y - 1 },
        ];

        for (const neighbor of neighbors) {
          if (
            neighbor.x < 0 ||
            neighbor.x >= SOLVER_GRID_SIZE ||
            neighbor.y < 0 ||
            neighbor.y >= SOLVER_GRID_SIZE ||
            metalMask[neighbor.y][neighbor.x]
          ) {
            continue;
          }

          boundarySum += nextPotential[neighbor.y][neighbor.x];
          boundaryCount += 1;
        }
      }

      const floatingPotential = boundaryCount === 0 ? 0 : boundarySum / boundaryCount;

      for (const cell of region) {
        nextPotential[cell.y][cell.x] = floatingPotential;
      }
    }

    for (let y = 1; y < SOLVER_GRID_SIZE - 1; y += 1) {
      for (let x = 1; x < SOLVER_GRID_SIZE - 1; x += 1) {
        potential[y][x] = nextPotential[y][x];
      }
    }
  }

  return potential;
}

function getMaterialStyle(type) {
  if (type === "dielectric") {
    return {
      fill: "rgba(223, 167, 55, 0.34)",
      stroke: "#b87412",
      label: "D",
    };
  }

  return {
    fill: "rgba(111, 123, 143, 0.34)",
    stroke: "#43556d",
    label: "M",
  };
}

function createPiece(type, centerX, centerY) {
  return {
    id: crypto.randomUUID(),
    type,
    x: Math.round(centerX - DEFAULT_PIECE_SIZE / 2),
    y: Math.round(centerY - DEFAULT_PIECE_SIZE / 2),
    width: DEFAULT_PIECE_SIZE,
    height: DEFAULT_PIECE_SIZE,
  };
}

function createCharge(charge, centerX, centerY) {
  return {
    id: crypto.randomUUID(),
    charge,
    x: Math.round(centerX),
    y: Math.round(centerY),
  };
}

function getChargeRadius(charge) {
  return BASE_CHARGE_RADIUS * Math.cbrt(Math.abs(charge));
}

function normalizePiece(piece) {
  piece.width = Math.max(MIN_PIECE_SIZE, Math.round(piece.width));
  piece.height = Math.max(MIN_PIECE_SIZE, Math.round(piece.height));
  piece.x = clamp(Math.round(piece.x), 0, GRID_SIZE - piece.width);
  piece.y = clamp(Math.round(piece.y), 0, GRID_SIZE - piece.height);
}

function findPieceById(pieceId) {
  return materialsState.pieces.find((piece) => piece.id === pieceId) ?? null;
}

function findChargeById(chargeId) {
  return materialsState.charges.find((charge) => charge.id === chargeId) ?? null;
}

function findPieceAtPoint(x, y) {
  for (let index = materialsState.pieces.length - 1; index >= 0; index -= 1) {
    const piece = materialsState.pieces[index];

    if (
      x >= piece.x &&
      x <= piece.x + piece.width &&
      y >= piece.y &&
      y <= piece.y + piece.height
    ) {
      return piece;
    }
  }

  return null;
}

function findChargeAtPoint(x, y) {
  for (let index = materialsState.charges.length - 1; index >= 0; index -= 1) {
    const charge = materialsState.charges[index];

    if (Math.hypot(charge.x - x, charge.y - y) <= getChargeRadius(charge.charge)) {
      return charge;
    }
  }

  return null;
}

function isInsideResizeHandle(piece, x, y) {
  return (
    x >= piece.x + piece.width - RESIZE_HANDLE_SIZE &&
    x <= piece.x + piece.width + 2 &&
    y >= piece.y + piece.height - RESIZE_HANDLE_SIZE &&
    y <= piece.y + piece.height + 2
  );
}

export function renderElectrostaticsMaterialsModule({ t }) {
  const page = document.createElement("main");
  page.className = "page-shell";

  const content = document.createElement("section");
  content.className = "module-page module-page-wide";

  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "back-link";
  backLink.textContent = t("common.backToMenu");

  const title = document.createElement("h1");
  title.className = "module-title";
  title.textContent = t("modules.electrostaticsMaterials.title");

  const description = document.createElement("p");
  description.className = "module-description";
  description.textContent = t("modules.electrostaticsMaterials.description");

  const layout = document.createElement("div");
  layout.className = "electrostatics-layout";

  const controls = document.createElement("aside");
  controls.className = "electrostatics-controls";

  const controlsTitle = document.createElement("h2");
  controlsTitle.className = "electrostatics-panel-title";
  controlsTitle.textContent = t("modules.electrostaticsMaterials.controlsTitle");

  const controlsText = document.createElement("p");
  controlsText.className = "electrostatics-help";
  controlsText.textContent = t("modules.electrostaticsMaterials.instructions");

  const selector = document.createElement("div");
  selector.className = "charge-selector";

  const metalButton = document.createElement("button");
  metalButton.type = "button";
  metalButton.className = "charge-type-button materials-metal-button";
  metalButton.textContent = t("modules.electrostaticsMaterials.metal");

  const dielectricButton = document.createElement("button");
  dielectricButton.type = "button";
  dielectricButton.className = "charge-type-button materials-dielectric-button";
  dielectricButton.textContent = t("modules.electrostaticsMaterials.dielectric");

  const positiveChargeButton = document.createElement("button");
  positiveChargeButton.type = "button";
  positiveChargeButton.className = "charge-type-button charge-type-positive";
  positiveChargeButton.textContent = t("modules.electrostaticsMaterials.positiveCharge");

  const negativeChargeButton = document.createElement("button");
  negativeChargeButton.type = "button";
  negativeChargeButton.className = "charge-type-button charge-type-negative";
  negativeChargeButton.textContent = t("modules.electrostaticsMaterials.negativeCharge");

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "charge-type-button materials-remove-button";
  deleteButton.textContent = t("modules.electrostaticsMaterials.removeObject");

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "reset-button";
  clearButton.textContent = t("modules.electrostaticsMaterials.clearAll");

  const status = document.createElement("p");
  status.className = "electrostatics-status";

  const summary = document.createElement("div");
  summary.className = "charge-summary";

  const solverNote = document.createElement("p");
  solverNote.className = "electrostatics-help";
  solverNote.textContent = t("modules.electrostaticsMaterials.solverNote");

  const board = document.createElement("section");
  board.className = "electrostatics-board";

  const boardTitle = document.createElement("h2");
  boardTitle.className = "electrostatics-panel-title";
  boardTitle.textContent = t("modules.electrostaticsMaterials.boardTitle");

  const canvasFrame = document.createElement("div");
  canvasFrame.className = "electrostatics-canvas-frame";

  const canvas = document.createElement("canvas");
  canvas.className = "electrostatics-canvas materials-canvas";
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;
  canvas.setAttribute("aria-label", t("modules.electrostaticsMaterials.canvasLabel"));

  const boardHint = document.createElement("p");
  boardHint.className = "electrostatics-board-hint";
  boardHint.textContent = t("modules.electrostaticsMaterials.boardHint");

  const context = canvas.getContext("2d");

  function updateToolButtons() {
    metalButton.classList.toggle("active", materialsState.selectedTool === "metal");
    dielectricButton.classList.toggle("active", materialsState.selectedTool === "dielectric");
    positiveChargeButton.classList.toggle("active", materialsState.selectedTool === "positiveCharge");
    negativeChargeButton.classList.toggle("active", materialsState.selectedTool === "negativeCharge");
    deleteButton.classList.toggle("active", materialsState.selectedTool === "removeObject");
  }

  function drawBackground() {
    context.fillStyle = "#fbfcfe";
    context.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

    for (let index = 0; index <= GRID_SIZE; index += 50) {
      context.beginPath();
      context.strokeStyle = index % 100 === 0 ? "#d6deea" : "#e8edf5";
      context.lineWidth = 1;
      context.moveTo(index + 0.5, 0);
      context.lineTo(index + 0.5, GRID_SIZE);
      context.stroke();

      context.beginPath();
      context.moveTo(0, index + 0.5);
      context.lineTo(GRID_SIZE, index + 0.5);
      context.stroke();
    }
  }

  function drawPotentialLandscape() {
    if (materialsState.charges.length === 0) {
      drawBackground();
      return;
    }

    const displayGrid = solvePotentialField(materialsState.charges, materialsState.pieces);
    const displayCutoff = findDisplayCutoff(displayGrid);
    const fieldLineOverlay = createFieldLineOverlayFromPotentialGrid(displayGrid, {
      autoFill: false,
      lineCount: 18,
      stepSize: 0.7,
      maxSteps: 900,
      seedSearchStep: 8,
      minSeedDistance: 8,
      maxOverlapRatio: 1,
      minStreamlineLength: 18,
      maxSeedAttempts: 120,
      arrowLength: 4,
      netCharge: materialsState.charges.reduce((sum, charge) => sum + charge.charge, 0),
    });
    const imageData = context.createImageData(SOLVER_GRID_SIZE, SOLVER_GRID_SIZE);
    let offset = 0;

    for (let y = 0; y < SOLVER_GRID_SIZE; y += 1) {
      for (let x = 0; x < SOLVER_GRID_SIZE; x += 1) {
        let color = colorForPotential(displayGrid[y][x], displayCutoff);

        if (fieldLineOverlay[y][x]) {
          color = blendColors(color, FIELD_LINE_COLOR, 0.78);
        }

        const [red, green, blue] = color;
        imageData.data[offset] = red;
        imageData.data[offset + 1] = green;
        imageData.data[offset + 2] = blue;
        imageData.data[offset + 3] = 255;
        offset += 4;
      }
    }

    const bitmapCanvas = document.createElement("canvas");
    bitmapCanvas.width = SOLVER_GRID_SIZE;
    bitmapCanvas.height = SOLVER_GRID_SIZE;
    const bitmapContext = bitmapCanvas.getContext("2d");
    bitmapContext.putImageData(imageData, 0, 0);

    context.imageSmoothingEnabled = true;
    context.drawImage(bitmapCanvas, 0, 0, GRID_SIZE, GRID_SIZE);
  }

  function drawPiece(piece) {
    const style = getMaterialStyle(piece.type);
    const isSelected =
      materialsState.selectedObjectType === "piece" &&
      piece.id === materialsState.selectedObjectId;

    context.fillStyle = style.fill;
    context.strokeStyle = style.stroke;
    context.lineWidth = isSelected ? 3 : 2;
    context.fillRect(piece.x, piece.y, piece.width, piece.height);
    context.strokeRect(piece.x, piece.y, piece.width, piece.height);

    context.fillStyle = style.stroke;
    context.font = '700 18px "Avenir Next", sans-serif';
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(
      `${style.label} ${piece.width}x${piece.height}`,
      piece.x + 10,
      piece.y + 10,
    );

    if (isSelected) {
      const handleX = piece.x + piece.width - RESIZE_HANDLE_SIZE;
      const handleY = piece.y + piece.height - RESIZE_HANDLE_SIZE;
      context.fillStyle = "#132238";
      context.fillRect(handleX, handleY, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.strokeRect(handleX + 0.5, handleY + 0.5, RESIZE_HANDLE_SIZE - 1, RESIZE_HANDLE_SIZE - 1);
    }
  }

  function drawCharge(charge) {
    const isSelected =
      materialsState.selectedObjectType === "charge" &&
      charge.id === materialsState.selectedObjectId;
    const radius = getChargeRadius(charge.charge);
    const isPositive = charge.charge > 0;

    context.beginPath();
    context.fillStyle = isPositive ? "#d93d37" : "#2560c7";
    context.strokeStyle = "#203045";
    context.lineWidth = isSelected ? 3 : 2;
    context.arc(charge.x, charge.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.max(13, radius * 0.9)}px "Avenir Next", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      `${charge.charge > 0 ? "+" : ""}${charge.charge}`,
      charge.x,
      charge.y + 1,
    );

    if (isSelected) {
      context.beginPath();
      context.fillStyle = "#132238";
      context.arc(charge.x + radius * 0.7, charge.y - radius * 0.7, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function redrawCanvas() {
    drawPotentialLandscape();
    materialsState.pieces.forEach(drawPiece);
    materialsState.charges.forEach(drawCharge);
  }

  function updateSummary() {
    const metalCount = materialsState.pieces.filter((piece) => piece.type === "metal").length;
    const dielectricCount = materialsState.pieces.filter((piece) => piece.type === "dielectric").length;
    const positiveCount = materialsState.charges.filter((charge) => charge.charge > 0).length;
    const negativeCount = materialsState.charges.filter((charge) => charge.charge < 0).length;

    status.textContent = t("modules.electrostaticsMaterials.selectionStatus", {
      material:
        materialsState.selectedTool === "metal"
          ? t("modules.electrostaticsMaterials.metal")
          : materialsState.selectedTool === "dielectric"
            ? t("modules.electrostaticsMaterials.dielectric")
            : materialsState.selectedTool === "positiveCharge"
              ? t("modules.electrostaticsMaterials.positiveCharge")
              : materialsState.selectedTool === "negativeCharge"
                ? t("modules.electrostaticsMaterials.negativeCharge")
                : t("modules.electrostaticsMaterials.removeObject"),
    });

    if (materialsState.pieces.length === 0 && materialsState.charges.length === 0) {
      summary.textContent = t("modules.electrostaticsMaterials.emptyState");
      return;
    }

    const lines = [
      t("modules.electrostaticsMaterials.materialCount", {
        count: materialsState.pieces.length + materialsState.charges.length,
      }),
      t("modules.electrostaticsMaterials.materialBreakdown", {
        metal: metalCount,
        dielectric: dielectricCount,
        positive: positiveCount,
        negative: negativeCount,
      }),
    ];

    summary.textContent = lines.join("\n");
  }

  function resetPointerState() {
    pointerState.pointerId = null;
    pointerState.mode = null;
    pointerState.objectType = null;
    pointerState.objectId = null;
    pointerState.offsetX = 0;
    pointerState.offsetY = 0;
    pointerState.anchorX = 0;
    pointerState.anchorY = 0;
    canvas.classList.remove("is-dragging");
    canvas.classList.remove("is-resizing");
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: clamp(Math.round((event.clientX - rect.left) * scaleX), 0, GRID_SIZE - 1),
      y: clamp(Math.round((event.clientY - rect.top) * scaleY), 0, GRID_SIZE - 1),
    };
  }

  function addPieceAt(x, y) {
    const piece = createPiece(materialsState.selectedTool, x, y);
    normalizePiece(piece);
    materialsState.pieces.push(piece);
    materialsState.selectedObjectType = "piece";
    materialsState.selectedObjectId = piece.id;
    redrawCanvas();
    updateSummary();
  }

  function addChargeAt(x, y) {
    const charge = createCharge(
      materialsState.selectedTool === "positiveCharge" ? 1 : -1,
      x,
      y,
    );
    materialsState.charges.push(charge);
    materialsState.selectedObjectType = "charge";
    materialsState.selectedObjectId = charge.id;
    redrawCanvas();
    updateSummary();
  }

  function removeObjectAtPoint(x, y) {
    const charge = findChargeAtPoint(x, y);

    if (charge) {
      materialsState.charges = materialsState.charges.filter((entry) => entry.id !== charge.id);
      if (materialsState.selectedObjectType === "charge" && materialsState.selectedObjectId === charge.id) {
        materialsState.selectedObjectType = null;
        materialsState.selectedObjectId = null;
      }
      redrawCanvas();
      updateSummary();
      return true;
    }

    const piece = findPieceAtPoint(x, y);

    if (piece) {
      materialsState.pieces = materialsState.pieces.filter((entry) => entry.id !== piece.id);
      if (materialsState.selectedObjectType === "piece" && materialsState.selectedObjectId === piece.id) {
        materialsState.selectedObjectType = null;
        materialsState.selectedObjectId = null;
      }
      redrawCanvas();
      updateSummary();
      return true;
    }

    return false;
  }

  function activateTool(tool) {
    materialsState.selectedTool = tool;
    updateToolButtons();
    updateSummary();
  }

  metalButton.addEventListener("click", () => activateTool("metal"));
  dielectricButton.addEventListener("click", () => activateTool("dielectric"));
  positiveChargeButton.addEventListener("click", () => activateTool("positiveCharge"));
  negativeChargeButton.addEventListener("click", () => activateTool("negativeCharge"));
  deleteButton.addEventListener("click", () => activateTool("removeObject"));

  clearButton.addEventListener("click", () => {
    materialsState.pieces = [];
    materialsState.charges = [];
    materialsState.selectedObjectType = null;
    materialsState.selectedObjectId = null;
    redrawCanvas();
    updateSummary();
  });

  canvas.addEventListener("pointerdown", (event) => {
    const { x, y } = getCanvasPoint(event);
    const charge = findChargeAtPoint(x, y);
    const piece = findPieceAtPoint(x, y);

    if (materialsState.selectedTool === "removeObject") {
      removeObjectAtPoint(x, y);
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    pointerState.pointerId = event.pointerId;

    if (!charge && !piece) {
      materialsState.selectedObjectType = null;
      materialsState.selectedObjectId = null;

      if (materialsState.selectedTool === "metal" || materialsState.selectedTool === "dielectric") {
        addPieceAt(x, y);
      } else {
        addChargeAt(x, y);
      }

      resetPointerState();
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (charge) {
      materialsState.selectedObjectType = "charge";
      materialsState.selectedObjectId = charge.id;
      pointerState.mode = "move";
      pointerState.objectType = "charge";
      pointerState.objectId = charge.id;
      pointerState.offsetX = x - charge.x;
      pointerState.offsetY = y - charge.y;
      canvas.classList.add("is-dragging");
      redrawCanvas();
      updateSummary();
      return;
    }

    materialsState.selectedObjectType = "piece";
    materialsState.selectedObjectId = piece.id;

    if (isInsideResizeHandle(piece, x, y)) {
      pointerState.mode = "resize";
      pointerState.objectType = "piece";
      pointerState.objectId = piece.id;
      pointerState.anchorX = piece.x;
      pointerState.anchorY = piece.y;
      canvas.classList.add("is-resizing");
    } else {
      pointerState.mode = "move";
      pointerState.objectType = "piece";
      pointerState.objectId = piece.id;
      pointerState.offsetX = x - piece.x;
      pointerState.offsetY = y - piece.y;
      canvas.classList.add("is-dragging");
    }

    redrawCanvas();
    updateSummary();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointerState.pointerId !== event.pointerId || !pointerState.mode || !pointerState.objectId) {
      return;
    }

    const { x, y } = getCanvasPoint(event);

    if (pointerState.objectType === "charge") {
      const charge = findChargeById(pointerState.objectId);
      if (!charge) {
        return;
      }

      charge.x = clamp(Math.round(x - pointerState.offsetX), 0, GRID_SIZE - 1);
      charge.y = clamp(Math.round(y - pointerState.offsetY), 0, GRID_SIZE - 1);
      redrawCanvas();
      updateSummary();
      return;
    }

    const piece = findPieceById(pointerState.objectId);
    if (!piece) {
      return;
    }

    if (pointerState.mode === "move") {
      piece.x = x - pointerState.offsetX;
      piece.y = y - pointerState.offsetY;
      normalizePiece(piece);
    }

    if (pointerState.mode === "resize") {
      piece.width = Math.max(MIN_PIECE_SIZE, x - pointerState.anchorX);
      piece.height = Math.max(MIN_PIECE_SIZE, y - pointerState.anchorY);
      normalizePiece(piece);
    }

    redrawCanvas();
    updateSummary();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (pointerState.pointerId !== event.pointerId) {
      return;
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

  updateToolButtons();
  redrawCanvas();
  updateSummary();

  selector.append(metalButton, dielectricButton, positiveChargeButton, negativeChargeButton);
  controls.append(
    controlsTitle,
    controlsText,
    selector,
    deleteButton,
    clearButton,
    status,
    summary,
    solverNote,
  );
  canvasFrame.append(canvas);
  board.append(boardTitle, canvasFrame, boardHint);
  layout.append(controls, board);
  content.append(backLink, title, description, layout);
  page.append(content);

  return page;
}
