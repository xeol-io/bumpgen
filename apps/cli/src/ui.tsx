import React, { useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";

import type { Bumpgen, BumpgenEvent } from "@repo/bumpgen-core";

import { Sidebar } from "./components/sidebar";
import { TitleText } from "./components/title-text";
import { useStdoutDimensions } from "./use-stdout-dimensions";

// import { MainPane } from "./panes/mainPane.js";
// import { useStdoutDimensions } from "./use-stdout-dimensions.js";

export interface ExecutionState {
  state: "working" | "fail" | "success";
  message: string;
}

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
    }
  });

  const [executionState, setExecutionState] = useState<ExecutionState[]>([]);

  const [executionHistory, setExecutionHistory] = useState<BumpgenEvent[]>([]);

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
    async function runBumpgen() {
      for await (const event of bumpgen.execute()) {
        setExecutionHistory((prev) => [...prev, event]);
        // if (event.type === "error") {
        //   pushExecutionState({
        //     state: "fail",
        //     message: event.message,
        //   });
        // }
      }
    }

    runBumpgen().catch((err) => {
      throw err;
    });
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
        width="80%"
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
              // minHeight="20%"
              flexDirection="column"
              borderStyle="single"
            ></Box>
            <Box
              width="100%"
              height="30%"
              // minHeight="10%"
              flexDirection="column"
              borderStyle="single"
            ></Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default App;
