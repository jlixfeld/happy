# Napkin Notes

## pod install dies on react-native-worklets-core that isn't installed

*2026-06-12 · packages/happy-app iOS prebuild (VisionCamera)*

**The problem:** `expo prebuild --platform ios` failed pod install with "Unable to find a specification for `react-native-worklets-core` depended upon by `VisionCamera/FrameProcessors`" — but worklets-core is nowhere in the dependency tree, and frame processors should be auto-disabled.

**Dead ends:** Hunting for worklets-core in `.pnpm`, looking for a stale Podfile.lock, suspecting `react-native-worklets` (the new package) triggers detection — all wrong. The package genuinely isn't installed.

**The fix / pattern:** Run prebuild with `FORCE_COLOR=0`. Expo CLI exports `FORCE_COLOR=1`; VisionCamera.podspec probes for worklets with `` node --print "try { require.resolve(...) } catch(e) {}" `` and string-compares the output against `"undefined"`. With color forced, node prints `\e[90mundefined\e[39m`, the compare fails, `File.dirname(<garbage>)` returns `"."`, `File.exist?(".")` is true → "react-native-worklets-core found at ., Frame Processors are enabled!" → missing-podspec failure.

**Why it works:** The podspec's detection is a string equality on node's stdout; any ANSI wrapping breaks it open in the *enable* direction.

**Rule:** Any podspec that shells out to `node --print` must be run color-free — prefix Expo/pod commands with `FORCE_COLOR=0`.

---

## Xcode 26.5 archive fails compiling react-native-audio-api

*2026-06-12 · node_modules/react-native-audio-api 0.8.x*

**The problem:** `xcodebuild archive` failed: `Constants.h:11:18: error: unknown type name 'size_t'` in react-native-audio-api.

**Dead ends:** `patch-package` can't persist the fix — under pnpm's hoisted layout the package lives at the repo-root `node_modules`, and patch-package (run from `packages/happy-app`) crashes with "Cannot find module .../packages/happy-app/node_modules/react-native-audio-api/package.json".

**The fix / pattern:** `scripts/build-ios-testflight.sh` applies the header fix idempotently before prebuild: insert `#include <cstddef>` after `#include <cmath>` in `common/cpp/audioapi/core/Constants.h`.

**Rule:** Library C++ header fixes in this pnpm monorepo go in the build script as idempotent seds, not patch-package.

---

## xcodebuild -exportArchive fails with bare "Copy failed"

*2026-06-12 · scripts/build-ios-testflight.sh export step*

**The problem:** Archive succeeds, export dies with `error: exportArchive Copy failed` and nothing else.

**The fix / pattern:** Run export with `PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive …`. Xcode's IPA packaging spawns `rsync` from PATH; Homebrew GNU rsync 3.x and macOS openrsync disagree on `-E` (executability vs extended-attrs), so packaging dies. Documented in the apple-build plugin's canonical `build-ios.sh` — steal from there first.

**Rule:** Every headless `-exportArchive` on a Homebrew Mac gets a system-only PATH.

---

## ASC New App dropdown missing a bundle ID that exists

*2026-06-12 · TestFlight onboarding for ca.lixfeld.happy*

**The problem:** Bundle ID auto-registered by Xcode during archive (`-allowProvisioningUpdates` + ASC API key) didn't show in App Store Connect's New App bundle-ID dropdown.

**The fix / pattern:** It's UI lag/team-context, not registration. Verify ground truth via ASC API: `GET /v1/bundleIds?filter[identifier]=...` with an ES256 JWT from the `.p8` (`uv run --with pyjwt --with cryptography`). Then hard-refresh ASC / check team switcher.

**Rule:** Never re-register a bundle ID because a dropdown is empty — query the ASC API first.

---

## happy-cli build script's tsc gate fails on upstream codex errors

*2026-06-12 · packages/happy-cli `pnpm build`*

**The problem:** `pnpm build` = `shx rm -rf dist && tsc --noEmit && pkgroll`; upstream main carries type errors in `src/codex/utils/sessionProtocolMapper.ts` (`codexItemId` not in `CreateEnvelopeOptions`), so the gate blocks dist builds of unrelated changes.

**The fix / pattern:** For local-fork builds: `npx shx rm -rf dist && npx pkgroll` (pkgroll doesn't typecheck). Global `happy` is a symlink into `packages/happy-cli`, so a fresh `dist/` + `happy daemon stop && happy daemon start` is the whole deploy.

**Rule:** When upstream main's typecheck is broken, build the CLI with pkgroll directly and restart the daemon; don't "fix" upstream codex types on a feature branch.

---
