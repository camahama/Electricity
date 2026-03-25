import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import {
  createPotentialGrid,
  DEFAULT_GRID_HEIGHT,
  DEFAULT_GRID_WIDTH,
  DEFAULT_POTENTIAL_CUTOFF,
} from "../src/modules/electrostatics/physics/potentialGrid.js";
import { createFieldLineOverlay } from "../src/modules/electrostatics/visualization/fieldLineOverlay.js";
import { createEquipotentialOverlay } from "../src/modules/electrostatics/visualization/equipotentialOverlay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const simulation = {
  width: 1000,
  height: 1000,
  cutoff: DEFAULT_POTENTIAL_CUTOFF,
  scale: 100,
};

const pointCharges = [
  { x: Math.round(simulation.width * 0.66), y: Math.round(simulation.height * 0.5), charge: 1 },
  { x: Math.round(simulation.width * 0.34), y: Math.round(simulation.height * 0.5), charge: -1 },
];

const overlayConfig = {
  fieldLines: {
    enabled: true,
    color: [35, 35, 35],
    opacity: 0.75,
    autoFill: true,
    lineCount: 31,
    arrowLength: 8,
    stepSize: 0.8,
    maxSteps: 3000,
    seedSearchStep: 12,
    minSeedDistance: 32,
    maxOverlapRatio: 1,
    minStreamlineLength: 60,
    maxSeedAttempts: 900,
  },
  equipotentials: {
    enabled: true,
    color: [20, 20, 20],
    opacity: 1,
    levels: [-16, -12, -10, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 10, 12, 16],
    dashPeriod: 12,
    dashLength: 5,
    thickness: 1,
  },
};

const visualConfig = {
  heatmapGamma: 0.55,
  positiveColor: [220, 50, 47],
  negativeColor: [38, 93, 171],
  neutralColor: [248, 248, 246],
  chargeRadius: 5,
  chargeOutlineRadius: 7,
};

const outputPath = path.resolve(__dirname, "../generated/electrostatics-heatmap.png");

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function interpolateChannel(start, end, factor) {
  return Math.round(start + (end - start) * factor);
}

function colorForPotential(value, displayCutoff) {
  const normalizedMagnitude = clamp(Math.abs(value) / displayCutoff, 0, 1);
  const intensity = normalizedMagnitude ** visualConfig.heatmapGamma;

  if (value > 0) {
    return [
      interpolateChannel(visualConfig.neutralColor[0], visualConfig.positiveColor[0], intensity),
      interpolateChannel(visualConfig.neutralColor[1], visualConfig.positiveColor[1], intensity),
      interpolateChannel(visualConfig.neutralColor[2], visualConfig.positiveColor[2], intensity),
    ];
  }

  if (value < 0) {
    return [
      interpolateChannel(visualConfig.neutralColor[0], visualConfig.negativeColor[0], intensity),
      interpolateChannel(visualConfig.neutralColor[1], visualConfig.negativeColor[1], intensity),
      interpolateChannel(visualConfig.neutralColor[2], visualConfig.negativeColor[2], intensity),
    ];
  }

  return [...visualConfig.neutralColor];
}

function createDisplayPotentialGrid(pointCharges, options) {
  const { width, height, cutoff, scale } = options;
  const grid = Array.from({ length: height }, () => new Array(width));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let potential = 0;

      for (const pointCharge of pointCharges) {
        const distance = Math.hypot(x - pointCharge.x, y - pointCharge.y);

        if (distance === 0) {
          potential = pointCharge.charge > 0 ? cutoff : -cutoff;
          break;
        }

        potential += (pointCharge.charge * scale) / distance;
      }

      grid[y][x] = clamp(potential, -cutoff, cutoff);
    }
  }

  return grid;
}

function findHeatmapDisplayCutoff(displayGrid) {
  const magnitudes = displayGrid
    .flat()
    .map((value) => Math.abs(value))
    .sort((left, right) => left - right);

  const percentileIndex = Math.floor(0.99 * (magnitudes.length - 1));
  return Math.max(4, magnitudes[percentileIndex]);
}

function blendColors(baseColor, overlayColor, opacity) {
  return [
    Math.round(baseColor[0] * (1 - opacity) + overlayColor[0] * opacity),
    Math.round(baseColor[1] * (1 - opacity) + overlayColor[1] * opacity),
    Math.round(baseColor[2] * (1 - opacity) + overlayColor[2] * opacity),
  ];
}

function colorForChargeMarker(x, y) {
  for (const pointCharge of pointCharges) {
    const distance = Math.hypot(x - pointCharge.x, y - pointCharge.y);

    if (distance <= visualConfig.chargeRadius) {
      return pointCharge.charge > 0 ? [220, 40, 40] : [40, 90, 220];
    }

    if (distance <= visualConfig.chargeOutlineRadius) {
      return [30, 30, 30];
    }
  }

  return null;
}

