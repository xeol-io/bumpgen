import child from "child_process";

export const createSubprocessService = (
  childProcess: typeof child,
  proc: typeof process,
) => {
  return {
    exec: async (
      command: string,
      options: {
        rejectOnStderr?: boolean;
      },
    ) => {
      return await new Promise<string>((resolve, reject) => {
        childProcess.exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(error);
            reject(new Error(`Failed to execute command '${command}'`));
          }
          if (stderr) {
            console.error(stderr);
            if (options.rejectOnStderr) {
              reject(new Error(`Failed to execute command '${command}'`));
            }
          }
          resolve(stdout);
        });
      });
    },
    spawn: async (
      command: string,
      options?: {
        rejectOnStderr?: boolean;
        rejectOnNonZeroExit?: boolean;
        env?: Record<string, string>;
      },
    ) => {
      return await new Promise<string>((resolve, reject) => {
        const child = childProcess.spawn(command, {
          shell: true,
          env: options?.env ?? proc.env,
        });

        // Re-writes the entire buffer on each data event
        // TODO: Optimize this to only append the new data
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
          stdout += data;
        });

        child.stderr.on("data", (data) => {
          stderr += data;
        });

        child.on("close", (code) => {
          if (code !== 0 && options?.rejectOnNonZeroExit) {
            console.error(stderr);
            reject(new Error(`Failed to execute command '${command}'`));
          }
          if (stderr && options?.rejectOnStderr) {
            console.error(stderr);
            reject(new Error(`Failed to execute command '${command}'`));
          }
          resolve(stdout);
        });
      });
    },
  };
};

export const injectSubprocessService = () => {
  return createSubprocessService(child, process);
};

export type SubprocessService = ReturnType<typeof createSubprocessService>;
