import { renderCircuitBuilderModule } from "../modules/circuit-builder/index.js";
import { renderElectrostaticsModule } from "../modules/electrostatics/index.js";
import { renderElectrostaticsMaterialsModule } from "../modules/electrostatics-materials/index.js";
import { renderPhasorDiagramModule } from "../modules/phasor-diagram/index.js";
import { renderRlcCircuitModule } from "../modules/rlc-circuit/index.js";
import { renderThreePhaseModule } from "../modules/three-phase/index.js";

export type ModuleRenderContext = {
  t: (key: string, values?: Record<string, string | number>) => string;
  language?: string;
};

export type ModuleDefinition = {
  slug: string;
  titleKey: string;
  render: (context: ModuleRenderContext) => HTMLElement;
  hiddenFromMenu?: boolean;
};

export const moduleRegistry: ModuleDefinition[] = [
  {
    slug: "electrostatics",
    titleKey: "modules.electrostatics.title",
    render: renderElectrostaticsModule,
  },
  {
    slug: "electrostatics-materials",
    titleKey: "modules.electrostaticsMaterials.title",
    render: renderElectrostaticsMaterialsModule,
    hiddenFromMenu: true,
  },
  {
    slug: "circuit-builder",
    titleKey: "modules.circuitBuilder.title",
    render: renderCircuitBuilderModule,
  },
  {
    slug: "phasor-diagram",
    titleKey: "modules.phasorDiagram.title",
    render: renderPhasorDiagramModule,
  },
  {
    slug: "rlc-circuit",
    titleKey: "modules.rlcCircuit.title",
    render: renderRlcCircuitModule,
  },
  {
    slug: "three-phase",
    titleKey: "modules.threePhase.title",
    render: renderThreePhaseModule,
  },
];
