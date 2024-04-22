import { createHash } from "crypto";
import type {
  ClassDeclaration,
  FunctionDeclaration,
  Identifier,
  ImportSpecifier,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  Kind,
} from "../../../models/graph/dependency";

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

export const getSurroundingBlock = (node: ImportSpecifier | Node) => {
  const ancestors = node.getAncestors();
  // the top ancestor is the entire file, the second from the top of the most
  // outer containing block
  const secondFromTopAncestor = ancestors[ancestors.length - 2];
  if (!secondFromTopAncestor) {
    return node;
  }
  return secondFromTopAncestor;
};

const id = ({
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
) => {
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

// process an import node. e.g 'import {x} from "y"'
const processImportNode = (identifier: Identifier, parentNode: Node) => {
  const surroundingBlock = getSurroundingBlock(parentNode);

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
  };

  return node;
};

const getImportNodes = (
  node: FunctionDeclaration | ClassDeclaration | VariableDeclaration,
) => {
  const importNodes: DependencyGraphNode[] = [];
  // for all children of type identifier in the function declaration block
  allChildrenOfKindIdentifier(node).forEach((identifier) => {
    // find all the declarations for the identifier
    identifier
      .getSymbol()
      ?.getDeclarations()
      .forEach((declaration) => {
        // if the declaration is an import, create an edge
        if (
          Node.isImportDeclaration(declaration) ||
          Node.isImportClause(declaration) ||
          Node.isImportSpecifier(declaration)
        ) {
          const parentNode = getSurroundingBlock(declaration);
          const node = processImportNode(identifier, parentNode);
          if (!node) {
            return;
          }
          importNodes.push(node);
        }
      });
  });
  return importNodes;
};

const getReferenceNodes = (
  node: FunctionDeclaration | ClassDeclaration | VariableDeclaration,
) => {
  const nodes: DependencyGraphNode[] = [];
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
      const topLevelNode =
        surroundingBlock.getFirstDescendantByKind(
          SyntaxKind.ClassDeclaration,
        ) ??
        surroundingBlock.getFirstDescendantByKind(
          SyntaxKind.FunctionDeclaration,
        ) ??
        surroundingBlock.getFirstDescendantByKind(
          SyntaxKind.VariableDeclaration,
        );
      if (!topLevelNode) {
        // TODO(benji): we have a limitation here, we're only processing references that are
        // in a block of these three kinds, however the referencing block might just be a naked
        // call expression like myClass.call() which we're not handling
        return;
      }

      const refNode = createTopLevelNode(topLevelNode);
      if (!refNode) {
        return;
      }
      nodes.push(refNode);
    });
  });
  return nodes;
};

const createTopLevelNode = (
  n: FunctionDeclaration | ClassDeclaration | VariableDeclaration,
) => {
  const kind = makeKind(n.getKind());
  const name = n.getName();
  if (!name) {
    console.log("no name for top level item");
    return;
  }
  const path = n.getSourceFile().getFilePath();

  return {
    id: id({
      path,
      kind,
      name,
    }),
    name,
    kind,
    path,
    block: n.getText(),
    startLine: n.getStartLineNumber(),
    endLine: n.getEndLineNumber(),
    edits: [],
  };
};

const processTopLevelItem = (
  n: FunctionDeclaration | ClassDeclaration | VariableDeclaration,
) => {
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

  return {
    nodes: collectedNodes,
    edges: collectedEdges,
  };
};
