import Fuse from "fuse.js";

const splitCode = (code: string) => code.split("\n");

const trimCode = (code: string) => code.split("\n").map((line) => line.trim());

export const formatNewCode = (firstMatchedLine: string, newCode: string) => {
  const countIndents = (line: string) => {
    let count = 0;
    for (const char of line) {
      if (char === " " || char === "\t") count++;
      else break;
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

export const findMatchedBlockIndices = (allRefIndexes: number[][]) => {
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

  const isSequential = (combination: number[]): boolean => {
    if (combination.length === 1) return true;

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

  const allCombinations = getAllCombinations(allRefIndexes);
  console.log(allCombinations);

  let indices = { startIndex: -1, endIndex: -1 };

  for (const combination of allCombinations) {
    if (isSequential(combination)) {
      const startIndex = combination[0];
      const endIndex = combination[combination.length - 1];

      if (combination.length > 0 && startIndex && endIndex) {
        indices = { startIndex: startIndex, endIndex: endIndex };
        break;
      }
  }};

  return indices;
};

export const advancedSearchAndReplace = (
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

  const { startIndex, endIndex } = findMatchedBlockIndices(allMatchedLines);

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

  const firstMatchedLine = splitContent[startIndex];
  if (firstMatchedLine === undefined) {
    console.log("This is a big oopsy");
    return content;
  }
  
  // format the replacing code accordingly then search n replace
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

const naiveSearchAndReplace = (
  content: string,
  oldCode: string,
  newCode: string,
): string => {
  console.log("naive replacement done");
  return content.replace(oldCode.trim(), newCode);
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
        if (content.includes(oldCode)) {
          return naiveSearchAndReplace(content, oldCode, newCode);
        } else {
          return advancedSearchAndReplace(content, oldCode, newCode);
        }
  
      },
    },
  };
};

export const injectMatchingService = () => {
  return createMatchingService();
};

export type MatchingService = ReturnType<typeof createMatchingService>;
