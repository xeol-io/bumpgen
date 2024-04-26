<p align="center">
    <img src="https://s3.amazonaws.com/static.xeol.io/readme-banner.png" alt="logo"/>
</p>

<p align="center">
    <a href="https://www.xeol.io/">
        <img src="https://img.shields.io/badge/Github App Sign Up-FCAE00?logo=googlechrome&logoColor=black&style=for-the-badge"/>
    </a>
    <a href="https://github.com/xeol-io/bumpgen?tab=MIT-1-ov-file">
        <img src="https://img.shields.io/badge/License-MIT-FCAE00.svg?style=for-the-badge">
    </a>
    <a href="https://github.com/xeol-io/bumpgen/stargazers">
        <img src="https://img.shields.io/github/stars/xeol-io/bumpgen?color=FCAE00&style=for-the-badge">
    </a>
    <a href="https://github.com/xeol-io/bumpgen/releases/latest">
        <img src="https://img.shields.io/github/release/xeol-io/bumpgen.svg?color=FCAE00&style=for-the-badge"/>
    </a>
    <img src="https://img.shields.io/github/downloads/xeol-io/bumpgen/total.svg?color=FCAE00&style=for-the-badge"/>
    <a href="https://discord.gg/bsWQjHMKPy">
        <img src="https://img.shields.io/discord/1233126412785815613?logo=discord&label=discord&color=5865F2&style=for-the-badge"/>
    </a>
</p>

## 📝 Summary
Dependabot but fixes the breaking changes for you as well.

![demo](https://s3.amazonaws.com/static.xeol.io/mkdirp.gif)

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

#### CLI
A CLI wrapper on top of the core logic

#### Abstract Syntax Tree
The AST is generated from **[ts-morph](https://github.com/dsherret/ts-morph)**. This AST allows `bumpgen` to understand the relationship between different functions in a complex codebase. This is the "master plan" to traverse a codebase.

#### Plan Graph
The plan graph is a concept detailed in **[codeplan](https://huggingface.co/papers/2309.12499)** by Microsoft. The plan graph allows `bumpgen` to not only fix an issue at a point but also fix the 2nd order breaking changes from the fix itself. In short, it allows `bumpgen` to perpetuate a fix to the rest of the codebase. 

#### Prompt Context
We pass the plan graph, the error, and the actual file with the breaking change as context to the LLM to maximize it's ability to fix the issue.

#### LLM
The backend model we use to fix the breaking changes. We use gpt4-turbo having the best results. (Future) Swap the model baesd on preference and security needs.

#### Core Loop
```
1. Bump package version up                                        <-----
2. Build to see breaking changes                                       |
3. Look at a breaking change and understand its related functions      |
4. Attempt to fix the breaking change                                  |
5. Perpetuate the fix to related functions                             |
6. Build to validate the fix                                           |
7. Rinse and repeat until all build errors are fixed                   |
8. Create Pull Request and trigger existing build and test         -----
```

## ⏱️ Benchmark
```
bumpgen + GPT-4 Turbo         █████████░░░░░░░░░░░░░░░░   36.01%
bumpgen + Claude 3            █████████░░░░░░░░░░░░░░░░   36.01% 
naive + GPT-4 Turbo           █████████░░░░░░░░░░░░░░░░   36.01% 
```

We benchmarked `bumpgen` with GPT-4 Turbo against a [suite](https://github.com/xeol-io/swe-bump-bench) of version bumps with breaking changes.

## 🚀 Get Started
#### LLM API Key
We only support GPT-4 Turbo right now.
```
LLM_API_KEY="gpt4_key"
```

#### Run Upgrade
```
> npm install -g bumpgen
> bumpgen @tanstack/react-query 5.28.14 
```

## 🎁 Contributing
<p align="center">
    <img src="https://s3.amazonaws.com/static.xeol.io/memes/rm-meme.jpeg" alt="logo"/>
</p>

#### Roadmap
- [x] codeplan
- [x] Typescript support
- [ ] `bumpgen` GitHub app 
- [ ] Embeddings for different package versions
- [ ] Benchmarks
- [ ] C# support
- [ ] Java support
- [ ] Go support
- [ ] Python support

[Join](https://img.shields.io/discord/1233126412785815613) our Discord community to contribute, learn more, ask questions! 