#!/usr/bin/env bash
#
# build-px4-sitl-bundle.sh
#
# Builds a self-contained PX4 SITL bundle in the exact layout ArduDeck's
# px4-sitl-downloader.ts / px4-sitl-process.ts expect, tars it, and (optionally)
# uploads it to the GitHub release the app downloads from.
#
# This is the PX4 counterpart of .github/workflows/build-sitl.yml. Like the
# ArduPilot flow, Linux x64 is built in CI (build-px4-sitl.yml calls this
# script) and macOS bundles are built locally on a Mac and uploaded, because
# PX4 has no standalone prebuilt SITL binary: the `px4` executable is compiled
# from source and needs its ROMFS data dir plus a physics backend (jMAVSim).
#
# Bundle layout produced (what the app expects):
#   <bundle>/bin/px4              the SITL executable
#   <bundle>/etc/                 ROMFS data dir incl. init.d-posix/rcS
#   <bundle>/rootfs/              writable working dir (created empty)
#   <bundle>/jmavsim/             jmavsim_run.jar + its runtime libs
#   <bundle>/px4-launch.sh        version-matched launcher the app spawns
#   <bundle>/.meta.json           version + build metadata
# Packed as: px4-sitl-<track>-<platform>.tar.gz
#
# Usage:
#   scripts/build-px4-sitl-bundle.sh [--track stable|beta|dev] [--ref <git-ref>]
#                                    [--upload] [--tag <release-tag>] [--skip-setup]
#
# Examples:
#   # Build a stable macOS bundle locally and upload it to the app's release tag:
#   scripts/build-px4-sitl-bundle.sh --track stable --ref v1.15.4 --upload \
#     --tag px4-sitl-vmaster-20260814
#
#   # Just build the tarball, no upload (inspect it first):
#   scripts/build-px4-sitl-bundle.sh --track dev --ref main
#
# Requirements:
#   - git, cmake, make, python3, a working PX4 toolchain (the script can run
#     PX4's own Tools/setup script unless --skip-setup), Java (JDK) + ant for
#     jMAVSim, and `gh` (authenticated) only when --upload is passed.
#
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
TRACK="stable"
PX4_REF=""            # resolved from TRACK below when not given
UPLOAD=0
RELEASE_TAG="px4-sitl-vmaster-20260814"   # MUST match PX4_SITL_RELEASE_TAG in px4-sitl-downloader.ts
SKIP_SETUP=0
GH_REPO="rubenCodeforges/ardudeck"

# Track -> default PX4 git ref. Keep these pinned to releases that are known to
# build a posix SITL target; bump deliberately (this pairs with the app's track
# selector).
default_ref_for_track() {
  case "$1" in
    stable) echo "v1.15.4" ;;
    beta)   echo "v1.16.0-beta1" ;;
    dev)    echo "main" ;;
    *) echo "" ;;
  esac
}

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --track) TRACK="$2"; shift 2 ;;
    --ref) PX4_REF="$2"; shift 2 ;;
    --upload) UPLOAD=1; shift ;;
    --tag) RELEASE_TAG="$2"; shift 2 ;;
    --skip-setup) SKIP_SETUP=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -z "$PX4_REF" ]] && PX4_REF="$(default_ref_for_track "$TRACK")"
if [[ -z "$PX4_REF" ]]; then
  echo "error: unknown track '$TRACK' (use stable|beta|dev) or pass --ref" >&2
  exit 2
fi

# ── Platform detection (matches the app's asset naming) ───────────────────────
uname_s="$(uname -s)"
uname_m="$(uname -m)"
case "$uname_s" in
  Darwin)
    case "$uname_m" in
      arm64) PLATFORM="macos-arm64" ;;
      x86_64) PLATFORM="macos-x64" ;;
      *) echo "error: unsupported mac arch $uname_m" >&2; exit 2 ;;
    esac ;;
  Linux)
    case "$uname_m" in
      x86_64) PLATFORM="linux-x64" ;;
      *) echo "error: unsupported linux arch $uname_m" >&2; exit 2 ;;
    esac ;;
  *) echo "error: unsupported OS $uname_s (Windows PX4 SITL native is not supported)" >&2; exit 2 ;;
