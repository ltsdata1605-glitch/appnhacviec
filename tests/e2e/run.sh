#!/usr/bin/env bash
# Kiểm thử toàn bộ app trên Firebase Emulator (không đụng dữ liệu thật).
# Cần: Java, Chromium + Playwright, firebase-tools.
set -e
cd "$(dirname "$0")/../.."
FIREBASE=${FIREBASE:-"npx -y firebase-tools@13"}
npx vite build --mode emulator --outDir dist-emulator
npm --prefix functions run build
npx vite preview --outDir dist-emulator --port 4174 --strictPort > /dev/null 2>&1 &
PREVIEW=$!
trap "kill $PREVIEW 2>/dev/null || true" EXIT
sleep 2
env -u JAVA_TOOL_OPTIONS -u _JAVA_OPTIONS $FIREBASE emulators:exec --only auth,firestore,storage,functions --project demo-nhacviec "node tests/e2e/full.cjs"
