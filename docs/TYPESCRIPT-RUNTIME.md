# TypeScript and Node runtime

The project pins **Node v27.0.0-nightly20261020531d28fc36** in `.node-version`.
This is a prerelease, not a stable Node 27 release. The official release-candidate
index had no Node 27 candidate when the pin was selected. The newer October 21
nightly lacked Windows archives, so the October 20 build is the latest common
Linux, Windows and Apple Silicon macOS build.

## Install the local runtime

With an existing Node installation, run:

```sh
node tools/runtime/install-node.mjs
```

The installer downloads from the [official Node nightly archive](https://nodejs.org/download/nightly/v27.0.0-nightly20261020531d28fc36/)
and verifies the SHA-256 recorded in `tools/runtime/node27.json`, copied from that
release's `SHASUMS256.txt`. It extracts into `.artifacts/node-runtime/`, leaving
system Node and other applications untouched. Supported archives are Linux x64
and ARM64, Windows x64 and ARM64, and macOS ARM64. This pin has no Intel macOS
archive; the installer rejects unsupported platforms rather than selecting a
different runtime silently. Windows extraction explicitly uses the native
`System32/tar.exe`, avoiding Git Bash’s GNU tar, which cannot read ZIP archives.
macOS and Linux extraction requires `tar` on `PATH`.

Launch scripts use the project-local binary when installed, otherwise they
require the exact pinned version on `PATH`. For development commands, put its
`bin/` directory first on `PATH` on Unix, or its installation directory first on
Windows. The installer prints this directory. CI adds it to `GITHUB_PATH`.

The nightly bundles npm 12.1.0. That npm version emits a supported-Node warning
because its semver range excludes prereleases; the warning does not prevent the
build or tests. Node's prerelease status is intentional and remains visible.

## Build and run

```sh
npm ci
npm run build
npm start
```

`npm ci` also builds during `prepare`. `npm start` and the registered regression
commands rebuild before running. After changing source, rebuild before launching
individual tests directly.

`server/`, `shared/` and `client/` contain source modules. Use explicit `.ts`
extensions when importing a TypeScript source module, including from JavaScript.
Node 27 strips erasable types when tests import source directly. Keep TypeScript
syntax erasable: no runtime enums, namespaces or constructor parameter properties.

`tsconfig.build.json` emits all application JavaScript into `dist/`, rewriting
relative `.ts` imports to `.js`. It never writes generated siblings beside source.
The HTTP server serves JavaScript from `dist/client/` and `dist/shared/`; raw
TypeScript URLs return 404. HTML, CSS, JSON and binary assets retain their original
paths. Both source and emitted server entry points use the repository root for
catalogs and persistent data, preserving online and Solo save locations.

Release archives must include `dist/`, original assets, `package.json`, the
startup scripts, `tools/start.mjs` and `tools/runtime/`. `tools/package.sh` rebuilds
and includes compiled output alongside tracked files, rejecting unexpected output.
Players using a built archive need no npm dependencies or compiler;
source checkouts do. Do not publish a source-only archive as ready to play.

## Checked scope

`npm run typecheck` retains the existing selective JavaScript/JSDoc checks and
adds `tsconfig.core.json` with strict checking for actual `.ts` source.
`npm run typecheck:tsrs` checks both configurations with the pinned Rust-based
[tsrs checker](https://github.com/oxc-project/tsrs). CI runs it alongside `tsc`,
including the valid/invalid contract fixtures through `npm run test:types:tsrs`.
The pinned tsrs package provides Linux and macOS binaries, but no Windows binary;
Windows contributors can keep using `npm run typecheck`. Builds still use `tsc`.
`GalaxyGraph`, `ShipCapacity`, deterministic random/hash utilities and client HTML
escaping are TypeScript. Existing
JavaScript bodies are not thereby converted or globally checked. Emitting every
module is not a claim that every implementation is type-safe.

`test/compiled-runtime.mjs` exercises online and Solo startup through both source
and compiled server entries, executable emitted browser/shared modules, original
JSON/CSS assets, TypeScript URL denial and online save-import denial. Existing
gameplay, browser, Windows persistence and save-generator suites remain required.
