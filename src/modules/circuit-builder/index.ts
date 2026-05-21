import type { ModuleRenderContext } from "../../config/modules.js";
import { createPackageCredit } from "../../components/packageCredit.js";
import { solveLinearCircuit, type LinearCircuitComponent } from "./physics/linearCircuit.js";

const BOARD_WIDTH = 900;
const BOARD_HEIGHT = 700;
const GRID_SIZE = 50;
const SNAP_RADIUS = 18;
const NODE_SPLIT_GAP = SNAP_RADIUS + 14;
const COMPONENT_SPAN = GRID_SIZE * 3;
const REAL_BATTERY_LEFT_SPAN = GRID_SIZE * 2;
const REAL_BATTERY_RIGHT_SPAN = GRID_SIZE * 2;
const REAL_BATTERY_SPAN = REAL_BATTERY_LEFT_SPAN + REAL_BATTERY_RIGHT_SPAN;
const DEFAULT_RESISTANCE_OHMS = 100;
const DEFAULT_VOLTAGE_VOLTS = 9;
const REAL_BATTERY_RESISTANCE_OHMS = 1;

type Tool =
  | "select"
  | "wire"
  | "resistor"
  | "idealBattery"
  | "realBattery"
  | "ground"
  | "erase"
  | "currentProbe"
  | "potentialProbe"
  | "voltmeter"
  | "ohmmeter";
type CircuitNode = { id: string; x: number; y: number };
type CurrentProbe = { id: string; componentId: string; fraction: number };
type PotentialProbe = { id: string; nodeId: string; offsetX: number; offsetY: number };
type MeterProbe = { id: string; positiveNode: string; negativeNode: string; offsetX: number; offsetY: number };
type VoltmeterProbe = MeterProbe;
type OhmmeterProbe = MeterProbe;
type DraggingProbe =
  | { type: "potential"; id: string; grabOffsetX: number; grabOffsetY: number }
  | { type: "voltmeter"; id: string; grabOffsetX: number; grabOffsetY: number }
  | { type: "ohmmeter"; id: string; grabOffsetX: number; grabOffsetY: number };
type DraggingNode = { id: string; startX: number; startY: number; moved: boolean };
type DraggingComponent = {
  startX: number;
  startY: number;
  moved: boolean;
  nodes: Array<{ id: string; x: number; y: number }>;
};
type ComponentClick = { componentId: string; time: number; x: number; y: number };
type ComponentEndpointKey = "nodeA" | "nodeB" | "positiveNode" | "negativeNode";
type BoardComponent =
  | { id: string; type: "wire"; nodeA: string; nodeB: string }
  | { id: string; type: "resistor"; nodeA: string; nodeB: string; resistanceOhms: number }
  | { id: string; type: "idealBattery"; positiveNode: string; negativeNode: string; voltageVolts: number };

const state = {
  selectedTool: "resistor" as Tool,
  nodes: [] as CircuitNode[],
  components: [] as BoardComponent[],
  groundNode: null as string | null,
  pendingWireNode: null as string | null,
  pendingVoltmeterNode: null as string | null,
  pendingOhmmeterNode: null as string | null,
  snapToGrid: true,
  draggingNode: null as DraggingNode | null,
  draggingProbe: null as DraggingProbe | null,
  draggingComponent: null as DraggingComponent | null,
  lastResistanceOhms: DEFAULT_RESISTANCE_OHMS,
  lastBatteryVoltageVolts: DEFAULT_VOLTAGE_VOLTS,
  currentProbes: [] as CurrentProbe[],
  potentialProbes: [] as PotentialProbe[],
  voltmeters: [] as VoltmeterProbe[],
  ohmmeters: [] as OhmmeterProbe[],
  activeToolInfo: null as Tool | null,
  lastComponentClick: null as ComponentClick | null,
};

let nextNodeId = 1;
let nextComponentId = 1;
let nextProbeId = 1;

