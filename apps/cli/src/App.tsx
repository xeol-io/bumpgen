import { spawn } from "child_process";
import type {
  BumpgenGraph,
  PlanGraphNode,
  SerializeableBumpgenEvent,
  SerializeableBumpgenGraph,
  SupportedLanguage,
  SupportedModel,
} from "@xeol/bumpgen-core";
import type { BoxProps, DOMElement } from "ink";
import type { ReactNode } from "react";
import React, { useEffect, useRef, useState } from "react";
import express from "express";
import DirectedGraph from "graphology";
import { topologicalSort } from "graphology-dag";
import { Box, measureElement, Newline, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { omit } from "radash";
import stripAnsi from "strip-ansi";

import { Sidebar } from "./components/Sidebar";
import { TitleText } from "./components/TitleText";
import { useStdoutDimensions } from "./hooks/use-stdout-dimensions";

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
        return event.data.plan;
      } else {
        return event.data.graph.plan;
      }
    });

  const latest = planGraphs.at(-1);

  return latest ?? null;
};

const TitleBox = (
  props: Omit<BoxProps, "flexDirection" | "overflow"> & {
    title: string;
    children?: ReactNode;
    innerRef?: React.Ref<DOMElement>;
  },
) => {
  return (
    <Box
      flexDirection="column"
      overflow="hidden"
      {...omit(props, ["children"])}
    >
      <Text bold={true}>{props.title}</Text>
      <Box
        borderStyle="double"
        width="100%"
        height="100%"
        flexDirection="column"
        ref={props.innerRef}
      >
        {props.children}
      </Box>
    </Box>
  );
};

const GraphNode = ({
  node,
  active,
}: {
  node: PlanGraphNode;
  active?: boolean;
}) => {
  const borderColor =
    node.status === "pending" ? (active ? "white" : "grey") : "white";
  const statusColor =
    node.status === "pending" ? (active ? "yellow" : "grey") : "green";

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      key={node.id}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text wrap="end">{node.id.slice(0, 6)}</Text>
      <Text wrap="end">{node.path.split("/").at(-1)}</Text>
      <Box justifyContent="center">
        <Text wrap="end" color={statusColor}>
          {active ? "active" : node.status}
        </Text>
      </Box>
    </Box>
  );
};

