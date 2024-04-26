import path from "path";

import { id, injectTypescriptService } from "./index";

const client = injectTypescriptService();

describe("dependencyGraphService", () => {
  it("initializes", () => {
    const pkg = path.dirname(require.resolve("@repo/test-project"));
    const rootDir = pkg.slice(0, -4); // remove /src

    const project = client.ast.initialize(rootDir);
    const depGraph = client.graph.dependency.initialize(project);

    const idMapping = new Map<string, string>();

    // we need to remap ids and paths so tests don't fail across
    // runs in different environments
    const updatedNodes = depGraph.nodes().map((nodeId) => {
      const node = depGraph.getNodeAttributes(nodeId);
      const path = node?.path.replace(/^.*?(\/test-project\/)/, "$1");
      const updatedId = id({
        path: path,
        kind: node.kind,
        name: node.name,
      });
      idMapping.set(nodeId, updatedId);
      return {
        ...node,
        id: id({
          path: path,
          kind: node.kind,
          name: node.name,
        }),
        // remove part of the path so snapshots don't fail
        path: node?.path.replace(/^.*?(\/test-project\/)/, "$1"),
        typeSignature: client.graph.getTypeSignature(project, node),
      };
    });

    const graphObj = depGraph.export();
    const updatedEdges = graphObj.edges.map((edge) => {
      return {
        source: idMapping.get(edge.source)!,
        target: idMapping.get(edge.target)!,
      };
    });

    expect(updatedNodes).toMatchSnapshot();
    expect(updatedEdges).toMatchSnapshot();
  });
});