esac

# Explicit XXXXXX template so this works on both GNU (Linux) and BSD (macOS)
# mktemp; `-t <name>` without X's is a BSD-only form and errors on GNU.
WORKROOT="${PX4_SITL_BUILD_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/px4-sitl-build.XXXXXX")}"
SRC="$WORKROOT/PX4-Autopilot"
OUT="$WORKROOT/bundle"
ASSET="px4-sitl-${TRACK}-${PLATFORM}.tar.gz"

echo "==> Track:    $TRACK"
echo "==> PX4 ref:  $PX4_REF"
echo "==> Platform: $PLATFORM"
echo "==> Work dir: $WORKROOT"
echo "==> Asset:    $ASSET"

# ── Clone PX4 ─────────────────────────────────────────────────────────────────
if [[ ! -d "$SRC/.git" ]]; then
  echo "==> Cloning PX4-Autopilot @ $PX4_REF"
  git clone --recursive --depth 1 --branch "$PX4_REF" https://github.com/PX4/PX4-Autopilot.git "$SRC"
else
  echo "==> Reusing existing checkout at $SRC"
fi

# ── Toolchain setup (best effort) ─────────────────────────────────────────────
if [[ "$SKIP_SETUP" -eq 0 ]]; then
  if [[ "$uname_s" == "Darwin" && -f "$SRC/Tools/setup/macos.sh" ]]; then
    echo "==> Running PX4 macOS setup (pass --skip-setup to skip)"
    bash "$SRC/Tools/setup/macos.sh" || echo "warn: macos setup returned non-zero, continuing"
  elif [[ "$uname_s" == "Linux" && -f "$SRC/Tools/setup/ubuntu.sh" ]]; then
    echo "==> Running PX4 Ubuntu setup (no NuttX/sim GUI)"
    bash "$SRC/Tools/setup/ubuntu.sh" --no-nuttx --no-sim-tools || echo "warn: ubuntu setup returned non-zero, continuing"
  fi
fi

# ── PX4 python requirements ───────────────────────────────────────────────────
# PX4's CMake configure imports kconfiglib (menuconfig) plus jinja2/empy/etc.
# Two gotchas: (1) the platform setup scripts install these into a DIFFERENT
# python than CMake resolves from PATH (CI's setup-python vs the system python),
# surfacing as "No module named 'menuconfig'"; and (2) PX4's requirements.txt
# pins like "matplotlib>=3.0.*", which modern pip rejects (".* needs == or !=").
# So sanitize the ".*" wildcards and install into the ACTIVE python3; fall back
# to the core build modules directly if the file install still fails.
CORE_PY_MODULES=(kconfiglib jinja2 jsonschema empy==3.3.4 pyros-genmsg packaging toml numpy pyyaml pymavlink)
pip_into_active() { python3 -m pip install "$@" || python3 -m pip install --break-system-packages "$@"; }
REQ="$SRC/Tools/setup/requirements.txt"
echo "==> Installing PX4 python requirements into $(command -v python3)"
if [[ -f "$REQ" ]]; then
  SANITIZED="$WORKROOT/px4-requirements.txt"
  # Drop the ".*" version wildcard modern pip refuses (e.g. matplotlib>=3.0.*).
  sed 's/\.[*]//g' "$REQ" > "$SANITIZED"
  pip_into_active -r "$SANITIZED" || pip_into_active "${CORE_PY_MODULES[@]}"
else
  pip_into_active "${CORE_PY_MODULES[@]}"
fi

