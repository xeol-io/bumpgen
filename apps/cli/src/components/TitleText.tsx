import type { BoxProps, DOMElement } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { Box, measureElement, Text } from "ink";
import BigText from "ink-big-text";

import { useStdoutDimensions } from "../use-stdout-dimensions";

export const TitleText = (
  props: Omit<BoxProps, "flexDirection" | "alignItems" | "justifyContent"> & {
    title: string;
  },
) => {
  const titleBoxRef = useRef<DOMElement>(null);
  const [columns, rows] = useStdoutDimensions();

  const [titleDimensions, setTitleDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!titleBoxRef.current) {
      return;
    }

    setTitleDimensions(measureElement(titleBoxRef.current));
  }, [columns, rows]);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      {...props}
      ref={titleBoxRef}
    >
      {titleDimensions.height > 5 && titleDimensions.width > 40 ? (
        <BigText text={props.title} font="tiny" space={false} />
      ) : (
        <Text>{props.title.toUpperCase().split("").join(" ")}</Text>
      )}
    </Box>
  );
};
