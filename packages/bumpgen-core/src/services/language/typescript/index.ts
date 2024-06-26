import path from "path";
import PackageJson from "@npmcli/package-json";
import { DirectedGraph } from "graphology";
import ncu from "npm-check-updates";
import { isObject } from "radash";
import semver from "semver";
import { Project, SyntaxKind } from "ts-morph";
import { z } from "zod";

import type { DependencyGraph } from "../../../models/graph";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
} from "../../../models/graph/dependency";
import type { FilesystemService } from "../../filesystem";
import type { GitService } from "../../git";
import type { SubprocessService } from "../../subprocess";
import type { BumpgenLanguageService } from "../types";
import { injectFilesystemService } from "../../filesystem";
import { injectGitService } from "../../git";
import { injectSubprocessService } from "../../subprocess";
import { processSourceFile } from "./process";
import { getImportSignature, getSignature, isImportNode } from "./signatures";

export { id } from "./process";

const NcuUpgradeSchema = z.record(z.string());

type ErrorRegexParsed = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

const makeBuildError = (regexParsed: ErrorRegexParsed) => {
  return {
    path: regexParsed[1],
    line: parseInt(regexParsed[2], 10),
    column: parseInt(regexParsed[3], 10),
    message: regexParsed[6],
  };
};

const isRegexParsed = (value: unknown): value is ErrorRegexParsed => {
  return (
    Array.isArray(value) &&
    value.length === 7 &&
    value.every((v) => typeof v === "string")
  );
};