# ── Build px4 SITL ────────────────────────────────────────────────────────────
# PX4 (and some of its submodules) still declare an ancient
# cmake_minimum_required, which CMake >= 4 rejects outright ("Compatibility with
# CMake < 3.5 has been removed"). Homebrew ships CMake 4 on macOS, so set the
# documented escape hatch that lets CMake configure those old projects anyway.
# Harmless on the older CMake 3.x that Linux runners carry (it just ignores it).
export CMAKE_POLICY_VERSION_MINIMUM=3.5

echo "==> Building px4_sitl_default (this takes a while)"
make -C "$SRC" px4_sitl_default

BUILD="$SRC/build/px4_sitl_default"
PX4_BIN="$BUILD/bin/px4"
[[ -x "$PX4_BIN" ]] || { echo "error: px4 binary not found at $PX4_BIN" >&2; exit 1; }

# ── Build jMAVSim (physics backend) ───────────────────────────────────────────
# jMAVSim is a git submodule; its runnable jar lands under out/production.
JMAVSIM_DIR="$SRC/Tools/simulation/jmavsim"
JMAVSIM_JAR=""
if [[ -d "$JMAVSIM_DIR" ]]; then
  echo "==> Building jMAVSim"
  ( cd "$JMAVSIM_DIR/jMAVSim" 2>/dev/null && ant create_run_jar copy_res ) \
    || ( cd "$JMAVSIM_DIR" && ant create_run_jar copy_res ) \
    || echo "warn: jMAVSim build failed; bundle will ship without a physics backend"
  JMAVSIM_JAR="$(find "$JMAVSIM_DIR" -name 'jmavsim_run.jar' -print -quit 2>/dev/null || true)"
fi

# ── Assemble the bundle ───────────────────────────────────────────────────────
echo "==> Assembling bundle at $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/bin" "$OUT/etc" "$OUT/rootfs" "$OUT/jmavsim"

cp "$PX4_BIN" "$OUT/bin/px4"
chmod 0755 "$OUT/bin/px4"

# ROMFS data dir (holds init.d-posix/rcS + airframe defs). Copy the built etc.
if [[ -d "$BUILD/etc" ]]; then
  cp -R "$BUILD/etc/." "$OUT/etc/"
else
  echo "error: expected ROMFS data dir at $BUILD/etc" >&2; exit 1
fi

# Generated run dir. The build emits px4-alias.sh (which defines the px4-*
# module commands the rcS sources) plus other run-time files into
# build/px4_sitl_default/rootfs. Ship that wholesale instead of an empty dir,
# otherwise rcS dies at ". px4-alias.sh: No such file or directory".
if [[ -d "$BUILD/rootfs" ]]; then
  cp -R "$BUILD/rootfs/." "$OUT/rootfs/"
fi
# Belt and suspenders: if px4-alias.sh landed somewhere else in the build tree,
# find it and drop it into the run dir so the launcher's PATH picks it up.
if [[ ! -f "$OUT/rootfs/px4-alias.sh" ]]; then
  ALIAS_SH="$(find "$BUILD" -name 'px4-alias.sh' -print -quit 2>/dev/null || true)"
  [[ -n "$ALIAS_SH" ]] && cp "$ALIAS_SH" "$OUT/rootfs/px4-alias.sh" || true
fi
echo "==> Bundled run dir contents:"; ls -la "$OUT/rootfs" | head -40
if [[ ! -f "$OUT/rootfs/px4-alias.sh" ]]; then
  echo "error: px4-alias.sh not found in the build; the bundle would fail at startup" >&2
  echo "       searched under $BUILD" >&2
  exit 1
fi

# test_data is referenced by some airframes; ship it when present.
[[ -d "$SRC/test_data" ]] && cp -R "$SRC/test_data" "$OUT/test_data" || true

