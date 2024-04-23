import React from "react";
import { Box, Text } from "ink";
import BigText from "ink-big-text";

export const TitleText = ({ large }: { large: boolean }) => (
  /*
todo: is there a better way to make this adaptive to the available space? (rather than the parent deciding whether it's in 'large' or 'small' mode)
*/
  <Box
    height={"30%"}
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
  >
    {large ? (
      <BigText text="bumpgen" font="tiny" space={false} />
    ) : (
      <Text>B U M P G E N</Text>
    )}
  </Box>
);
