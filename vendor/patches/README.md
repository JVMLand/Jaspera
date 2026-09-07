# Bovine JVM debugger patch

Upstream: https://github.com/anematode/b-jvm

Revision: `3fd56c74656602eb32efefca46f51f074bef6bca`  
Toolchain: Emscripten **4.0.2**, CMake **3.15–3.31**, Ninja, Python 3, Node.js 22, TypeScript 5.8.3 from the pnpm lockfile.

Bovine is fetched directly from Git. It is not a dependency in the npm registry，so `pnpm patch` cannot rebuild its native code. `bovine-debugger.patch` is applied to the fixed source revision with `git apply`. The compiled artifacts remain under `.cache` and `public/runtime` and are not committed.

```sh
pnpm install --frozen-lockfile
pnpm run setup
# Rebuild only the JVM after editing the maintained patch:
pnpm run build:runtime
```

The build script obtains an SDK in `.cache/emsdk` unless `EMSDK` specifies an existing installation. `PYTHON` and `CMAKE` can select executables. CMake and Ninja must be on PATH. On Windows，the following optional local installation is also supported:

```powershell
python -m pip install --target .cache/build-tools cmake==3.31.6 ninja==1.11.1.4
```

MSYS2 UCRT64 tools may also supply CMake/Ninja. C compilation itself uses Emscripten's Clang because the target is WebAssembly. The SDK and patch hash are recorded in `.cache/b-jvm/build-debugger/jaspera-build.json`. An unchanged build is reused. The script replaces its previous patch automatically. If the cached sources contain conflicting local edits，it stops without resetting them.

## Interpreter changes

- Complete the existing cooperative debugger hook using `CONT_DEBUGGER_PAUSE`.
- Spill cached integer/reference，float and double TOS values before suspension.
- Skip interpreter return/suspend sentinels. Method resolution and TOS redispatch do not count as completed instructions. Self-targeting branches still advance the per-thread instruction serial.
- Copy actual stack and local values using Bovine's GC stack summaries. Do not dereference outgoing arguments that now overlap a callee's locals.
- Decode Java strings from their Latin-1 / UTF-16 storage without calling Java methods or allocating in the JVM heap.
- Stop rescheduling Java threads while paused，but leave the JS event loop available for Comlink commands.
- Preserve and root the pending exception while resolving a catch type; otherwise a previously unresolved handler can be skipped even in normal execution.
- Enable hooks for existing and newly created Java threads; remove hooks when debugging ends.
- Invoke Python explicitly on Windows，scope the upstream CommonJS postprocessor correctly，and avoid fetching doctest for a build without tests.

The normal interpreter uses the existing `entry_notco_no_stepping` path. Native methods and synchronous VM calls remain atomic. The UI and worker tests in `tests/debugger-*.test.mjs` exercise actual WASM execution; they do not simulate instructions from source.