const GraphView = ({
  graph,
}: {
  graph: SerializeableBumpgenGraph["plan"] | null;
}) => {
  if (!graph) {
    return (
      <Box flexDirection="row" paddingLeft={1}>
        <Text dimColor={true}>Waiting for AST graph </Text>
        <Spinner type="dots" />
      </Box>
    );
  }

  const directedGraph = new DirectedGraph<
    ReturnType<BumpgenGraph["plan"]["getNodeAttributes"]>,
    ReturnType<BumpgenGraph["plan"]["getEdgeAttributes"]>
  >();

  directedGraph.import(graph);

  const sorted = topologicalSort(directedGraph).map((id) =>
    directedGraph.getNodeAttributes(id),
  );

  const activeNodeIndex = sorted.findIndex((node) => node.status === "pending");

  const truncated = sorted.slice(Math.max(activeNodeIndex - 1, 0));

  return (
    <Box
      height="100%"
      paddingLeft={1}
      justifyContent="flex-start"
      alignItems="center"
      overflow="hidden"
      flexDirection="row"
      display="flex"
    >
      {truncated.map((node, index) => {
        return (
          <Box
            flexShrink={0}
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            key={index}
          >
            <GraphNode
              node={node}
              active={
                activeNodeIndex >= 0 && node.id === sorted[activeNodeIndex]?.id
              }
            />
            {index < sorted.length - 1 && (
              <Box>
                <Text dimColor={true} wrap="end">
                  {"➤➤➤➤"}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

const App = (props: {
  model: SupportedModel;
  language: SupportedLanguage;
  pkg: string;
  version: string;
  port: number;
  token?: string;
}) => {
  const { exit } = useApp();

  const { model, language, pkg, version, token, port } = props;

  const [columns, rows] = useStdoutDimensions();

  const [outputOffset, setOutputOffset] = useState(0);

  const [outputDimensions, setOutputDimensions] = useState({
    width: 0,
    height: 0,
  });

  const outputRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (!outputRef.current) {
      return;
    }

    setOutputDimensions(measureElement(outputRef.current));
  }, [columns, rows]);

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      exit();
      process.exit(0);
    }
    if (key.upArrow) {
      setOutputOffset((prev) => Math.min(prev + 1, output.length));
    }
    if (key.downArrow) {
      setOutputOffset((prev) => Math.max(prev - 1, 0));
    }
  });

  const [executionHistory, setExecutionHistory] = useState<
    SerializeableBumpgenEvent[]
  >([]);

  const [output, setOutput] = useState<string[]>([]);

  useEffect(() => {
    // Set up an express server, this will be used to handle events from the bumpgen subprocess
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.post("/data", (req, res) => {
      const event = req.body as SerializeableBumpgenEvent;
      setExecutionHistory((prev) => [...prev, event]);
      res.setHeader("Connection", "close");
      res.status(200).send({ message: "Data received successfully" });
    });

    const server = app.listen(3000);

    const child = spawn(
      "node",
      [
        `${import.meta.dirname}/index.mjs`,
        pkg,
        version,
        "-i",
        "-l",
        language,
        "-m",
        model,
        "-p",
        `${port}`,
        ...(token ? ["-t", token] : []),
      ],
      {
        shell: true,
        env: process.env,
      },
    );

    child.stdout.on("data", (data: Buffer) => {
      const lines = stripAnsi(data.toString("utf8")).split("\n");

      setOutput((prev) => prev.concat(lines));
    });

    child.on("exit", (code) => {
      server.close();
      if (code === 0) {
        exit();
        process.exit(code ?? 0);
      } else {
        setExecutionHistory((prev) => [
          ...prev,
          {
            type: "error",

            data: { message: `Child process exited with code ${code}` },
          },
        ]);
      }
    });
  }, []);

  const outputBoxTooltip =
    outputOffset > 0 ? `offset: ${-1 * outputOffset}` : "use ↑ and ↓ to scroll";

  const outputWindowStart =
    -1 * outputOffset - (outputDimensions.height - 2) - 1;
  const outputWindowEnd = outputWindowStart + (outputDimensions.height - 2);

  return (
    <Box
      flexDirection="row"
      height={rows - 1}
      width={columns}
      padding={1}
      alignItems="center"
      overflow="hidden"
    >
      <Box width="30%" height="100%" paddingRight={1}>
        <Sidebar width="100%" executionHistory={executionHistory} />
      </Box>
      <Box flexDirection="column" width="70%" height="100%" paddingLeft={1}>
        <Box
          flexDirection="column"
          width="100%"
          height="100%"
          alignItems="center"
          display="flex"
          justifyContent="space-between"
        >
          <TitleText height="20%" width="100%" title="bumpgen" />
          <TitleBox
            innerRef={outputRef}
            width="100%"
            height="60%"
            title="Program Output"
          >
            <Box
              position="absolute"
              marginLeft={outputDimensions.width - outputBoxTooltip.length - 3}
              flexDirection="row-reverse"
              justifyContent="flex-start"
            >
              <Text dimColor={true}>{outputBoxTooltip}</Text>
            </Box>
            <Text wrap="end">
              {output.slice(outputWindowStart, outputWindowEnd).join("\n")}
            </Text>
          </TitleBox>

          <Newline />
          <TitleBox
            width="100%"
            height="20%"
            title="Plan Graph (topological view)"
          >
            <GraphView graph={getLatestPlanGraph(executionHistory)} />
          </TitleBox>
        </Box>
      </Box>
    </Box>
  );
};

export default App;
