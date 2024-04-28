# Contributing

### Publishing on Npm

We manage _what_ gets merged _when_ using the pull request labels `release` and `prerelease`.

When the `prerelease` label is added to a pull request:

- the version in the package.json is verified, asserting that it is greater than the version in the main branch and includes a prerelease suffix (_e.g 1.2.3-rc.1_)
- the package is published to NPM with the `--next` tag. The next tag is how alpha and beta package versions are published to NPM. When a developer runs `npm install @vesselapi/integrations` versions with the next tag are ignored -- unless they are specifically specified `npm install @vesselapi/integrations@1.2.3-rc.1`.

When the `release` label is added to a pull request:

- the version in the package.json is verified, asserting that it is greater than the version in the main branch and does not include a prerelease suffix

When no release label is provided github actions verifies that the version has not changed so versions of the package are not published erroneously.
