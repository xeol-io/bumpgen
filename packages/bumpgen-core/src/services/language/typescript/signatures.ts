import type {
  ClassDeclaration,
  ConstructorDeclaration,
  FunctionDeclaration,
  HeritageClause,
  Identifier,
  IndexSignatureDeclaration,
  MethodDeclaration,
} from "ts-morph";
import { Node, SyntaxKind, TypeFormatFlags } from "ts-morph";

import {
  allChildrenOfKindIdentifier,
  getDefinitionNodesOutsideBlock,
  getSurroundingBlock,
} from "./process";

// Gets the definition nodes for a given node identifier
const getDefinitionNodes = (id: Identifier, allowExternal = false) => {
  const definitionNodes = id.getDefinitionNodes().filter((def) => {
    if (allowExternal) return true;
    return (
      def.getStartLineNumber() !== id.getStartLineNumber() &&
      !def.getSourceFile().isInNodeModules() &&
      !def.getSourceFile().isFromExternalLibrary()
    );
  });
  return definitionNodes;
};

const resolveTypeReferences = (
  node: Node,
  types: Set<string> = new Set<string>(),
  seenNodes: Set<Node> = new Set<Node>(),
  depth = 0,
  maxDepth = 1,
) => {
  // we set a somewhat arbitary depth to the fetching of type signatures from external
  // packages due to the size of type signature that could be returned
  if (depth >= maxDepth) {
    return;
  }

  node.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
    if (seenNodes.has(typeRef)) {
      return;
    }
    seenNodes.add(typeRef);
    const id = typeRef.getFirstChildByKind(SyntaxKind.Identifier);
    if (!id) {
      return;
    }
    const typeDefinitions = getDefinitionNodes(id, true);
    typeDefinitions?.forEach((typeDefinition) => {
      if (seenNodes.has(typeDefinition)) {
        return;
      }
      seenNodes.add(typeDefinition);
      resolveTypeReferences(
        typeDefinition,
        types,
        seenNodes,
        depth + 1,
        maxDepth,
      );
      if (typeDefinition.getText().startsWith("type")) {
        types.add(typeDefinition.getText());
      }
    });
  });
};

const enrichWithTypeReferences = (typeDef: string, node: Node) => {
  const types = new Set<string>();
  resolveTypeReferences(node, types);

  return (
    `${typeDef}\n` +
    (Array.from(types).length > 1 ? `\n${Array.from(types).join("\n")}\n` : "")
  );
};

const constructorDeclarationSignature = (node: ConstructorDeclaration) => {
  const params = node
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(", ");
  const returnType = node.getParent().getName();
  return `(${params}) => ${returnType}`;
};

const indexSignatureDeclarationSignature = (
  node: IndexSignatureDeclaration,
) => {
  return `[${node.getKeyName()}: ${node.getKeyType().getText()}]:  ${node
    .getReturnType()
    .getText()}`;
};

const functionDeclarationSignature = (node: FunctionDeclaration) => {
  // ref: https://github.com/dsherret/ts-morph/issues/907
  const params = node
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(", ");
  const returnType = node.getReturnType().getText(
    node,
    // https://github.com/dsherret/ts-morph/issues/453#issuecomment-667578386
    TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
  return enrichWithTypeReferences(`(${params}) => ${returnType}`, node);
};

const methodDeclarationSignature = (node: MethodDeclaration) => {
  // ref: https://github.com/dsherret/ts-morph/issues/907
  const params = node
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(", ");
  const returnType = node.getReturnType().getText();
  return enrichWithTypeReferences(`(${params}) => ${returnType}`, node);
};

const heritageClauseSignature = (node: HeritageClause) => {
  const heritance =
    node.getText().indexOf("implements") > -1 ? "implements" : "extends";
  return `${heritance} ${node
    .getTypeNodes()
    .map((n) => n.getType().getText())
    .join(", ")}`;
};

const classDeclarationSignature = (node: ClassDeclaration) => {
  const className = node.getName();

  const constructorSignatures = node.getConstructors().map((constructor) => {
    const signature = constructorDeclarationSignature(constructor);
    return `constructor ${signature}`;
  });

  const methodSignatures = node.getMethods().map((method) => {
    const signature = methodDeclarationSignature(method);
    return `${className}.${method.getName()}: ${signature}`;
  });

  const heritageClause = node.getHeritageClauses().map((h) => {
    const signature = heritageClauseSignature(h);
    return `${signature}`;
  });

  return `class ${className} ${heritageClause.length > 0 ? ` ${heritageClause.join(" ")}` : ""} {\n ${[...constructorSignatures, ...methodSignatures].join("  ")}}`;
};

export const getImportSignature = (node: Node, identifierName: string) => {
  const children = allChildrenOfKindIdentifier(node);
  const identifier = children.find(
    (child) => child.getText() === identifierName,
  );
  if (!identifier) {
    return "";
  }

  const parentNode = getSurroundingBlock(identifier);

  const defs = getDefinitionNodesOutsideBlock(
    identifier,
    parentNode.getSourceFile().getFilePath(),
    parentNode.getStartLineNumber(),
    parentNode.getEndLineNumber(),
  );

  const typeSignatures = [];
  for (const def of defs) {
    const signature = getSignature(def);
    if (signature) {
      typeSignatures.push(signature);
    }
  }

  return typeSignatures.join("\n");
};

export const isImportNode = (node: Node) => {
  if (
    Node.isImportDeclaration(node) ||
    Node.isNamespaceImport(node) || // import * as foo from 'bar'
    Node.isImportClause(node) || // import foo from 'bar'
    Node.isImportEqualsDeclaration(node) || // const foo = require('bar')
    Node.isImportSpecifier(node)
  ) {
    return true;
  }
  return false;
};

// the performance of .getType() and .getReturnType() in ts-morph is poor, getSignature()
// should only be executed when absolutely necessary
export const getSignature = (node: Node) => {
  // ref: https://user-images.githubusercontent.com/16563603/106034659-2dd70700-60a1-11eb-9f2c-0b3fa81ae8e8.png
  if (Node.isIndexSignatureDeclaration(node)) {
    return indexSignatureDeclarationSignature(node);
  }

  if (Node.isConstructorDeclaration(node)) {
    return constructorDeclarationSignature(node);
  }

  if (Node.isFunctionDeclaration(node)) {
    return functionDeclarationSignature(node);
  }

  if (Node.isHeritageClause(node)) {
    return heritageClauseSignature(node);
  }

  if (Node.isClassDeclaration(node)) {
    return classDeclarationSignature(node);
  }

  try {
    return node
      .getType()
      .getText(
        undefined,
        TypeFormatFlags.UseFullyQualifiedType |
          TypeFormatFlags.InTypeAlias |
          TypeFormatFlags.NoTruncation,
      );
  } catch (e) {
    if (e instanceof TypeError) {
      // TODO(benji): we need to follow exports, such as when an import is import {x} from "y"
      // and then in y we find "export x from xx"
      return "";
    }
    throw e;
  }
};
