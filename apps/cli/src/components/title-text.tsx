import React from "react";
import { Text } from "ink";
import BigText from "ink-big-text";

// import { GameColors } from "../game-colors.js";

export const TitleText = ({ large }: { large: boolean }) =>
  /*
todo: is there a better way to make this adaptive to the available space? (rather than the parent deciding whether it's in 'large' or 'small' mode)
*/
  large ? (
    <BigText
      // colors={colors.largeTitle}
      // align="center"

      text="bumpgen"
      font="tiny"
      space={false}
    />
  ) : (
    <Text>B U M P G E N</Text>
  );
