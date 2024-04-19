import React, { useEffect, useState } from "react";
import spinners from "cli-spinners";
import { Box, Text } from "ink";
import { Task, TaskList } from "ink-task-list";
import ms from "ms";

import type { SerializeableBumpgenEvent } from "@repo/bumpgen-core";

import type { ExecutionState } from "../ui";
import { Bold } from "../common/bold";

// interface SidebarProps {
//   executionState: ExecutionState[];
// }

const renderExecutionHistory = (
  executionHistory: SerializeableBumpgenEvent[],
) => {
  const seenIds = new Set<string>();

  // If we have received multiple events for the same ID, we only care about the most recent
  const filtered = executionHistory
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

  // for (const event of executionHistory) {
  //   if ("id" in event && event.id) {
  //     if (seenIds.has(event.id)) {
  //       continue;
  //     }

  //     seenIds.add(event.id);
  //   }
  // }

  return (
    <TaskList>
      {filtered.map((event, index) => {
        if (event.type === "error") {
          return (
            <Task
              key={index}
              state="error"
              label="Error"
              status={event.data.message}
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
              status={
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
                spinner={spinners.dots}
                label="Installing package"
              />
            );
          }
          return (
            <Task
              key={index}
              state="success"
              label="Installed"
              status={`${event.data.packageName}@${event.data.newVersion}`}
            />
          );
        } else if (event.type === "build.getErrors") {
          if (event.status === "started") {
            return (
              <Task
                key={index}
                state="loading"
                spinner={spinners.dots}
                label="Building project"
              />
            );
          }
          return (
            <Task
              key={index}
              state="success"
              label="Build complete"
              status={`${event.data.length} error(s) to fix`}
            />
          );
        } else if (event.type === "graph.initialize") {
          if (event.status === "started") {
            return (
              <Task
                key={index}
                state="loading"
                spinner={spinners.dots}
                label="Initializing AST graph"
              />
            );
          }
          return (
            <Task
              key={index}
              state="success"
              label="AST initialized"
              status={`${event.data.dependency.nodes.length} nodes`}
            />
          );
        } else if (event.type === "graph.plan.execute") {
          if (event.status === "started") {
            return (
              <Task
                key={index}
                state="loading"
                spinner={spinners.dots}
                label="Executing plan node"
              />
            );
          }
          return (
            <Task
              key={index}
              state="success"
              label="Plan node complete"
              status={event.data.iterationResult.commitMessage}
            />
          );
        }
      })}
    </TaskList>
  );
};

export const Sidebar = ({
  executionState,
  executionHistory,
}: {
  executionState: ExecutionState[];
  executionHistory: SerializeableBumpgenEvent[];
}) => {
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

  // const renderExecutionState = (executionState: ExecutionState[]) => {
  //   return executionState.map((state, index) => {
  //     if (state.state === "working") {
  //       return (
  //         <Text key={index}>
  //           <Text color="green">
  //             <Spinner type="dots" />
  //           </Text>
  //           {state.message}
  //         </Text>
  //       );
  //     }
  //     if (state.state === "fail") {
  //       return (
  //         <Text key={index}>
  //           {logSymbols.error} {state.message}
  //         </Text>
  //       );
  //     }
  //     if (state.state === "success") {
  //       return (
  //         <Text key={index}>
  //           {logSymbols.success} {state.message}
  //         </Text>
  //       );
  //     }
  //     return null;
  //   });
  // };

  return (
    <Box
      width="30%"
      height="100%"
      borderStyle="single"
      flexDirection="column"
      overflow="hidden"
    >
      <Box
        padding={1}
        flexDirection="column"
        // height={10}
        minHeight={5}
        flexShrink={0}
      >
        <Bold>State</Bold>
        <Text>Current Time: {currentTime.toLocaleTimeString()}</Text>
        <Text>Elapsed Time: {getElapsedTime()}</Text>
        <Text>Timeout: 10m</Text>
        <Bold>Execution</Bold>
        {/* {renderExecutionState(executionState)} */}
        {renderExecutionHistory(executionHistory)}
      </Box>
      <Box height={17} />
    </Box>
  );
};
