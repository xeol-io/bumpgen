import type { DependencyGraphService } from "./dependency";
import type { PlanGraphService } from "./plan";
import { injectDependencyGraphService } from "./dependency";
import { injectPlanGraphService } from "./plan";

export const createGraphService = (
  plan: PlanGraphService,
  dependency: DependencyGraphService,
) => {
  return {
    dependency,
    plan,
  };
};

export const injectGraphService = () => {
  const planService = injectPlanGraphService();
  const dependencyService = injectDependencyGraphService();
  return createGraphService(planService, dependencyService);
};

export type GraphService = ReturnType<typeof createGraphService>;
