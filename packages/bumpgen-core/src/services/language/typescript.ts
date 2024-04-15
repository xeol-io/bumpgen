import { createHash } from "crypto";
import type {
  ClassDeclaration,
  FunctionDeclaration,
  Identifier,
  ReferencedSymbol,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";
import { DirectedGraph } from "graphology";
import { Node, Project, SyntaxKind } from "ts-morph";

import type { BumpgenGraph, DependencyGraph } from "../../models/graph";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  Edge,
  KnownKind,
} from "../../models/graph/dependency";
import type { PlanGraphNode } from "../../models/graph/plan";
import type { Replacement } from "../../models/llm";
import type { BumpgenLanguageService } from "./types";

const hash = (str: string) => createHash("sha1").update(str).digest("hex");

/**
 * Gets the definition nodes for a given node identifier
 *
 * @param id The node identifier to get the definition nodes for
 * @param project
 * @param allowExternal
 * @returns
 */
const getDefinitionNodes = (id: Identifier, allowExternal = false) => {
  const definitionNodes = id.getDefinitionNodes().filter((def) => {
    if (allowExternal) return true;
    return (
      !def.getSourceFile().isInNodeModules() &&
      !def.getSourceFile().isFromExternalLibrary()
    );
  });
  return definitionNodes;
};
const isJsDocChild = (node: Node) => {
  return node.getAncestors().some((ancestor) => Node.isJSDoc(ancestor));
};

function isKindType(value: string): value is KnownKind {
  return (
    value === "CallExpression" ||
    value === "TypeReference" ||
    value === "NewExpression"
  );
}

export const DependencyEdgeTypes = [
  "referencedBy",
  "importDeclaration",
] as const;
export type DependencyEdgeType = (typeof DependencyEdgeTypes)[number];

const convertKindToEdgeType = (kind: KnownKind): DependencyEdgeType => {
  switch (kind) {
    case "CallExpression":
      return "referencedBy" as const;
    case "TypeReference":
      return "referencedBy" as const;
    case "NewExpression":
      return "referencedBy" as const;
  }
};

const _alreadyTriedToCollectReference = new Set<string>();
const _alreadyTriedToCollectImport = new Set<string>();
const _alreadyTriedToCollectImportUnknownNode = new Set<string>();
// const _alreadyTriedToCollectIdentifierDeclaration = new Set<string>();

