<p align="center">
    <img src="https://github.com/xeol-io/bumpgen/assets/4740147/8abf2d07-6161-42e6-ad4e-2cc9181ad21a" alt="logo"/>
</p>

<p align="center">
    <a href="https://www.xeol.io/beta">
        <img src="https://img.shields.io/badge/Github App Sign Up-FCAE00?logo=googlechrome&logoColor=black&style=for-the-badge"/>
    </a>
    <a href="https://github.com/xeol-io/bumpgen?tab=MIT-1-ov-file">
        <img src="https://img.shields.io/badge/License-MIT-FCAE00.svg?style=for-the-badge">
    </a>
    <a href="https://github.com/xeol-io/bumpgen/stargazers">
        <img src="https://img.shields.io/github/stars/xeol-io/bumpgen?color=FCAE00&style=for-the-badge">
    </a>
    <a href="https://discord.gg/J7E9BqVHkG">
        <img src="https://img.shields.io/discord/1233126412785815613?logo=discord&label=discord&color=5865F2&style=for-the-badge"/>
    </a>
</p>

## 📝 Summary

`bumpgen` bumps your **TypeScript / TSX** dependencies and makes code changes for you if anything breaks.

![demo](<https://assets-global.website-files.com/65af8f02f12662528cdc93d6/662e6061d42954630a191417_tanstack-ezgif.com-speed%20(1).gif>)

Here's a common scenario:

> you: "I should upgrade to the latest version of x, it has banging new features and impressive performance improvements"
>
> you (5 minutes later): _nevermind, that broke a bunch of stuff_

Then use `bumpgen`!

**How does it work?**

- `bumpgen` builds your project to understand what broke when a dependency was bumped
- Then `bumpgen` uses [ts-morph](https://github.com/dsherret/ts-morph) to create an _abstract syntax tree_ from your code, to understand the relationships between statements
- It also uses the AST to get type definitions for external methods to understand how to use new package versions
- `bumpgen` then creates a _plan graph_ DAG to execute things in the correct order to handle propagating changes (ref: [arxiv 2309.12499](https://huggingface.co/papers/2309.12499))

> [!NOTE]
> `bumpgen` only supports typescript and tsx at the moment, but we're working on adding support for other strongly typed languages. Hit the emoji button on our open issues for [Java](https://github.com/xeol-io/bumpgen/issues/60), [golang](https://github.com/xeol-io/bumpgen/issues/59), [C#](https://github.com/xeol-io/bumpgen/issues/62) and [Python](https://github.com/xeol-io/bumpgen/issues/61) to request support.

## 🚀 Get Started

To get started, you'll need an OpenAI API key. `gpt-4-turbo-preview` from OpenAI is the only supported model at this time, though we plan on supporting more soon.

Then, run `bumpgen`:

```
> export LLM_API_KEY="<openai-api-key>"
> cd ~/my-repository
> npm install -g bumpgen
> bumpgen @tanstack/react-query 5.28.14
```

where `@tanstack/react-query` is the package you want to bump and `5.28.14` is the version you want to bump to.

You can also run `bumpgen` without arguments and select which package to upgrade from the menu. Use `bumpgen --help` for a complete list of options.

### Github Action

We've created a GitHub action that can be used to run bumpgen. The intended usage is to be triggered on dependabot or renovatebot PRs - if breaking changes are detected, bumpgen will commit to the PR branch.

> [!NOTE]
> The action commits changes to the branch it was triggered from. If you would like those commits to trigger other CI workflows, you will need to use a GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

#### Example Workflow

```yml
name: "Bumpgen"

on:
  pull_request:
    types:
      - opened
      - synchronize

permissions:
  pull-requests: read
  contents: write

jobs:
  main:
    name: Run Bumpgen
    runs-on: ubuntu-latest
    if: ${{ github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.commits[0].author.username != 'github-actions[bot]'}} # Use renovate[bot] for renovate PRs
    steps:
      - uses: actions/checkout@v4
      - name: Setup # Checkout and setup your project before running the bumpgen action
        uses: ./tooling/github/setup
      - name: Bumpgen
        uses: xeol-io/bumpgen@v0.0.1
        with:
          path: "./packages/bumpgen-core/" # The location of your project's package.json file
          llm_key: ${{ secrets.LLM_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

> [!NOTE]
> If you'd like to be first in line to try the `bumpgen` GitHub App to replace your usage of dependabot + renovatebot, sign up [here](https://www.xeol.io/beta).

## Limitations

There are some limitations you should know about.

- `bumpgen` relies on build errors to determine what needs to be fixed. If an issue is caused by a behavioral change, `bumpgen` won't detect it.
- `bumpgen` can't handle multiple packages at the same time. It will fail to upgrade packages that require peer dependencies to be updated the same time to work such as `@octokit/core` and `@octokit/plugin-retry`.
- `bumpgen` is not good with very large frameworks like `vue`. These kind of upgrades (and vue 2 -> 3 specifically) can be arduous even for a human.

## 🏙️ Architecture

```
 > bumpgen @tanstack/react-query 5.28.14
       │
┌┬─────▼──────────────────────────────────────────────────────────────────────┐
││ CLI                                                                        │
└┴─────┬──▲───────────────────────────────────────────────────────────────────┘
       │  │
┌┬─────▼──┴───────────────────────────────────────────────────────────────────┐
││ Core (Codeplan)                                                            │
││                                                                            │
││ ┌───────────────────────────────────┐ ┌──────────────────────────────────┐ │
││ │ Plan Graph                        │ │ Abstract Syntax Tree             │ │
││ │                                   │ │                                  │ │
││ │                                   │ │                                  │ │
││ │               ┌─┐                 │ │                  ┌─┐             │ │
││ │            ┌──┴─┘                 │ │               ┌──┴─┴──┐          │ │
││ │            │                      │ │               │       │          │ │
││ │           ┌▼┐                  ┌──┼─┼──┐           ┌▼┐     ┌▼┐         │ │
││ │           └─┴──┐               │  │ │  │        ┌──┴─┴──┐  └─┘         │ │
││ │                │                  │ │  ▼        │       │              │ │
││ │               ┌▼┐              ▲  │ │          ┌▼┐     ┌▼┐             │ │
││ │               └─┴──┐           │  │ │  │       └─┘  ┌──┴─┴──┐          │ │
││ │                    │           └──┼─┼──┘            │       │          │ │
││ │                   ┌▼┐             │ │              ┌▼┐     ┌▼┐         │ │
││ │                   └─┘             │ │              └─┘     └─┘         │ │
││ │                                   │ │                                  │ │
││ │                                   │ │                                  │ │
││ │                                   │ │                                  │ │
││ │                                   │ │                                  │ │
││ └───────────────────────────────────┘ └──────────────────────────────────┘ │
││                                                                            │
└┴─────┬──▲───────────────────────────────────────────────────────────────────┘
       │  │
┌┬─────▼──┴───────────────────────────┐  ┌┬───────────────────────────────────┐
││ Prompt Context                     │  ││ LLM                               │
││                                    │  ││                                   │
││ - plan graph                       │  ││ GPT4-Turbo, Claude 3, BYOM        │
││ - errors                           ├──►│                                   │
││ - code                             │  ││                                   │
││                                    ◄──┼│                                   │
││                                    │  ││                                   │
││                                    │  ││                                   │
││                                    │  ││                                   │
└┴────────────────────────────────────┘  └┴───────────────────────────────────┘
```

#### Abstract Syntax Tree

The AST is generated from **[ts-morph](https://github.com/dsherret/ts-morph)**. This AST allows `bumpgen` to understand the relationship between nodes in a codebase.

#### Plan Graph

The plan graph is a concept detailed in **[codeplan](https://huggingface.co/papers/2309.12499)** by Microsoft. The plan graph allows `bumpgen` to not only fix an issue at a point but also fix the 2nd order breaking changes from the fix itself. In short, it allows `bumpgen` to propagate a fix to the rest of the codebase.

#### Prompt Context

We pass the plan graph, the error, and the actual file with the breaking change as context to the LLM to maximize its ability to fix the issue.

#### LLM

We only support `gpt-4-turbo-preview` at this time.

<p align="center">
    <img src="https://s3.amazonaws.com/static.xeol.io/memes/terminator-meme.png" alt="meme"/>
</p>

## ⏱️ Benchmark

```
bumpgen + GPT-4 Turbo         ██████████░░░░░░░░░░░   45% (67 tasks)
```

We benchmarked `bumpgen` with GPT-4 Turbo against a [suite](https://github.com/xeol-io/swe-bump-bench) of version bumps with breaking changes. You can check out the evals [here](https://github.com/xeol-io/swe-bump-bench/tree/main/evals/bumpgen/v_8df9f7de936707815eb12e226517a1b0023383eb).

## 🎁 Contributing

Contributions are welcome! To get set up for development, see [Development](./.github/development.md).

#### Roadmap

- [x] codeplan
- [x] Typescript/TSX support
- [ ] `bumpgen` GitHub app
- [ ] Embeddings for different package versions
- [ ] Use test runners as an oracle
- [ ] C# support
- [ ] Java support
- [ ] Go support

[Join](https://discord.gg/J7E9BqVHkG) our Discord community to contribute, learn more, and ask questions!
