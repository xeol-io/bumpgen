import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { program } from "@commander-js/extra-typings";
import { z } from "zod";

import { makeBumpgen } from "./index";
import { injectGitService } from "./services/git";

export const PredictionSchema = z.object({
  // the name of the model that generated the prediction
  modelName: z.string(),
  // the task id
  id: z.string(),
  // the git diff patch generated by the model
  patch: z.string(),
});
export type Prediction = z.infer<typeof PredictionSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  pkgManager: z.string(),
  package: z.string(),
  versionTo: z.string(),
  nodeVersion: z.string(),
  commit: z.string(),
});

export const TasksSchema = z.array(TaskSchema);

const model = "gpt-4-turbo-preview";
const language = "typescript";
const llmApiKey = process.env.LLM_API_KEY ?? undefined;
if (!llmApiKey) {
  console.error("error: required env var LLM_API_KEY not set");
  process.exit(1);
}

const getTasks = (filePath: string) => {
  if (!existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const file = JSON.parse(readFileSync(filePath, "utf8"));
  const tasks = TasksSchema.parse(file);
  return tasks;
};

const tmpDir = "/tmp/workspace";

const cwd = process.cwd();
const tasksPath = `${cwd}/tasks.json`;
const tasks = getTasks(tasksPath);

const execCmd = async (cmd: string) => {
  return await new Promise<string>((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        reject(new Error(`Failed to execute command '${cmd}'`));
      }
      if (stderr) {
        console.error(stderr);
      }
      resolve(stdout);
    });
  });
};

const git = injectGitService(tmpDir);

program
  .name("eval")
  .argument("<taskNumber>", "name of the package to bump", parseInt)
  .action(async (taskNumber) => {
    const {
      id,
      owner,
      name,
      package: pkgName,
      versionTo,
      commit,
    } = tasks[taskNumber]!;

    const logPath = `${process.cwd()}/log/${id}.json`;

    const workingDir = `${tmpDir}/${id}`;

    console.log(`working on task id ${id} in ${workingDir}`);

    const repoUrl = `https://github.com/${owner}/${name}`;
    await execCmd(`rm -rf ${workingDir}`);
    await execCmd(`mkdir -p ${workingDir}`);
    await git.clone(repoUrl, workingDir);
    await git.cwd(workingDir);
    process.chdir(workingDir);
    await git.checkout(commit);

    const bumpgen = makeBumpgen({
      llmApiKey: llmApiKey,
      model: model,
      packageToUpgrade: {
        packageName: pkgName,
        newVersion: versionTo,
      },
      language: language,
      projectRoot: process.cwd(),
    });

    try {
      await bumpgen.upgrade.apply();
    } catch (e) {
      console.log(`failed to apply upgrade and install, skipping ${id}`);
      process.exit(1);
    }

    let iterations = 0;
    let errors;
    do {
      errors = await bumpgen.build.getErrors();
      if (errors.length === 0) {
        break;
      }
      const graph = bumpgen.graph.initialize(errors);
      let iterationResult;
      do {
        iterationResult = await bumpgen.graph.plan.execute(graph);
        if (!iterationResult) {
          break;
        }
      } while (iterationResult);
      iterations += 1;
    } while (errors.length > 0 && iterations < 10);

    if (iterations === 0) {
      console.log(
        `This task didn't have any errors after the pkg upgrade ${id}`,
      );
      process.exit(1);
    }

    const errorsAfter = await bumpgen.build.getErrors();
    if (errorsAfter.length === 0) {
      console.log("TASK SUCCESS", id);
    }

    await execCmd(`git diff > ${workingDir}/patch.diff`);
    const patch = readFileSync(`${workingDir}/patch.diff`, "utf8");
    const prediction = {
      modelName: "bumgen",
      id: id,
      patch: patch,
    };
    await saveTaskResult(logPath, prediction);
  })
  .parse();

const saveTaskResult = async (path: string, task: Prediction) => {
  const file = JSON.stringify(task, null, 2);
  await writeFile(path, file);
};
