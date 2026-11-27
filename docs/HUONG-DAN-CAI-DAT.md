# Hướng dẫn cài đặt app Nhắc việc

Hướng dẫn này đi từng bước, làm trên máy tính (Chrome/Safari), khoảng 20–30 phút.
Anh/chị chỉ cần **một tài khoản Gmail** (chính là tài khoản Admin) và **một thẻ thanh toán quốc tế** (Visa/Master) để bật gói Blaze của Firebase.

> **Xem thử ngay, chưa cần cài:** khi chạy app mà chưa có cấu hình Firebase, app tự mở ở chế độ dữ liệu mẫu. Thêm `?demo=1` vào đường link để luôn mở chế độ này, `?demo=0` để tắt.

---

## Bước 1. Tạo dự án Firebase

1. Mở <https://console.firebase.google.com> và đăng nhập bằng Gmail của anh/chị.
2. Chạm **Create a project** (Tạo dự án).
3. Đặt tên dự án: `nhac-viec`. Firebase tự thêm đuôi, ví dụ `nhac-viec-4f2a1`. Đây là **Project ID**, hãy ghi lại.
4. Ở bước Google Analytics: **tắt**, vì app không cần.
5. Chạm **Create project** và chờ khoảng 30 giây.

## Bước 2. Bật gói Blaze (trả theo mức dùng)

Gói Blaze là bắt buộc để chạy **nhắc việc tự động theo giờ** (Cloud Functions) và **lưu ảnh** (Storage).

1. Góc dưới bên trái, chạm **Spark · Upgrade**, rồi chọn **Blaze**.
2. Tạo tài khoản thanh toán và nhập thẻ.
3. Khi được hỏi về ngân sách (budget), đặt mức cảnh báo, ví dụ **5 USD/tháng**. Ngân sách chỉ dùng để cảnh báo, không chặn app.

**Chi phí dự kiến** cho 1 siêu thị khoảng 40 người, ảnh lưu 15 ngày (tự xoá cuốn chiếu): phần lớn nằm trong hạn mức miễn phí, thường **dưới 50.000đ/tháng**.

## Bước 3. Bật đăng nhập bằng Google

1. Menu trái: **Build › Authentication**, rồi chạm **Get started**.
2. Tab **Sign-in method**, chọn **Google**, bật **Enable**.
3. Chọn **Project support email** là Gmail của anh/chị, rồi chạm **Save**.

## Bước 4. Tạo cơ sở dữ liệu Firestore

1. **Build › Firestore Database**, rồi **Create database**.
2. Location: chọn **asia-southeast1 (Singapore)** để nhanh nhất cho Việt Nam.
3. Chọn **Start in production mode**, rồi **Create**.

## Bước 5. Bật lưu trữ ảnh (Storage)

1. **Build › Storage**, rồi **Get started**.
2. Chọn **production mode** và location **asia-southeast1**, rồi **Done**.

## Bước 6. Đăng ký Web App và lấy cấu hình

1. Bấm biểu tượng **bánh răng › Project settings › General**.
2. Ở mục **Your apps**, bấm biểu tượng **`</>`** (Web).
3. App nickname: `Nhắc việc`, rồi **Register app**.
4. Firebase hiện một đoạn `firebaseConfig`. Ghi lại 6 giá trị sau. Đây **không phải mật khẩu**, có thể gửi qua chat:

```
apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
```

## Bước 7. Tạo khoá thông báo đẩy (cho iPhone)

1. **Project settings › Cloud Messaging**.
2. Kéo xuống **Web configuration › Web Push certificates**, rồi bấm **Generate key pair**.
3. Sao chép dãy ký tự trong cột **Key pair**. Đây là **VAPID key**.

## Bước 8. Đặt tài khoản Admin

Admin là người duyệt Quản lý cho từng mã kho.

1. **Firestore Database › Data › + Start collection**.
2. Collection ID: `admins`, rồi **Next**.
3. Document ID: **Gmail của anh/chị, viết thường toàn bộ**, ví dụ `ten.cua.ban@gmail.com`.
4. Thêm field: tên `email`, kiểu `string`, giá trị là Gmail đó, rồi **Save**.

Muốn thêm Admin khác: sau khi app chạy, vào **Nhân sự › Quản trị hệ thống › Admin › Thêm**.

## Bước 9. Triển khai app lên mạng

### Cách A — Nhờ Claude triển khai (khuyến nghị)

1. Gửi cho Claude: **Project ID**, 6 giá trị cấu hình ở Bước 6 và **VAPID key** ở Bước 7.
2. Claude gửi cho anh/chị một **đường link đăng nhập Firebase** kèm **mã phiên (Session ID)**.
3. Mở link, kiểm tra mã phiên trên trang khớp với mã Claude gửi, rồi đăng nhập bằng Gmail Admin.
4. Sao chép **mã xác nhận** hiện ra và gửi lại cho Claude.
5. Claude sẽ đưa quy tắc bảo mật, chỉ mục, máy chủ nhắc việc và app lên mạng tại `https://<project-id>.firebaseapp.com`.

