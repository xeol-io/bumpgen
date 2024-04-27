import type { BuildError } from "../../models/build";
import type {
  AbstractSyntaxTree,
  BumpgenGraph,
  DependencyGraph,
} from "../../models/graph";
import type { DependencyGraphNode } from "../../models/graph/dependency";
import type { PlanGraphNode } from "../../models/graph/plan";
import type { Replacement } from "../../models/llm";
import type { PackageUpgrade } from "../../models/packages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BumpgenLanguageService<TAst = any> = {
  ast: {
    initialize: (projectRoot: string) => AbstractSyntaxTree<TAst>;
  };
  build: {
    getErrors: (projectRoot: string) => Promise<BuildError[]>;
  };
  packages: {
    upgrade: {
      list: (projectRoot: string) => Promise<PackageUpgrade[]>;
      apply: (
        projectRoot: string,
        upgrade: PackageUpgrade,
      ) => Promise<PackageUpgrade>;
    };
    install: (projectRoot: string) => Promise<string>;
  };
  graph: {
    dependency: {
      initialize: (ast: AbstractSyntaxTree<TAst>) => DependencyGraph;
      isImportedFromExternalPackage: (
        node: DependencyGraphNode,
        packageName: string,
      ) => boolean;
    };
    getTypeSignature: (
      graph: AbstractSyntaxTree<TAst>,
      node: DependencyGraphNode,
    ) => string;
    recomputeGraphAfterChange: (
      graph: BumpgenGraph<TAst>,
      affectedNode: PlanGraphNode,
      replacements: Replacement[],
    ) => BumpgenGraph<TAst>;
  };
};
