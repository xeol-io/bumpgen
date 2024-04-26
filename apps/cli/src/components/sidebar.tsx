import type { BoxProps, DOMElement } from "ink";
import React, { useEffect, useRef, useState } from "react";
import spinners from "cli-spinners";
import { Box, measureElement, Text } from "ink";
import ms from "ms";

import type { SerializeableBumpgenEvent } from "@repo/bumpgen-core";

import { Bold } from "../common/bold";
import { useStdoutDimensions } from "../use-stdout-dimensions";
import { Task } from "./task-list";

const ExecutionHistory = (props: {
  executionHistory: SerializeableBumpgenEvent[];
}) => {
  const seenIds = new Set<string>();

  // If we have received multiple events for the same ID, we only care about the most recent
  const filtered = props.executionHistory
    .toReversed()
    .filter((event) => {
      if ("id" in event && event.id) {
        if (seenIds.has(event.id)) {
          return false;
        }

        seenIds.add(event.id);
      }

      return true;
    })
    .reverse();

  const historyBoxRef = useRef<DOMElement>(null);
  const [columns, rows] = useStdoutDimensions();

  const [historyDimensions, setHistoryDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!historyBoxRef.current) {
      return;
    }

    setHistoryDimensions(measureElement(historyBoxRef.current));
  }, [columns, rows]);

  return (
    <Box ref={historyBoxRef} height="100%" flexDirection="column" padding={1}>
      <Bold>Execution</Bold>
      {filtered
        .map((event, index) => {
          if (event.type === "error") {
            return (
              <Task
                key={index}
                state="error"
                label="Error"
                output={event.data.message}
              />
            );
          } else if (event.type === "complete") {
            return <Task key={index} state="success" label="Complete" />;
          } else if (event.type === "failed") {
            return (
              <Task
                key={index}
                state="error"
                label="Failed"
                output={
                  event.data.reason === "timeout" ? "Timeout" : "Max iterations"
                }
              />
            );
          } else if (event.type === "upgrade.apply") {
            if (event.status === "started") {
              return (
                <Task
                  key={index}
                  state="loading"
                  spinner={{ frames: spinners.dots.frames, interval: 160 }}
                  label="Installing package"
                />
              );
            }
            return (
              <Task
                key={index}
                state="success"
                label="Installed"
                output={`${event.data.packageName}@${event.data.newVersion}`}
              />
            );
          } else if (event.type === "build.getErrors") {
            if (event.status === "started") {
              return (
                <Task
                  key={index}
                  state="loading"
                  spinner={{ frames: spinners.dots.frames, interval: 160 }}
                  label="Building project"
                />
              );
            }
            return (
              <Task
                key={index}
                state="success"
                label="Build complete"
                output={`${event.data.length} error(s) to fix`}
              />
            );
          } else if (event.type === "graph.initialize") {
            if (event.status === "started") {
              return (
                <Task
                  key={index}
                  state="loading"
                  spinner={{ frames: spinners.dots.frames, interval: 160 }}
                  label="Initializing AST graph"
                />
              );
            }
            return (
              <Task
                key={index}
                state="success"
                label="AST initialized"
                output={`${event.data.dependency.nodes.length} nodes`}
              />
            );
          } else if (event.type === "graph.plan.execute") {
            if (event.status === "started") {
              return (
                <Task
                  key={index}
                  state="loading"
                  spinner={{ frames: spinners.dots.frames, interval: 160 }}
                  label="Executing plan node"
                />
              );
            }
            return (
              <Task
                key={index}
                state="success"
                label="Plan node complete"
                output={event.data.iterationResult.commitMessage}
              />
            );
          }
        })
        .slice(
          Math.max(
            filtered.length - Math.floor(historyDimensions.height / 2) + 2,
            0,
          ),
          filtered.length,
        )}
    </Box>
  );
};

export const Sidebar = (
  props: Omit<
    BoxProps,
    "height" | "borderStyle" | "flexDirection" | "overflow"
  > & {
    executionHistory: SerializeableBumpgenEvent[];
  },
) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const startTime = React.useRef(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, ms("1s"));

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const getElapsedTime = () => {
    const now = new Date();
    const elapsedTime = +now - +startTime.current;
    const seconds = Math.floor((elapsedTime / 1000) % 60);
    const minutes = Math.floor((elapsedTime / 1000 / 60) % 60);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Box
      height="100%"
      width={props.width}
      borderStyle="double"
      flexDirection="column"
      overflow="hidden"
      {...props}
    >
      <Box padding={1} flexDirection="column" minHeight={5} flexShrink={0}>
        <Bold>State</Bold>
        <Text>Current Time: {currentTime.toLocaleTimeString()}</Text>
        <Text>Elapsed Time: {getElapsedTime()}</Text>
        <Text>Timeout: 10m</Text>
      </Box>
      <ExecutionHistory
        executionHistory={props.executionHistory}
      ></ExecutionHistory>
    </Box>
  );
};
