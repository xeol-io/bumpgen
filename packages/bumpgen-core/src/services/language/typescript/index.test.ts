import path from "path";

import { injectTypescriptService } from "./index";

const client = injectTypescriptService();

describe("dependencyGraphService", () => {
  it("initializes", () => {
    const pkg = path.dirname(require.resolve("@repo/test-project"));
    const rootDir = pkg.slice(0, -4); // remove /src

    const project = client.ast.initialize(rootDir);
    const depGraph = client.graph.dependency.initialize(project);

    const graphObj = depGraph.export();
    graphObj.edges.forEach((edge) => delete edge.key);
    graphObj.nodes.forEach((node) => {
      if (node.attributes?.path) {
        node.attributes.path = node.attributes?.path.replace(
          /^.*?(\/scripts\/)/,
          "$1",
        );
      }
    });
    expect(graphObj).toMatchSnapshot();
  });
});
