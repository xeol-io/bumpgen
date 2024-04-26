import Fuse from "fuse.js";

// TODO: account for tabbing as well
const countIndents = (line: string) => {
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") {
      count++;
    } else {
      break;
    }
  }
  return count;
};

const splitCode = (code: string) => code.split("\n");

const trimCode = (code: string) => code.split("\n").map((line) => line.trim());

// TODO: account for negative indent differences, very unlikely scenario
// TODO: remove empty lines at the beginning and end?
const formatNewCode = (matchedIndent: number, newCode: string) => {
  const splitNewCode = splitCode(newCode);
  const firstLine = splitNewCode[0];

  if (!firstLine) {
    return [];
  }

  const indentDiff = matchedIndent - countIndents(firstLine);

  const adjustedCode = splitNewCode.map((line) => {
    if (indentDiff > 0) {
      return " ".repeat(indentDiff) + line;
    } else {
      return line;
    }
  });

  return adjustedCode;
};

const findSequentialMatchedLinesIndices = (
  allRefIndexes: number[][],
): { startIndex: number; endIndex: number } => {
  const isSequential = (combination: number[]): boolean => {
    combination.forEach((current, index, array) => {
      if (index < array.length - 1 && array[index + 1] !== current + 1) {
        return false;
      }
    });
    return true;
  };

  // recursion black magic
  const getAllCombinations = (
    currentIndex: number,
    currentCombination: number[],
    bestCombination: { startIndex: number; endIndex: number },
  ): { startIndex: number; endIndex: number } => {
    const indexList = allRefIndexes[currentIndex];
    const firstIndex = currentCombination[0];
    const lastIndex = currentCombination[currentCombination.length - 1];

    if (currentIndex === allRefIndexes.length) {
      if (
        isSequential(currentCombination) &&
        firstIndex &&
        lastIndex &&
        currentCombination.length > 0 &&
        currentCombination.length >
          bestCombination.endIndex - bestCombination.startIndex + 1
      ) {
        return { startIndex: firstIndex, endIndex: lastIndex };
      }
      return bestCombination;
    }

    let updatedBestCombination = bestCombination;

    indexList &&
      indexList.forEach((element) => {
        if (
          currentCombination.length === 0 ||
          (lastIndex && element === lastIndex + 1)
        ) {
          currentCombination.push(element);
          updatedBestCombination = getAllCombinations(
            currentIndex + 1,
            currentCombination,
            updatedBestCombination,
          );
          currentCombination.pop();
        }
      });

    return updatedBestCombination;
  };

  if (
    allRefIndexes.length === 1 &&
    allRefIndexes[0] &&
    allRefIndexes[0].length > 0 &&
    allRefIndexes[0][0]
  ) {
    return { startIndex: allRefIndexes[0][0], endIndex: allRefIndexes[0][0] };
  }

  return getAllCombinations(0, [], { startIndex: -1, endIndex: -1 });
};

const splitMultiImportOldCode = (code: string): string[] => {
  const regexes = [
    /import\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=\s*require\(['"]([^'"]+)['"]\)(\.[a-zA-Z_$][0-9a-zA-Z_$]*)?\s*(;|\n|$)/g,
    /import\s+(['"]([^'"]+)['"]|[\s\S]+?from\s+['"]([^'"]+)['"])\s*(;|\n|$)/g,
    /const\s+[a-zA-Z_$][0-9a-zA-Z_$]*\s*=\s*(await\s+)?(require\(['"][^'"]+['"]\)|import\(['"][^'"]+['"]\))\s*(;|\n|$)/g,
  ];

  const imports: string[] = [];
  let codeWithoutImports = code.trim();

  for (const regex of regexes) {
    console.log("=== multi import split");

    let match: RegExpExecArray | null;
    while ((match = regex.exec(codeWithoutImports)) !== null) {
      imports.push(match[0]);
      console.log(match[0]);
    }
    codeWithoutImports = codeWithoutImports.replace(regex, "").trim();
    console.log("===");
  }

  const remainingCodeSections: string[] = [];

  if (codeWithoutImports.length > 0) {
    remainingCodeSections.push(codeWithoutImports);
  }

  return [...imports, ...remainingCodeSections];
};

export const searchAndReplace = (
  content: string,
  oldCode: string,
  newCode: string,
) => {
  const splitContent = splitCode(content);
  const allMatchedLines: number[][] = [];
  const threshold = 0.2;

  const fuse = new Fuse(trimCode(content), {
    threshold: threshold,
    ignoreLocation: true,
    includeScore: true,
    includeMatches: true,
    findAllMatches: true,
    isCaseSensitive: true,
    shouldSort: true,
  });

  // find all possible matched lines then find the sequential hits
  trimCode(oldCode).forEach((line) => {
    const result = fuse.search(line);
    console.log(result);

    const matchedLines = result
      .filter(
        (item) => item.score !== undefined && item.score <= threshold * 1.5,
      )
      .map((item) => item.refIndex);

    if (matchedLines.length > 0) {
      allMatchedLines.push(matchedLines);
    }
  });

  const { startIndex, endIndex } =
    findSequentialMatchedLinesIndices(allMatchedLines);

  console.log(`Looking for this code:`);
  console.log("=====");
  console.log(oldCode);
  console.log("=====");
  console.log(`In this file:`);
  console.log("=====");
  console.log(content);
  console.log("=====");
  console.log(`And found the following:`);
  console.log("=====");
  console.log("Matched indexes:", allMatchedLines);
  if (startIndex === -1 && endIndex === -1) {
    console.log("ERROR: No matching block found");
    return content;
  }
  console.log("=====");

  const matchedLines = splitContent.slice(startIndex, endIndex + 1).join("\n");

  console.log(
    `Matched block starts at ${startIndex} and ends at ${endIndex}\n`,
  );
  console.log("=== actual matched code block");
  console.log(matchedLines);
  console.log("=== \n");

  // format the replacing code accordingly then search n replace
  const firstMatchedLine = splitContent[startIndex];
  if (firstMatchedLine === undefined) {
    console.log("This is a big oopsy");
    return content;
  }

  const indentedNewCode = formatNewCode(
    countIndents(firstMatchedLine),
    newCode,
  );

  console.log("=== replacing with this new code");
  console.log(indentedNewCode.join("\n"));
  console.log("=== \n");

  const updatedContents = [
    ...splitContent.slice(0, startIndex),
    ...indentedNewCode,
    ...splitContent.slice(endIndex + 1),
  ].join("\n");

  return updatedContents;
};

export const createMatchingService = () => {
  return {
    replacements: {
      fuzzy: ({
        content,
        oldCode,
        newCode,
      }: {
        content: string;
        oldCode: string;
        newCode: string;
      }) => {
        const multiImportOldCode = splitMultiImportOldCode(oldCode);

        if (multiImportOldCode.length > 1) {
          multiImportOldCode.forEach((line: string) => {
            content = searchAndReplace(content, line, newCode);
          });
        } else {
          content = searchAndReplace(content, content, newCode);
        }

        return content;
      },
    },
  };
};

export const injectMatchingService = () => {
  return createMatchingService();
};

export type MatchingService = ReturnType<typeof createMatchingService>;
