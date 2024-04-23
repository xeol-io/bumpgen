import type { SimpleGit, SimpleGitOptions } from "simple-git";
import { simpleGit } from "simple-git";

export const createGitService = (git: SimpleGit) => {
  return git;
};

export const injectGitService = (basePath: string) => {
  const options: Partial<SimpleGitOptions> = {
    baseDir: basePath,
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  const git = simpleGit(options);

  return createGitService(git);
};

export type GitService = ReturnType<typeof createGitService>;
