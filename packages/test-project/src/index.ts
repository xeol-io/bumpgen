import {
  date,
  myFunction,
  NodeRelations,
} from "./utils";

export * as zodUtils from "./utils";

date().parse("19th September 2023");

const n = new NodeRelations(false);
n.addEdge();

myFunction("test");
