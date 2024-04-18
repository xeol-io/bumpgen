#!/usr/bin/env node
import React from "react";
import { Option, program } from "@commander-js/extra-typings";
import { Box, render, Text } from "ink";

import {
  makeBumpgen,
  SupportedLanguages,
  SupportedModels,
} from "@repo/bumpgen-core";

import App from "./ui";

// let app: ReturnType<typeof render> | undefined;

const command = program
  .name("bumpgen")
  .description("Upgrade packages with the help of AI")
  .version("0.0.1")
  .argument("<package>", "name of the package to bump")
  .argument("<version>", "upgrade to this version of the package")
  .addOption(
    new Option("-l, --language <language>", "the language of the project")
      .choices(SupportedLanguages)
      .default("typescript" as const),
  )
  .addOption(
    new Option("-m, --model <model>", "the model to use for the upgrade")
      .choices(SupportedModels)
      .default("gpt-4-turbo-preview" as const),
  )
  .parse();

const { model, language } = command.opts();

const [pkg, version] = command.processedArgs;

const bumpgen = makeBumpgen({
  llmApiKey: "foo",
  model,
  packageToUpgrade: {
    packageName: pkg,
    newVersion: version,
  },
  language,
  projectRoot: process.cwd(),
});

const app = render(<App bumpgen={bumpgen} />);

// const foo = program.opts();

// const options = program.opts() as {
//   language: string;
//   model: string;
// };
// const args = program.args;

// if (!args[0]) {
//   console.error("error: missing required argument `package`");
//   program.help();
// }

// if (!args[1]) {
//   console.error("error: missing required argument `version`");
//   program.help();
// }

// if (!options.language) {
//   console.error("error: missing required option `--language`");
//   program.help();
// }

// if (!options.model) {
//   console.error("error: missing required option `--model`");
//   program.help();
// }

// const llmApiKey = process.env["LLM_API_KEY"] ?? undefined;
// if (!llmApiKey) {
//   console.error("error: missing required environment variable `LLM_API_KEY`");
//   program.help();
// }

// const app = render(
//   <App
//     llmApiKey={llmApiKey}
//     pkgName={args[0]}
//     version={args[1]}
//     language={options.language}
//     model={options.model}
//   />,
// );

await app.waitUntilExit();
// await app.waitUntilExit();
