#!/usr/bin/env node
import React from "react";
import { Option, program } from "@commander-js/extra-typings";
import { select } from "@inquirer/prompts";
import { render } from "ink";
import { serializeError } from "serialize-error";

import {
  makeBumpFinder,
  makeBumpgen,
  SupportedLanguages,
  SupportedModels,
} from "@repo/bumpgen-core";

import App from "./app";

const command = program
  .name("bumpgen")
  .description("Upgrade packages with the help of AI")
  .version("0.0.1")
  .argument("[package]", "name of the package to bump")
  .argument("[version]", "upgrade to this version of the package")
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
  .option("-s, --simple", "simple mode")
  .option("-i, --ipc <port>", "run in ipc mode", parseInt)
  .parse();

const { model, language, ipc, simple } = command.opts();

let [pkg, version] = command.processedArgs;

const bumpFinder = makeBumpFinder({
  language,
  projectRoot: process.cwd(),
});

const available = await bumpFinder.list();

if (!pkg) {
  if (available.length === 0) {
    console.log("All packages are on their latest major version!");
    process.exit(0);
  }

  const choice = await select({
    message: "Select a package to upgrade (major version changes only)",
    choices: available.map((pkg, index) => {
      return {
        name: `${pkg.packageName}@${pkg.newVersion}`,
        value: index,
      };
    }),
  });

  pkg = available[choice]!.packageName;
  version = available[choice]!.newVersion;
} else {
  const choice = available.find((p) => p.packageName === pkg);

  if (!choice) {
    console.log(
      `Package ${pkg} is not currently in your project, or is already on its latest major version`,
    );
    process.exit(1);
  }

  if (!version) {
    version = choice.newVersion;
  }
}

const bumpgen = makeBumpgen({
  llmApiKey: process.env.LLM_API_KEY ?? "",
  model,
  packageToUpgrade: {
    packageName: pkg,
    newVersion: version,
  },
  language,
  projectRoot: process.cwd(),
});

if (simple) {
  for await (const event of bumpgen.execute()) {
    console.log("event", event);
  }
} else if (ipc) {
  console.log("Running in IPC mode");

  for await (const event of bumpgen.executeSerializeable()) {
    console.log("event", event);
    try {
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      };
      await fetch(`http://localhost:${ipc}/data`, options);
    } catch (error) {
      console.log("error", serializeError(error));
      process.exit(1);
    }
    if (event.type === "error") {
      process.exit(1);
    }
  }
} else {
  const app = render(
    <App model={model} language={language} pkg={pkg} version={version} />,
  );
  await app.waitUntilExit();
}