const createReferences = (
  references: ReferencedSymbol[],
  node: DependencyGraphNode,
) => {
  const edges: Edge[] = [];
  const nodes: DependencyGraphNode[] = [];
  for (const reference of references) {
    const references = reference.getReferences();
    for (const ref of references) {
      const ancestors = ref.getNode().getAncestors();
      // gets the top most ancestor, which contains the full text block
      // the top ancestor is the entire file, the second from the top of the most
      // outer containing block
      const secondFromTopAncestor = ancestors[ancestors.length - 2];
      if (!secondFromTopAncestor) {
        throw new Error("No second from top ancestor found");
      }

      if (!isKindType(ref.getNode().getParentOrThrow().getKindName())) {
        // console.debug(
        //   "Skipping, since it's not the right type: ",
        //   ref.getNode().getParentOrThrow().getKindName(),
        // );
        continue;
      }

      const relationshipToNode = convertKindToEdgeType(
        ref.getNode().getParentOrThrow().getKindName() as KnownKind,
      );

      const path = ref.getNode().getSourceFile().getFilePath();
      if (path.includes("node_modules")) {
        continue;
      }
      const kind = ref.getNode().getParentOrThrow().getKindName() as KnownKind;
      const name = ref.getNode().getText();

      const referenceNode = {
        id: hash(`${path}:${kind}:${name}`),
        kind,
        name,
        typeSignature: secondFromTopAncestor.getType().getText(),
        path,
        block: secondFromTopAncestor?.getText(),
        startLine: secondFromTopAncestor.getStartLineNumber(),
        endLine: secondFromTopAncestor.getEndLineNumber(),
        edits: [],
      };

      if (
        referenceNode.path === node.path &&
        referenceNode.startLine === node.startLine
      ) {
        continue;
      }

      // we need to find how this reference is imported
      ref
        .getNode()
        .getSymbol()
        ?.getDeclarations()
        ?.forEach((declaration) => {
          if (declaration.isKind(SyntaxKind.ImportSpecifier)) {
            // TODO(benji): if this code block isn't here, the program is incredibly slow
            // if it is here, then we don't get imports correctly. Will need to investigate.
            // if (_alreadyTriedToCollectImport.has(declaration.getText())) {
            //   return;
            // }
            // _alreadyTriedToCollectImport.add(declaration.getText());

            const kind = declaration.getKindName() as KnownKind;
            const path = declaration.getSourceFile().getFilePath();

            const ancestors = declaration.getAncestors();
            // gets the top most ancestor, which contains the full text block
            // the top ancestor is the entire file, the second from the top of the most
            // outer containing block
            const secondFromTopAncestor = ancestors[ancestors.length - 2];
            if (!secondFromTopAncestor) {
              throw new Error("No second from top ancestor found");
            }

            const importLiterals = secondFromTopAncestor.getChildrenOfKind(
              SyntaxKind.StringLiteral,
            );
            if (importLiterals.length === 0) {
              throw new Error("No import literals found");
            }
            if (importLiterals.length > 1) {
              throw new Error("More than one import literal found");
            }
            const importLiteralText = importLiterals[0]!.getText();
            const name = `from ${importLiteralText}`;

            const importNode = {
              id: hash(`${path}:${kind}:${name}`),
              kind,
              name,
              typeSignature: secondFromTopAncestor.getType().getText(),
              path,
              block: secondFromTopAncestor.getText(),
              startLine: declaration.getStartLineNumber(),
              endLine: declaration.getEndLineNumber(),
              edits: [],
            };
            nodes.push(importNode);
            edges.push({
              nodeFromId: referenceNode.id,
              nodeToId: importNode.id,
              relationship: "importDeclaration",
            });
          }
        });

      nodes.push(referenceNode);
      edges.push({
        nodeFromId: node.id,
        nodeToId: referenceNode.id,
        relationship: relationshipToNode,
      });
    }
  }

  return {
    nodes,
    edges,
  };
};

const getImportDeclarations = (
  filePath: string,
  nodeId: string,
  declaration: VariableDeclaration | FunctionDeclaration | ClassDeclaration,
) => {
  const importNodes: DependencyGraphNode[] = [];
  const importEdges: Edge[] = [];
  declaration.forEachDescendant((unknownNode) => {
    if (_alreadyTriedToCollectImportUnknownNode.has(unknownNode.getText())) {
      return;
    }
    _alreadyTriedToCollectImportUnknownNode.add(unknownNode.getText());

    if (unknownNode.getKind() === SyntaxKind.Identifier) {
      const identifier = unknownNode as Identifier;
      identifier
        .getSymbol()
        ?.getDeclarations()
        .forEach((declaration) => {
          if (
            declaration.isKind(SyntaxKind.ImportSpecifier) ||
            declaration.isKind(SyntaxKind.ImportClause)
          ) {
            const ancestors = declaration.getAncestors();
            // gets the top most ancestor, which contains the full text block
            // the top ancestor is the entire file, the second from the top of the most
            // outer containing block
            const secondFromTopAncestor = ancestors[ancestors.length - 2];
            if (!secondFromTopAncestor) {
              throw new Error("No second from top ancestor found");
            }

            const imNode = _getImport(identifier);
            if (!imNode) {
              throw new Error("No import node found");
            }

            const importLiterals = secondFromTopAncestor.getChildrenOfKind(
              SyntaxKind.StringLiteral,
            );
            if (importLiterals.length === 0) {
              throw new Error("No import literals found");
            }
            if (importLiterals.length > 1) {
              throw new Error("More than one import literal found");
            }
            const importLiteralText = importLiterals[0]!.getText();
            const name = `from ${importLiteralText}`;
            const kind = "ImportSpecifier" as const;

            const importNodeId = hash(`${filePath}:${kind}:${name}`);
            const importNode = {
              id: importNodeId,
              name: name,
              kind,
              block: secondFromTopAncestor.getText(),
              typeSignature: imNode.typeSignature,
              path: filePath,
              startLine: secondFromTopAncestor.getStartLineNumber(),
              endLine: secondFromTopAncestor.getEndLineNumber(),
              edits: [],
            };
            importNodes.push(importNode);
            importEdges.push({
              nodeFromId: nodeId,
              nodeToId: importNodeId,
              relationship: "importDeclaration",
            });
          }
        });
    }
  });

  return {
    nodes: importNodes,
    edges: importEdges,
  };
};

