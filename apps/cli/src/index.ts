import { Option, program } from "@commander-js/extra-typings";

import {
  makeBumpgen,
  SupportedLanguages,
  SupportedModels,
} from "@repo/bumpgen-core";

program
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
  .hook("preAction", () => {
    console.log(`
    ███     ▄   █▀▄▀█ █ ▄▄    ▄▀  ▄███▄      ▄
    █  █     █  █ █ █ █   █ ▄▀    █▀   ▀      █
    █ ▀ ▄ █   █ █ ▄ █ █▀▀▀  █ ▀▄  ██▄▄    ██   █
    █  ▄▀ █   █ █   █ █     █   █ █▄   ▄▀ █ █  █
    ███   █▄ ▄█    █   █     ███  ▀███▀   █  █ █
           ▀▀▀    ▀     ▀                 █   ██
    `);
  })
  .action(async (pkg, version, options) => {
    const { language, model } = options;
    console.log(language);
    console.log(model);

    const llmApiKey = process.env.LLM_API_KEY ?? undefined;
    if (!llmApiKey) {
      console.error("error: required env var LLM_API_KEY not set");
      process.exit(1);
    }

    const bumpgen = makeBumpgen({
      llmApiKey: llmApiKey,
      model: model,
      packageToUpgrade: {
        packageName: pkg,
        newVersion: version,
      },
      language: language,
      projectRoot: process.cwd(),
    });

    await bumpgen.upgrade.apply();

    const iterations = 0;
    let errors;

    do {
      errors = await bumpgen.build.getErrors();
      const graph = bumpgen.graph.initialize(errors);

      let iterationResult;
      do {
        iterationResult = await bumpgen.graph.plan.execute(graph);
        if (!iterationResult) {
          break;
        }
        const { commitMessage, planNode, replacements } = iterationResult;
        console.log(commitMessage);
      } while (iterationResult);
    } while (errors.length > 0 && iterations < 20);
  });

program.parse();

process.on("SIGINT" || "SIGTERM" || "SIGQUIT", () => {
  console.log("\nClosing...");
  process.exit(0);
});
