import type { ReactElement } from "react";
import React from "react";
import { Box, Text } from "ink";

import type { Spinner } from "./TaskSpinner";
import figures from "./figures";
import TaskSpinner from "./TaskSpinner";

type StateLoading = "loading";
type StateOthers = "pending" | "success" | "warning" | "error";

type State = StateLoading | StateOthers;

const getSymbol = (state: State) => {
  if (state === "warning") {
    return <Text color="yellow">{figures.warning}</Text>;
  }

  if (state === "error") {
    return <Text color="red">{figures.cross}</Text>;
  }

  if (state === "success") {
    return <Text color="green">{figures.tick}</Text>;
  }

  if (state === "pending") {
    return <Text color="gray">{figures.squareSmallFilled}</Text>;
  }

  return " ";
};

const getPointer = (state: State) => (
  <Text color={state === "error" ? "red" : "yellow"}>{figures.pointer}</Text>
);

type BaseProps = {
  label: string;
  status?: string;
  output?: string;
  isExpanded?: boolean;
  children?: ReactElement | ReactElement[];
};

const Task = (
  props: BaseProps &
    (
      | {
          state: StateOthers;
          spinner?: never;
        }
      | {
          state: StateLoading;
          spinner: Spinner;
        }
    ),
) => {
  const {
    label,
    status,
    output,
    isExpanded = false,
    // children,
    state,
    spinner,
  } = props;

  // const childrenArray = Children.toArray(children);
  // const listChildren = childrenArray.filter((node) => isValidElement(node));

  let icon =
    state === "loading" ? (
      <Text>
        <TaskSpinner spinner={spinner} />
      </Text>
    ) : (
      getSymbol(state)
    );

  if (isExpanded) {
    icon = getPointer(state);
  }

  return (
    <Box
      flexDirection="column"
      height={1 + (status ? 1 : 0) + (output ? 1 : 0)}
    >
      <Box flexShrink={0} width="100%">
        <Box marginRight={1}>
          <Text>{icon}</Text>
        </Box>
        <Text>{label}</Text>
      </Box>
      {status ? (
        <Box marginLeft={1}>
          <Text dimColor>[{status}]</Text>
        </Box>
      ) : undefined}
      {output ? (
        <Box marginLeft={2}>
          <Text
            wrap="truncate-end"
            color="gray"
          >{`${figures.arrowRight} ${output}`}</Text>
        </Box>
      ) : undefined}
      {/* {isExpanded && listChildren.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {listChildren}
        </Box>
      )} */}
    </Box>
  );
};

export default Task;
