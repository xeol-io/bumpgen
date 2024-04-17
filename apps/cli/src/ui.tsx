import type { FC } from "react";
import React, { useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";

import { Sidebar } from "./components/sidebar.js";

// import { MainPane } from "./panes/mainPane.js";
// import { useStdoutDimensions } from "./use-stdout-dimensions.js";

export interface ExecutionState {
  state: "working" | "fail" | "success";
  message: string;
}

const App: FC<{
  llmApiKey: string;
  pkgName: string;
  version: string;
  model: string;
  language: string;
}> = ({ llmApiKey, pkgName, version, model, language }) => {
  const { exit } = useApp();
  console.log(pkgName);
  console.log(version);
  console.log(model);
  console.log(language);
  console.log(llmApiKey);

  // const [columns, _] = useStdoutDimensions();

  useInput((input, key) => {
    console.log(input, key);
    if (key.escape) {
      exit();
    }
  });

  const [executionState, setExecutionState] = useState<ExecutionState[]>([]);
  const updateExecutionState = (newState: ExecutionState) => {
    setExecutionState((prevState) => [...prevState, newState]);
  };

  useEffect(() => {
    updateExecutionState({
      state: "working",
      message: "Installing packages...",
    });
  }, []);

  return (
    <Box
      flexDirection="column"
      height={process.stdout.rows}
      width={70}
      padding={1}
    >
      {/* <TitleText large={columns > 45 && rows > 20} /> */}

      <Box flexDirection="row" width="100%" height="80%">
        <Sidebar executionState={executionState} />
        {/* <MainPane /> */}
      </Box>
    </Box>
  );
};

export default App;
