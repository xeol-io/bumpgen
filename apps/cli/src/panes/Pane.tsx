import React, { PropsWithChildren } from "react";
import { Box, BoxProps } from "ink";

// import { Merge } from "type-fest";

// import { useBreakpointForWindow } from "../../hooks/useResize";
// import Breakpoints from "../../utils/breakpoints";
import { TitleText } from "../components/title-text.js";

// import { Headline } from "../common/Headline";

export type PaneProps = BoxProps;

export const Pane = ({ children, ...props }: PropsWithChildren<PaneProps>) => {
  // const { shouldRender, width, height } = useBreakpointForWindow(
  //   Breakpoints.SHOW_REGULAR_HEADLINE,
  // );
  // let headlineElement = null;
  // if (headline) {
  // const headlineElement = (
  //   <Box justifyContent="center">
  //     <TitleText large={true} />
  //   </Box>
  // );
  // }
  return (
    <Box flexDirection="column" flexGrow={1} {...props}>
      <Box justifyContent="center">
        <TitleText large={true} />
      </Box>
      {children}
    </Box>
  );
};

// export * from "./PaneContent";
