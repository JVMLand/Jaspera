#!/usr/bin/env bash
set -euo pipefail

# Workers Builds does not provide the Java/CMake toolchain used by the JVM build.
# Keep all downloaded tools inside the checkout; no sudo or system changes.
tools="$PWD/.cache/cloudflare-tools"
mkdir -p "$tools/jdk"
archive=OpenJDK23U-jdk_x64_linux_hotspot_23.0.2_7.tar.gz
url="https://github.com/adoptium/temurin23-binaries/releases/download/jdk-23.0.2%2B7/$archive"
if [[ ! -x "$tools/jdk/bin/javac" ]]; then
  curl --fail --location --retry 3 "$url" -o "$tools/$archive"
  curl --fail --location --retry 3 "$url.sha256.txt" -o "$tools/$archive.sha256.txt"
  (cd "$tools" && sha256sum --check "$archive.sha256.txt")
  tar -xzf "$tools/$archive" --strip-components=1 -C "$tools/jdk"
fi
export JAVA_HOME="$tools/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
python3 -m pip install --disable-pip-version-check --target .cache/build-tools 'cmake==3.31.6' 'ninja==1.11.1.3'
java -version
pnpm run setup
node --test tests/cloudflare.test.mjs
pnpm run build:cloudflare
