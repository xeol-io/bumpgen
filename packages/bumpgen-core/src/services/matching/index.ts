import Fuse from "fuse.js";

const splitCode = (code: string) => code.split("\n");

const trimCode = (code: string) => code.split("\n").map((line) => line.trim());

export const formatNewCode = (firstMatchedLine: string, newCode: string) => {
  const countIndents = (line: string) => {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < line.length; i++) {
      if (line[i] === " " || line[i] === "\t") {
        count++;
      } else {
        break;
      }
    }
    return count;
  };

  const splitNewCode = splitCode(newCode);
  const firstNewCodeLine = splitNewCode[0];

  if (!firstNewCodeLine) return splitNewCode;

  const indentDiff = countIndents(firstMatchedLine) - countIndents(firstNewCodeLine);

  const formattedCode = splitNewCode.map((line) => {
    if (indentDiff > 0) {
      return firstMatchedLine[0]?.repeat(indentDiff) + line;
    } else if (indentDiff < 0) {
      return line.substring(-indentDiff);
    } else {
      return line;
    }
  });

  return formattedCode;
};

const getAllCombinations = (allRefIndexes: number[][]) => {
  if (allRefIndexes.length === 1 && allRefIndexes[0]) {
    return allRefIndexes[0].map(element => [element]);
  }

  const restCombinations = getAllCombinations(allRefIndexes.slice(1));
  const allCombinations: number[][] = [];

  if (allRefIndexes[0]) {
    allRefIndexes[0].forEach(element => {
      restCombinations.forEach(combination => {
        allCombinations.push([element, ...combination]);
      });
    });
  }

  return allCombinations;
};

export const findSequentialMatchedLinesIndices = (
  allRefIndexes: number[][],
): { startIndex: number; endIndex: number } => {
  const isSequential = (combination: number[]): boolean => {
    for (let i = 0; i < combination.length - 1; i++) {
      const current = combination[i];
      const next = combination[i + 1];
  
      if (current === undefined || next === undefined) {
        continue;
      }
  
      if (next !== current + 1 && current !== -1 && next !== -1) {
        return false;
      }
    }
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

export const splitMultiImportOldCode = (code: string): string[] => {
  const regexes = [
    /import\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=\s*require\(['"]([^'"]+)['"]\)(\.[a-zA-Z_$][0-9a-zA-Z_$]*)?\s*(;|\n|$)/g,
    /import\s+(['"]([^'"]+)['"]|[\s\S]+?from\s+['"]([^'"]+)['"])\s*(;|\n|$)/g,
    /const\s+[a-zA-Z_$][0-9a-zA-Z_$]*\s*=\s*(await\s+)?(require\(['"][^'"]+['"]\)|import\(['"][^'"]+['"]\))\s*(;|\n|$)/g,
  ];

  const imports: string[] = [];
  let codeWithoutImports = code.trim();

  console.log("=== multi import split");
  for (const regex of regexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(codeWithoutImports)) !== null) {
      imports.push(match[0].trim());
      console.log("line:", match[0]);
    }
    codeWithoutImports = codeWithoutImports.replace(regex, "").trim();
  }
  console.log("===");

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
        // this addresses a fuse.js bug where high threshold matches are still returned
        (item) => item.score !== undefined && item.score <= threshold * 1.5,
      )
      .map((item) => item.refIndex);

    if (line === "") matchedLines.push(-1);

    allMatchedLines.push(matchedLines);
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

  const formattedNewCode = formatNewCode(firstMatchedLine, newCode);

  console.log("=== replacing with this new code")
  console.log(formattedNewCode.join("\n"));
  console.log("=== \n");

  const updatedContents = [
    ...splitContent.slice(0, startIndex),
    ...formattedNewCode,
    ...splitContent.slice(endIndex + 1)
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
          content = searchAndReplace(content, oldCode, newCode);
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
