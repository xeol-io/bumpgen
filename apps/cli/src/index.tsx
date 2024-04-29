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
} from "@xeol/bumpgen-core";

import App from "./App";

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
  .option(
    "-t, --token <token>",
    "LLM token (can also be set via the LLM_API_KEY environment variable)",
  )
  .option(
    "-p, --port <port>",
    "port to run the IPC server on (default: 3000)",
    (val) => parseInt(val),
    3000,
  )
  .option("-s, --simple", "simple mode")
  .option("-i, --ipc", "run in ipc mode")
  .parse();

const { model, language, port, ipc, simple, token } = command.opts();

let [pkg, version] = command.processedArgs;

if (isNaN(port)) {
  console.log("Port must be a number");
  process.exit(1);
}

const resolvedToken = token ?? process.env.LLM_API_KEY;

if (!resolvedToken) {
  console.log(
    "LLM token must be provided (either via --token or the LLM_API_KEY environment variable)",
  );
  process.exit(1);
}

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
  llmApiKey: resolvedToken,
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
      await fetch(`http://localhost:${port}/data`, options);
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
    <App
      model={model}
      language={language}
      pkg={pkg}
      version={version}
      token={token}
      port={port}
    />,
  );
  await app.waitUntilExit();
}
