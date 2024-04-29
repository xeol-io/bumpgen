<p align="center">
    <img src="https://s3.amazonaws.com/static.xeol.io/readme-banner.png" alt="logo"/>
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
`bumpgen` bumps your dependencies and makes code changes for you if anything breaks.

This may be a common scenario:

> you: "I should upgrade to the latest version of x, it has banging new features and impressive performance improvments"
>
> you (internal monologue): _I don't want to feel pain anymore_

Then use `bumpgen`!

**How does it work?**

- It uses [ts-morph](https://github.com/dsherret/ts-morph) to turn your codebase into an AST to understand code relationships
- Uses the AST to get type definitions for external methods to understand how to use new package versions
- Creates a plan graph DAG to execute things in the correct order to get to the root of problems (ref: [arxiv 2309.12499](https://huggingface.co/papers/2309.12499))

![demo](https://s3.amazonaws.com/static.xeol.io/mkdirp-demo-optimized.gif)

> `bumpgen` only supports typescript or tsx at the moment, but we're working on adding support for other strongly typed languages like C#, Java and Go

## 🚀 Get Started

To get started, you'll need an OpenAI API key. `gpt-4-turbo-preview` from OpenAI is the only supported model at this time.

Then, run `bumpgen` this:

```
> export LLM_API_KEY="<openai-api-key>"
> cd ~/my-repository
> npm install -g bumpgen
> bumpgen @tanstack/react-query 5.28.14
```

where `@tanstack/react-query` is the package you want to bump and `5.28.14` is the version you want to bump to.

> If you'd like to be first to try the `bumpgen` GitHub App to replace your usage of dependabot + renovatebot, sign up [here](https://www.xeol.io/beta)

## Limitations

There are some limitations you should know about.

- `bumpgen` can't handle multiple packages at this time. It will fail to upgrade packages that require peer dependencies to be updated the same time to work such as `@octokit/core` and `@octokit/plugin-retry`.
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

The AST is generated from **[ts-morph](https://github.com/dsherret/ts-morph)**. This AST allows `bumpgen` to understand the relationship between code properties in a codebase.

#### Plan Graph

The plan graph is a concept detailed in **[codeplan](https://huggingface.co/papers/2309.12499)** by Microsoft. The plan graph allows `bumpgen` to not only fix an issue at a point but also fix the 2nd order breaking changes from the fix itself. In short, it allows `bumpgen` to perpetuate a fix to the rest of the codebase.

#### Prompt Context

We pass the plan graph, the error, and the actual file with the breaking change as context to the LLM to maximize it's ability to fix the issue.

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

[Join](https://img.shields.io/discord/1233126412785815613) our Discord community to contribute, learn more, and ask questions!
