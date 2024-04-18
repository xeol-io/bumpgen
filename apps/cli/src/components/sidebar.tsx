import React, { FC, useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import logSymbols from "log-symbols";
import ms from "ms";

import type { BumpgenEvent } from "@repo/bumpgen-core";

import type { ExecutionState } from "../ui";
import { Bold } from "../common/bold";
import { TitleText } from "./title-text";

// interface SidebarProps {
//   executionState: ExecutionState[];
// }

const renderExecutionHistory = (executionHistory: BumpgenEvent[]) => {
  return executionHistory.map((event, index) => {
    return <Text key={index}>{event.type}</Text>;
  });
};

export const Sidebar = ({
  executionState,
  executionHistory,
}: {
  executionState: ExecutionState[];
  executionHistory: BumpgenEvent[];
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

  const renderExecutionState = (executionState: ExecutionState[]) => {
    return executionState.map((state, index) => {
      if (state.state === "working") {
        return (
          <Text key={index}>
            <Text color="green">
              <Spinner type="dots" />
            </Text>
            {state.message}
          </Text>
        );
      }
      if (state.state === "fail") {
        return (
          <Text key={index}>
            {logSymbols.error} {state.message}
          </Text>
        );
      }
      if (state.state === "success") {
        return (
          <Text key={index}>
            {logSymbols.success} {state.message}
          </Text>
        );
      }
      return null;
    });
  };

  return (
    <Box width="20%" height="100%" borderStyle="single" flexDirection="column">
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