### Cách B — Tự triển khai bằng Google Cloud Shell (không cần cài gì vào máy)

1. Mở <https://shell.cloud.google.com> bằng cùng Gmail.
2. Chạy lần lượt từng lệnh (thay `<...>` bằng thông tin của anh/chị):

```bash
git clone https://github.com/<tai-khoan-github>/nhac-viec.git && cd nhac-viec
```

```bash
cp .env.example .env && nano .env
```

Điền 7 dòng cấu hình (có sẵn trong `.env.production` nếu đã cấu hình). Bấm `Ctrl+O`, `Enter`, `Ctrl+X` để lưu.

```bash
npm install && npm --prefix functions install && npm run build
```

```bash
npx firebase-tools login --no-localhost
```

```bash
npx firebase-tools use --add <project-id>
```

```bash
npx firebase-tools deploy
```

Lần đầu triển khai Cloud Functions mất khoảng 3–5 phút. Nếu báo lỗi quyền API, chờ 1–2 phút rồi chạy lại lệnh `deploy`.

## Bước 10. Địa chỉ app

App dùng địa chỉ **`https://<project-id>.firebaseapp.com`**, trùng tên miền với trang đăng nhập Google, nên iPhone không chặn đăng nhập và không cần cấu hình thêm. Nếu ai mở bằng `https://<project-id>.web.app`, app tự chuyển sang địa chỉ trên.

## Bước 11. Bắt đầu dùng

**Admin / Quản lý (làm trên iPhone):**

1. Mở `https://<project-id>.firebaseapp.com` bằng **Safari**.
2. Chạm **Chia sẻ › Thêm vào MH chính › Thêm**.
3. Mở app từ Màn hình chính, chạm **Tiếp tục với Google**.
4. Chọn **Quản lý**, nhập User, Họ tên, Mã kho. Tài khoản Admin được duyệt ngay.
5. Vào **Nhân sự › Cài đặt siêu thị**:
   - đứng trong siêu thị, chạm **Vị trí kiểm tra GPS** để lưu toạ độ;
   - kiểm tra hạn nộp **21:00**;
   - chỉnh giờ nhắc, số ảnh tối thiểu.
6. **Nhân sự › Khu vực 8NTTT › +**, chọn **Thêm từ tiêu chí 8NTTT**, chọn các khu vực có trong siêu thị.
7. Mở từng khu vực, chọn **Người phụ trách**, **Người dự phòng** và **Ảnh chuẩn**.
8. **Tài khoản › Thông báo đẩy › Bật**.

**Nhân viên / PG:**

1. Quản lý gửi link app vào nhóm Zalo của siêu thị.
2. Nhân viên mở bằng Safari, **Thêm vào MH chính**, đăng nhập Google, chọn **Nhân viên** hoặc **PG**, nhập mã kho.
3. Quản lý vào **Nhân sự › Chờ duyệt** để duyệt và xếp bộ phận.
4. Nhân viên vào **Tài khoản › Thông báo đẩy › Bật** để nhận nhắc việc.

## Gợi ý triển khai thực tế

| Thời gian | Việc nên làm |
|---|---|
| Ngày 1 | Quản lý tạo khu vực, phân công, chụp ảnh chuẩn cho từng khu vực |
| Ngày 2 | Cả siêu thị cài app, bật thông báo. Quản lý kiểm tra danh sách người chưa bật trong Nhân sự |
| Tuần 1 | Chạy thử báo cáo 8NTTT và giao việc cho bộ phận Kho, Thu ngân |
| Tuần 2 | Chuyển toàn bộ giao việc từ Zalo sang app. Zalo chỉ để trao đổi nhanh |
| Cuối tháng | Dùng **Báo cáo › Thống kê** để xem chuyên cần và ngày thiếu báo cáo của từng người |

## Câu hỏi thường gặp

- **Không nhận được thông báo trên iPhone?**
  - App phải được mở từ biểu tượng trên Màn hình chính (không mở trong Safari) và đã bật thông báo trong **Tài khoản**.
  - Kiểm tra **Cài đặt iPhone › Thông báo › Nhắc việc**.
- **Báo "Chưa xác nhận vị trí" khi gửi báo cáo?**
  - Bật **Cài đặt › Quyền riêng tư & Bảo mật › Dịch vụ định vị**, cho phép Safari/Nhắc việc dùng vị trí.
  - Kiểm tra lại toạ độ siêu thị trong **Cài đặt siêu thị**.
- **Nhân viên nghỉ thì sao?** Quản lý vào **Nhân sự › Lịch nghỉ** (hoặc nhân viên tự xin nghỉ trong **Tài khoản**). Ngày nghỉ được duyệt không tính thiếu báo cáo; người dự phòng của khu vực sẽ được nhắc báo cáo thay.
- **Đổi kho?** Nhân viên vào **Tài khoản › Chuyển kho** và nhập mã kho mới. Quản lý kho mới duyệt; với Quản lý thì Admin duyệt.
