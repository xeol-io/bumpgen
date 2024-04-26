import { spawn } from "child_process";
import type {
  BumpgenGraph,
  PlanGraph,
  PlanGraphNode,
  SerializeableBumpgenEvent,
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
import stripAnsi from "strip-ansi";

import { Sidebar } from "./components/sidebar";
import { TitleText } from "./components/title-text";
import { useStdoutDimensions } from "./use-stdout-dimensions";

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

const TitleBox = (
  props: Omit<BoxProps, "flexDirection" | "overflow"> & {
    title: string;
    children?: ReactNode;
    innerRef?: React.Ref<DOMElement>;
  },
) => {
  return (
    <Box flexDirection="column" overflow="hidden" {...props}>
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

const GraphView = ({ graph }: { graph: PlanGraph | null }) => {
  if (!graph) {
    return (
      <Box flexDirection="row" paddingLeft={1}>
        <Text dimColor={true}>Waiting for AST graph </Text>
        <Spinner type="dots" />
      </Box>
    );
  }

  const sorted = topologicalSort(graph).map((id) =>
    graph.getNodeAttributes(id),
  );

  const activeNodeIndex = Math.max(
    sorted.findIndex((node) => node.status === "pending"),
    0,
  );

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
              active={node.id === sorted[activeNodeIndex]?.id}
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
}) => {
  const { exit } = useApp();

  const { model, language, pkg, version } = props;

  const [columns, rows] = useStdoutDimensions();

  const [stdoutOffset, setStdoutOffset] = useState(0);
  const [outputDimensions, setOutputDimensions] = useState({
    width: 0,
    height: 0,
  });

  const stdoutRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (!stdoutRef.current) {
      return;
    }

    setOutputDimensions(measureElement(stdoutRef.current));
  }, [columns, rows]);

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      exit();
      process.exit(0);
    }
    if (key.upArrow) {
      setStdoutOffset((prev) => Math.min(prev + 1, stdout.length));
    }
    if (key.downArrow) {
      setStdoutOffset((prev) => Math.max(prev - 1, 0));
    }
  });

  const [executionHistory, setExecutionHistory] = useState<
    SerializeableBumpgenEvent[]
  >([]);

  const [stdout, setStdout] = useState<string[]>([]);

  useEffect(() => {
    // Set up an express server, this will be used to handle events from the bumpgen subprocess
    const server = express();
    server.use(express.json({ limit: "50mb" }));
    server.post("/data", (req, res) => {
      const event = req.body as SerializeableBumpgenEvent;
      setExecutionHistory((prev) => [...prev, event]);
      res.status(200).send({ message: "Data received successfully" });
    });

    server.listen(3000);

    const child = spawn(
      "node",
      [
        `${import.meta.dirname}/index.mjs`,
        pkg,
        version,
        "-i",
        "3000",
        "-l",
        language,
        "-m",
        model,
      ],
      {
        shell: true,
        env: process.env,
      },
    );

    child.stdout.on("data", (data: Buffer) => {
      const lines = stripAnsi(data.toString("utf8")).split("\n");

      setStdout((prev) => prev.concat(lines));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        exit();
        process.exit(code ?? 0);
      }
    });
  }, []);

  const outputBoxTooltip =
    stdoutOffset > 0 ? `offset: ${-1 * stdoutOffset}` : "use ↑ and ↓ to scroll";

  const outputWindowStart =
    -1 * stdoutOffset - (outputDimensions.height - 2) - 1;
  const outputWindowEnd = outputWindowStart + (outputDimensions.height - 2);

  return (
    <Box
      flexDirection="row"
      height={rows - 1}
      width="80%"
      padding={1}
      alignItems="center"
      overflow="hidden"
    >
      <Box height="100%" width="30%" paddingRight={1}>
        <Sidebar executionHistory={executionHistory} />
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
          <TitleText large={columns > 111 && rows > 20} />
          <TitleBox
            innerRef={stdoutRef}
            width="100%"
            height="50%"
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
              {stdout.slice(outputWindowStart, outputWindowEnd).join("\n")}
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
