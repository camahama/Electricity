import { renderElectrostaticsModule } from "../modules/electrostatics/index.js";
import { renderElectrostaticsMaterialsModule } from "../modules/electrostatics-materials/index.js";

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
];
