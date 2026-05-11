export type CircuitNodeId = string;

export type WireComponent = {
  id: string;
  type: "wire";
  nodeA: CircuitNodeId;
  nodeB: CircuitNodeId;
};

export type ResistorComponent = {
  id: string;
  type: "resistor";
  nodeA: CircuitNodeId;
  nodeB: CircuitNodeId;
  resistanceOhms: number;
};

export type BatteryComponent = {
  id: string;
  type: "battery";
  positiveNode: CircuitNodeId;
  negativeNode: CircuitNodeId;
  voltageVolts: number;
};

export type LinearCircuitComponent = WireComponent | ResistorComponent | BatteryComponent;

export type LinearCircuit = {
  nodes: CircuitNodeId[];
  groundNode: CircuitNodeId;
  components: LinearCircuitComponent[];
};

export type ComponentCurrentResult = {
  componentId: string;
  type: LinearCircuitComponent["type"];
  /**
   * Positive current is nodeA -> nodeB for resistors, and positiveNode -> negativeNode
   * for batteries. Ideal wire branch current is not uniquely defined after node merging.
   */
  currentAmps: number | null;
};

export type LinearCircuitSolution = {
  nodePotentials: Record<CircuitNodeId, number>;
  componentCurrents: ComponentCurrentResult[];
  equivalentNodes: Record<CircuitNodeId, CircuitNodeId>;
};

const MAX_CONNECTION_POINTS = 100;
const PIVOT_EPSILON = 1e-12;
const NUMERICAL_ZERO_RELATIVE_TOLERANCE = 1e-6;
const NUMERICAL_ZERO_ABSOLUTE_VOLTAGE_TOLERANCE = 1e-9;
const NUMERICAL_ZERO_ABSOLUTE_CURRENT_TOLERANCE = 1e-9;

class DisjointSet {
  private readonly parent = new Map<CircuitNodeId, CircuitNodeId>();

  constructor(nodes: CircuitNodeId[]) {
    for (const node of nodes) {
      this.parent.set(node, node);
    }
  }

  find(node: CircuitNodeId): CircuitNodeId {
    const parent = this.parent.get(node);
    if (parent == null) {
      throw new Error(`Unknown node '${node}'.`);
    }

    if (parent === node) {
      return node;
    }

    const root = this.find(parent);
    this.parent.set(node, root);
    return root;
  }

  union(left: CircuitNodeId, right: CircuitNodeId): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);

    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

export function solveLinearCircuit(circuit: LinearCircuit): LinearCircuitSolution {
  validateCircuit(circuit);

  const disjointSet = new DisjointSet(circuit.nodes);

  for (const component of circuit.components) {
    if (component.type === "wire") {
      disjointSet.union(component.nodeA, component.nodeB);
    }
  }

  const equivalentNodes = Object.fromEntries(
    circuit.nodes.map((node) => [node, disjointSet.find(node)]),
  );
  const groundRoot = disjointSet.find(circuit.groundNode);
  const mergedNodes = [...new Set(circuit.nodes.map((node) => disjointSet.find(node)))];
  const solvedNodes = mergedNodes.filter((node) => node !== groundRoot);
  const nodeIndex = new Map(solvedNodes.map((node, index) => [node, index]));
  const batteries = circuit.components.filter((component) => component.type === "battery");
  const nodeUnknownCount = solvedNodes.length;
  const unknownCount = nodeUnknownCount + batteries.length;

  if (unknownCount === 0) {
    return {
      nodePotentials: Object.fromEntries(circuit.nodes.map((node) => [node, 0])),
      componentCurrents: circuit.components.map((component) => ({
        componentId: component.id,
        type: component.type,
        currentAmps: component.type === "wire" ? null : 0,
      })),
      equivalentNodes,
    };
  }

  const matrix = createMatrix(unknownCount, unknownCount);
  const rhs = new Array<number>(unknownCount).fill(0);

  for (const component of circuit.components) {
    if (component.type !== "resistor") {
      continue;
    }

    const nodeA = disjointSet.find(component.nodeA);
    const nodeB = disjointSet.find(component.nodeB);
    const conductance = 1 / component.resistanceOhms;
    stampConductance(matrix, nodeIndex, nodeA, nodeB, conductance);
  }

  batteries.forEach((component, batteryIndex) => {
    const positiveNode = disjointSet.find(component.positiveNode);
    const negativeNode = disjointSet.find(component.negativeNode);
    const sourceColumn = nodeUnknownCount + batteryIndex;
    const sourceRow = sourceColumn;

    stampVoltageSource(matrix, nodeIndex, positiveNode, negativeNode, sourceColumn);
    stampVoltageConstraint(matrix, nodeIndex, positiveNode, negativeNode, sourceRow);
    rhs[sourceRow] = component.voltageVolts;
  });

  const solution = solveLinearSystem(matrix, rhs);
  const mergedPotentials = new Map<CircuitNodeId, number>([[groundRoot, 0]]);

  for (const node of solvedNodes) {
    mergedPotentials.set(node, solution[nodeIndex.get(node) ?? 0]);
  }

  const batteryCurrentById = new Map<string, number>();
  batteries.forEach((component, batteryIndex) => {
    batteryCurrentById.set(component.id, solution[nodeUnknownCount + batteryIndex]);
  });

  const nodePotentials = Object.fromEntries(
    circuit.nodes.map((node) => [node, mergedPotentials.get(disjointSet.find(node)) ?? 0]),
  );
  const componentCurrents = deriveWireCurrents(
    circuit,
    circuit.components.map((component) => {
      if (component.type === "wire") {
        return {
          componentId: component.id,
          type: component.type,
          currentAmps: null,
        };
      }

      if (component.type === "battery") {
        return {
          componentId: component.id,
          type: component.type,
          currentAmps: batteryCurrentById.get(component.id) ?? 0,
        };
      }

      return {
        componentId: component.id,
        type: component.type,
        currentAmps:
          ((mergedPotentials.get(disjointSet.find(component.nodeA)) ?? 0) -
            (mergedPotentials.get(disjointSet.find(component.nodeB)) ?? 0)) /
          component.resistanceOhms,
      };
    }),
  );

  return normalizeSolution({
    nodePotentials,
    componentCurrents,
    equivalentNodes,
  }, circuit);
}