function colorForPixel(x, y, displayGrid, fieldLineOverlay, equipotentialOverlay, displayCutoff) {
  let color = colorForPotential(displayGrid[y][x], displayCutoff);

  if (fieldLineOverlay?.[y]?.[x]) {
    color = blendColors(
      color,
      overlayConfig.fieldLines.color,
      overlayConfig.fieldLines.opacity,
    );
  }

  if (equipotentialOverlay?.[y]?.[x]) {
    color = blendColors(
      color,
      overlayConfig.equipotentials.color,
      overlayConfig.equipotentials.opacity,
    );
  }

  const chargeMarkerColor = colorForChargeMarker(x, y);

  if (chargeMarkerColor) {
    return chargeMarkerColor;
  }

  return color;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
}

const crc32Table = createCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const value of buffer) {
    crc = crc32Table[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createPngBuffer(displayGrid, fieldLineOverlay, equipotentialOverlay, displayCutoff) {
  const height = displayGrid.length;
  const width = displayGrid[0].length;
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const rawImageData = Buffer.alloc((width * 3 + 1) * height);

  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    const row = displayGrid[y];
    rawImageData[offset] = 0;
    offset += 1;

    for (let x = 0; x < row.length; x += 1) {
      const [red, green, blue] = colorForPixel(
        x,
        y,
        displayGrid,
        fieldLineOverlay,
        equipotentialOverlay,
        displayCutoff,
      );
      rawImageData[offset] = red;
      rawImageData[offset + 1] = green;
      rawImageData[offset + 2] = blue;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressedData = zlib.deflateSync(rawImageData);

  return Buffer.concat([
    signature,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", compressedData),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

function ensureOutputDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const grid = createPotentialGrid(pointCharges, simulation);
  const displayGrid = createDisplayPotentialGrid(pointCharges, simulation);
  const displayCutoff = findHeatmapDisplayCutoff(displayGrid);
  const fieldLineOverlay = overlayConfig.fieldLines.enabled
    ? createFieldLineOverlay(pointCharges, {
        potentialGrid: displayGrid,
        width: simulation.width,
        height: simulation.height,
        cutoff: simulation.cutoff,
        scale: simulation.scale,
        autoFill: overlayConfig.fieldLines.autoFill,
        lineCount: overlayConfig.fieldLines.lineCount,
        arrowLength: overlayConfig.fieldLines.arrowLength,
        stepSize: overlayConfig.fieldLines.stepSize,
        maxSteps: overlayConfig.fieldLines.maxSteps,
        seedSearchStep: overlayConfig.fieldLines.seedSearchStep,
        minSeedDistance: overlayConfig.fieldLines.minSeedDistance,
        maxOverlapRatio: overlayConfig.fieldLines.maxOverlapRatio,
        minStreamlineLength: overlayConfig.fieldLines.minStreamlineLength,
        maxSeedAttempts: overlayConfig.fieldLines.maxSeedAttempts,
      })
    : null;
  const equipotentialOverlay = overlayConfig.equipotentials.enabled
    ? createEquipotentialOverlay(displayGrid, {
        levels: overlayConfig.equipotentials.levels,
        dashPeriod: overlayConfig.equipotentials.dashPeriod,
        dashLength: overlayConfig.equipotentials.dashLength,
        thickness: overlayConfig.equipotentials.thickness,
      })
    : null;
  const pngBuffer = createPngBuffer(
    displayGrid,
    fieldLineOverlay,
    equipotentialOverlay,
    displayCutoff,
  );

  ensureOutputDirectory(outputPath);
  fs.writeFileSync(outputPath, pngBuffer);

  console.log("Electrostatics heat map image created.");
  console.log(`Saved to: ${outputPath}`);
  console.log("");
  console.log("Point charges:");

  pointCharges.forEach((pointCharge, index) => {
    console.log(
      `  ${index + 1}. q=${pointCharge.charge}, x=${pointCharge.x}, y=${pointCharge.y}`,
    );
  });

  console.log("");
  console.log(
    `Grid: ${simulation.width}x${simulation.height}  Heat map range: +/-${displayCutoff.toFixed(1)}  Physics cutoff: +/-${simulation.cutoff}`,
  );
  console.log(
    `Overlays: field lines=${overlayConfig.fieldLines.enabled} equipotentials=${overlayConfig.equipotentials.enabled}`,
  );
  if (overlayConfig.fieldLines.enabled) {
    console.log(
      `Field-line spacing: autoFill=${overlayConfig.fieldLines.autoFill} lineCount=${overlayConfig.fieldLines.lineCount} minSeedDistance=${overlayConfig.fieldLines.minSeedDistance} maxOverlapRatio=${overlayConfig.fieldLines.maxOverlapRatio}`,
    );
    console.log(
      `Field-line search: seedSearchStep=${overlayConfig.fieldLines.seedSearchStep} maxSeedAttempts=${overlayConfig.fieldLines.maxSeedAttempts} arrowLength=${overlayConfig.fieldLines.arrowLength}`,
    );
  }
}

main();
