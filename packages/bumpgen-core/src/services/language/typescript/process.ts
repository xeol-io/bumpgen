import { createHash } from "crypto";
import type {
  ClassDeclaration,
  ExportAssignment,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  ImportSpecifier,
  InterfaceDeclaration,
  ModuleDeclaration,
  SourceFile,
  TypeAliasDeclaration,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  Kind,
} from "../../../models/graph/dependency";
import { isImportNode } from "./signatures";

type TopLevelTypes =
  | ModuleDeclaration
  | InterfaceDeclaration
  | ClassDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | ExportAssignment
  | ExpressionStatement
  | TypeAliasDeclaration;

const isTopLevelType = (node: Node): node is TopLevelTypes => {
  return (
    node.getKind() === SyntaxKind.ModuleDeclaration ||
    node.getKind() === SyntaxKind.InterfaceDeclaration ||
    node.getKind() === SyntaxKind.ClassDeclaration ||
    node.getKind() === SyntaxKind.FunctionDeclaration ||
    node.getKind() === SyntaxKind.VariableDeclaration ||
    node.getKind() === SyntaxKind.ExportAssignment ||
    node.getKind() === SyntaxKind.ExpressionStatement ||
    node.getKind() === SyntaxKind.TypeAliasDeclaration
  );
};

// walks the AST tree to find all children of the kind Identifier
export const allChildrenOfKindIdentifier = (
  node: Node | SourceFile,
  identifiers: Identifier[] = [],
) => {
  if (node instanceof Node) {
    if (node.getKind() === SyntaxKind.Identifier) {
      identifiers.push(node as Identifier);
    }
  }

  node.forEachChild((child) => {
    identifiers.concat(allChildrenOfKindIdentifier(child, identifiers));
  });

  return identifiers;
};

export const getSurroundingBlock = (node: ImportSpecifier | Node): Node => {
  const ancestors = node.getAncestors();
  // the top ancestor is the entire file, the second from the top of the most
  // outer containing block
  const secondFromTopAncestor = ancestors[ancestors.length - 2];
  if (!secondFromTopAncestor) {
    return node;
  }
  return secondFromTopAncestor;
};

export const id = ({
  path,
  kind,
  name,
}: {
  path: string;
  kind: Kind;
  name: string;
}) => {
  return createHash("sha1").update(`${path}:${kind}:${name}`).digest("hex");
};

const makeKind = (kind: SyntaxKind) => {
  return SyntaxKind[kind] as Kind;
};

export const getDefinitionNodesOutsideBlock = (
  id: Identifier,
  filePath: string,
  blockStart: number,
  blockEnd: number,
): Node[] => {
  const definitionNodes = id.getDefinitionNodes().filter((def) => {
    const defNodeIsOutsideIdNodeBlock =
      (def.getStartLineNumber() < blockStart &&
        def.getSourceFile().getFilePath() === filePath) ||
      (def.getEndLineNumber() <= blockEnd &&
        def.getSourceFile().getFilePath() === filePath) ||
      def.getSourceFile().getFilePath() !== filePath;

    return defNodeIsOutsideIdNodeBlock;
  });
  return definitionNodes;
};

const isExportableType = (
  node: Node,
): node is
  | ModuleDeclaration
  | InterfaceDeclaration
  | ClassDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | TypeAliasDeclaration => {
  return (
    node.getKind() === SyntaxKind.ModuleDeclaration ||
    node.getKind() === SyntaxKind.InterfaceDeclaration ||
    node.getKind() === SyntaxKind.ClassDeclaration ||
    node.getKind() === SyntaxKind.FunctionDeclaration ||
    node.getKind() === SyntaxKind.VariableDeclaration ||
    node.getKind() === SyntaxKind.TypeAliasDeclaration
  );
};

