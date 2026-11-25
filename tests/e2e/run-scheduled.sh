#!/usr/bin/env bash
# Kiểm thử các hàm chạy theo giờ trên Firebase Emulator (có Pub/Sub).
set -e
cd "$(dirname "$0")/../.."
FIREBASE=${FIREBASE:-"npx -y firebase-tools@13"}
npm --prefix functions run build
env -u JAVA_TOOL_OPTIONS -u _JAVA_OPTIONS $FIREBASE emulators:exec --only firestore,storage --project demo-nhacviec "node tests/e2e/scheduled.cjs"
