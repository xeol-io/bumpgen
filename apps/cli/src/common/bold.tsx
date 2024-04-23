import type { TextProps } from "ink";
import type { PropsWithChildren } from "react";
import React from "react";
import { Text } from "ink";

export type BoldProps = TextProps;

export function Bold({ children, ...props }: PropsWithChildren<BoldProps>) {
  return (
    <Text bold color="redBright" {...props}>
      {children}
    </Text>
  );
}