// process an import node. e.g 'import {x} from "y"'
const processImportNode = (identifier: Identifier, parentNode: Node) => {
  const surroundingBlock = getSurroundingBlock(parentNode);

  let exportStatements: string[] | undefined;

  const moduleName = surroundingBlock
    .getFirstChildByKind(SyntaxKind.StringLiteral)
    ?.getText()
    .replace(/^['"]|['"]$/g, "");

  // we need to do this rather then using identifier.getDefinitionNodes
  // where identifier is something like { Thing } from x because Thing might not exist in x
  // and getDefinitionNodes will not resolve
  const externalFile = surroundingBlock
    .getSourceFile()
    .getReferencedSourceFiles()
    .find((file) => file.getFilePath().includes(`node_modules/${moduleName}`));

  if (externalFile) {
    exportStatements = externalFile
      .getFirstChildByKind(SyntaxKind.SyntaxList)
      ?.getChildren()
      .filter((child) => {
        return (
          child.getKind() === SyntaxKind.ExportAssignment ||
          child.getKind() === SyntaxKind.ExportDeclaration ||
          (isExportableType(child) && child.getExportKeyword() !== undefined)
        );
      })
      .map((child) => {
        if (
          child.getKind() === SyntaxKind.ExportAssignment ||
          child.getKind() === SyntaxKind.ExportDeclaration
        ) {
          return child.getText();
        } else {
          const text = child.getText();
          const block = child.getFirstChildByKind(SyntaxKind.Block);

          if (block) {
            return text.replace(block.getText(), "");
          }

          return text;
        }
      });
  }

  const name = identifier.getText();
  const kind = makeKind(surroundingBlock.getKind());
  const path = surroundingBlock.getSourceFile().getFilePath();

  const node = {
    id: id({
      path,
      kind,
      name,
    }),
    kind,
    name,
    path,
    block: surroundingBlock.getText(),
    startLine: surroundingBlock.getStartLineNumber(),
    endLine: surroundingBlock.getEndLineNumber(),
    edits: [],
    external:
      exportStatements && moduleName
        ? {
            importedFrom: moduleName,
            exports: exportStatements,
          }
        : undefined,
  };

  return node;
};

const getImportNodes = (node: TopLevelTypes) => {
  const importNodes: DependencyGraphNode[] = [];
  // for all children of type identifier in the function declaration block
  allChildrenOfKindIdentifier(node).forEach((identifier) => {
    // find all the declarations for the identifier
    identifier
      .getSymbol()
      ?.getDeclarations()
      .forEach((declaration) => {
        // if the declaration is an import, create an edge
        if (isImportNode(declaration)) {
          const parentNode = getSurroundingBlock(declaration);
          const node = processImportNode(identifier, parentNode);
          importNodes.push(node);
        }
      });
  });
  return importNodes;
};

const getReferenceNodes = (node: TopLevelTypes) => {
  const nodes: DependencyGraphNode[] = [];
  if ("findReferences" in node) {
    node.findReferences().forEach((r) => {
      r.getReferences().forEach((ref) => {
        const referencingNode = ref.getNode();
        if (
          referencingNode.getSourceFile().getFilePath() ===
            node.getSourceFile().getFilePath() &&
          referencingNode.getStartLineNumber() === node.getStartLineNumber()
        ) {
          return;
        }

        if (referencingNode.getSourceFile().isInNodeModules()) {
          return;
        }

        const surroundingBlock = getSurroundingBlock(referencingNode);

        // TODO(benji): we have a limitation here, we're only processing references that are
        // in a block of these three kinds, however the referencing block might just be a naked
        // call expression like myClass.call() which we're not handling
        if (!isTopLevelType(surroundingBlock)) {
          return;
        }
        const refNode = createTopLevelNode(surroundingBlock);
        if (!refNode) {
          return;
        }
        nodes.push(refNode);
      });
    });
  }
  return nodes;
};

const createTopLevelNode = (n: TopLevelTypes) => {
  const kind = makeKind(n.getKind());
  const idName = n
    .getFirstDescendantByKind(SyntaxKind.Identifier)
    ?.getSymbol()
    ?.getName();
  const nodeName = "getName" in n ? n.getName() : n.getSymbol()?.getName();
  const name = nodeName ?? idName;
  if (!name) {
    return;
  }
  const path = n.getSourceFile().getFilePath();
  const surroundingBlock = getSurroundingBlock(n);

  return {
    id: id({
      path,
      kind,
      name,
    }),
    name,
    kind,
    path,
    block: surroundingBlock.getText(),
    startLine: surroundingBlock.getStartLineNumber(),
    endLine: surroundingBlock.getEndLineNumber(),
    edits: [],
  };
};

const processTopLevelItem = (n: TopLevelTypes) => {
  const nodes: DependencyGraphNode[] = [];
  const edges: DependencyGraphEdge[] = [];

  const node = createTopLevelNode(n);
  if (!node) {
    console.log("couldn't create top level node");
    return {
      nodes,
      edges,
    };
  }
  nodes.push(node);

  getImportNodes(n).map((importNode) => {
    nodes.push(importNode);
    edges.push({
      source: node.id,
      target: importNode.id,
      relationship: "importDeclaration",
    });
  });

  getReferenceNodes(n).map((referenceNode) => {
    nodes.push(referenceNode);
    edges.push({
      source: node.id,
      target: referenceNode.id,
      relationship: "referencedBy",
    });
  });

  return {
    nodes,
    edges,
  };
};

export const processSourceFile = (sourceFile: SourceFile) => {
  const collectedNodes: DependencyGraphNode[] = [];
  const collectedEdges: DependencyGraphEdge[] = [];

  // process import nodes
  allChildrenOfKindIdentifier(sourceFile).forEach((identifier) => {
    const parentNode = getSurroundingBlock(identifier);
    if (
      parentNode.getKind() === SyntaxKind.ImportSpecifier ||
      parentNode.getKind() === SyntaxKind.ImportDeclaration
    ) {
      // Create node for import identifiers
      const importNode = processImportNode(identifier, parentNode);
      if (importNode) {
        collectedNodes.push(importNode);
      }
    }
  });

  sourceFile.getClasses().forEach((classDeclaration) => {
    const { nodes, edges } = processTopLevelItem(classDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getFunctions().forEach((functionDeclaration) => {
    const { nodes, edges } = processTopLevelItem(functionDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getVariableDeclarations().forEach((variableDeclaration) => {
    const { nodes, edges } = processTopLevelItem(variableDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getExportAssignments().forEach((exportAssignment) => {
    const { nodes, edges } = processTopLevelItem(exportAssignment);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getModules().forEach((moduleDeclaration) => {
    const { nodes, edges } = processTopLevelItem(moduleDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getInterfaces().forEach((interfaceDeclaration) => {
    const { nodes, edges } = processTopLevelItem(interfaceDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile.getTypeAliases().forEach((typeAliasDeclaration) => {
    const { nodes, edges } = processTopLevelItem(typeAliasDeclaration);
    collectedNodes.push(...nodes);
    collectedEdges.push(...edges);
  });

  sourceFile
    .getChildrenOfKind(SyntaxKind.ExpressionStatement)
    .forEach((expressionStatement) => {
      const { nodes, edges } = processTopLevelItem(expressionStatement);
      collectedNodes.push(...nodes);
      collectedEdges.push(...edges);
    });

  sourceFile.getVariableStatements().forEach((variableStatement) => {
    variableStatement
      .getChildrenOfKind(SyntaxKind.VariableDeclarationList)
      .forEach((variableDeclarationList) => {
        variableDeclarationList
          .getChildrenOfKind(SyntaxKind.VariableDeclaration)
          .forEach((variableDeclaration) => {
            const { nodes, edges } = processTopLevelItem(variableDeclaration);
            collectedNodes.push(...nodes);
            collectedEdges.push(...edges);
          });
      });
  });

  return {
    nodes: collectedNodes,
    edges: collectedEdges,
  };
};
