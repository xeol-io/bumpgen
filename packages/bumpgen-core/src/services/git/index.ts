import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

import type { SubprocessService } from "../subprocess";
import { injectSubprocessService } from "../subprocess";

export const createGitService = (
  git: SimpleGit,
  subprocess: SubprocessService,
) => {
  return {
    raw: git,
    getMainBranch: async (cwd: string) => {
      await git.cwd(cwd);
      const mainBranch = (
        await subprocess.exec(
          "git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
          {
            cwd,
          },
        )
      ).trim();

      if (!mainBranch) {
        return null;
      }

      return mainBranch;
    },
  };
};

export const injectGitService = () => {
  const options = {
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  const git = simpleGit(options);

  const subprocess = injectSubprocessService();

  return createGitService(git, subprocess);
};

export type GitService = ReturnType<typeof createGitService>;
