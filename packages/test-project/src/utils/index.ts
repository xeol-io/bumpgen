import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const useQueryFn = () => {
  useQuery({
    queryKey: ["key"],
    queryFn: () => {
      return "data";
    },
  });
};

export class NodeRelations {
  protected hasCycle = false;

  constructor(hasCycle: boolean) {
    this.hasCycle = hasCycle;
  }

  addEdge() {
    console.log("edge");
    z.string();
    return "";
  }
}

export const date = () =>
  z.string().transform((v) => {
    const date = v.replace(/(\\d+)(st|nd|rd|th)/, "$1");
    return isNaN(new Date(date).getTime()) ? undefined : new Date(date);
  });

export function myFunction(text: string) {
  z.string();
  console.log(text);
  return text;
}
