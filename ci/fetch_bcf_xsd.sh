#!/usr/bin/env bash
# BCF 2.1 schemas from buildingSMART (downloaded at test time, not vendored: licence not stated in the repo).
set -euo pipefail
d="$(dirname "$0")/../dist-test/bcf-xsd"; mkdir -p "$d"
for f in markup.xsd visinfo.xsd version.xsd; do [ -s "$d/$f" ] || curl -fsSL -o "$d/$f" "https://raw.githubusercontent.com/buildingSMART/BCF-XML/release_2_1/Schemas/$f"; done
echo "$d"
