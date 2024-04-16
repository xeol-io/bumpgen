import path from "path";
import PackageJson from "@npmcli/package-json";
import { DirectedGraph } from "graphology";
import ncu from "npm-check-updates";
import { isObject } from "radash";
import semver from "semver";
import { Project } from "ts-morph";
import { z } from "zod";

import type {
  DependencyGraphEdge,
  DependencyGraphNode,
} from "../../../models/graph/dependency";
import type { FilesystemService } from "../../filesystem";
import type { GraphService } from "../../graph";
import type { SubprocessService } from "../../subprocess";
import type { BumpgenLanguageService } from "../types";
import { injectFilesystemService } from "../../filesystem";
import { injectGraphService } from "../../graph";
import { injectSubprocessService } from "../../subprocess";
import { processSourceFile } from "./process";

const NcuUpgradeSchema = z.record(z.string());

export const makeTypescriptService = (
  filesystem: FilesystemService,
  subprocess: SubprocessService,
  graphService: GraphService,
) => {
  const findPackageManager = async (projectRoot: string) => {
    let currentDir = projectRoot;
    const rootPath = path.parse(currentDir).root;

    while (currentDir !== rootPath) {
      if (await filesystem.exists(path.join(currentDir, "package-lock.json"))) {
        return {
          packageManager: "npm" as const,
          filePath: path.join(currentDir, "package-lock.json"),
        };
      } else if (await filesystem.exists(path.join(currentDir, "yarn.lock"))) {
        return {
          packageManager: "yarn" as const,
          filePath: path.join(currentDir, "yarn.lock"),
        };
      } else if (
        await filesystem.exists(path.join(currentDir, "pnpm-lock.yaml"))
      ) {
        return {
          packageManager: "pnpm" as const,
          filePath: path.join(currentDir, "pnpm-lock.yaml"),
        };
      }

      // check for .git folder to stop at the root of the repo
      if (await filesystem.exists(path.join(currentDir, ".git"))) {
        break;
      }

      currentDir = path.join(currentDir, "..");
    }
    return {
      packageManager: "npm" as const,
      filePath: "package-lock.json",
    };
  };

  return {
    build: {
      getErrors: async () => {
        return Promise.resolve([]);
      },
    },
    ast: {
      initialize: (projectRoot) => {
        const project = new Project({
          tsConfigFilePath: `${projectRoot}/tsconfig.json`,
        });

        return {
          source: "ts-morph",

          tree: project,
        };
      },
    },
    packages: {
      upgrade: {
        list: async (projectRoot) => {
          const packages = await ncu({
            packageFile: `${projectRoot}/package.json`,
            dep: "prod",
            interactive: false,
            jsonUpgraded: true,
            target: "latest",
            filterResults: (name, { currentVersion, upgradedVersion }) => {
              if (name.startsWith("@types")) {
                return false;
              }

              const currentSemver = semver.coerce(currentVersion);

              if (!currentSemver) {
                console.debug(`No semver found for ${currentVersion}`);
                return false;
              }

              const upgradedSemver = semver.coerce(upgradedVersion);

              if (!upgradedSemver) {
                console.debug(`No semver found for ${upgradedVersion}`);
                return false;
              }

              return currentSemver.major !== upgradedSemver.major;
            },
          });

          if (!isObject(packages) || !Object.keys(packages).length) {
            return [];
          }

          const parsed = NcuUpgradeSchema.safeParse(packages);

          if (!parsed.success) {
            console.error(parsed.error);
            return [];
          }

          return Object.entries(parsed.data).map(([name, version]) => {
            return {
              packageName: name,
              newVersion: version,
            };
          });
        },
        apply: async (projectRoot, upgrade) => {
          const { packageManager } = await findPackageManager(projectRoot);

          const packageJson = await PackageJson.load(projectRoot);

          const existingDependencies = packageJson.content.dependencies;

          packageJson.update({
            dependencies: {
              ...(existingDependencies
                ? Object.entries(existingDependencies).reduce(
                    (acc, [key, value]) => {
                      if (key === upgrade.packageName) {
                        return acc;
                      }
                      return {
                        ...acc,
                        [key]: value,
                      };
                    },
                    {},
                  )
                : {}),
              [upgrade.packageName]: upgrade.newVersion,
            },
          });

          await packageJson.save();

          console.log("Applying upgrades...");

          await subprocess.spawn(`${packageManager} install`, {
            rejectOnStderr: false,
          });
        },
      },
      install: async (projectRoot) => {
        const { packageManager } = await findPackageManager(projectRoot);

        return await subprocess.spawn(`${packageManager} install`, {
          rejectOnStderr: false,
        });
      },
    },
    // replacements: {
    //   apply: async (projectRoot, affectedNode, replacements) => {
    //     const fileContents = await filesystem.read(affectedNode.path);

    //   },
    // },
    graph: {
      dependency: {
        initialize: (ast) => {
          console.log("Initializing the dependency graph...");

          const graph = new DirectedGraph<
            DependencyGraphNode,
            DependencyGraphEdge
          >();
          const sourceFiles = ast.tree.getSourceFiles();

          sourceFiles.forEach((sourceFile) => {
            const { nodes, edges } = processSourceFile(sourceFile);
            for (const node of nodes) {
              if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, node);
              }
            }
            for (const edge of edges) {
              if (!graph.hasEdge(edge.source, edge.target)) {
                graph.addDirectedEdge(edge.source, edge.target, edge);
              }
            }
          });
          return graph;
        },
        checkImportsForPackage: (graph, node, packageName) => {
          const referencedImports = graphService.dependency.getReferencingNodes(
            graph,
            {
              id: node.id,
              relationships: ["importDeclaration"],
            },
          );

          return (
            referencedImports.filter((n) => n.block.includes(packageName))
              .length > 0
          );
        },
      },
      recomputeGraphAfterChange: (graph, affectedNode, replacements) => {
        // recompute file will update nodes and edges for a file
        // so that line numbers are correct
        const sourceFile = graph.ast.tree.getSourceFile(affectedNode.path);
        if (!sourceFile) {
          throw new Error("File not found");
        }
        const removed = graph.ast.tree.removeSourceFile(sourceFile);
        if (!removed) {
          throw new Error("File not removed");
        }

        const newSourceFile = graph.ast.tree.addSourceFileAtPath(
          affectedNode.path,
        );
        const { nodes } = processSourceFile(newSourceFile);

        nodes.forEach((node) => {
          const oldNode = graph.dependency.findNode((n) => n === node.id);
          if (!oldNode) {
            console.log("old node not found, something in the tree changed");
            return;
          }
          const oldAttrs = graph.dependency.getNodeAttributes(oldNode);
          graph.dependency.updateNode(node.id, () => {
            return {
              ...node,
              edits: [
                ...oldAttrs.edits,
                ...(node.id === affectedNode.id
                  ? [
                      {
                        replacements,
                        causedErrors: [],
                      },
                    ]
                  : []),
              ],
            };
          });
        });
        return graph;
      },
    },
  } satisfies BumpgenLanguageService<Project>;
};

export const injectTypescriptService = () => {
  const filesystemService = injectFilesystemService();
  const subprocessService = injectSubprocessService();
  const graphService = injectGraphService();

  return makeTypescriptService(
    filesystemService,
    subprocessService,
    graphService,
  );
};

export type TypescriptService = ReturnType<typeof makeTypescriptService>;
