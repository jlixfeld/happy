# Design: Photo/File Attachments + Local TestFlight Build

Date: 2026-06-12
Status: Approved (brainstorm complete)

## Goal

1. Add attachment support (photos, camera, arbitrary files/PDFs) to the Happy app, full scope of issue #1319 (also covers #1270, #919, #70), using upstream PR #554's architecture as a blueprint but implemented fresh on current main.
2. Ship a personal iOS build to TestFlight via local headless xcodebuild (App Store Connect API key signing — Seneca/SoundSpotter pattern), incorporating our open PRs #1372 (Fable 5) and #1373 (per-model effort + Opus 4.8[1m]) without waiting for upstream merge.

## Branch strategy

```
upstream/main
 ├─ feat/fable-5-model        (PR #1372, exists)
 ├─ feat/claude-model-effort  (PR #1373, exists, stacked on fable-5)
 ├─ feat/attachments          (NEW — clean off main; app + cli changes; PR upstream)
 └─ local/testflight          (NEW — integration branch: main + all 3 feature branches
                               + one local-only commit: bundle ID, build script.
                               Never PRed upstream.)
```

- TestFlight config (bundle ID swap, build script) lives only on `local/testflight`.
- Integration branch is rebuilt whenever upstream merges a PR; merged feature branches drop out naturally.
- happy-cli changes run from local dist via the existing daemon setup; the CLI is not part of the TestFlight artifact.

## Attachment feature

### Architecture (from PR #554, extended)

```
App picks attachment → (images: normalize) → chunked upload via RPC to CLI
  machine's $TMPDIR/happy/uploads/{sessionId}/ → message text gains
  [image: /path] / [file: /path] refs → agent reads files with Read tool
```

Zero server/protocol changes. Reuses existing encrypted RPC channel.

### App side (`packages/happy-app/sources`)

| Unit | Purpose |
|------|---------|
| `utils/attachments.ts` (native) | Gallery + camera via `expo-image-picker`; files via `expo-document-picker`. |
| `utils/attachments.web.ts` | File picker + clipboard paste (Canvas-based image normalize). Follows existing `.web` split pattern. |
| `utils/attachments.shared.ts` | Base64 validation, chunked RPC upload, upload-dir caching, filename sanitization. |
| `hooks/useAttachments.ts` | Pending-attachment state, max 5, pick/capture/remove handlers. |

**Image handling (quality-preserving):**
- Downscale only if long edge > 1568 px (Claude vision API ceiling — API downscales beyond this itself; larger is pure waste).
- HEIC → JPEG conversion mandatory (vision API does not accept HEIC), JPEG quality 0.9.
- No aggressive 520 KB squeeze — images use the same chunked upload path as files.

**Files:** raw bytes, no transformation. 5 MB cap, error toast beyond.

**UI (`AgentInput.tsx`):**
- “+” button in action bar → action sheet: Photo Library / Camera / Choose File. Count badge; disabled at 5.
- Chips strip above input: thumbnail (images) or file icon + name, per-chip remove.
- On send: upload all pending, then append `[image: /path]` / `[file: /path]` refs to the message text.

**Permissions:** `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` via `app.config.js`.

**i18n:** new keys in `text/_default.ts` + all 11 translation files.

### CLI side (`packages/happy-cli`)

- `getUploadDir` RPC → returns `$TMPDIR/happy/uploads/{sessionId}/` (created on demand).
- `pathSecurity.validatePath` gains `additionalAllowedDirs` covering the upload dir.
- **Chunked upload:** new `appendFile` RPC (or offset parameter on `writeFile`); app loops 256 KB chunks. Socket.io payload limit is 1 MB, so single-shot writes cap at ~520 KB base64 — chunking lifts that for both large images and files.
- Strip base64 image data from tool results before socket transport (agent Read of an image file otherwise overflows the socket) — ported from #554.
- System prompt addition instructing the agent to use Read on `[image:]` / `[file:]` refs.

### Testing

- pathSecurity traversal tests (upload dir allowlist).
- Chunked-write reassembly test (CLI).
- `useAttachments` hook tests (max-5, remove, send-clears).
- Image normalize tests (downscale threshold, HEIC conversion path where mockable).

## TestFlight build (local/testflight only)

### One-time manual prereqs (public ASC API cannot create app records)

1. Register bundle ID `ca.lixfeld.happy` in the Apple Developer portal.
2. Create the ASC app record against it (name e.g. “Happy JL”). TestFlight-only; never App Store.

### `scripts/build-ios-testflight.sh`

```
fetch APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID (Infisical)
verify ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 exists — fail fast
APP_ENV=production expo prebuild   (regenerates ios/)
xcodebuild archive   -allowProvisioningUpdates -authenticationKeyPath/-KeyID/-KeyIssuerID
xcodebuild -exportArchive  (app-store method) + same three auth flags
xcrun altool --upload-app --apiKey/--apiIssuer
```

Both `archive` and `-exportArchive` carry the three `-authenticationKey*` flags — without them, headless automatic signing fails (`error: No Accounts`) or produces a generic profile missing entitlements.

### Local-only commit contents

- `app.config.js`: bundle ID → `ca.lixfeld.happy`, display-name tweak.
- `scripts/build-ios-testflight.sh`.
- Timestamp-based build-number auto-increment.

### Known limitation

Push notifications do not work in the fork build: happy-server sends APNs pushes with slopus’ credentials, which are tied to their bundle ID. Pairing and E2E sync against api.happy-servers.com are unaffected (bundle ID is irrelevant to the backend protocol).

## Out of scope

- Server changes of any kind.
- Android build/distribution.
- App Store (non-TestFlight) release.
- Restoring push notifications in the fork build.