function deriveWireCurrents(
  circuit: LinearCircuit,
  componentCurrents: ComponentCurrentResult[],
): ComponentCurrentResult[] {
  const wires = circuit.components.filter((component) => component.type === "wire");
  if (wires.length === 0) {
    return componentCurrents;
  }

  const nodeIndex = new Map(circuit.nodes.map((node, index) => [node, index]));
  const matrix = Array.from({ length: circuit.nodes.length }, () => new Array(wires.length).fill(0));
  const rhs = new Array(circuit.nodes.length).fill(0);
  const currentById = new Map(componentCurrents.map((entry) => [entry.componentId, entry.currentAmps]));

  for (const [wireIndex, wire] of wires.entries()) {
    stampBranch(matrix, nodeIndex, wire.nodeA, wire.nodeB, wireIndex, 1);
  }

  for (const component of circuit.components) {
    const current = currentById.get(component.id);
    if (current == null) {
      continue;
    }

    const endpoints = getComponentEndpointIds(component);
    const startIndex = nodeIndex.get(endpoints.startNode);
    const endIndex = nodeIndex.get(endpoints.endNode);

    if (startIndex != null) {
      rhs[startIndex] -= current;
    }
    if (endIndex != null) {
      rhs[endIndex] += current;
    }
  }

  const wireCurrents = solveLeastSquares(matrix, rhs);
  const wireCurrentById = new Map(wires.map((wire, index) => [wire.id, wireCurrents[index] ?? 0]));

  return componentCurrents.map((entry) =>
    entry.type === "wire"
      ? {
          ...entry,
          currentAmps: wireCurrentById.get(entry.componentId) ?? null,
        }
      : entry,
  );
}

function normalizeSolution(solution: LinearCircuitSolution, circuit: LinearCircuit): LinearCircuitSolution {
  let maxVoltage = Math.max(0, ...Object.values(solution.nodePotentials).map((potential) => Math.abs(potential)));
  let maxCurrent = 0;

  for (const component of circuit.components) {
    const endpoints = getComponentEndpointIds(component);
    maxVoltage = Math.max(
      maxVoltage,
      Math.abs((solution.nodePotentials[endpoints.startNode] ?? 0) - (solution.nodePotentials[endpoints.endNode] ?? 0)),
    );
  }

  for (const current of solution.componentCurrents) {
    if (current.currentAmps != null) {
      maxCurrent = Math.max(maxCurrent, Math.abs(current.currentAmps));
    }
  }

  const voltageThreshold = Math.max(maxVoltage * NUMERICAL_ZERO_RELATIVE_TOLERANCE, NUMERICAL_ZERO_ABSOLUTE_VOLTAGE_TOLERANCE);
  const currentThreshold = Math.max(maxCurrent * NUMERICAL_ZERO_RELATIVE_TOLERANCE, NUMERICAL_ZERO_ABSOLUTE_CURRENT_TOLERANCE);

  return {
    ...solution,
    nodePotentials: Object.fromEntries(
      Object.entries(solution.nodePotentials).map(([node, potential]) => [node, zeroNumericalNoise(potential, voltageThreshold)]),
    ),
    componentCurrents: solution.componentCurrents.map((current) => ({
      ...current,
      currentAmps: current.currentAmps == null ? null : zeroNumericalNoise(current.currentAmps, currentThreshold),
    })),
  };
}

function zeroNumericalNoise(value: number, threshold: number): number {
  return Math.abs(value) < threshold ? 0 : value;
}

