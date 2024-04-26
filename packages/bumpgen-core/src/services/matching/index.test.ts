import fs from "fs/promises";
import path from "path";

import { 
  formatNewCode,
  searchAndReplace, 
  splitMultiImportOldCode,
} from ".";

const getFileBefore = async (filename: string) => {
  return (
    await fs.readFile(
      path.resolve(__dirname, `./__fixtures__/before/${filename}`),
    )
  ).toString();
};

const getFileAfter = async (filename: string) => {
  return (
    await fs.readFile(
      path.resolve(__dirname, `./__fixtures__/after/${filename}`),
    )
  ).toString();
};

describe("searchAndReplace", () => {
  it("searchAndReplace glob.txt", async () => {
    const fileBefore = await getFileBefore("glob.txt");
    const fileAfter = await getFileAfter("glob.txt");

    const oldCode = "import * as rawGlob from 'glob';";
    const newCode = "import { glob as rawGlob } from 'glob';";

    const result = searchAndReplace(fileBefore, oldCode, newCode);

    expect(result).toBe(fileAfter);
  });
});

describe("splitMultiImportOldCode", () => {
  it("splitMultiImportOldCode", () => {
    const oldCode =
      "import * as rawGlob from 'glob';\n\n\nconst glob = promisify(rawGlob);";

    const result = splitMultiImportOldCode(oldCode);

    expect(result).toEqual([
      "import * as rawGlob from 'glob';",
      "const glob = promisify(rawGlob);",
    ]);
  });
});

describe("formatNewCode", () => {
  it("should format replacement code correctly for missing indents", () => {
    const line = "    import * as Sentry from '@sentry/line';";
    const replace = "import * as Sentry from '@sentry/replace';";

    const result = formatNewCode(line, replace);

    expect(result).toEqual(["    import * as Sentry from '@sentry/replace';"]);
  });
  it("should format replacement code correctly for extra indents", () => {
    const line = "import * as Sentry from '@sentry/line';";
    const replace = "  import * as Sentry from '@sentry/replace';";

    const result = formatNewCode(line, replace);

    expect(result).toEqual(["import * as Sentry from '@sentry/replace';"]);
  });
  it("should format replacement code correctly for tabs", () => {
    const line = "\t\timport * as Sentry from '@sentry/line';";
    const replace = "import * as Sentry from '@sentry/replace';";

    const result = formatNewCode(line, replace);

    expect(result).toEqual(["\t\timport * as Sentry from '@sentry/replace';"]);
  });
});