# Third-party software

| Component | Version / source | License |
| --- | --- | --- |
| UDEV Gothic | 2.2.0, https://github.com/yuru7/udev-gothic | SIL OFL 1.1, `licenses/UDEV-Gothic.txt` |
| i18next | 26.4.2, https://github.com/i18next/i18next | MIT, `licenses/i18next.txt` |
| Floating UI (DOM) | 1.8.0, https://github.com/floating-ui/floating-ui | MIT, `licenses/Floating-UI.txt` |
| Workbox | 7.4.1, https://github.com/GoogleChrome/workbox | MIT, `licenses/Workbox.txt` |
| Comlink | 4.4.2, https://github.com/GoogleChromeLabs/comlink | Apache-2.0, `licenses/Comlink.txt` |
| elkjs | 0.12.0, https://github.com/kieler/elkjs/tree/ff5771d7165445c42c408bb8a090c8035272218c | EPL-2.0, `licenses/ELK.txt`; unmodified library |
| Monaco Editor | 0.52.2, https://github.com/microsoft/monaco-editor | MIT |
| fflate | 0.8.2, https://github.com/101arrowz/fflate | MIT, `licenses/fflate.txt` |
| LangJAL | local source snapshot; `vendor/provenance.json` | MIT, `licenses/LangJAL.txt` |
| Javasm instruction documents | local source snapshot; `vendor/provenance.json` | `licenses/Javasm.txt` |
| ANTLR | 4.13.2, https://github.com/antlr/antlr4/tree/4.13.2 | BSD-3-Clause |
| ASM | 9.8, https://asm.ow2.io/ | BSD-3-Clause |
| Bovine JVM | 3fd56c74656602eb32efefca46f51f074bef6bca, https://github.com/anematode/b-jvm | MIT, `licenses/Bovine-JVM.txt` |
| OpenJDK 23 | runtime artifacts from Bovine's pinned `test/jdk23*` files | GPLv2 with Classpath Exception where applicable; `licenses/OpenJDK*` |
| JZlib | 1.1.3, https://github.com/ymnk/jzlib/tree/1.1.3 | BSD-style, `licenses/JZlib.txt` |

OpenJDK upstream source: https://github.com/openjdk/jdk/tree/jdk-23%2B37
Runtime distribution provenance: https://github.com/anematode/b-jvm/tree/3fd56c74656602eb32efefca46f51f074bef6bca/test
The Bovine repository supplies a reduced OpenJDK class archive. Its exact binary hashes and source URLs are recorded in `vendor/runtime-lock.json`; it does not supply a complete original JDK build recipe. The upstream source link is not a claim that this checkout reproduces the original binary bit for bit.

JALWeb replaces java.util.zip.Deflater, Inflater, CRC32 and Adler32 with adapters to JZlib. The complete adapter source and build procedure are included in `java/patches/` and `scripts/build-compiler.ts`. These files are modifications by JALWeb, not unmodified OpenJDK source.

Bovine is built from the pinned upstream revision with `vendor/patches/bovine-debugger.patch` by `scripts/build-runtime.ts`. `scripts/bundle-runtime.ts` applies UTF-8 allocation and HTTP response handling fixes to the wrapper from that checkout and bundles it with the locally built WebAssembly runtime.

All application execution is local to the browser; public dependency hosts are contacted by the setup process only. Runtime assets are served from the same site as the editor.

Timezone data (`tzdb.dat`) comes from Eclipse Temurin 23.0.2+7. The setup script pins the archive SHA-256 and extracts only this platform-independent data file. Sources: https://github.com/adoptium/jdk23u/tree/jdk-23.0.2%2B7_adopt

`java/src/jalweb/PatchRuntime.java` changes FileInputStream.available0 to check the closed state and return the conservative estimate 0, avoiding an unsupported host ioctl. All other FileInputStream bytecode is retained. This is a JALWeb modification of the runtime.

JALWeb uses the unmodified Javasm plugin logo for its header and favicon: `public/favicon.svg`, copied from `Javasm/javasm-intellij-plugin/src/main/resources/META-INF/pluginIcon.svg`. SHA-256: `f9bed50c85af24967e23c63c104fa3c2e32b5625b6eda5111509337f053f4210`. See `licenses/Javasm.txt` for the accompanying Javasm notice.

Darcula: JetBrains IntelliJ Community, Apache-2.0. Pinned sources and adaptation details: `vendor/themes/README.md`; license: `public/licenses/Darcula.txt`. Visual Studio Light/Dark and high-contrast themes are built into Monaco (MIT).

Bytecode-offset previews adapt Javasm InstructionOffsetCalculator and its wide/switch size rules (see `licenses/Javasm.txt`), using LangJAL EOpcodes and a JavaScript parser generated from the vendored ANTLR grammar. These source estimates do not require compiling a class.

Instruction completion categories reuse Javasm Japanese completion descriptions, snapshotted in `vendor/javasm/completion-ja.json`, and organize them into operation / subject / type paths. See `licenses/Javasm.txt`.

The class viewer uses ASM to parse class files and adapts JALP rendering conventions from LangJAL (`jalp` ClassPrinter / CodePrinter / MethodPrinter). It does not reuse the CLI class finder or handwritten binary reader. See `licenses/LangJAL.txt`.

The vendored LangJAL analyser adds opt-in reporter level checks to avoid formatting disabled debug/info messages. Existing reporters keep logging enabled by default; the browser compiler disables these levels.

The vendored LangJAL analyser preserves the current class type and initializes all aliases of `this` after `super()` / `this()` calls. Its grammar and ldc evaluators accept reference/array class constants so the ASM-based class viewer can retain these instructions. These are JALWeb modifications.

Native/abstract method declarations skip code generation and reject instruction bodies. Local-variable liveness accounts for conditional jumps within label-delimited blocks, retaining values used only on a branch. These are JALWeb modifications of the vendored LangJAL compiler/analyser.

The vendored LangJAL class compiler exposes an optional method-start/completion callback. JALWeb uses it to stream method progress and completed graph data through its browser bridge.