export function renderCircuitBuilderModule({ t, language = "en" }: ModuleRenderContext): HTMLElement {
  const page = document.createElement("main");
  page.className = "page-shell circuit-builder-shell";

  const content = element("section", "module-page module-page-wide circuit-builder-page");
  const backLink = document.createElement("a");
  backLink.href = "#/";
  backLink.className = "module-menu-button";
  backLink.textContent = t("common.menuButton");

  const header = element("header", "circuit-builder-header");
  const headerInfo = element("div", "module-header-info");
  headerInfo.append(element("p", "module-description", t("modules.circuitBuilder.description")), backLink);
  header.append(
    element("h1", "module-title", t("modules.circuitBuilder.title")),
    headerInfo,
  );

  const layout = element("div", "circuit-builder-layout");
  const controls = element("aside", "circuit-builder-controls");
  const boardPanel = element("section", "circuit-builder-board-panel");
  const snapControl = element("label", "circuit-builder-snap-control");
  const snapCheckbox = document.createElement("input");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const results = element("div", "circuit-builder-results");

  snapCheckbox.type = "checkbox";
  snapCheckbox.checked = state.snapToGrid;
  snapCheckbox.addEventListener("change", () => {
    state.snapToGrid = snapCheckbox.checked;
  });
  snapControl.append(snapCheckbox, element("span", "", t("modules.circuitBuilder.snapToGrid")));

  svg.setAttribute("viewBox", `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
  svg.setAttribute("class", "circuit-builder-board");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("modules.circuitBuilder.boardLabel"));

  function update() {
    renderControls();
    renderBoard();
    renderResults();
  }

  function renderControls() {
    controls.replaceChildren();
    const toolTitle = element("h2", "circuit-builder-panel-title", t("modules.circuitBuilder.componentsTitle"));
    const toolGrid = element("div", "circuit-builder-tool-grid");

    const tools: Array<{ tool: Tool; label: string; info: string }> = [
      { tool: "select", label: t("modules.circuitBuilder.selectTool"), info: t("modules.circuitBuilder.selectInfo") },
      { tool: "wire", label: t("modules.circuitBuilder.wireTool"), info: t("modules.circuitBuilder.wireInfo") },
      { tool: "resistor", label: t("modules.circuitBuilder.resistorTool"), info: t("modules.circuitBuilder.resistorInfo") },
      { tool: "idealBattery", label: t("modules.circuitBuilder.idealBatteryTool"), info: t("modules.circuitBuilder.idealBatteryInfo") },
      { tool: "realBattery", label: t("modules.circuitBuilder.realBatteryTool"), info: t("modules.circuitBuilder.realBatteryInfo") },
      { tool: "ground", label: t("modules.circuitBuilder.groundTool"), info: t("modules.circuitBuilder.groundInfo") },
      { tool: "currentProbe", label: t("modules.circuitBuilder.currentProbeTool"), info: t("modules.circuitBuilder.currentProbeInfo") },
      { tool: "potentialProbe", label: t("modules.circuitBuilder.potentialProbeTool"), info: t("modules.circuitBuilder.potentialProbeInfo") },
      { tool: "voltmeter", label: t("modules.circuitBuilder.voltmeterTool"), info: t("modules.circuitBuilder.voltmeterInfo") },
      { tool: "ohmmeter", label: t("modules.circuitBuilder.ohmmeterTool"), info: t("modules.circuitBuilder.ohmmeterInfo") },
      { tool: "erase", label: t("modules.circuitBuilder.eraseTool"), info: t("modules.circuitBuilder.eraseInfo") },
    ];

    for (const entry of tools) {
      const row = element("div", "circuit-builder-tool-row");
      const button = document.createElement("button");
      button.type = "button";
      button.className = entry.tool === state.selectedTool ? "circuit-builder-tool active" : "circuit-builder-tool";
      button.append(createToolIcon(entry.tool), element("span", "circuit-builder-tool-label", entry.label));
      button.addEventListener("click", () => {
        cancelPendingActions();
        state.selectedTool = entry.tool;
        update();
      });
      const infoButton = document.createElement("button");
      infoButton.type = "button";
      infoButton.className = "circuit-builder-tool-info";
      infoButton.textContent = "i";
      infoButton.setAttribute("aria-label", entry.info);
      infoButton.addEventListener("click", (event) => {
        event.stopPropagation();
        state.activeToolInfo = state.activeToolInfo === entry.tool ? null : entry.tool;
        update();
      });
      row.append(button, infoButton);
      if (state.activeToolInfo === entry.tool) {
        row.append(element("p", "circuit-builder-tool-popup", entry.info));
      }
      toolGrid.append(row);
    }

    const actions = element("div", "circuit-builder-actions");
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "circuit-builder-reset";
    clearButton.textContent = t("modules.circuitBuilder.clearAll");
    clearButton.addEventListener("click", () => {
      state.nodes = [];
      state.components = [];
      state.groundNode = null;
      state.pendingWireNode = null;
      state.pendingVoltmeterNode = null;
      state.pendingOhmmeterNode = null;
      state.draggingProbe = null;
      state.draggingComponent = null;
      state.activeToolInfo = null;
      state.currentProbes = [];
      state.potentialProbes = [];
      state.voltmeters = [];
      state.ohmmeters = [];
      update();
    });
    actions.append(clearButton);

    controls.append(toolTitle, toolGrid, actions);
  }

  function renderBoard() {
    svg.replaceChildren();
    svg.append(createProbeMarker(), createGrid());

    for (const component of state.components) {
      svg.append(renderComponent(component));
    }

    for (const probe of state.currentProbes) {
      svg.append(renderCurrentProbe(probe));
    }
    for (const probe of state.potentialProbes) {
      svg.append(renderPotentialProbe(probe));
    }
    for (const voltmeter of state.voltmeters) {
      svg.append(renderVoltmeter(voltmeter));
    }
    for (const ohmmeter of state.ohmmeters) {
      svg.append(renderOhmmeter(ohmmeter));
    }

    for (const node of state.nodes) {
      svg.append(renderNode(node));
    }
  }

  function renderResults() {
    results.replaceChildren();
    results.hidden = false;

    if (state.nodes.length === 0) {
      results.textContent = t("modules.circuitBuilder.instructions");
      return;
    }

    const groundNode = getEffectiveGroundNode();

    if (groundNode == null) {
      results.textContent = t("modules.circuitBuilder.noGround");
      return;
    }

    try {
      solveLinearCircuit({
        nodes: physicsNodes(),
        groundNode,
        components: physicsComponents(),
      });
      results.hidden = true;
    } catch (error) {
      results.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  function renderComponent(component: BoardComponent): SVGElement {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `circuit-builder-component circuit-builder-${component.type}`);
    group.addEventListener("pointerdown", (event) => {
      const point = svgPoint(svg, event);
      if (state.selectedTool === "select") {
        event.preventDefault();
        event.stopPropagation();
        if (handleComponentDoubleClick(component, point, event.target)) {
          update();
          return;
        }
        state.draggingComponent = createDraggingComponent(component, point);
        svg.setPointerCapture(event.pointerId);
        return;
      }
      if (state.selectedTool === "currentProbe") {
        event.stopPropagation();
        toggleCurrentProbe(component.id, point);
        returnToSelect();
        update();
        return;
      }
      if (state.selectedTool === "wire" && component.type === "wire") {
        event.stopPropagation();
        handleWireNode(splitWireAtPoint(component, point));
        update();
        return;
      }
      if (state.selectedTool === "wire" && isComponentWireTarget(event.target)) {
        event.stopPropagation();
        handleWireNode(insertNodeOnComponentWire(component, point));
        update();
        return;
      }
      if (state.selectedTool !== "erase") {
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      removeComponent(component.id);
      update();
    });
    group.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      if (state.selectedTool === "erase" || state.selectedTool === "currentProbe") {
        return;
      }
      if (shouldEditComponentOnDoubleClick(component, event.target)) {
        editComponentValue(component);
      } else {
        splitComponentAtPoint(component, svgPoint(svg, event));
      }
      update();
    });

    if (component.type === "wire") {
      const nodeA = getNode(component.nodeA);
      const nodeB = getNode(component.nodeB);
      appendLine(group, nodeA.x, nodeA.y, nodeB.x, nodeB.y, "circuit-builder-wire-line");
      return group;
    }

    if (isBatteryComponent(component)) {
      const positive = getNode(component.positiveNode);
      const negative = getNode(component.negativeNode);
      const center = midpoint(positive, negative);
      const angle = Math.atan2(positive.y - negative.y, positive.x - negative.x);
      const normal = angle + Math.PI / 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const shortCenter = { x: center.x - ux * 9, y: center.y - uy * 9 };
      const longCenter = { x: center.x + ux * 9, y: center.y + uy * 9 };
      appendLine(group, negative.x, negative.y, shortCenter.x, shortCenter.y, "circuit-builder-wire-line");
      appendLine(group, longCenter.x, longCenter.y, positive.x, positive.y, "circuit-builder-wire-line");
      appendLine(group, shortCenter.x, shortCenter.y, longCenter.x, longCenter.y, "circuit-builder-battery-hit");
      appendPlate(group, shortCenter, normal, 26);
      appendPlate(group, longCenter, normal, 44);
      const labelX = center.x + Math.cos(normal) * 34;
      const labelY = center.y + Math.sin(normal) * 34;
      const valueLabel = label(labelX, labelY, formatVoltage(component.voltageVolts));
      valueLabel.setAttribute("transform", `rotate(${readableAngleDegrees(angle)} ${labelX} ${labelY})`);
      group.append(valueLabel);
      return group;
    }

    const nodeA = getNode(component.nodeA);
    const nodeB = getNode(component.nodeB);
    appendLine(group, nodeA.x, nodeA.y, nodeB.x, nodeB.y, "circuit-builder-wire-line");

    const center = midpoint(nodeA, nodeB);
    const angle = Math.atan2(nodeB.y - nodeA.y, nodeB.x - nodeA.x);
    appendResistorBody(group, center, angle, formatResistance(component.resistanceOhms));

    return group;
  }

  function renderNode(node: CircuitNode): SVGElement {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const isGrounded = getEffectiveGroundNode() === node.id;
    const isConnected = componentEndpointRefs(node.id).length > 1;
    group.setAttribute(
      "class",
      [
        "circuit-builder-node",
        isConnected ? "connected" : "",
        isGrounded ? "grounded" : "",
        shouldUseSolderingCursor() ? "soldering" : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    group.setAttribute("transform", `translate(${node.x} ${node.y})`);
    group.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.selectedTool === "ground") {
        state.groundNode = node.id;
        returnToSelect();
        update();
        return;
      }
      if (state.selectedTool === "wire") {
        handleWireNode(node.id);
        update();
        return;
      }
      if (state.selectedTool === "potentialProbe") {
        togglePotentialProbe(node.id);
        returnToSelect();
        update();
        return;
      }
      if (state.selectedTool === "voltmeter") {
        if (handleVoltmeterNode(node.id)) {
          returnToSelect();
        }
        update();
        return;
      }
      if (state.selectedTool === "ohmmeter") {
        if (handleOhmmeterNode(node.id)) {
          returnToSelect();
        }
        update();
        return;
      }
      if (state.selectedTool === "erase" || state.selectedTool === "currentProbe") {
        return;
      }
      const point = svgPoint(svg, event);
      state.draggingNode = { id: node.id, startX: point.x, startY: point.y, moved: false };
      svg.setPointerCapture(event.pointerId);
    });

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("r", "16");
    hit.setAttribute("class", "circuit-builder-node-hit");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", isConnected ? "3.5" : "5");
    dot.setAttribute("class", "circuit-builder-node-dot");
    group.append(hit, dot);

    if (isGrounded) {
      const ground = document.createElementNS("http://www.w3.org/2000/svg", "path");
      ground.setAttribute("d", "M 0 0 V 14 M -12 14 H 12 M -8 20 H 8 M -4 26 H 4");
      ground.setAttribute("class", "circuit-builder-ground-symbol");
      group.append(ground);
    }

    return group;
  }

  svg.addEventListener(
    "pointerdown",
    (event) => {
      const point = svgPoint(svg, event);

      if (state.selectedTool === "select") {
        const probe = movableProbeAt(point);
        if (probe == null) {
          return;
        }

        state.draggingProbe = probe;
        event.preventDefault();
        event.stopPropagation();
        svg.setPointerCapture(event.pointerId);
        return;
      }

      if (state.selectedTool !== "erase") {
        return;
      }

      if (!removeProbeAt(point)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      update();
    },
    { capture: true },
  );

  svg.addEventListener("pointerdown", (event) => {
    const point = svgPoint(svg, event);
    const placementPoint = maybeSnapPoint(point);

    if (state.selectedTool === "select") {
      return;
    }

    if (state.selectedTool === "erase" || state.selectedTool === "currentProbe") {
      return;
    }

    if (state.selectedTool === "ground") {
      state.groundNode = getOrCreateNode(placementPoint.x, placementPoint.y);
      returnToSelect();
      update();
      return;
    }

    if (state.selectedTool === "wire") {
      const nodeId = getOrCreateNode(placementPoint.x, placementPoint.y);
      handleWireNode(nodeId);
      update();
      return;
    }

    if (state.selectedTool === "potentialProbe") {
      togglePotentialProbe(getOrCreateNode(placementPoint.x, placementPoint.y));
      returnToSelect();
      update();
      return;
    }

    if (state.selectedTool === "voltmeter") {
      if (handleVoltmeterNode(getOrCreateNode(placementPoint.x, placementPoint.y))) {
        returnToSelect();
      }
      update();
      return;
    }

    if (state.selectedTool === "ohmmeter") {
      if (handleOhmmeterNode(getOrCreateNode(placementPoint.x, placementPoint.y))) {
        returnToSelect();
      }
      update();
      return;
    }

    if (state.selectedTool === "resistor") {
      const { left, right } = horizontalSpanPoints(point, COMPONENT_SPAN);
      const leftNode = getOrCreateNode(left.x, left.y);
      const rightNode = getOrCreateNode(right.x, right.y);
      state.components.push({
        id: nextComponentIdValue("r"),
        type: "resistor",
        nodeA: leftNode,
        nodeB: rightNode,
        resistanceOhms: state.lastResistanceOhms,
      });
    } else if (state.selectedTool === "idealBattery") {
      const { left, right } = horizontalSpanPoints(point, COMPONENT_SPAN);
      const leftNode = getOrCreateNode(left.x, left.y);
      const rightNode = getOrCreateNode(right.x, right.y);
      state.components.push({
        id: nextComponentIdValue("b"),
        type: "idealBattery",
        positiveNode: leftNode,
        negativeNode: rightNode,
        voltageVolts: state.lastBatteryVoltageVolts,
      });
    } else if (state.selectedTool === "realBattery") {
      const { left, middle, right } = realBatterySpanPoints(point);
      const realBatteryLeftNode = getOrCreateNode(left.x, left.y);
      const middleNode = getOrCreateNode(middle.x, middle.y);
      const realBatteryRightNode = getOrCreateNode(right.x, right.y);
      state.components.push(
        {
          id: nextComponentIdValue("b"),
          type: "idealBattery",
          positiveNode: realBatteryLeftNode,
          negativeNode: middleNode,
          voltageVolts: state.lastBatteryVoltageVolts,
        },
        {
          id: nextComponentIdValue("r"),
          type: "resistor",
          nodeA: middleNode,
          nodeB: realBatteryRightNode,
          resistanceOhms: REAL_BATTERY_RESISTANCE_OHMS,
        },
      );
    }

    update();
  });

  svg.addEventListener("pointermove", (event) => {
    if (state.draggingProbe != null) {
      moveDraggingProbe(svgPoint(svg, event));
      renderBoard();
      return;
    }

    if (state.draggingComponent != null) {
      if (moveDraggingComponent(svgPoint(svg, event))) {
        renderBoard();
      }
      return;
    }

    if (state.draggingNode == null) {
      return;
    }
    const node = getNode(state.draggingNode.id);
    const point = svgPoint(svg, event);
    if (!state.draggingNode.moved && Math.hypot(point.x - state.draggingNode.startX, point.y - state.draggingNode.startY) < 3) {
      return;
    }
    state.draggingNode.moved = true;
    const targetPoint = maybeSnapPoint(point);
    node.x = targetPoint.x;
    node.y = targetPoint.y;
    renderBoard();
  });

  svg.addEventListener("pointerup", () => {
    if (state.draggingProbe != null) {
      state.draggingProbe = null;
      update();
      return;
    }

    if (state.draggingComponent != null) {
      const draggingComponent = state.draggingComponent;
      const nodeIds = draggingComponent.nodes.map((node) => node.id);
      state.draggingComponent = null;
      if (!draggingComponent.moved) {
        return;
      }
      for (const nodeId of nodeIds) {
        mergeTouchingNode(nodeId);
      }
      update();
      return;
    }

    if (state.draggingNode != null) {
      const draggingNode = state.draggingNode;
      state.draggingNode = null;
      if (draggingNode.moved) {
        mergeTouchingNode(draggingNode.id);
      } else {
        splitNode(draggingNode.id);
      }
      update();
    }
  });

  boardPanel.append(snapControl, svg, results);
  layout.append(controls, boardPanel);
  content.append(header, layout, createPackageCredit(t));
  page.append(content);
  update();

  return page;
}

function physicsNodes(): string[] {
  return state.nodes.map((node) => node.id);
}

function physicsComponents(): LinearCircuitComponent[] {
  return state.components.flatMap(toPhysicsComponents);
}

function toPhysicsComponents(component: BoardComponent): LinearCircuitComponent[] {
  if (component.type === "idealBattery") {
    return [
      {
        id: component.id,
        type: "battery",
        positiveNode: component.positiveNode,
        negativeNode: component.negativeNode,
        voltageVolts: component.voltageVolts,
      },
    ];
  }

  return [component];
}

function isBatteryComponent(
  component: BoardComponent,
): component is Extract<BoardComponent, { type: "idealBattery" }> {
  return component.type === "idealBattery";
}

function handleWireNode(nodeId: string): boolean {
  if (state.pendingWireNode == null) {
    state.pendingWireNode = nodeId;
    return false;
  }

  if (state.pendingWireNode !== nodeId) {
    state.components.push({ id: nextComponentIdValue("w"), type: "wire", nodeA: state.pendingWireNode, nodeB: nodeId });
  }
  state.pendingWireNode = null;
  return true;
}

function toggleCurrentProbe(componentId: string, point: { x: number; y: number }): void {
  const existingProbe = state.currentProbes.find((probe) => probe.componentId === componentId);
  if (existingProbe) {
    state.currentProbes = state.currentProbes.filter((probe) => probe.id !== existingProbe.id);
    return;
  }
  const component = state.components.find((entry) => entry.id === componentId);
  const fraction = component ? fractionAlongComponent(component, point) : 0.5;
  state.currentProbes.push({ id: nextProbeIdValue(), componentId, fraction });
}

function handleVoltmeterNode(nodeId: string): boolean {
  if (state.pendingVoltmeterNode == null) {
    state.pendingVoltmeterNode = nodeId;
    return false;
  }

  if (state.pendingVoltmeterNode !== nodeId) {
    state.voltmeters.push({
      id: nextProbeIdValue(),
      positiveNode: state.pendingVoltmeterNode,
      negativeNode: nodeId,
      offsetX: 0,
      offsetY: 0,
    });
  }
  state.pendingVoltmeterNode = null;
  return true;
}

function handleOhmmeterNode(nodeId: string): boolean {
  if (state.pendingOhmmeterNode == null) {
    state.pendingOhmmeterNode = nodeId;
    return false;
  }

  if (state.pendingOhmmeterNode !== nodeId) {
    state.ohmmeters.push({
      id: nextProbeIdValue(),
      positiveNode: state.pendingOhmmeterNode,
      negativeNode: nodeId,
      offsetX: 0,
      offsetY: 0,
    });
  }
  state.pendingOhmmeterNode = null;
  return true;
}

function togglePotentialProbe(nodeId: string): void {
  const existingProbe = state.potentialProbes.find((probe) => probe.nodeId === nodeId);
  if (existingProbe) {
    state.potentialProbes = state.potentialProbes.filter((probe) => probe.id !== existingProbe.id);
    return;
  }
  state.potentialProbes.push({ id: nextProbeIdValue(), nodeId, offsetX: 0, offsetY: -26 });
}

function returnToSelect(): void {
  state.selectedTool = "select";
  cancelPendingActions();
}

function cancelPendingActions(): void {
  state.pendingWireNode = null;
  state.pendingVoltmeterNode = null;
  state.pendingOhmmeterNode = null;
  removeOrphanNodes();
}

function removeProbeAt(point: { x: number; y: number }): boolean {
  const ohmmeter = state.ohmmeters.find((probe) => pointHitsMeter(probe, point));
  if (ohmmeter) {
    state.ohmmeters = state.ohmmeters.filter((probe) => probe.id !== ohmmeter.id);
    removeOrphanNodes();
    return true;
  }

  const voltmeter = state.voltmeters.find((probe) => pointHitsVoltmeter(probe, point));
  if (voltmeter) {
    state.voltmeters = state.voltmeters.filter((probe) => probe.id !== voltmeter.id);
    removeOrphanNodes();
    return true;
  }

  const potentialProbe = state.potentialProbes.find((probe) => pointHitsPotentialProbe(probe, point));
  if (potentialProbe) {
    state.potentialProbes = state.potentialProbes.filter((probe) => probe.id !== potentialProbe.id);
    removeOrphanNodes();
    return true;
  }

  const currentProbe = state.currentProbes.find((probe) => pointHitsCurrentProbe(probe, point));
  if (currentProbe) {
    state.currentProbes = state.currentProbes.filter((probe) => probe.id !== currentProbe.id);
    return true;
  }

  return false;
}

function nextProbeIdValue(): string {
  const id = `p${nextProbeId}`;
  nextProbeId += 1;
  return id;
}

function removeComponent(componentId: string): void {
  state.components = state.components.filter((component) => component.id !== componentId);
  state.currentProbes = state.currentProbes.filter((probe) => probe.componentId !== componentId);
  removeOrphanNodes();
}

function handleComponentDoubleClick(
  component: BoardComponent,
  point: { x: number; y: number },
  target: EventTarget | null,
): boolean {
  const previous = state.lastComponentClick;
  const isDoubleClick =
    previous?.componentId === component.id &&
    performance.now() - previous.time <= 450 &&
    Math.hypot(point.x - previous.x, point.y - previous.y) <= 8;

  state.lastComponentClick = {
    componentId: component.id,
    time: performance.now(),
    x: point.x,
    y: point.y,
  };

  if (!isDoubleClick) {
    return false;
  }

  state.lastComponentClick = null;
  state.draggingComponent = null;

  if (shouldEditComponentOnDoubleClick(component, target)) {
    editComponentValue(component);
  } else {
    splitComponentAtPoint(component, point);
  }
  return true;
}

function createDraggingComponent(component: BoardComponent, point: { x: number; y: number }): DraggingComponent {
  return {
    startX: point.x,
    startY: point.y,
    moved: false,
    nodes: componentNodeIds(component).map((nodeId) => {
      const node = getNode(nodeId);
      return { id: node.id, x: node.x, y: node.y };
    }),
  };
}

function moveDraggingComponent(point: { x: number; y: number }): boolean {
  const dragging = state.draggingComponent;
  if (dragging == null) {
    return false;
  }

  let deltaX = point.x - dragging.startX;
  let deltaY = point.y - dragging.startY;
  if (!dragging.moved && Math.hypot(deltaX, deltaY) < 3) {
    return false;
  }
  dragging.moved = true;

  if (state.snapToGrid && dragging.nodes.length > 0) {
    const referenceNode = dragging.nodes[0];
    const snappedReference = snapPointToGrid({
      x: referenceNode.x + deltaX,
      y: referenceNode.y + deltaY,
    });
    deltaX = snappedReference.x - referenceNode.x;
    deltaY = snappedReference.y - referenceNode.y;
  }

  for (const startNode of dragging.nodes) {
    const node = getNode(startNode.id);
    node.x = clamp(startNode.x + deltaX, 0, BOARD_WIDTH);
    node.y = clamp(startNode.y + deltaY, 0, BOARD_HEIGHT);
  }
  return true;
}

function maybeSnapPoint(point: { x: number; y: number }): { x: number; y: number } {
  return state.snapToGrid ? snapPointToGrid(point) : clampPoint(point);
}

function snapPointToGrid(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: snapValueToGrid(point.x, BOARD_WIDTH),
    y: snapValueToGrid(point.y, BOARD_HEIGHT),
  };
}

function snapValueToGrid(value: number, max: number): number {
  return clamp(Math.round(value / GRID_SIZE) * GRID_SIZE, 0, max);
}

function clampPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(point.x, 0, BOARD_WIDTH),
    y: clamp(point.y, 0, BOARD_HEIGHT),
  };
}

function horizontalSpanPoints(
  center: { x: number; y: number },
  span: number,
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  if (!state.snapToGrid) {
    const y = clamp(center.y, 0, BOARD_HEIGHT);
    return {
      left: { x: clamp(center.x - span / 2, 0, BOARD_WIDTH), y },
      right: { x: clamp(center.x + span / 2, 0, BOARD_WIDTH), y },
    };
  }

  const y = snapValueToGrid(center.y, BOARD_HEIGHT);
  const leftX = snappedSpanStart(center.x, span);
  return {
    left: { x: leftX, y },
    right: { x: leftX + span, y },
  };
}

function realBatterySpanPoints(center: { x: number; y: number }): {
  left: { x: number; y: number };
  middle: { x: number; y: number };
  right: { x: number; y: number };
} {
  if (!state.snapToGrid) {
    const y = clamp(center.y, 0, BOARD_HEIGHT);
    return {
      left: { x: clamp(center.x - REAL_BATTERY_LEFT_SPAN, 0, BOARD_WIDTH), y },
      middle: { x: clamp(center.x, 0, BOARD_WIDTH), y },
      right: { x: clamp(center.x + REAL_BATTERY_RIGHT_SPAN, 0, BOARD_WIDTH), y },
    };
  }

  const y = snapValueToGrid(center.y, BOARD_HEIGHT);
  const leftX = snappedSpanStart(center.x, REAL_BATTERY_SPAN);
  return {
    left: { x: leftX, y },
    middle: { x: leftX + REAL_BATTERY_LEFT_SPAN, y },
    right: { x: leftX + REAL_BATTERY_SPAN, y },
  };
}

function snappedSpanStart(centerX: number, span: number): number {
  return clamp(snapValueToGrid(centerX - span / 2, BOARD_WIDTH), 0, BOARD_WIDTH - span);
}

function shouldEditComponentOnDoubleClick(component: BoardComponent, target: EventTarget | null): boolean {
  if (component.type === "wire") {
    return false;
  }

  if (!(target instanceof SVGElement)) {
    return true;
  }

  return (
    target.classList.contains("circuit-builder-resistor-body") ||
    target.classList.contains("circuit-builder-battery-plate") ||
    target.classList.contains("circuit-builder-battery-hit") ||
    target.classList.contains("circuit-builder-component-label")
  );
}

function shouldUseSolderingCursor(): boolean {
  return (
    state.selectedTool === "wire" ||
    state.selectedTool === "potentialProbe" ||
    state.selectedTool === "voltmeter" ||
    state.selectedTool === "ohmmeter"
  );
}

function isComponentWireTarget(target: EventTarget | null): boolean {
  return target instanceof SVGElement && target.classList.contains("circuit-builder-wire-line");
}

function splitNode(nodeId: string): void {
  const node = state.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return;
  }

  const endpoints = componentEndpointRefs(nodeId);
  if (endpoints.length < 2) {
    return;
  }

  const splitNodes = endpoints.map((endpoint, index) => {
    const position = splitNodePosition(node, endpoint, index, endpoints.length);
    const splitNode = { id: nextNodeIdValue(), x: position.x, y: position.y };
    state.nodes.push(splitNode);
    return splitNode;
  });

  endpoints.forEach((endpoint, index) => {
    setComponentEndpoint(endpoint.component, endpoint.key, splitNodes[index].id);
  });

  const fallbackNodeId = splitNodes[0].id;
  if (state.groundNode === nodeId) {
    state.groundNode = fallbackNodeId;
  }
  if (state.pendingWireNode === nodeId) {
    state.pendingWireNode = fallbackNodeId;
  }
  if (state.pendingVoltmeterNode === nodeId) {
    state.pendingVoltmeterNode = fallbackNodeId;
  }
  for (const probe of state.potentialProbes) {
    if (probe.nodeId === nodeId) {
      probe.nodeId = fallbackNodeId;
    }
  }
  for (const voltmeter of state.voltmeters) {
    if (voltmeter.positiveNode === nodeId) {
      voltmeter.positiveNode = fallbackNodeId;
    }
    if (voltmeter.negativeNode === nodeId) {
      voltmeter.negativeNode = fallbackNodeId;
    }
  }
  for (const ohmmeter of state.ohmmeters) {
    if (ohmmeter.positiveNode === nodeId) {
      ohmmeter.positiveNode = fallbackNodeId;
    }
    if (ohmmeter.negativeNode === nodeId) {
      ohmmeter.negativeNode = fallbackNodeId;
    }
  }

  state.nodes = state.nodes.filter((entry) => entry.id !== nodeId);
}

function splitNodePosition(
  node: CircuitNode,
  endpoint: { component: BoardComponent; key: ComponentEndpointKey },
  index: number,
  total: number,
): { x: number; y: number } {
  const otherNode = getOtherComponentNode(endpoint.component, endpoint.key);
  let dx = otherNode.x - node.x;
  let dy = otherNode.y - node.y;
  let length = Math.hypot(dx, dy);

  if (length < 1) {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    length = 1;
  }

  const ux = dx / length;
  const uy = dy / length;
  const perpendicularOffset = total > 2 ? ((index % 2 === 0 ? -1 : 1) * Math.floor(index / 2) * 7) : 0;

  return {
    x: clamp(node.x + ux * NODE_SPLIT_GAP - uy * perpendicularOffset, 0, BOARD_WIDTH),
    y: clamp(node.y + uy * NODE_SPLIT_GAP + ux * perpendicularOffset, 0, BOARD_HEIGHT),
  };
}

function getOtherComponentNode(component: BoardComponent, key: ComponentEndpointKey): CircuitNode {
  if (isBatteryComponent(component)) {
    return getNode(key === "positiveNode" ? component.negativeNode : component.positiveNode);
  }

  return getNode(key === "nodeA" ? component.nodeB : component.nodeA);
}

function splitWireAtPoint(component: Extract<BoardComponent, { type: "wire" }>, point: { x: number; y: number }): string {
  const nodeA = getNode(component.nodeA);
  const nodeB = getNode(component.nodeB);
  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return component.nodeA;
  }

  const fraction = clamp(((point.x - nodeA.x) * dx + (point.y - nodeA.y) * dy) / lengthSquared, 0, 1);
  if (fraction <= 0.04) {
    return component.nodeA;
  }
  if (fraction >= 0.96) {
    return component.nodeB;
  }

  const splitPoint = pointAlong(nodeA, nodeB, fraction);
  const splitNodeId = createNodeAt(splitPoint.x, splitPoint.y);
  state.components = state.components.filter((entry) => entry.id !== component.id);
  state.currentProbes = state.currentProbes.filter((probe) => probe.componentId !== component.id);
  state.components.push(
    { id: nextComponentIdValue("w"), type: "wire", nodeA: component.nodeA, nodeB: splitNodeId },
    { id: nextComponentIdValue("w"), type: "wire", nodeA: splitNodeId, nodeB: component.nodeB },
  );
  return splitNodeId;
}

function insertNodeOnComponentWire(component: BoardComponent, point: { x: number; y: number }): string {
  if (component.type === "wire") {
    return splitWireAtPoint(component, point);
  }

  const endpoints = componentEditableEndpoints(component);
  const dx = endpoints.end.x - endpoints.start.x;
  const dy = endpoints.end.y - endpoints.start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return endpoints.start.id;
  }

  const fraction = clamp(((point.x - endpoints.start.x) * dx + (point.y - endpoints.start.y) * dy) / lengthSquared, 0, 1);
  if (fraction <= 0.04) {
    return endpoints.start.id;
  }
  if (fraction >= 0.96) {
    return endpoints.end.id;
  }

  const splitPoint = pointAlong(endpoints.start, endpoints.end, fraction);
  const splitNodeId = createNodeAt(splitPoint.x, splitPoint.y);

  if (fraction < 0.5) {
    state.components.push({ id: nextComponentIdValue("w"), type: "wire", nodeA: endpoints.start.id, nodeB: splitNodeId });
    setComponentEndpoint(component, endpoints.startKey, splitNodeId);
    return splitNodeId;
  }

  state.components.push({ id: nextComponentIdValue("w"), type: "wire", nodeA: splitNodeId, nodeB: endpoints.end.id });
  setComponentEndpoint(component, endpoints.endKey, splitNodeId);
  return splitNodeId;
}

function splitComponentAtPoint(component: BoardComponent, point: { x: number; y: number }): void {
  const endpoints = componentEditableEndpoints(component);
  const dx = endpoints.end.x - endpoints.start.x;
  const dy = endpoints.end.y - endpoints.start.y;
  const length = Math.hypot(dx, dy);

  if (length < 12) {
    return;
  }

  const fraction = clamp(((point.x - endpoints.start.x) * dx + (point.y - endpoints.start.y) * dy) / (length * length), 0.08, 0.92);
  const ux = dx / length;
  const uy = dy / length;
  const splitPoint = pointAlong(endpoints.start, endpoints.end, fraction);
  const gap = Math.min(10, length * 0.18);
  const startSideNodeId = createNodeAt(splitPoint.x - ux * gap, splitPoint.y - uy * gap);
  const endSideNodeId = createNodeAt(splitPoint.x + ux * gap, splitPoint.y + uy * gap);

  if (component.type === "wire") {
    state.components = state.components.filter((entry) => entry.id !== component.id);
    state.currentProbes = state.currentProbes.filter((probe) => probe.componentId !== component.id);
    state.components.push(
      { id: nextComponentIdValue("w"), type: "wire", nodeA: endpoints.start.id, nodeB: startSideNodeId },
      { id: nextComponentIdValue("w"), type: "wire", nodeA: endSideNodeId, nodeB: endpoints.end.id },
    );
    return;
  }

  if (fraction < 0.5) {
    state.components.push({ id: nextComponentIdValue("w"), type: "wire", nodeA: endpoints.start.id, nodeB: startSideNodeId });
    setComponentEndpoint(component, endpoints.startKey, endSideNodeId);
    return;
  }

  setComponentEndpoint(component, endpoints.endKey, startSideNodeId);
  state.components.push({ id: nextComponentIdValue("w"), type: "wire", nodeA: endSideNodeId, nodeB: endpoints.end.id });
}

function removeOrphanNodes(): void {
  const connectedNodes = new Set<string>();

  for (const component of state.components) {
    if (isBatteryComponent(component)) {
      connectedNodes.add(component.positiveNode);
      connectedNodes.add(component.negativeNode);
    } else {
      connectedNodes.add(component.nodeA);
      connectedNodes.add(component.nodeB);
    }
  }

  if (state.groundNode != null) {
    connectedNodes.add(state.groundNode);
  }
  if (state.pendingWireNode != null) {
    connectedNodes.add(state.pendingWireNode);
  }
  if (state.pendingVoltmeterNode != null) {
    connectedNodes.add(state.pendingVoltmeterNode);
  }
  for (const probe of state.potentialProbes) {
    connectedNodes.add(probe.nodeId);
  }
  for (const voltmeter of state.voltmeters) {
    connectedNodes.add(voltmeter.positiveNode);
    connectedNodes.add(voltmeter.negativeNode);
  }
  for (const ohmmeter of state.ohmmeters) {
    connectedNodes.add(ohmmeter.positiveNode);
    connectedNodes.add(ohmmeter.negativeNode);
  }

  state.nodes = state.nodes.filter((node) => connectedNodes.has(node.id));
}

function getEffectiveGroundNode(): string | null {
  if (state.groundNode != null) {
    return state.groundNode;
  }

  const firstBattery = state.components.find(isBatteryComponent);
  return firstBattery?.negativeNode ?? null;
}

function editComponentValue(component: BoardComponent): void {
  if (component.type === "wire") {
    return;
  }

  if (component.type === "resistor") {
    const nextValue = window.prompt("Resistance (Ω)", formatResistance(component.resistanceOhms));
    if (nextValue == null) {
      return;
    }
    const parsed = parseSiValue(nextValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      component.resistanceOhms = parsed;
      state.lastResistanceOhms = parsed;
    }
    return;
  }

  const nextValue = window.prompt("Voltage (V)", formatVoltage(component.voltageVolts));
  if (nextValue == null) {
    return;
  }
  const parsed = parseSiValue(nextValue);
  if (Number.isFinite(parsed)) {
    component.voltageVolts = parsed;
    state.lastBatteryVoltageVolts = parsed;
  }
}

function renderPotentialProbe(probe: PotentialProbe): SVGElement {
  const { node, probeCenter, labelPosition } = potentialProbeGeometry(probe);
  const potential = potentialForNode(probe.nodeId);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "circuit-builder-voltage-probe");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(probeCenter.x));
  circle.setAttribute("cy", String(probeCenter.y));
  circle.setAttribute("r", "9");
  circle.setAttribute("class", "circuit-builder-potential-probe-dot");
  appendLine(group, node.x, node.y, probeCenter.x, probeCenter.y, "circuit-builder-voltmeter-lead");
  group.append(circle);
  group.append(label(labelPosition.x, labelPosition.y, potential == null ? "—" : formatMeasurementVoltage(potential)));
  group.lastElementChild?.setAttribute("class", "circuit-builder-voltage-label");
  group.lastElementChild?.setAttribute("text-anchor", "start");
  return group;
}

function renderVoltmeter(voltmeter: VoltmeterProbe): SVGElement {
  const { positive, negative, meterCenter } = meterGeometry(voltmeter);
  const voltage = voltageBetween(voltmeter.positiveNode, voltmeter.negativeNode);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "circuit-builder-voltmeter");
  appendMeterLead(group, positive, meterCenter, "circuit-builder-voltmeter-lead positive");
  appendMeterLead(group, negative, meterCenter, "circuit-builder-voltmeter-lead negative");
  appendMeterSymbol(group, meterCenter, "V", "circuit-builder-voltmeter-body");
  appendMeterReadout(group, meterCenter, voltage == null ? "—" : formatMeasurementVoltage(voltage), "circuit-builder-voltage-label");
  return group;
}

function renderOhmmeter(ohmmeter: OhmmeterProbe): SVGElement {
  const { positive, negative, meterCenter } = meterGeometry(ohmmeter);
  const resistance = resistanceBetween(ohmmeter.positiveNode, ohmmeter.negativeNode);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "circuit-builder-ohmmeter");
  appendMeterLead(group, positive, meterCenter, "circuit-builder-ohmmeter-lead");
  appendMeterLead(group, negative, meterCenter, "circuit-builder-ohmmeter-lead");
  appendMeterSymbol(group, meterCenter, "Ω", "circuit-builder-ohmmeter-body");
  appendMeterReadout(group, meterCenter, resistance == null ? "—" : formatMeasurementResistance(resistance), "circuit-builder-ohmmeter-label");
  return group;
}

function renderCurrentProbe(probe: CurrentProbe): SVGElement {
  const geometry = currentProbeGeometry(probe);
  if (!geometry) {
    return document.createElementNS("http://www.w3.org/2000/svg", "g");
  }

  const arrowStart = {
    x: geometry.center.x + geometry.ux * 26,
    y: geometry.center.y + geometry.uy * 26,
  };
  const arrowEnd = {
    x: geometry.center.x + geometry.ux * 42,
    y: geometry.center.y + geometry.uy * 42,
  };
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "circuit-builder-current-probe");
  appendLine(group, arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y, "circuit-builder-current-arrow");
  group.lastElementChild?.setAttribute("marker-end", "url(#circuit-builder-current-arrowhead)");
  appendMeterSymbol(group, geometry.center, "A", "circuit-builder-ammeter-body");

  const currentLabel = label(
    geometry.textPosition.x,
    geometry.textPosition.y,
    geometry.current == null ? "—" : formatMeasurementCurrent(Math.abs(geometry.current)),
  );
  currentLabel.setAttribute("text-anchor", geometry.textPosition.anchor);
  currentLabel.setAttribute("class", "circuit-builder-current-label");
  group.append(currentLabel);

  return group;
}

function appendMeterLead(
  group: SVGElement,
  node: CircuitNode,
  meterCenter: { x: number; y: number },
  className: string,
): void {
  const radius = 17;
  const dx = node.x - meterCenter.x;
  const dy = node.y - meterCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  appendLine(
    group,
    node.x,
    node.y,
    meterCenter.x + (dx / length) * radius,
    meterCenter.y + (dy / length) * radius,
    className,
  );
}

function appendMeterSymbol(group: SVGElement, center: { x: number; y: number }, symbol: string, className: string): void {
  const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  body.setAttribute("cx", String(center.x));
  body.setAttribute("cy", String(center.y));
  body.setAttribute("r", "17");
  body.setAttribute("class", className);
  const textNode = label(center.x, center.y + 6, symbol);
  textNode.setAttribute("class", "circuit-builder-meter-symbol");
  group.append(body, textNode);
}

function appendMeterReadout(group: SVGElement, center: { x: number; y: number }, value: string, className: string): void {
  const x = clamp(center.x + 25, 28, BOARD_WIDTH - 110);
  const readout = label(x, center.y + 6, value);
  readout.setAttribute("class", className);
  readout.setAttribute("text-anchor", "start");
  group.append(readout);
}

function pointHitsVoltmeter(voltmeter: VoltmeterProbe, point: { x: number; y: number }): boolean {
  return pointHitsMeter(voltmeter, point);
}

function pointHitsMeter(meter: MeterProbe, point: { x: number; y: number }): boolean {
  const { positive, negative, meterCenter } = meterGeometry(meter);
  const readoutX = clamp(meterCenter.x + 25, 28, BOARD_WIDTH - 110);
  return (
    Math.hypot(point.x - meterCenter.x, point.y - meterCenter.y) <= 22 ||
    pointInRect(point, readoutX, meterCenter.y - 22, 110, 32) ||
    distanceToSegment(point, positive, meterCenter) <= 10 ||
    distanceToSegment(point, negative, meterCenter) <= 10
  );
}

function pointHitsPotentialProbe(probe: PotentialProbe, point: { x: number; y: number }): boolean {
  const { node, probeCenter, labelPosition } = potentialProbeGeometry(probe);
  return (
    Math.hypot(point.x - probeCenter.x, point.y - probeCenter.y) <= 20 ||
    distanceToSegment(point, node, probeCenter) <= 10 ||
    pointInRect(point, labelPosition.x, labelPosition.y - 24, 92, 32)
  );
}

function pointHitsCurrentProbe(probe: CurrentProbe, point: { x: number; y: number }): boolean {
  const geometry = currentProbeGeometry(probe);
  if (!geometry) {
    return false;
  }

  const labelX = geometry.textPosition.anchor === "end" ? geometry.textPosition.x - 110 : geometry.textPosition.x;
  const labelRectX = geometry.textPosition.anchor === "middle" ? geometry.textPosition.x - 55 : labelX;
  const arrowStart = { x: geometry.center.x + geometry.ux * 24, y: geometry.center.y + geometry.uy * 24 };
  const arrowEnd = { x: geometry.center.x + geometry.ux * 44, y: geometry.center.y + geometry.uy * 44 };
  return (
    Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y) <= 22 ||
    distanceToSegment(point, arrowStart, arrowEnd) <= 12 ||
    pointInRect(point, labelRectX, geometry.textPosition.y - 26, 110, 34)
  );
}

function movableProbeAt(point: { x: number; y: number }): DraggingProbe | null {
  const ohmmeter = state.ohmmeters.find((probe) => pointHitsMeter(probe, point));
  if (ohmmeter) {
    const { meterCenter } = meterGeometry(ohmmeter);
    return {
      type: "ohmmeter",
      id: ohmmeter.id,
      grabOffsetX: point.x - meterCenter.x,
      grabOffsetY: point.y - meterCenter.y,
    };
  }

  const voltmeter = state.voltmeters.find((probe) => pointHitsVoltmeter(probe, point));
  if (voltmeter) {
    const { meterCenter } = meterGeometry(voltmeter);
    return {
      type: "voltmeter",
      id: voltmeter.id,
      grabOffsetX: point.x - meterCenter.x,
      grabOffsetY: point.y - meterCenter.y,
    };
  }

  const potentialProbe = state.potentialProbes.find((probe) => pointHitsPotentialProbe(probe, point));
  if (potentialProbe) {
    const { probeCenter } = potentialProbeGeometry(potentialProbe);
    return {
      type: "potential",
      id: potentialProbe.id,
      grabOffsetX: point.x - probeCenter.x,
      grabOffsetY: point.y - probeCenter.y,
    };
  }

  return null;
}

function moveDraggingProbe(point: { x: number; y: number }): void {
  const dragging = state.draggingProbe;
  if (dragging == null) {
    return;
  }

  const target = {
    x: point.x - dragging.grabOffsetX,
    y: point.y - dragging.grabOffsetY,
  };

  if (dragging.type === "voltmeter" || dragging.type === "ohmmeter") {
    const meter =
      dragging.type === "voltmeter"
        ? state.voltmeters.find((probe) => probe.id === dragging.id)
        : state.ohmmeters.find((probe) => probe.id === dragging.id);
    if (!meter) {
      return;
    }
    const baseCenter = meterBaseCenter(meter);
    meter.offsetX = clamp(target.x, 58, BOARD_WIDTH - 58) - baseCenter.x;
    meter.offsetY = clamp(target.y, 34, BOARD_HEIGHT - 34) - baseCenter.y;
    return;
  }

  const potentialProbe = state.potentialProbes.find((probe) => probe.id === dragging.id);
  if (!potentialProbe) {
    return;
  }
  const node = getNode(potentialProbe.nodeId);
  potentialProbe.offsetX = clamp(target.x, 12, BOARD_WIDTH - 12) - node.x;
  potentialProbe.offsetY = clamp(target.y, 12, BOARD_HEIGHT - 12) - node.y;
}

function meterGeometry(meter: MeterProbe): {
  positive: CircuitNode;
  negative: CircuitNode;
  meterCenter: { x: number; y: number };
} {
  const positive = getNode(meter.positiveNode);
  const negative = getNode(meter.negativeNode);
  const center = meterBaseCenter(meter);
  return {
    positive,
    negative,
    meterCenter: {
      x: clamp(center.x + meter.offsetX, 58, BOARD_WIDTH - 58),
      y: clamp(center.y + meter.offsetY, 34, BOARD_HEIGHT - 34),
    },
  };
}

function meterBaseCenter(meter: MeterProbe): { x: number; y: number } {
  const positive = getNode(meter.positiveNode);
  const negative = getNode(meter.negativeNode);
  const center = midpoint(positive, negative);
  return {
    x: clamp(center.x, 58, BOARD_WIDTH - 58),
    y: clamp(center.y - 54, 34, BOARD_HEIGHT - 34),
  };
}

function potentialProbeGeometry(probe: PotentialProbe): {
  node: CircuitNode;
  probeCenter: { x: number; y: number };
  labelPosition: { x: number; y: number };
} {
  const node = getNode(probe.nodeId);
  const probeCenter = {
    x: clamp(node.x + probe.offsetX, 12, BOARD_WIDTH - 12),
    y: clamp(node.y + probe.offsetY, 12, BOARD_HEIGHT - 12),
  };
  return {
    node,
    probeCenter,
    labelPosition: {
      x: clamp(probeCenter.x + 12, 40, BOARD_WIDTH - 90),
      y: clamp(probeCenter.y - 4, 24, BOARD_HEIGHT - 18),
    },
  };
}

function currentProbeGeometry(probe: CurrentProbe):
  | {
      center: { x: number; y: number };
      ux: number;
      uy: number;
      textPosition: { x: number; y: number; anchor: string };
      current: number | null;
    }
  | null {
  const component = state.components.find((entry) => entry.id === probe.componentId);
  if (!component) {
    return null;
  }

  const { start, end } = componentEndpoints(component);
  const current = currentForComponent(component.id);
  const direction = current == null || current >= 0 ? 1 : -1;
  const arrowStartNode = direction > 0 ? start : end;
  const arrowEndNode = direction > 0 ? end : start;
  const center = pointAlong(start, end, probe.fraction);
  const length = Math.hypot(arrowEndNode.x - arrowStartNode.x, arrowEndNode.y - arrowStartNode.y) || 1;
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  return {
    center,
    ux: (arrowEndNode.x - arrowStartNode.x) / length,
    uy: (arrowEndNode.y - arrowStartNode.y) / length,
    textPosition: getProbeLabelPosition(center, horizontal),
    current,
  };
}

function currentForComponent(componentId: string): number | null {
  const groundNode = getEffectiveGroundNode();
  if (groundNode == null) {
    return null;
  }

  try {
    const solution = solveLinearCircuit({
      nodes: physicsNodes(),
      groundNode,
      components: physicsComponents(),
    });
    const componentCurrent = solution.componentCurrents.find((entry) => entry.componentId === componentId);
    return componentCurrent?.currentAmps ?? null;
  } catch {
    return null;
  }
}

function solveBoardPotentials(): Record<string, number> | null {
  const groundNode = getEffectiveGroundNode();
  if (groundNode == null) {
    return null;
  }

  try {
    return solveLinearCircuit({
      nodes: physicsNodes(),
      groundNode,
      components: physicsComponents(),
    }).nodePotentials;
  } catch {
    return null;
  }
}

function potentialForNode(nodeId: string): number | null {
  return solveBoardPotentials()?.[nodeId] ?? null;
}

function voltageBetween(positiveNode: string, negativeNode: string): number | null {
  const potentials = solveBoardPotentials();
  if (potentials == null) {
    return null;
  }
  return (potentials[positiveNode] ?? 0) - (potentials[negativeNode] ?? 0);
}

function resistanceBetween(positiveNode: string, negativeNode: string): number | null {
  if (state.components.some(isBatteryComponent)) {
    return null;
  }

  if (positiveNode === negativeNode || areNodesShorted(positiveNode, negativeNode)) {
    return 0;
  }

  const reachableNodes = connectedNodeSet(positiveNode, negativeNode);
  if (!reachableNodes.has(positiveNode) || !reachableNodes.has(negativeNode)) {
    return null;
  }

  const components = physicsComponents().filter((component) => {
    if (component.type === "battery") {
      return false;
    }
    const endpoints = physicsComponentEndpointIds(component);
    return reachableNodes.has(endpoints.startNode) && reachableNodes.has(endpoints.endNode);
  });

  try {
    const solution = solveLinearCircuit({
      nodes: [...reachableNodes],
      groundNode: negativeNode,
      components: [
        ...components,
        {
          id: "__ohmmeter_test_source",
          type: "battery",
          positiveNode,
          negativeNode,
          voltageVolts: 1,
        },
      ],
    });
    const testCurrent = solution.componentCurrents.find((current) => current.componentId === "__ohmmeter_test_source")?.currentAmps;
    if (testCurrent == null || Math.abs(testCurrent) < 1e-12) {
      return null;
    }
    return Math.abs(1 / testCurrent);
  } catch {
    return null;
  }
}

function connectedNodeSet(startNode: string, endNode: string): Set<string> {
  const connected = new Set<string>([startNode, endNode]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const component of physicsComponents()) {
      if (component.type === "battery") {
        continue;
      }
      const endpoints = physicsComponentEndpointIds(component);
      const touchesConnected = connected.has(endpoints.startNode) || connected.has(endpoints.endNode);
      if (!touchesConnected) {
        continue;
      }
      const before = connected.size;
      connected.add(endpoints.startNode);
      connected.add(endpoints.endNode);
      changed = connected.size !== before;
    }
  }

  return connected;
}

function areNodesShorted(startNode: string, endNode: string): boolean {
  if (startNode === endNode) {
    return true;
  }

  const connected = new Set<string>([startNode]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const wire of state.components.filter((component) => component.type === "wire")) {
      const touchesA = connected.has(wire.nodeA);
      const touchesB = connected.has(wire.nodeB);
      if (!touchesA && !touchesB) {
        continue;
      }
      const before = connected.size;
      connected.add(wire.nodeA);
      connected.add(wire.nodeB);
      changed = connected.size !== before;
    }
  }

  return connected.has(endNode);
}

function physicsComponentEndpointIds(component: LinearCircuitComponent): { startNode: string; endNode: string } {
  if (component.type === "battery") {
    return { startNode: component.positiveNode, endNode: component.negativeNode };
  }
  return { startNode: component.nodeA, endNode: component.nodeB };
}

function componentEndpoints(component: BoardComponent): { start: CircuitNode; end: CircuitNode } {
  if (isBatteryComponent(component)) {
    return { start: getNode(component.positiveNode), end: getNode(component.negativeNode) };
  }
  return { start: getNode(component.nodeA), end: getNode(component.nodeB) };
}

function componentNodeIds(component: BoardComponent): string[] {
  if (isBatteryComponent(component)) {
    return [...new Set([component.positiveNode, component.negativeNode])];
  }
  return [...new Set([component.nodeA, component.nodeB])];
}

function componentEditableEndpoints(component: BoardComponent): {
  start: CircuitNode;
  end: CircuitNode;
  startKey: ComponentEndpointKey;
  endKey: ComponentEndpointKey;
} {
  if (isBatteryComponent(component)) {
    return {
      start: getNode(component.negativeNode),
      end: getNode(component.positiveNode),
      startKey: "negativeNode",
      endKey: "positiveNode",
    };
  }

  return {
    start: getNode(component.nodeA),
    end: getNode(component.nodeB),
    startKey: "nodeA",
    endKey: "nodeB",
  };
}

function componentEndpointRefs(nodeId: string): Array<{ component: BoardComponent; key: ComponentEndpointKey }> {
  const refs: Array<{ component: BoardComponent; key: ComponentEndpointKey }> = [];

  for (const component of state.components) {
    if (isBatteryComponent(component)) {
      if (component.positiveNode === nodeId) {
        refs.push({ component, key: "positiveNode" });
      }
      if (component.negativeNode === nodeId) {
        refs.push({ component, key: "negativeNode" });
      }
      continue;
    }

    if (component.nodeA === nodeId) {
      refs.push({ component, key: "nodeA" });
    }
    if (component.nodeB === nodeId) {
      refs.push({ component, key: "nodeB" });
    }
  }

  return refs;
}

function setComponentEndpoint(component: BoardComponent, key: ComponentEndpointKey, nodeId: string): void {
  if (isBatteryComponent(component)) {
    if (key === "positiveNode") {
      component.positiveNode = nodeId;
    } else if (key === "negativeNode") {
      component.negativeNode = nodeId;
    }
    return;
  }

  if (key === "nodeA") {
    component.nodeA = nodeId;
  } else if (key === "nodeB") {
    component.nodeB = nodeId;
  }
}

function fractionAlongComponent(component: BoardComponent, point: { x: number; y: number }): number {
  const { start, end } = componentEndpoints(component);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return 0.5;
  }

  return clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0.08, 0.92);
}

function getProbeLabelPosition(
  center: { x: number; y: number },
  horizontal: boolean,
): { x: number; y: number; anchor: string } {
  if (horizontal) {
    return {
      x: clamp(center.x, 46, BOARD_WIDTH - 46),
      y: center.y > BOARD_HEIGHT - 46 ? center.y - 34 : center.y + 34,
      anchor: "middle",
    };
  }

  if (center.x > BOARD_WIDTH / 2) {
    return {
      x: clamp(center.x - 34, 120, BOARD_WIDTH - 34),
      y: clamp(center.y + 5, 24, BOARD_HEIGHT - 18),
      anchor: "end",
    };
  }

  return {
    x: clamp(center.x + 34, 34, BOARD_WIDTH - 120),
    y: clamp(center.y + 5, 24, BOARD_HEIGHT - 18),
    anchor: "start",
  };
}

function getOrCreateNode(x: number, y: number): string {
  const existing = state.nodes.find((node) => Math.hypot(node.x - x, node.y - y) <= SNAP_RADIUS);
  if (existing) {
    return existing.id;
  }
  return createNodeAt(x, y);
}

function createNodeAt(x: number, y: number): string {
  const node = { id: nextNodeIdValue(), x: clamp(x, 0, BOARD_WIDTH), y: clamp(y, 0, BOARD_HEIGHT) };
  state.nodes.push(node);
  return node.id;
}

function mergeTouchingNode(sourceNodeId: string): void {
  const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    return;
  }

  const targetNode = state.nodes.find(
    (node) => node.id !== sourceNodeId && Math.hypot(node.x - sourceNode.x, node.y - sourceNode.y) <= SNAP_RADIUS,
  );

  if (!targetNode) {
    return;
  }

  mergeNodes(sourceNodeId, targetNode.id);
}

function mergeNodes(sourceNodeId: string, targetNodeId: string): void {
  if (sourceNodeId === targetNodeId) {
    return;
  }

  for (const component of state.components) {
    if (isBatteryComponent(component)) {
      if (component.positiveNode === sourceNodeId) {
        component.positiveNode = targetNodeId;
      }
      if (component.negativeNode === sourceNodeId) {
        component.negativeNode = targetNodeId;
      }
    } else {
      if (component.nodeA === sourceNodeId) {
        component.nodeA = targetNodeId;
      }
      if (component.nodeB === sourceNodeId) {
        component.nodeB = targetNodeId;
      }
    }
  }

  state.components = state.components.filter((component) => {
    if (component.type !== "wire") {
      return true;
    }
    return component.nodeA !== component.nodeB;
  });

  if (state.groundNode === sourceNodeId) {
    state.groundNode = targetNodeId;
  }
  if (state.pendingWireNode === sourceNodeId) {
    state.pendingWireNode = targetNodeId;
  }
  if (state.pendingVoltmeterNode === sourceNodeId) {
    state.pendingVoltmeterNode = targetNodeId;
  }
  if (state.pendingOhmmeterNode === sourceNodeId) {
    state.pendingOhmmeterNode = targetNodeId;
  }
  for (const probe of state.potentialProbes) {
    if (probe.nodeId === sourceNodeId) {
      probe.nodeId = targetNodeId;
    }
  }
  for (const voltmeter of state.voltmeters) {
    if (voltmeter.positiveNode === sourceNodeId) {
      voltmeter.positiveNode = targetNodeId;
    }
    if (voltmeter.negativeNode === sourceNodeId) {
      voltmeter.negativeNode = targetNodeId;
    }
  }
  for (const ohmmeter of state.ohmmeters) {
    if (ohmmeter.positiveNode === sourceNodeId) {
      ohmmeter.positiveNode = targetNodeId;
    }
    if (ohmmeter.negativeNode === sourceNodeId) {
      ohmmeter.negativeNode = targetNodeId;
    }
  }

  state.nodes = state.nodes.filter((node) => node.id !== sourceNodeId);
}

function getNode(id: string): CircuitNode {
  const node = state.nodes.find((entry) => entry.id === id);
  if (!node) {
    throw new Error(`Missing board node ${id}`);
  }
  return node;
}

function nextNodeIdValue(): string {
  const id = `n${nextNodeId}`;
  nextNodeId += 1;
  return id;
}

function nextComponentIdValue(prefix: string): string {
  const id = `${prefix}${nextComponentId}`;
  nextComponentId += 1;
  return id;
}

function createGrid(): SVGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "circuit-builder-grid");
  for (let x = 0; x <= BOARD_WIDTH; x += GRID_SIZE) {
    appendLine(group, x, 0, x, BOARD_HEIGHT, "circuit-builder-grid-line");
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += GRID_SIZE) {
    appendLine(group, 0, y, BOARD_WIDTH, y, "circuit-builder-grid-line");
  }
  return group;
}

function createProbeMarker(): SVGDefsElement {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "circuit-builder-current-arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "2.5");
  marker.setAttribute("markerHeight", "2.5");
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("class", "circuit-builder-current-arrowhead");
  marker.append(path);
  defs.append(marker);
  return defs;
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

function appendPlate(parent: SVGElement, center: { x: number; y: number }, angle: number, length: number): void {
  const dx = Math.cos(angle) * length * 0.5;
  const dy = Math.sin(angle) * length * 0.5;
  appendLine(parent, center.x - dx, center.y - dy, center.x + dx, center.y + dy, "circuit-builder-battery-plate");
}

function appendResistorBody(parent: SVGElement, center: { x: number; y: number }, angle: number, textContent: string): void {
  const angleDeg = (angle * 180) / Math.PI;
  const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  body.setAttribute("x", String(center.x - 36));
  body.setAttribute("y", String(center.y - 13));
  body.setAttribute("width", "72");
  body.setAttribute("height", "26");
  body.setAttribute("rx", "4");
  body.setAttribute("class", "circuit-builder-resistor-body");
  body.setAttribute("transform", `rotate(${angleDeg} ${center.x} ${center.y})`);
  const valueLabel = label(center.x, center.y + 6, textContent);
  valueLabel.setAttribute("transform", `rotate(${angleDeg} ${center.x} ${center.y})`);
  parent.append(body, valueLabel);
}

function label(x: number, y: number, textContent: string): SVGTextElement {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", "circuit-builder-component-label");
  text.textContent = textContent;
  return text;
}

function midpoint(a: CircuitNode, b: CircuitNode): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointAlong(a: CircuitNode, b: CircuitNode, fraction: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}

function pointInRect(point: { x: number; y: number }, x: number, y: number, width: number, height: number): boolean {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const fraction = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * fraction), point.y - (start.y + dy * fraction));
}

function svgPoint(svg: SVGSVGElement, event: MouseEvent | PointerEvent): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
  return { x: transformed.x, y: transformed.y };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function formatCurrent(currentAmps: number): string {
  if (Math.abs(currentAmps) >= 0.9995 && Math.abs(currentAmps) < 10) {
    return `${currentAmps.toFixed(1)} A`;
  }

  return formatSiUnit(currentAmps, "A");
}

function formatMeasurementCurrent(currentAmps: number): string {
  if (Math.abs(currentAmps) >= 0.9995 && Math.abs(currentAmps) < 10) {
    return `${currentAmps.toFixed(1)} A`;
  }

  return formatSiUnit(currentAmps, "A", 2);
}

function formatResistance(resistanceOhms: number): string {
  return formatSiUnit(resistanceOhms, "Ω");
}

function formatMeasurementResistance(resistanceOhms: number): string {
  return formatSiUnit(resistanceOhms, "Ω", 2);
}

function formatVoltage(voltage: number): string {
  return formatSiUnit(voltage, "V");
}

function formatMeasurementVoltage(voltage: number): string {
  return formatSiUnit(voltage, "V", 2);
}

function formatSiUnit(value: number, unit: string, minimumSignificantDigits = 1): string {
  const magnitude = Math.abs(value);
  if (magnitude === 0) {
    return `0 ${unit}`;
  }

  const prefixes = [
    { symbol: "T", multiplier: 1e12 },
    { symbol: "G", multiplier: 1e9 },
    { symbol: "M", multiplier: 1e6 },
    { symbol: "k", multiplier: 1e3 },
    { symbol: "", multiplier: 1 },
    { symbol: "m", multiplier: 1e-3 },
    { symbol: "µ", multiplier: 1e-6 },
    { symbol: "n", multiplier: 1e-9 },
    { symbol: "p", multiplier: 1e-12 },
  ];

  const prefix = prefixes.find((entry) => magnitude >= entry.multiplier) ?? prefixes[prefixes.length - 1];
  return `${formatSignificant(value / prefix.multiplier, minimumSignificantDigits)} ${prefix.symbol}${unit}`;
}

function parseSiValue(input: string): number {
  const normalized = input.trim().replace(",", ".");
  const match = normalized.match(
    /^([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*([pPnNuUµμmMkKMGGT]?)(?:\s*(?:[vV]|[vV]olts?|Ω|Ω|[oO]hms?))?\s*$/,
  );

  if (!match) {
    return Number.NaN;
  }

  const value = Number(match[1]);
  const prefix = match[2];
  const multipliers: Record<string, number> = {
    p: 1e-12,
    P: 1e-12,
    n: 1e-9,
    N: 1e-9,
    u: 1e-6,
    U: 1e-6,
    µ: 1e-6,
    μ: 1e-6,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
  };

  return value * (multipliers[prefix] ?? 1);
}

function formatSignificant(value: number, minimumSignificantDigits = 1): string {
  const rounded = value.toPrecision(3);
  if (rounded.includes("e")) {
    return Number(rounded).toString();
  }

  const [integerPart, decimalPart = ""] = rounded.split(".");
  const significantIntegerDigits = integerPart.replace("-", "").replace(/^0+/, "").length;
  const minimumDecimalDigits = Math.max(0, minimumSignificantDigits - significantIntegerDigits);
  let trimmedDecimal = decimalPart.replace(/0+$/, "");

  while (trimmedDecimal.length < minimumDecimalDigits) {
    trimmedDecimal += "0";
  }

  return trimmedDecimal.length > 0 ? `${integerPart}.${trimmedDecimal}` : integerPart;
}

function readableAngleDegrees(angleRadians: number): number {
  let angleDegrees = (angleRadians * 180) / Math.PI;
  while (angleDegrees > 90) {
    angleDegrees -= 180;
  }
  while (angleDegrees < -90) {
    angleDegrees += 180;
  }
  return angleDegrees;
}

function createToolIcon(tool: Tool): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "circuit-builder-tool-icon");
  icon.setAttribute("viewBox", "0 0 64 36");
  icon.setAttribute("aria-hidden", "true");

  const line = (x1: number, y1: number, x2: number, y2: number, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
    node.setAttribute("x1", String(x1));
    node.setAttribute("y1", String(y1));
    node.setAttribute("x2", String(x2));
    node.setAttribute("y2", String(y2));
    node.setAttribute("class", className);
    icon.append(node);
  };
  const circle = (cx: number, cy: number, r: number, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("r", String(r));
    node.setAttribute("class", className);
    icon.append(node);
  };
  const rect = (x: number, y: number, width: number, height: number, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    node.setAttribute("x", String(x));
    node.setAttribute("y", String(y));
    node.setAttribute("width", String(width));
    node.setAttribute("height", String(height));
    node.setAttribute("rx", "3");
    node.setAttribute("class", className);
    icon.append(node);
  };
  const path = (d: string, className = "stroke") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
    node.setAttribute("d", d);
    node.setAttribute("class", className);
    icon.append(node);
  };
  const text = (x: number, y: number, value: string) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
    node.setAttribute("x", String(x));
    node.setAttribute("y", String(y));
    node.setAttribute("class", "text");
    node.textContent = value;
    icon.append(node);
  };

  if (tool === "select") {
    path("M 20 20 V 14 C 20 11 24 11 24 14 V 20 V 9 C 24 6 28 6 28 9 V 20 V 12 C 28 9 32 9 32 12 V 21 V 15 C 32 12 36 12 36 15 V 22 L 39 18 C 41 16 44 18 43 21 L 39 30 C 38 33 36 34 32 34 H 26 C 22 34 19 32 17 29 L 12 21 C 11 19 13 17 15 18 Z");
  } else if (tool === "wire") {
    line(8, 18, 56, 18);
    circle(8, 18, 3, "fill");
    circle(56, 18, 3, "fill");
  } else if (tool === "resistor") {
    line(5, 18, 15, 18);
    rect(15, 9, 34, 18);
    line(49, 18, 59, 18);
  } else if (tool === "idealBattery") {
    line(7, 18, 24, 18);
    line(40, 18, 57, 18);
    line(26, 7, 26, 29);
    line(38, 12, 38, 24);
  } else if (tool === "realBattery") {
    line(5, 18, 17, 18);
    line(19, 7, 19, 29);
    line(28, 12, 28, 24);
    line(28, 18, 35, 18);
    rect(35, 10, 21, 16);
    line(56, 18, 61, 18);
  } else if (tool === "ground") {
    line(32, 6, 32, 16);
    line(18, 16, 46, 16);
    line(23, 23, 41, 23);
    line(28, 30, 36, 30);
  } else if (tool === "currentProbe") {
    line(6, 18, 14, 18);
    circle(28, 18, 14);
    text(28, 23, "A");
    line(42, 18, 60, 18);
    path("M 48 14 L 56 18 L 48 22 Z", "fill");
  } else if (tool === "potentialProbe") {
    circle(22, 18, 5, "fill");
    line(27, 18, 39, 18);
    text(44, 22, "V");
  } else if (tool === "voltmeter") {
    line(8, 18, 18, 18);
    line(46, 18, 56, 18);
    circle(32, 18, 13);
    text(32, 23, "V");
  } else if (tool === "ohmmeter") {
    line(8, 18, 18, 18);
    line(46, 18, 56, 18);
    circle(32, 18, 13);
    text(32, 23, "Ω");
  } else if (tool === "erase") {
    path("M 21 9 L 48 9 L 43 28 L 16 28 Z");
    line(25, 14, 39, 24);
    line(39, 14, 25, 24);
  }

  return icon;
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