function validateCircuit(circuit: LinearCircuit): void {
  const uniqueNodes = new Set(circuit.nodes);

  if (uniqueNodes.size !== circuit.nodes.length) {
    throw new Error("Circuit node ids must be unique.");
  }

  if (uniqueNodes.size > MAX_CONNECTION_POINTS) {
    throw new Error(`Linear circuit solver supports at most ${MAX_CONNECTION_POINTS} connection points.`);
  }

  if (!uniqueNodes.has(circuit.groundNode)) {
    throw new Error("Circuit groundNode must be included in nodes.");
  }

  const componentIds = new Set<string>();

  for (const component of circuit.components) {
    if (componentIds.has(component.id)) {
      throw new Error(`Duplicate component id '${component.id}'.`);
    }
    componentIds.add(component.id);

    if (component.type === "resistor" && component.resistanceOhms <= 0) {
      throw new Error(`Resistor '${component.id}' resistance must be greater than zero.`);
    }

    const endpoints = getComponentNodes(component);
    for (const node of endpoints) {
      if (!uniqueNodes.has(node)) {
        throw new Error(`Component '${component.id}' references unknown node '${node}'.`);
      }
    }
  }
}

function getComponentNodes(component: LinearCircuitComponent): CircuitNodeId[] {
  if (component.type === "battery") {
    return [component.positiveNode, component.negativeNode];
  }

  return [component.nodeA, component.nodeB];
}

function getComponentEndpointIds(component: LinearCircuitComponent): { startNode: CircuitNodeId; endNode: CircuitNodeId } {
  if (component.type === "battery") {
    return { startNode: component.positiveNode, endNode: component.negativeNode };
  }

  return { startNode: component.nodeA, endNode: component.nodeB };
}

function createMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
}

function stampBranch(
  matrix: number[][],
  nodeIndex: Map<CircuitNodeId, number>,
  startNode: CircuitNodeId,
  endNode: CircuitNodeId,
  column: number,
  coefficient: number,
): void {
  const startIndex = nodeIndex.get(startNode);
  const endIndex = nodeIndex.get(endNode);

  if (startIndex != null) {
    matrix[startIndex][column] += coefficient;
  }
  if (endIndex != null) {
    matrix[endIndex][column] -= coefficient;
  }
}

function stampConductance(
  matrix: number[][],
  nodeIndex: Map<CircuitNodeId, number>,
  nodeA: CircuitNodeId,
  nodeB: CircuitNodeId,
  conductance: number,
): void {
  const indexA = nodeIndex.get(nodeA);
  const indexB = nodeIndex.get(nodeB);

  if (indexA != null) {
    matrix[indexA][indexA] += conductance;
  }
  if (indexB != null) {
    matrix[indexB][indexB] += conductance;
  }
  if (indexA != null && indexB != null) {
    matrix[indexA][indexB] -= conductance;
    matrix[indexB][indexA] -= conductance;
  }
}

function stampVoltageSource(
  matrix: number[][],
  nodeIndex: Map<CircuitNodeId, number>,
  positiveNode: CircuitNodeId,
  negativeNode: CircuitNodeId,
  sourceColumn: number,
): void {
  const positiveIndex = nodeIndex.get(positiveNode);
  const negativeIndex = nodeIndex.get(negativeNode);

  if (positiveIndex != null) {
    matrix[positiveIndex][sourceColumn] += 1;
  }
  if (negativeIndex != null) {
    matrix[negativeIndex][sourceColumn] -= 1;
  }
}

function stampVoltageConstraint(
  matrix: number[][],
  nodeIndex: Map<CircuitNodeId, number>,
  positiveNode: CircuitNodeId,
  negativeNode: CircuitNodeId,
  sourceRow: number,
): void {
  const positiveIndex = nodeIndex.get(positiveNode);
  const negativeIndex = nodeIndex.get(negativeNode);

  if (positiveIndex != null) {
    matrix[sourceRow][positiveIndex] += 1;
  }
  if (negativeIndex != null) {
    matrix[sourceRow][negativeIndex] -= 1;
  }
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < PIVOT_EPSILON) {
      throw new Error("Circuit equations are singular. Check for floating nodes or contradictory ideal sources.");
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

    const pivot = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) {
      augmented[column][entry] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      if (factor === 0) {
        continue;
      }

      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function solveLeastSquares(matrix: number[][], rhs: number[]): number[] {
  const columns = matrix[0]?.length ?? 0;
  const normal = Array.from({ length: columns }, () => new Array(columns).fill(0));
  const projected = new Array(columns).fill(0);

  for (let row = 0; row < matrix.length; row += 1) {
    for (let colA = 0; colA < columns; colA += 1) {
      projected[colA] += matrix[row][colA] * rhs[row];
      for (let colB = 0; colB < columns; colB += 1) {
        normal[colA][colB] += matrix[row][colA] * matrix[row][colB];
      }
    }
  }

  for (let index = 0; index < columns; index += 1) {
    normal[index][index] += 1e-10;
  }

  return solveRegularizedSystem(normal, projected);
}

function solveRegularizedSystem(matrix: number[][], rhs: number[]): number[] {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-14) {
      return new Array(size).fill(0);
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) {
      augmented[column][entry] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  return augmented.map((row) => row[size]);
}
