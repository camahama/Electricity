import { renderElectrostaticsModule } from "../modules/electrostatics/index.js";
import { renderElectrostaticsMaterialsModule } from "../modules/electrostatics-materials/index.js";

export const moduleRegistry = [
  {
    slug: "electrostatics",
    titleKey: "modules.electrostatics.title",
    render: renderElectrostaticsModule,
  },
  {
    slug: "electrostatics-materials",
    titleKey: "modules.electrostaticsMaterials.title",
    render: renderElectrostaticsMaterialsModule,
  },
];
