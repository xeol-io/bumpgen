import process from "process";
import { DirectedGraph } from "graphology";

import type { BuildError } from "./models/build";
import type { BumpgenGraph } from "./models/graph";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
} from "./models/graph/dependency";
import type { PlanGraphEdge, PlanGraphNode } from "./models/graph/plan";
import type { GraphService } from "./services/graph";
import type { BumpgenLanguageService } from "./services/language/types";
import type { LLMService } from "./services/llm/types";
import { injectGraphService } from "./services/graph";
import { injectTypescriptService } from "./services/language/typescript";
import { injectLLMService } from "./services/llm";

const _bumpgen = ({
  llm,
  language,
  graph,
  projectRoot,
}: {
  llm: LLMService;
  language: BumpgenLanguageService;
  graph: GraphService;
  projectRoot: string;
}) => {
  return {
    build: {
      getErrors: async () => {
        return await language.build.getErrors();
      },
    },
    // ast: {
    //   initialize: () => {
    //     return {} as unknown;
    //   },
    // },
    graph: {
      initialize: (projectRoot: string, errs: BuildError[]): BumpgenGraph => {
        const ast = language.ast.initialize(projectRoot);

        const dependencyGraph = language.ast.graph.initialize(ast);

        return {
          dependency: new DirectedGraph<
            DependencyGraphNode,
            DependencyGraphEdge
          >(),
          plan: new DirectedGraph<PlanGraphNode, PlanGraphEdge>(),
          ast,
        };
      },
      // dependency: {
      //   populate: (graph: BumpgenGraph) => {
      //     return graph;
      //   },
      // },
      plan: {
        // populate: (errs: BuildError[], graph: BumpgenGraph) => {},
        isComplete: () => {
          return false;
        },
        execute: () => {},
      },
    },
    // execute: async () => {},
    // execute: async function* () {
    //   const context = {} as LLMContext;
    //   const replacements = await llm.codeplan.getReplacements(context);
    //   yield replacements;
    // },
    // context: {
    //   get: async () => {
    //     return {} as Promise<LLMContext>;
    //   },
    // },
  };
};

export const makeBumpgen = ({
  llmApiKey,
  model,
  language,
  projectRoot,
}: {
  llmApiKey: string;
  projectRoot?: string;
  model?: "gpt-4-turbo-preview";
  language?: "typescript";
}) => {
  model = model ?? "gpt-4-turbo-preview";
  language = language ?? "typescript";
  projectRoot = projectRoot ?? process.cwd();
  let languageService: BumpgenLanguageService;

  if (language === "typescript") {
    languageService = injectTypescriptService();
  } else {
    throw new Error(`Unsupported language`);
  }

  const llm = injectLLMService({ llmApiKey, model })();
  const graph = injectGraphService();

  return _bumpgen({ llm, language: languageService, graph, projectRoot });
};
