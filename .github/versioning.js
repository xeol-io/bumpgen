const semver = require("semver");

const { PR_VERSION: pr, MAIN_VERSION: main } = process.env;

const assertIsValidPrerelease = ({ github, context, core }) => {
  const pr_clean = pr.replace(/\-.+$/, "");
  const pr_is_greater = semver.gt(pr_clean, main);

  if (pr_is_greater) {
    core.debug(
      `The pr version (${pr} -> ${pr_clean}) is higher than the main version (${main}).`
    );
  } else {
    core.setFailed(
      `The pr version (${pr}) is not greater than the main version (${main}). A pull request labeled with 'prerelease' must have a valid version bump.`
    );
  }
  const pr_is_prerelease = semver.prerelease(pr) !== null;
  if (pr_is_prerelease) {
    core.debug(`The pr version (${pr}) is a prerelease.`);
  } else {
    core.setFailed(
      `The pr version (${pr}) is not a prerelease. A pull request labeled with 'prerelease' must have a valid prerelease version (1.2.3-rc.1).`
    );
  }
};

const assertIsValidRelease = ({ github, context, core }) => {
  const pr_is_greater = semver.gt(pr, main);
  if (pr_is_greater) {
    core.debug(
      `Success, the pr version (${pr}) is higher than the main version (${main}).`
    );
  } else {
    core.setFailed(
      `The pr version (${pr}) is not greater than the main version (${main}). A pull request labeled with 'release' must have a valid version bump.`
    );
  }
  const pr_is_prerelease = semver.prerelease(pr) !== null;
  if (!pr_is_prerelease) {
    core.debug(`The pr version (${pr}) is not a prerelease.`);
  } else {
    core.setFailed(
      `The pr version (${pr}) is a prerelease. A pull request labeled with 'release' cannot have a prerelease version (1.2.3-alpha.1 or 1.2.3-rc.1)`
    );
  }
};

const assertIsUnchanged = ({ github, context, core }) => {
  if (pr.trim() === main.trim()) {
    core.debug(
      `Success, the pr version (${pr}) is the same as the main version (${main}).`
    );
  } else {
    core.setFailed(
      `The pr version (${pr}) is not the same as the main version (${main}). A pull request without a 'release' or 'prerelease' label cannot include a version bump.`
    );
  }
};

exports.verify = ({ github, context, core }) => {
  const labels = (context.payload?.pull_request?.labels ?? []).map((l) =>
    l.name.toLowerCase()
  );
  if (labels.includes("prerelease")) {
    return assertIsValidPrerelease({ github, context, core });
  }
  if (labels.includes("release")) {
    return assertIsValidRelease({ github, context, core });
  }
  assertIsUnchanged({ github, context, core });
};
