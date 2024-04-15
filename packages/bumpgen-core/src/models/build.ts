export type BuildError = {
  path: string;
  column: number;
  line: number;
  message: string;
};