export const makeTypescriptService = (
  filesystem: FilesystemService,
  subprocess: SubprocessService,
  git: GitService,
) => {
  const findPackageManager = async (projectRoot: string) => {
    let currentDir = projectRoot;
    const rootPath = path.parse(currentDir).root;

    while (currentDir !== rootPath) {
      if (await filesystem.exists(path.join(currentDir, "yarn.lock"))) {
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
      } else if (
        await filesystem.exists(path.join(currentDir, "package-lock.json"))
      ) {
        return {
          packageManager: "npm" as const,
          filePath: path.join(currentDir, "package-lock.json"),
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
      getErrors: async (projectRoot) => {
        let tscOutput = await subprocess.spawn(
          `npx tsc --noEmit --skipLibCheck --pretty`,
          {
            cwd: projectRoot,
            rejectOnStderr: false,
          },
        );

        // strip ansi
        tscOutput = tscOutput.replace(
          // eslint-disable-next-line no-control-regex
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          "",
        );
        const trimRegex = /Found \d+ errors in/;
        const trimmedString = trimRegex.test(tscOutput)
          ? tscOutput.substring(0, tscOutput.search(trimRegex))
          : tscOutput;

        // tsc errors with lines like this
        // src/components/Component.tsx:231:33 - error TS2339: Property 'foo' does not exist on type 'Bar'
        const colonRegex =
          /^(.+?):(\d+):(\d+) - (error|warning) (TS\d+): (.*(?:\n(?!src\/).*)*)/gm;
        // tsc errors with lines like this
        // src/components/Component.tsx(231,33): error TS2339: Property 'foo' does not exist on type 'Bar'
        const bracketRegex =
          /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*(?:\n(?!src\/).*)*)/gm;
        const items = [];

        let regexParsed;
        while ((regexParsed = colonRegex.exec(trimmedString)) !== null) {
          if (isRegexParsed(regexParsed)) {
            items.push(makeBuildError(regexParsed));
          }
        }
        while ((regexParsed = bracketRegex.exec(trimmedString)) !== null) {
          if (isRegexParsed(regexParsed)) {
            items.push(makeBuildError(regexParsed));
          }
        }

        // I thought --skipLibCheck filtered out items inside node_modules
        // but it doesn't always, so we add a manual filter to remove all
        // items with a part in node_modules
        return items.filter((item) => {
          return !item.path.startsWith("node_modules/");
        });
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
        detect: async (projectRoot, target) => {
          const packageJson = await PackageJson.load(projectRoot);

          const existingDependencies = new Set([
            ...(packageJson.content.dependencies
              ? Object.keys(packageJson.content.dependencies)
              : []),
            ...(packageJson.content.devDependencies
              ? Object.keys(packageJson.content.devDependencies)
              : []),
          ]);

          await git.raw.cwd(projectRoot);
          const branch = target ?? (await git.raw.branch()).current;

          const diff = await git.raw.diff([branch, "package.json"]);

          const upgradedPackages = [];

          const lines = diff.split("\n");
          for (const line of lines) {
            const match = line.match(/^\+[\s]*"([^"]+)": "([^"]+)",?$/);
            if (match) {
              const packageName = match[1];
              const newVersion = match[2];

              if (
                packageName &&
                newVersion &&
                existingDependencies.has(packageName)
              ) {
                upgradedPackages.push({ packageName, newVersion });
              }
            }
          }

          return upgradedPackages;
        },
        apply: async (projectRoot, upgrade) => {
          const { packageManager } = await findPackageManager(projectRoot);
          const packageJson = await PackageJson.load(projectRoot);
          const existingDevDependencies = packageJson.content.devDependencies;
          const existingDependencies = packageJson.content.dependencies;

          if (existingDependencies?.[upgrade.packageName]) {
            existingDependencies[upgrade.packageName] = upgrade.newVersion;
          }
          if (existingDevDependencies?.[upgrade.packageName]) {
            existingDevDependencies[upgrade.packageName] = upgrade.newVersion;
          }

          await packageJson.save();

          console.log("Applying upgrades...");

          await subprocess.spawn(`${packageManager} install`, {
            cwd: projectRoot,
            rejectOnStderr: false,
            rejectOnNonZeroExit: true,
          });

          return upgrade;
        },
      },
      install: async (projectRoot) => {
        const { packageManager } = await findPackageManager(projectRoot);

        return await subprocess.spawn(`${packageManager} install`, {
          cwd: projectRoot,
          rejectOnStderr: false,
        });
      },
    },
    graph: {
      dependency: {
        initialize: (ast): DependencyGraph => {
          console.log("Initializing the dependency graph...");

          const graph = new DirectedGraph<
            DependencyGraphNode,
            DependencyGraphEdge
          >();
          const sourceFiles = ast.tree.getSourceFiles();

          if (sourceFiles.length === 0) {
            throw new Error(
              "No source files found in this project, cannot build dependency graph",
            );
          }

          const start = Date.now();
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
          console.log(
            "Done processing source files in",
            Date.now() - start,
            "ms",
          );
          return graph;
        },
        isImportedFromExternalPackage: (node, packageName) => {
          return !!(
            node.external?.importedFrom &&
            node.external.importedFrom.startsWith(packageName)
          );
        },
      },
      // the performance of .getType() and .getReturnType() in ts-morph is not very good.
      // thus, we need to compute these typeSignatures on the fly rather than when we
      // create the dependency graph
      getTypeSignature: (ast, node) => {
        const { name, kind, path } = node;

        const astNode = ast.tree
          .getSourceFile(path)
          ?.getFirstChild()
          ?.getDescendantsOfKind(SyntaxKind[kind])
          .map((descendant) => {
            const idName = descendant
              .getFirstDescendantByKind(SyntaxKind.Identifier)
              ?.getSymbol()
              ?.getName();
            const nodeName =
              "getName" in descendant
                ? descendant.getName()
                : descendant.getSymbol()?.getName();
            const descendantName = nodeName ?? idName;
            if (descendantName === name) {
              return {
                node: descendant,
                identifier: name,
              };
            }
          })
          .find(Boolean);

        if (!astNode) {
          console.log(
            `couldn't find ${name} of kind ${kind} in ${path}, something in the tree might have changed`,
          );
          return "";
        }

        if (isImportNode(astNode.node)) {
          return getImportSignature(astNode.node, astNode.identifier);
        }
        return getSignature(astNode.node);
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
        const { nodes, edges } = processSourceFile(newSourceFile);

        // map new nodes to existing nodes in the dependency graph
        nodes.forEach((node) => {
          const oldNode = graph.dependency.findNode((n) => n === node.id);
          if (!oldNode) {
            console.log(
              "old node not found, something in the tree changed, adding new node",
            );
            if (!graph.dependency.hasNode(node.id)) {
              graph.dependency.addNode(node.id, node);
            }
            for (const edge of edges) {
              if (
                graph.dependency.hasNode(edge.source) &&
                graph.dependency.hasNode(edge.target) &&
                !graph.dependency.hasEdge(edge.source, edge.target) &&
                (edge.source !== node.id || edge.target !== node.id)
              ) {
                graph.dependency.addDirectedEdge(
                  edge.source,
                  edge.target,
                  edge,
                );
              }
            }
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
  const gitService = injectGitService();

  return makeTypescriptService(
    filesystemService,
    subprocessService,
    gitService,
  );
};

export type TypescriptService = ReturnType<typeof makeTypescriptService>;