# jMAVSim jar + its runtime libs (the jar's manifest classpath points at lib/).
if [[ -n "$JMAVSIM_JAR" && -f "$JMAVSIM_JAR" ]]; then
  cp "$JMAVSIM_JAR" "$OUT/jmavsim/jmavsim_run.jar"
  jmavsim_root="$(dirname "$(dirname "$JMAVSIM_JAR")")"
  [[ -d "$jmavsim_root/lib" ]] && cp -R "$jmavsim_root/lib" "$OUT/jmavsim/lib" || true
fi

# ── Version-matched launcher the app spawns ───────────────────────────────────
# The exact px4 posix argv (data path, working dir, -s startup script) is a
# property of THIS PX4 checkout, so it lives here rather than hardcoded in the
# app. Home/model/speed arrive as env from px4-sitl-process.ts. jMAVSim is
# started separately by the app before this runs.
cat > "$OUT/px4-launch.sh" <<'LAUNCH'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PX4's posix startup re-execs its rc script with an unquoted `/bin/sh <path>`,
# so a space anywhere in the bundle path (e.g. macOS "~/Library/Application
# Support/...") breaks it. Expose a space-free symlink and run from there.
if [[ "$HERE" == *" "* ]]; then
  LINK="${TMPDIR:-/tmp}/ardudeck-px4-sitl"
  ln -sfn "$HERE" "$LINK"
  HERE="$LINK"
fi
MODEL="${PX4_SIM_MODEL:-iris}"
WORK="$HERE/rootfs"
mkdir -p "$WORK"
cd "$WORK"
# The rcS sources `px4-alias.sh` (which defines the px4-* module commands) from
# the PATH, and px4 module binaries live in bin/. Put both on PATH so startup
# resolves them regardless of the -w working subdir px4 chdirs into.
export PATH="$WORK:$HERE/bin:$PATH"
# Mirror PX4's Tools/simulation/sitl_run.sh: data path is the bundle's etc dir,
# a per-model working subdir, absolute path to the POSIX rc startup script, and
# the test-data dir when present. PX4_HOME_* / PX4_SIM_SPEED_FACTOR are read
# from the environment by px4 itself.
TEST_DATA_ARG=()
[[ -d "$HERE/test_data" ]] && TEST_DATA_ARG=(-t "$HERE/test_data")
exec "$HERE/bin/px4" "$HERE/etc" -w "sitl_${MODEL}" -s "$HERE/etc/init.d-posix/rcS" "${TEST_DATA_ARG[@]}"
LAUNCH
chmod 0755 "$OUT/px4-launch.sh"

# ── Metadata ──────────────────────────────────────────────────────────────────
cat > "$OUT/.meta.json" <<META
{
  "track": "$TRACK",
  "platform": "$PLATFORM",
  "px4Ref": "$PX4_REF",
  "builtBy": "build-px4-sitl-bundle.sh"
}
META

# ── Pack ──────────────────────────────────────────────────────────────────────
echo "==> Packing $ASSET"
tar -czf "$WORKROOT/$ASSET" -C "$OUT" .
ls -lh "$WORKROOT/$ASSET"
echo "==> Bundle ready: $WORKROOT/$ASSET"

# ── Upload ────────────────────────────────────────────────────────────────────
if [[ "$UPLOAD" -eq 1 ]]; then
  command -v gh >/dev/null || { echo "error: gh CLI not found for --upload" >&2; exit 1; }
  echo "==> Ensuring release $RELEASE_TAG exists on $GH_REPO"
  gh release view "$RELEASE_TAG" --repo "$GH_REPO" >/dev/null 2>&1 \
    || gh release create "$RELEASE_TAG" --repo "$GH_REPO" --title "PX4 SITL bundles" \
         --notes "Prebuilt PX4 SITL bundles for ArduDeck's in-app simulator." --prerelease
  echo "==> Uploading $ASSET"
  gh release upload "$RELEASE_TAG" "$WORKROOT/$ASSET" --repo "$GH_REPO" --clobber
  echo "==> Uploaded: https://github.com/$GH_REPO/releases/download/$RELEASE_TAG/$ASSET"
fi

echo "==> Done."
