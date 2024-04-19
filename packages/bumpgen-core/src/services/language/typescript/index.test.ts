import path from "path";

import { injectTypescriptService } from "./index";

const client = injectTypescriptService();

describe("dependencyGraphService", () => {
  it("initializes", () => {
    const pkg = path.dirname(require.resolve("@repo/test-project"));
    const rootDir = pkg.slice(0, -4); // remove /src

    const project = client.ast.initialize(rootDir);
    const depGraph = client.graph.dependency.initialize(project);

    const updatedNodes = depGraph.nodes().map((id) => {
      const node = depGraph.getNodeAttributes(id);
      return {
        ...node,
        // remove part of the path so snapshots don't fail
        path: node?.path.replace(/^.*?(\/test-project\/)/, "$1"),
        typeSignature: client.graph.getTypeSignature(project, node),
      };
    });

    const graphObj = depGraph.export();

    // delete edge key so snapshots don't fail
    graphObj.edges.forEach((edge) => delete edge.key);

    expect(updatedNodes).toMatchSnapshot();
    expect(graphObj.edges).toMatchSnapshot();
  });
});
