import fs from "fs/promises";
import path from "path";

import { searchAndReplace } from ".";

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

describe("matching", () => {
  it("searchAndReplace glob.txt", async () => {
    const fileBefore = await getFileBefore("glob.txt");
    const fileAfter = await getFileAfter("glob.txt");

    const oldCode = "import * as rawGlob from 'glob';";
    const newCode = "import { glob as rawGlob } from 'glob';";

    const result = searchAndReplace(fileBefore, oldCode, newCode);

    expect(result).toBe(fileAfter);
  });
});