const _alreadyTriedToCollectNode = new Set<Node>();
const _alreadyTriedToCollectId = new Set<string>();

/**
 * Recursively "collects" all definitions that are local to the project based off identifiers found in the source code (node).
 *
 * Goes through the source file and:
 * 1. Iterates all node definitions of identifiers
 * 2. If a definition node is external or in node modules simply add it to the diagnostics and skip it
 * 3. If a definition node is in a declaration file, add it to nodeModuleDeclarationImports and diagnostics and skip it
 * 4. If a definition node has already been processed, skip it
 * 3. If a definition node is in the project, recursively call collect on it
 *
 * After the identifier definitions have been processed:
 * 1. Generate all declaration files for each root node or fail
 * 2. Get transient nodes from the declaration files and collect those as well
 *
 * @param parentNode tsm.Node
 */
function resolveTypes(ids: Identifier[], types: Set<string>) {
  const definitionNodes: Node[] = [];
  for (const id of ids) {
    const symbol = id.getSymbol();
    if (symbol) {
      symbol.getDeclarations().forEach((declaration) => {
        const declarations: Node[] = [];
        declarations.push(declaration);
        const ident = declaration.getFirstChildByKind(SyntaxKind.Identifier);
        if (ident) {
          declarations.push(...getDefinitionNodes(ident, true));
        }
        for (const d of declarations) {
          if (
            Node.isTypeAliasDeclaration(d) ||
            Node.isTypeParameterDeclaration(d)
          ) {
            const typeDefinition = d.getFullText().trim();
            if (typeDefinition.startsWith("type")) {
              types.add(typeDefinition);
            }
          } else if (Node.isFunctionDeclaration(d)) {
            types.add(d.getText());
          }
        }
      });
    }

    definitionNodes.push(...getDefinitionNodes(id, true));
    for (const defNode of definitionNodes) {
      if (_alreadyTriedToCollectNode.has(defNode)) {
        continue;
      }
      _alreadyTriedToCollectNode.add(defNode);

      if (defNode.getSourceFile().isFromExternalLibrary()) {
        const typesInNode = defNode
          .getDescendantsOfKind(SyntaxKind.TypeReference)
          .map((c) => c.getFirstChildByKind(SyntaxKind.Identifier))
          .filter(<T>(c: T | undefined): c is T => !!c);
        resolveTypes(typesInNode, types);
        continue;
      }
      if (defNode.getSourceFile().isInNodeModules()) {
        const typesInNode = defNode
          .getDescendantsOfKind(SyntaxKind.TypeReference)
          .map((c) => c.getFirstChildByKind(SyntaxKind.Identifier))
          .filter(<T>(c: T | undefined): c is T => !!c);
        resolveTypes(typesInNode, types);
        continue;
      }
      if (defNode.getSourceFile().isDeclarationFile()) {
        const typesInNode = defNode
          .getDescendantsOfKind(SyntaxKind.TypeReference)
          .map((c) => c.getFirstChildByKind(SyntaxKind.Identifier))
          .filter(<T>(c: T | undefined): c is T => !!c);
        resolveTypes(typesInNode, types);
        continue;
      }
    }
  }
}

