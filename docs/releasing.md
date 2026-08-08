# Releasing

Two independent release series live in this repository, one per language. Each is started by pushing
a tag, and each publishes with no stored credential — npm and crates.io both authenticate the
workflow run itself through OIDC trusted publishing.

| Series | Tag     | Workflow                           | Publishes to                                  |
| ------ | ------- | ---------------------------------- | --------------------------------------------- |
| npm    | `js/v*` | `.github/workflows/release-js.yml` | npm `interior-point` + a GitHub Release       |
| crate  | `rs/v*` | `.github/workflows/release-rs.yml` | crates.io `interior-point` + a GitHub Release |

The two are deliberately separate files. Both registries record the **workflow filename** as part of
the trust relationship, so renaming either one means re-registering at that registry.

## Before tagging

Three things must be true on `main` at the commit you tag. The workflows check the first two and
refuse to publish if either is wrong.

1. **The manifest version equals the tag version.** `js/v1.0.0` requires `js/package.json` at
   `1.0.0`; `rs/v1.0.0` requires `[workspace.package] version` in `rs/Cargo.toml` at `1.0.0`. The rs
   side is read through `cargo metadata`, so what is compared is the resolved value that ships.
   Bump the Rust version with `cargo` rather than by hand so `rs/Cargo.lock` moves with it.
2. **The changelog has a closed, non-empty section for that version.** Promote `## [Unreleased]` to
   `## [1.0.0] - YYYY-MM-DD` and leave a new empty `## [Unreleased]` above it. That section becomes
   the body of the GitHub Release, extracted by `scripts/changelog-section.mjs`. An absent or empty
   section fails the run before anything reaches a registry.
3. **The commit is on `main`.** Tag the merged commit, not a branch head, so the released tree and
   the tag agree.

Promoting the changelog heading is a human step on purpose: a tag-triggered workflow that rewrote
`main` would leave the released tree different from the tree the tag points at.

## Tagging

```bash
git tag rs/v1.0.0 && git push origin rs/v1.0.0
git tag js/v1.0.0 && git push origin js/v1.0.0
```

Nothing else starts a release. `ci.yml` runs on pushes and pull requests and publishes nothing.

## What runs

Both workflows begin by calling the same reusable test workflow a pull request uses
(`test-js.yml` / `test-rs.yml`), so a release cannot be checked more loosely than a PR.

**npm** — one job after the tests, held at the `release-npm` environment until approved:
version check, changelog read, build, `npm publish --dry-run`, `npm publish --provenance`,
`npm pack`, attestation over the packed tarball, then the Release.

**crate** — after the tests, two jobs run side by side. `build-binaries` compiles five targets
natively and uploads each as an artifact. `publish-crate` is held at the `release-crates`
environment until approved, then runs the version check, the changelog check, `cargo package` and
`cargo publish`, and uploads the packed `.crate`. `cargo package` stands where the npm side has
both `npm publish --dry-run` and `npm pack`: it compiles the crate from the packed copy the way a
dry run does, and it is the only one of the two commands that leaves the archive under
`target/package/` — `cargo publish` uploads from a temporary directory of its own. A final job
collects every artifact, writes `SHA256SUMS`, attests the six files, and creates the Release.

The GitHub Release is created **last** in both, after the registry has accepted the version.
Registries refuse to accept a version twice, so the irreversible step goes first: if the Release
step fails, the package is out and the Release can be made by hand, which is the recoverable
direction.

## Approving

Both publish jobs stop at an environment gate. Open the run in the Actions tab and review the
pending deployment. Nothing is sent to a registry before that approval.

## Pre-releases

A version containing `-` is treated as a pre-release by both workflows, decided from the manifest
version alone:

- npm publishes under the `next` dist-tag, leaving `latest` alone.
- crates.io needs no flag — a pre-release is excluded from ordinary version resolution already.
- The GitHub Release is marked as a pre-release.

There is no promotion step. To turn `1.0.0-rc.1` into `1.0.0`, bump the manifest, move the changelog
heading, and push a new tag. Re-tagging an existing published version is not possible, and npm's
dist-tag command does not work under OIDC.

## When something fails

- **Before the registry accepted anything** — fix the cause, delete the tag locally and remotely,
  and push it again.
- **After the registry accepted it, Release creation failed** — the package is published. Re-run the
  failed job, or create the Release by hand from the changelog section. Do not bump the version.
- **A bad version was published** — `cargo yank` on crates.io; on npm, deprecate, or unpublish
  within 72 hours. Neither registry frees the version number for reuse. Release the fix as a new
  version.

## One-time setup

Done once by hand, outside CI. It has to be redone if the repository moves or a workflow file is
renamed, and the first release cannot succeed until all three are in place.

1. **Two GitHub Environments**, `release-npm` and `release-crates`, each with the repository owner
   as a required reviewer, and with `js/v*` / `rs/v*` added under _Deployment branches and tags_.
   This last part is easy to miss — with a protection rule in place the default may allow branches
   only, and a tag-triggered job then never reaches the environment.
2. **A trusted publisher on npm** for `interior-point`: GitHub Actions, owner `sanak`, repository
   `interior-point`, workflow `release-js.yml`, environment `release-npm`. A package accepts exactly
   one.
3. **A trusted publisher on crates.io** for `interior-point`: the same owner and repository, workflow
   `release-rs.yml`, environment `release-crates`.

The workflow files must already be on `main` before registering, since both registrations match on a
filename that has to exist.
