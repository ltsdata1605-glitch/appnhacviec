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

## Kiểm thử toàn bộ app với nhiều vai trò (Firebase Emulator)

Chạy app thật trên Firebase giả lập (không đụng dữ liệu thật) với 5 người dùng cùng lúc: Admin (kiêm Quản lý kho 910), Quản lý kho 911, Nhân viên kho 910, PG Samsung kho 910, Nhân viên kho 911. Kiểm tra đăng ký – duyệt, giao việc và quyền xem việc, báo cáo 8NTTT (camera, GPS, chấm điểm, chụp lại), thư viện, quyền bổ sung, nghỉ phép, chuyển kho, vô hiệu hoá, Admin xem kho khác.

```bash
bash tests/e2e/run.sh
```

Kiểm thử các hàm chạy theo giờ (nhắc hạn, báo quá hạn, nhắc 8NTTT, tóm tắt đầu ngày, việc lặp lại, dọn ảnh):

```bash
bash tests/e2e/run-scheduled.sh
```
