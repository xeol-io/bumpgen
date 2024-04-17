import React from "react";
import { Text } from "ink";

import { Pane } from "./Pane.js";
import { PaneContent } from "./PaneContent.js";

export const OutputPane = () => {
  // const { dispatch } = useMode();
  // const [selectedDemoIdx] = useScrollableList(0, demos, Array.isArray(demos));
  // const selectedDemo = Array.isArray(demos)
  // ? demos[selectedDemoIdx]
  // : undefined;

  // const handleSelect = useCallback(
  //   (chosenOption, languageIdx) => {
  //     if (chosenOption === DemoEntryOptions.DOWNLOAD) {
  //       dispatch({
  //         type: ModeEvents.showInstaller,
  //         data: {
  //           ...selectedDemo,
  //           ...selectedDemo?.options[languageIdx],
  //         },
  //       } as ShowInstallerEvent);
  //     } else if (chosenOption === DemoEntryOptions.LEARN_MORE) {
  //       openBrowserUrl(selectedDemo?.codeexchange_link);
  //     } else if (chosenOption === DemoEntryOptions.VIEW_CODE) {
  //       if (selectedDemo?.options[languageIdx]) {
  //         openBrowserUrl(
  //           selectedDemo.options[languageIdx].repo_link ||
  //             selectedDemo.options[languageIdx].functions_link,
  //         );
  //       }
  //     } else if (chosenOption === DemoEntryOptions.QUICK_DEPLOY) {
  //       openBrowserUrl(selectedDemo?.quick_deploy_link);
  //     }
  //   },
  //   [selectedDemo],
  // );

  return (
    <>
      <Text>instructions here</Text>
      {/* <OutputList /> */}
      {/* {selectedDemo && ( */}
      {/* <InteractiveDemoEntry demo={selectedDemo} onSelect={handleSelect} /> */}
      {/* )} */}
    </>
  );
};

export const MainPane = () => {
  // const {
  //   demos,
  //   loading,
  //   error,
  // }: { demos?: Demo[]; loading: boolean; error?: Error } = useDemos();

  // const sortedDemos = useMemo(
  //   (): Demo[] | undefined =>
  //     demos?.sort((a: Demo, b: Demo) => a.name.localeCompare(b.name)),
  //   [demos],
  // );

  return (
    <Pane>
      <PaneContent>
        {/* <Bold>Explore what's possible with Twilio</Bold> */}
        {/* {loading && <LoadingIndicator text="Loading demos..." />} */}
        {/* {error && <Text>{error?.message}</Text>} */}
        {/* {!loading && sortedDemos && <DemoSelection demos={sortedDemos} />} */}
        <OutputPane />
        <Text>TODO</Text>
      </PaneContent>
    </Pane>
  );
};