function _getImport(parent: Node | SourceFile) {
  const importNodes = [];

  if (Node.isIdentifier(parent)) {
    if (isJsDocChild(parent)) {
      return;
    }

    const types = new Set<string>();
    resolveTypes([parent], types);
    importNodes.push({
      id: parent.getFullText().trim(),
      typeSignature:
        Array.from(types).length > 1
          ? `\n${Array.from(types).join("\n")}\n`
          : "",
    });
  } else {
    parent.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
      // if (_alreadyTriedToCollectId.has(id.getText())) {
      //   return;
      // }
      // _alreadyTriedToCollectId.add(id.getText());

      if (isJsDocChild(id)) {
        return;
      }
      const types = new Set<string>();
      resolveTypes([id], types);
      importNodes.push({
        id: id.getFullText().trim(),
        typeSignature:
          Array.from(types).length > 1
            ? `\n${Array.from(types).join("\n")}\n`
            : "",
      });
    });
  }
  if (importNodes.length === 0) {
    throw new Error("No imports found");
  }
  if (importNodes.length > 1) {
    throw new Error("More than one import found");
  }
  return importNodes[0];
}

export const processSourceFile = (sourceFile: SourceFile, rootDir: string) => {
  const nodes: DependencyGraphNode[] = [];
  const edges: Edge[] = [];

  const filePath = sourceFile
    .getFilePath()
    .replace(rootDir, "")
    .replace(/^\//, "");

  sourceFile.getClasses().forEach((classDeclaration) => {
    const kind = classDeclaration.getKindName();
    const name = classDeclaration.getName();
    if (!name) {
      console.log("No name found");
      return;
      // throw new Error("No name found");
    }

    const node = {
      id: hash(`${filePath}:${kind}:${name}`),
      name,
      kind,
      path: filePath,
      typeSignature: "Class",
      block: classDeclaration.getText(),
      startLine: classDeclaration.getStartLineNumber(),
      endLine: classDeclaration.getEndLineNumber(),
      edits: [],
    };
    nodes.push(node);

    const { nodes: refNodes, edges: refEdges } = createReferences(
      classDeclaration.findReferences(),
      node,
    );
    nodes.push(...refNodes);
    edges.push(...refEdges);

    const { nodes: importNodes, edges: importEdges } = getImportDeclarations(
      filePath,
      node.id,
      classDeclaration,
    );
    nodes.push(...importNodes);
    edges.push(...importEdges);
  });

  sourceFile.getFunctions().forEach((functionDeclaration) => {
    const kind = functionDeclaration.getKindName();
    const name = functionDeclaration.getName();
    if (!name) {
      console.log("No name found");
      return;
      // throw new Error("No name found");
    }

    // ref: https://github.com/dsherret/ts-morph/issues/907
    const parameters = functionDeclaration
      .getParameters()
      .map((parameter) => parameter.getText());
    const returnType = functionDeclaration.getReturnType().getText();
    const signature = `(${parameters.join(", ")}) => ${returnType}`;

    const node = {
      id: hash(`${filePath}:${kind}:${name}`),
      name,
      kind,
      path: filePath,
      typeSignature: signature,
      block: functionDeclaration.getText(),
      startLine: functionDeclaration.getStartLineNumber(),
      endLine: functionDeclaration.getEndLineNumber(),
      edits: [],
    };
    nodes.push(node);

    // console.log("Finding references");
    const { nodes: refNodes, edges: refEdges } = createReferences(
      functionDeclaration.findReferences(),
      node,
    );
    nodes.push(...refNodes);
    edges.push(...refEdges);

    // console.log("Finding imports");
    const { nodes: importNodes, edges: importEdges } = getImportDeclarations(
      filePath,
      node.id,
      functionDeclaration,
    );
    nodes.push(...importNodes);
    edges.push(...importEdges);
  });

  sourceFile.getVariableDeclarations().forEach((variableDeclaration) => {
    const initializer = variableDeclaration.getInitializer();
    const kind = initializer?.getKindName();
    if (!kind) {
      // console.log(
      //   "No initializer kind found for:",
      //   variableDeclaration.getText(),
      // );
      return;
    }
    const ancestors = variableDeclaration.getAncestors();
    // gets the top most ancestor, which contains the full text block
    // the top ancestor is the entire file, the second from the top of the most
    // outer containing block
    const secondFromTopAncestor = ancestors[ancestors.length - 2];
    if (!secondFromTopAncestor) {
      throw new Error("No second from top ancestor found");
    }

    const block = secondFromTopAncestor.getText();

    const node = {
      id: hash(`${filePath}:${kind}:${variableDeclaration.getName()}`),
      name: variableDeclaration.getName(),
      kind,
      block,
      typeSignature: variableDeclaration.getType().getText(),
      path: filePath,
      startLine: secondFromTopAncestor.getStartLineNumber(),
      endLine: secondFromTopAncestor.getEndLineNumber(),
      edits: [],
    };
    nodes.push(node);

    const { nodes: refNodes, edges: refEdges } = createReferences(
      variableDeclaration.findReferences(),
      node,
    );
    nodes.push(...refNodes);
    edges.push(...refEdges);

    // create all nodes and edges for import declarations for a given code
    // block
    const { nodes: importNodes, edges: importEdges } = getImportDeclarations(
      filePath,
      node.id,
      variableDeclaration,
    );
    nodes.push(...importNodes);
    edges.push(...importEdges);
  });

  return {
    nodes,
    edges,
  };
};

export const makeTypescriptService = () => {
  return {
    build: {
      getErrors: async () => {
        return Promise.resolve([]);
      },
    },
    ast: {
      initialize: (projectRoot: string) => {
        const project = new Project({
          tsConfigFilePath: `${projectRoot}/tsconfig.json`,
        });

        return project;
      },
    },
    graph: {
      dependency: {
        initialize: (project: unknown, projectRoot: string) => {
          console.log("Initializing the dependency graph...");

          if (!(project instanceof Project)) {
            throw new Error("Invalid project type");
          }

          const graph = new DirectedGraph<
            DependencyGraphNode,
            DependencyGraphEdge
          >();
          const sourceFiles = project.getSourceFiles();

          // await parallel(3, sourceFiles, async (sourceFile) => {
          sourceFiles.forEach((sourceFile) => {
            // console.log("Processing source file:", sourceFile.getFilePath());
            const { nodes, edges } = processSourceFile(sourceFile, projectRoot);
            for (const node of nodes) {
              if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, node);
              }
            }
            for (const edge of edges) {
              if (!graph.hasEdge(edge.nodeFromId, edge.nodeToId)) {
                graph.addDirectedEdge(edge.nodeFromId, edge.nodeToId, {
                  relationship: edge.relationship,
                });
              }
            }
          });
          return graph;
        },
      },
      //  recompute file will update nodes and edges for a file
      // so that line numbers are correct
      recomputeFileAfterChange: (
        graph: BumpgenGraph,
        affectedNode: PlanGraphNode,
        replacements: Replacement[],
      ) => {
        if (!(graph.ast instanceof Project)) {
          throw new Error("Invalid project type");
        }

        console.log("recomputing file after change...");
        project = new Project({
          tsConfigFilePath: `${rootDir}/tsconfig.json`,
          skipAddingFilesFromTsConfig: true,
        });
        graph.ast.addSourceFileAtPath(affectedNode.path);
        const sourceFile = graph.ast.getSourceFile(affectedNode.path);
        if (!sourceFile) {
          throw new Error("File not found");
        }
        const { nodes } = processSourceFile(sourceFile, rootDir);
        nodes.forEach((node) => {
          const oldNode = graph.dependency.findNode((n) => n === node.id);
          if (!oldNode) {
            console.log("old node not found, something in the tree changed");
            return;
            // throw new Error("old node not found, something in the tree changed");
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
        console.log("recomputing file after change...done");
        return graph;
      },
    },
  } satisfies BumpgenLanguageService;
};

export const injectTypescriptService = () => {
  return makeTypescriptService();
};

export type TypescriptService = ReturnType<typeof makeTypescriptService>;
