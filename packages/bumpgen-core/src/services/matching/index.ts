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

// TODO: account for negative indent differences, very unlikely scenario
// TODO: remove empty lines at the beginning and end?
const formatNewCode = (matchedIndent: number, splitNewCode: string[]) => {
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

const splitCode = (code: string) => code.split("\n");

const trimCode = (code: string) => code.split("\n").map((line) => line.trim());

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
        const trimmedFileContents = trimCode(content);
        const trimmedOldCode = trimCode(oldCode);

        console.log("trimmedFileContents:", trimmedFileContents);
        console.log("trimmedOldCode:", trimmedOldCode);
        console.log("newCode:", newCode);

        /* 
        TODO: finetune threshold, 0 > 1 where 0 is exact match
        
        NOTE: 
        0.3 accounts for variance like different quotes, slight spelling differences.
        0.3 does not account for line reordering.
        */
        const fuseOptions = {
          includeScore: true,
          includeMatches: true,
          threshold: 0.3,
          findAllMatches: false,
        };

        // finetune tolerance where 0 is no tolerance for mismatched lines in a block.
        // We could remove this all together if we think the LLM will not return extra lines that are not comments
        const mismatchTolerance = Math.floor(trimmedOldCode.length * 0.75);

        const fuse = new Fuse(trimmedFileContents, fuseOptions);

        let startIndex = -1;
        let endIndex = -1;
        let mismatches = 0;
        let matchedIndent = 0;

        trimmedOldCode.forEach((line: string) => {
          // this only covers js comments for now and we will need to add support for other languages
          // this does not account for 2+ line js comments for now
          const isComment =
            line.startsWith("//") ||
            line.startsWith("/*") ||
            line.endsWith("*/") ||
            line.startsWith("*");

          if (startIndex === -1) {
            fuse.setCollection(trimmedFileContents);
          } else {
            fuse.setCollection(trimmedFileContents.slice(endIndex + 1));
          }

          const result = fuse.search(line);
          console.log(`Searching for line: "${line}"`);
          if (result.length > 0) {
            console.log('\x1b[32m' + `"${result[0].item}" matching line found on line ${result[0].refIndex + 1} with score ${result[0].score}\n` + '\x1b[0m');
          } else {
            console.log('\x1b[31m' + "No matching lines found \n" + '\x1b[0m');
          }

          const topResult = result[0];

          if (!isComment && topResult) {
            // const match = result[0];
            const matchIndex =
              startIndex === -1
                ? topResult.refIndex
                : endIndex + 1 + topResult.refIndex;

            const firstMatchedLine = splitCode(content)[matchIndex];

            if (firstMatchedLine === undefined) {
              throw new Error(
                "No matched line found. This should not have matched.",
              );
            }

            matchedIndent = countIndents(firstMatchedLine);

            if (startIndex === -1) {
              startIndex = matchIndex;
              endIndex = matchIndex;
            } else if (matchIndex === endIndex + 1) {
              endIndex = matchIndex;
              mismatches = 0;
            } else if (mismatches < mismatchTolerance) {
              endIndex = matchIndex;
              mismatches++;
            } else {
              console.log('\x1b[32m' + "Too many mismatches, restarting search.") + '\x1b[0m';
              startIndex = -1;
              endIndex = -1;
              mismatches = 0;
            }
          } else if (!isComment) {
            if (mismatches < mismatchTolerance) {
              mismatches++;
              endIndex++;
            } else {
              console.log(
                '\x1b[32m' +  "No match found and out of tolerance, restarting search." + '\x1b[0m',
              );
              startIndex = -1;
              endIndex = -1;
              mismatches = 0;
            }
          }
        });

        const matchedLines = splitCode(content).slice(startIndex, endIndex + 1).join('\n');

        console.log('\x1b[32m' + `Matched block starts at ${startIndex} and ends at ${endIndex}\n`);
        console.log('\x1b[33m' + "=== actual matched code block");
        console.log(matchedLines);
        console.log("=== \n" + '\x1b[0m');
      
        const indentedNewCode = formatNewCode(
          matchedIndent,
          splitCode(newCode),
        );
      
        console.log('\x1b[34m' + "=== replacing with this new code")
        console.log(indentedNewCode.join("\n"));
        console.log("=== \n" + '\x1b[0m');
        

        if (startIndex !== -1 && endIndex !== -1) {
          const updatedContents = [
            ...splitCode(content).slice(0, startIndex),
            ...indentedNewCode,
            ...splitCode(content).slice(endIndex + 1),
          ].join("\n");

          return updatedContents;
        } else {
          console.log('\x1b[32m' + 'No sufficiently similar block found.' + '\x1b[0m');
          return content;
        }
      },
    },
  };
};

export const injectMatchingService = () => {
  return createMatchingService();
};

export type MatchingService = ReturnType<typeof createMatchingService>;
