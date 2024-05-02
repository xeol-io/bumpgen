import fs from "fs/promises";
import path from "path";

import { 
  findMatchedBlockIndices,
  formatNewCode,
  advancedSearchAndReplace, 
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

describe("advancedSearchAndReplace", () => {
  it("searchAndReplace glob.txt", async () => {
    const fileBefore = await getFileBefore("glob.txt");
    const fileAfter = await getFileAfter("glob.txt");

    const oldCode = "import * as rawGlob from 'glob'";
    const newCode = "import { glob as rawGlob } from 'glob';";

    const result = advancedSearchAndReplace(fileBefore, oldCode, newCode);
    expect(result).toBe(fileAfter);
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

describe("findMatchedBlockIndices", () => {
  it("should find the right indices for the block of code to replace", () => {
    const matchedIndices = [
      [1, 5, 6],
      [2, 9, 16],
      [0, 3],
    ];

    const result = findMatchedBlockIndices(matchedIndices);

    expect(result).toEqual({"startIndex": 1, "endIndex": 3});
  });

  it("should return -1 indices if no matching block found", () => {
    const matchedIndices = [
      [1, 5, 6],
      [3, 9, 16],
      [0, 3],
    ];

    const result = findMatchedBlockIndices(matchedIndices);

    expect(result).toEqual({"startIndex": -1, "endIndex": -1});
  });

  it("should handle empty lists edge case", () => {
    const matchedIndices = [
      [1, 7],
      [],
      [2, 3, 4],
    ];

    const result = findMatchedBlockIndices(matchedIndices);

    expect(result).toEqual({"startIndex": -1, "endIndex": -1});
  });

  it("should handle only one single line", () => {
    const matchedIndices = [
      [1, 7]
    ];

    const result = findMatchedBlockIndices(matchedIndices);

    expect(result).toEqual({"startIndex": 1, "endIndex": 1});
  });

  it("should handle no matched indices", () => {
    const matchedIndices = [
      []
    ];

    const result = findMatchedBlockIndices(matchedIndices);

    expect(result).toEqual({"startIndex": -1, "endIndex": -1});
  });
});