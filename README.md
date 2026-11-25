# Nhắc việc

Ứng dụng giao việc, nhắc việc và báo cáo hình ảnh 8NTTT cho siêu thị (TGDĐ, ĐMX, TopZone). Thiết kế theo chuẩn iOS cho iPhone 15 Pro Max trở lên, cài lên Màn hình chính như app thật (PWA), nhận thông báo đẩy và số đỏ trên biểu tượng.

- **Hướng dẫn cài đặt từng bước:** [`docs/HUONG-DAN-CAI-DAT.md`](docs/HUONG-DAN-CAI-DAT.md)
- **Xem thử với dữ liệu mẫu:** chạy app khi chưa có file `.env`, hoặc thêm `?demo=1` vào đường link.

## Tính năng

| Phần | Nội dung |
|---|---|
| Đăng ký & duyệt | Đăng nhập Google. Lần đầu chọn **Quản lý / Nhân viên / PG**, nhập User hoặc Hãng (tự viết hoa chữ cái đầu), Họ tên, Mã kho. Admin duyệt Quản lý; Quản lý duyệt Nhân viên, PG của kho mình. Chuyển kho cũng phải duyệt theo cấp. |
| Công việc | Giao cho **cá nhân** (chỉ quản lý và người đó thấy), **bộ phận**, **PG theo hãng** hoặc **toàn siêu thị** (mọi nhân viên kho đều thấy). Hạn chót, nhắc trước hạn, mức ưu tiên, checklist, bắt buộc chụp ảnh khi hoàn tất, cần quản lý duyệt, chế độ "từng người phải xác nhận". Có dòng thời gian ai đã xem, ai làm, lúc nào. Có việc lặp lại hằng ngày/tuần/tháng. |
| Báo cáo 8NTTT | Bộ tiêu chí của 3 chuỗi có sẵn. Mỗi khu vực có người phụ trách và người dự phòng. Ảnh **chỉ chụp trực tiếp bằng camera trong app**, đóng dấu giờ máy chủ, tên, khu vực, mã kho, khoảng cách tới siêu thị. Kiểm tra GPS. Ảnh phải gửi trong 15 phút sau khi chụp. Máy chủ gắn cờ nghi vấn khi ảnh trùng ảnh cũ hoặc vị trí xa. Mỗi ngày 1 lần, sau 21:00 tính trễ. |
| Thống kê | Hôm nay: đã nộp, đúng giờ, trễ, quá giờ chưa báo cáo, chờ chấm; nút nhắc tất cả. Theo tháng: tỷ lệ đúng giờ, **số ngày thiếu báo cáo** của từng người, số ngày thiếu liên tiếp, lịch tô màu từng ngày. Ngày nghỉ được duyệt không tính. |
| Chấm ảnh | Quản lý (hoặc người được cấp quyền) xem ảnh toàn màn hình, so với ảnh chuẩn, chấm Đạt/Không đạt theo tiêu chí. Khi Không đạt, nhân viên nhận thông báo chụp lại. |
| Thư viện | Nội quy, Triển khai – CTKM, Chính sách, Quy trình, Biểu mẫu, Thông báo, Tiêu chí 8NTTT. Đính kèm ảnh/PDF, chọn đối tượng đọc, ghim, ngày hiệu lực, **xác nhận đã đọc** và nhắc người chưa đọc, đánh số phiên bản khi cập nhật. |
| Nhân sự | Danh sách theo bộ phận, sửa bộ phận/hãng/chức vụ/chức danh, **quyền bổ sung** (giao việc, chấm ảnh, đăng thư viện, duyệt nhân viên), vô hiệu hoá/xoá, lịch nghỉ, cài đặt siêu thị, nhật ký hoạt động. |
| Thông báo | Việc mới, sắp đến hạn, đến hạn, quá hạn (báo quản lý), nhắc báo cáo 8NTTT theo giờ, tổng hợp quá giờ lúc 21:00, tóm tắt đầu ngày. Giờ yên lặng 22:00–06:00 (trừ việc khẩn). |

## Công nghệ

- **Giao diện:** React 18 + TypeScript + Vite. Bộ thành phần iOS tự xây: thanh tab kính mờ, tiêu đề lớn, danh sách nhóm, sheet, vuốt để quay lại, vuốt hàng để thao tác. Chế độ Sáng/Tối, cỡ chữ theo máy.
- **Máy chủ:** Firebase gồm Authentication (Google), Firestore, Storage, Cloud Functions (asia-southeast1), Cloud Messaging, Hosting.
- **Bảo mật:** [`firestore.rules`](firestore.rules) và [`storage.rules`](storage.rules) phân quyền theo vai trò và mã kho.

```
src/
  lib/        nghiệp vụ, thời gian VN, tiêu chí 8NTTT, ảnh, GPS, Firebase/dữ liệu mẫu
  state/      phiên đăng nhập, dữ liệu kho dùng chung
  ui/         hệ thống giao diện iOS (Icon, Page, Nav, Overlay, controls)
  screens/    auth, home, tasks, reports, library, people, admin, profile
functions/    Cloud Functions: thông báo đẩy, nhắc việc theo giờ, việc lặp lại, dọn ảnh
public/       biểu tượng app, màn hình khởi động iPhone, service worker
```

## Chạy trên máy

```bash
npm install
```

```bash
npm run dev
```

Khi chưa có file `.env`, app chạy với dữ liệu mẫu. Để nối Firebase, sao chép `.env.example` thành `.env` rồi điền cấu hình.

```bash
npm run build && npx firebase-tools deploy
```
