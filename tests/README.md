# Kiểm thử quy tắc bảo mật

Chạy bằng Firebase Emulator (cần Java):

```bash
npm i -D firebase-tools @firebase/rules-unit-testing
```

```bash
npx firebase emulators:exec --only firestore --project demo-nhacviec "node tests/firestore.rules.test.cjs"
```

```bash
npx firebase emulators:exec --only firestore,storage,auth --project demo-nhacviec "node tests/storage.rules.test.cjs"
```
