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

  return {
    nodePotentials: Object.fromEntries(
      circuit.nodes.map((node) => [node, mergedPotentials.get(disjointSet.find(node)) ?? 0]),
    ),
    componentCurrents: circuit.components.map((component) => {
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
    equivalentNodes,
  };
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

function createMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
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
