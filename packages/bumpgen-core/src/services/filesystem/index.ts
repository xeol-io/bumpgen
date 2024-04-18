import cryptography from "crypto";
import filesystem, { promises as fsPromises } from "fs";
import { isObject } from "radash";

export const createFilesystemService = (
  fs: typeof filesystem,
  asyncFs: typeof fsPromises,
  crypto: typeof cryptography,
) => {
  const exists = async (path: string) => {
    try {
      await asyncFs.access(path);
      return true;
    } catch (e) {
      if (isObject(e) && "code" in e && e.code === "ENOENT") {
        return false;
      }
      return false;
    }
  };

  const fileHash = async (path: string) => {
    if (!(await exists(path))) {
      return "";
    }

    return crypto
      .createHash("sha256")
      .update(await asyncFs.readFile(path))
      .digest("hex");
  };

  return {
    exists,
    read: async (path: string) => {
      return await asyncFs.readFile(path, "utf-8");
    },
    write: async (path: string, contents: string) => {
      await asyncFs.writeFile(path, contents, "utf-8");
    },
    waitForChange: async (path: string, timeout = 60000) => {
      const startTime = Date.now();
      const initialHash = fileHash(path);
      return new Promise<void>((resolve, reject) => {
        (function waitForChange() {
          if (Date.now() - startTime >= timeout) {
            reject(new Error("Timeout waiting for file change"));
            return;
          }

          const currentHash = fileHash(path);
          if (currentHash !== initialHash) {
            resolve();
          } else {
            setTimeout(waitForChange, 500);
          }
        })();
      });
    },
  };
};

export const injectFilesystemService = () => {
  return createFilesystemService(filesystem, fsPromises, cryptography);
};

export type FilesystemService = ReturnType<typeof createFilesystemService>;
