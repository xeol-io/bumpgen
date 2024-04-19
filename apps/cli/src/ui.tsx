import { spawn } from "child_process";
import React, { useEffect, useRef, useState } from "react";
import express from "express";
import DirectedGraph from "graphology";
import { Box, Text, useApp, useInput } from "ink";
import BigText from "ink-big-text";
import Spinner from "ink-spinner";
import stripAnsi from "strip-ansi";

import type {
  Bumpgen,
  BumpgenEvent,
  BumpgenGraph,
  PlanGraph,
  SerializeableBumpgenEvent,
} from "@repo/bumpgen-core";

import { Sidebar } from "./components/sidebar";
import { TitleText } from "./components/title-text";
import { useStdoutDimensions } from "./use-stdout-dimensions";

// import { MainPane } from "./panes/mainPane.js";
// import { useStdoutDimensions } from "./use-stdout-dimensions.js";

export interface ExecutionState {
  state: "working" | "fail" | "success";
  message: string;
}

const getLatestPlanGraph = (events: SerializeableBumpgenEvent[]) => {
  const planGraphs = events
    .filter(
      (
        event,
      ): event is Extract<
        SerializeableBumpgenEvent,
        { type: "graph.initialize" | "graph.plan.execute"; status: "finished" }
      > => {
        return (
          (event.type === "graph.initialize" && event.status === "finished") ||
          (event.type === "graph.plan.execute" && event.status === "finished")
        );
      },
    )
    .map((event) => {
      if (event.type === "graph.initialize") {
        return event.data;
      } else {
        return event.data.graph;
      }
    });

  const graph = new DirectedGraph<
    ReturnType<BumpgenGraph["plan"]["getNodeAttributes"]>,
    ReturnType<BumpgenGraph["plan"]["getEdgeAttributes"]>
  >();

  const latest = planGraphs.at(-1);

  return latest ? graph.import(latest.plan) : null;
};

const GraphView = ({ graph }: { graph: PlanGraph | null }) => {
  if (!graph) {
    return (
      <Box flexDirection="row" paddingLeft={1}>
        <Text>Waiting for AST graph </Text>
        <Spinner type="dots" />
      </Box>
    );
  }

  return <Text>{JSON.stringify(graph, null, 2)}</Text>;
};

const App = ({ bumpgen }: { bumpgen: Bumpgen }) => {
  const { exit } = useApp();

  const [columns, rows] = useStdoutDimensions();

  // console.log(pkgName);
  // console.log(version);
  // console.log(model);
  // console.log(language);
  // console.log(llmApiKey);

  // const [columns, _] = useStdoutDimensions();

  useInput((input, key) => {
    // console.log(input, key);
    if (key.escape || input === "q" || input === "Q") {
      exit();
      process.exit(0);
    }
  });

  const [executionState, setExecutionState] = useState<ExecutionState[]>([]);

  const [executionHistory, setExecutionHistory] = useState<
    SerializeableBumpgenEvent[]
  >([]);

  const [stdout, setStdout] = useState<string>("");

  const pushExecutionState = (newState: ExecutionState) => {
    setExecutionState((prevState) => [...prevState, newState]);
  };

  useEffect(() => {
    pushExecutionState({
      state: "working",
      message: "Installing packages...",
    });
  }, []);

  useEffect(() => {
    // Set up an express server, that will be used to handle events from the bumpgen subprocess
    const server = express();
    server.use(express.json());
    server.post("/data", (req, res) => {
      // console.log("Data received:", req.body);
      const event = req.body as SerializeableBumpgenEvent;
      setExecutionHistory((prev) => [...prev, event]);
      res.status(200).send({ message: "Data received successfully" });
    });

    server.listen(3000);

    const child = spawn(
      "node",
      [
        `${import.meta.dirname}/index.mjs`,
        "@tanstack/react-query",
        "5.28.14",
        "-i",
        "3000",
      ],
      {
        shell: true,
        env: process.env,
      },
    );

    child.stdout.on("data", (data: Buffer) => {
      const lines = stripAnsi(data.toString("utf8")).split("\n");

      setStdout((prev) => prev + lines.join("\n"));
    });

    child.on("exit", (code) => {
      exit();
      process.exit(code ?? 0);
    });

    // // Run the bumpgen subprocess
    // async function runBumpgen() {
    //   // for await (const event of bumpgen.execute()) {
    //   //   setExecutionHistory((prev) => [...prev, event]);
    //   //   // if (event.type === "error") {
    //   //   //   pushExecutionState({
    //   //   //     state: "fail",
    //   //   //     message: event.message,
    //   //   //   });
    //   //   // }
    //   // }
    // }

    // runBumpgen().catch((err) => {
    //   throw err;
    // });
  }, []);

  return (
    <Box
      flexDirection="row"
      height={rows - 1}
      width="80%"
      padding={1}
      alignItems="center"
    >
      {/* <Box flexDirection="row"> */}
      <Sidebar
        executionState={executionState}
        executionHistory={executionHistory}
      />
      <Box
        flexDirection="column"
        width="70%"
        // height="80%"
        // padding={1}
        // borderStyle="single"
      >
        <Box
          width="100%"
          height="100%"
          flexDirection="column"
          alignItems="center"
          display="flex"
          // borderStyle="single"
          justifyContent="flex-start"
        >
          <TitleText large={columns > 111 && rows > 20} />
          <Box
            flexDirection="column"
            width="100%"
            height="100%"
            alignItems="center"
            display="flex"
            // borderStyle="single"
            justifyContent="space-between"
          >
            <Box
              width="100%"
              height="70%"
              padding={1}
              // minHeight="20%"
              flexDirection="column"
              borderStyle="double"
              overflow="hidden"
            >
              <Text>
                {stdout
                  .split("\n")
                  .slice(-1 * Math.floor(0.7 * (rows - 7)))
                  .join("\n")}
              </Text>
            </Box>
            <Box
              width="100%"
              height="30%"
              // minHeight="10%"
              flexDirection="column"
              borderStyle="single"
            >
              <GraphView graph={getLatestPlanGraph(executionHistory)} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default App;
