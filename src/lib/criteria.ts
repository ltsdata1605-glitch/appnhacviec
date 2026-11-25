// Bộ tiêu chí đánh giá 8NTTT theo từng chuỗi (TGDĐ, ĐMX, TopZone).
// Nội dung giữ nguyên theo văn bản gốc. Quản lý có thể chỉnh tiêu chí riêng cho từng khu vực sau khi tạo.
import type { Chain } from './types';

export interface CriteriaGroup {
  key: string;
  name: string;
  items: string[];
}

const NOPOSM =
  'NoPOSM Rõ Ràng, Chính Xác, Không Bị Cũ, Nhàu Nát, Đúng Thời Gian Áp Dụng Và Không Được Để Trống.';

const BAI_XE_TGDD_DMX: string[] = [
  'Bãi Xe Không Rác, Vật Dụng Thừa.',
  'Logo Đèn Thế Giới Di Động Không Bị Bụi Bẩn/Mạng Nhện/Vỡ.',
  'Rạp Gia Dụng Bên Ngoài Siêu Thị Sạch Sẽ, Không Bụi Bẩn, Mạng Nhện.',
  'Ô Dù Không Bị Rách/Bị Mờ Quảng Cáo/Bụi Bám.',
  'Tiếp Đón Khách Hàng Không Hút Thuốc, Không Sử Dụng Điện Thoại Trong Giờ Làm Việc.',
  'Đèn Pha Siêu Thị Luôn Được Bật Sáng Khi Trời Tối.',
  'Không Có Sản Phẩm, Vật Dụng Thừa Che No POSM, PP Kính,… Của Siêu Thị.',
  'Xe Được Sắp Xếp Ngay Ngắn Và 100% Được Che Nắng, Úp Nón Khi Trời Mưa.',
  'Baner Mặt Tiền, POSM, PP Ô Kính Không Bị Rách/Trùng Hoặc Bị Mờ.',
  'PP Ô Kính Đúng Thông Tin CTKM Đang Triển Khai Trong Tháng.',
];

const TRONG_ST_TGDD_DMX: string[] = [
  'Không Rác, Nước, Bụi Bẩn, Mạng Nhện, Vật Dụng Thừa, Không Có Mùi Hôi Khó Chịu.',
  'Trên Trần Nhà/Các Ngóc Ngách Của Siêu Thị Sạch Sẽ Không Có Mạng Nhện.',
  'Nhiệt Độ Trong Siêu Thị Duy Trì Từ 24 – 27 Độ C Và Không Có Đèn Bị Hỏng, Cháy Tại Siêu Thị Mà Chưa Liên Hệ Thay.',
  'Trong Siêu Thị Luôn Bật Nhạc Sôi Động.',
  'Bình Chữa Cháy Tại Siêu Thị Không Bị Bụi Bẩn Và Để Đúng Nơi Quy Định.',
  'Lối Đi Rộng Rãi, Không Bị Chắn Bởi Thùng, Hộp Hàng Hóa, Vật Dụng Thừa. (Ghế, Thang, …)',
  'Bàn Tư Vấn Sắp Xếp Gọn Gàng, Không Có Vật Dụng Thừa. (Dao Mổ, Chìa Khóa)',
  'Topper Đầu Kệ, A5, Hanging Treo Trần Và Định Vị Không Được Để Trống.',
  NOPOSM,
];

const BAN_TN_TGDD_DMX: string[] = [
  'Sạch Sẽ, Không Bụi Bẩn, Không Có Côn Trùng Chết Và Không Có Vật Dụng Thừa.',
  '100% Máy Trải Nghiệm Được Bật, Kết Nối Wifi, Không Có Mật Khẩu Và Khách Hàng Có Thể Đăng Nhập Vào Trải Nghiệm.',
  'Bảng Cấu Hình Trên Bàn Trải Nghiệm Được In Đầy Đủ Và Không Được Để Trống Đế Trưng Bày Sản Phẩm.',
];

const TU_PHONE: string[] = [
  'Trong Tủ Phone Không Có Giấy Rác, Vật Dụng Thừa, Bụi Bẩn, Mạng Nhện.',
  'Không Có Khoảng Trống (Khoảng Trống Không Nhìn Thấy Vách) Kể Cả Stock Kho.',
  'Đèn Led Trong Tủ Điện Thoại Hiển Thị Rõ Ràng Không Bị Mờ Và Hiển Thị Đầy Đủ Thông Tin.',
  'Tất Cả Điện Thoại Được Sắp Xếp Đúng Theo Thông Tin Trên LED.',
  NOPOSM,
  'Bảng Cấu Hình, Popup Trong Tủ Phone Được In Đầy Đủ.',
];

const LAPTOP: string[] = [
  'Khu Vực Trưng Bày Laptop Không Được Bụi Bẩn.',
  'Laptop Demo Được Bật Và Kết Nối Wifi, Và Có Thể Trải Nghiệm.',
  'Laptop Trưng Bày Phải Được Quấn Wrap Đầy Đủ, Phải Được Trưng Bày Tại Bàn Trưng Bày, Không Được Để Trong Kho Siêu Thị.',
  'Bàn Laptop Trưng Bày Không Có Khoảng Trống Lấy Được 1 Sản Phẩm Bên Trái Hoặc Bên Phải Để Vào Được Khoảng Trống Này.',
  NOPOSM,
];

const PHU_KIEN_TGDD_DMX: string[] = [
  'Khu Vực Trưng Bày Phụ Kiện Không Được Bụi Bẩn.',
  'Không Có Móc Trống Trên Vách Trưng Bày Phụ Kiện, Tối Thiểu 2 Sản Phẩm Mỗi Móc, Trưng Bày Theo Hàng Ngang.',
  'Pin Sạc Dự Phòng (Sạc Nhanh Không Dây, Sạc Cơ Bản) Được Trưng Bày Theo Dung Lượng. Và Giá Giảm Dần.',
  'Adapter: Sạc Xe Hơi, Sạc Không Dây, Adapter. (Theo W Và Giá Giảm Dần)',
  'Cáp Sạc (Cáp Micro, Cáp Type C, Cáp Lightning) Theo Độ Dài Và Giá Giảm Dần.',
  'Tai Nghe Theo Giá Giảm Dần.',
  'Phụ Kiện Chính Hãng Trưng Hết Hãng Này Qua Hãng Khác',
  'Ốp Lưng Điện Thoại Trưng Bày. Theo Model, Hết Model Này Qua Model Khác Và Có Bảng Định Vị.',
  'Thẻ Nhớ, USB, Pin Trưng Theo Bộ Nhớ Và Giá Giảm Dần.',
  'Chuột Trưng Chuột Không Dây > Có Dây. (Trong Nhóm Giá Giảm Dần)',
  'Phụ Kiện Khác: Trưng Hết Nhóm Này, Qua Nhóm Khác.',
  'Loa Vi Tính: Trưng Bày Loa Di Động > Loa Vi Tính. (Trong Nhóm Theo Giá Giảm Dần)',
  'Vách Phụ Kiện Trưng Bày Theo Từng Nhóm Hàng Phụ Kiện, Không Lẫn Lộn Các Nhóm Phụ Kiện Với Nhau. Ví Dụ: Sạc Dự Phòng Không Lẫn Lộn Dây Cáp Khi Chưa Trưng Hết Sạc Dự Phòng.',
  NOPOSM,
];

const DONG_HO: string[] = [
  'Trong Tủ Trưng Bày Phải Có Cốc Nước Và Cốc Không Bị Bẩn.',
  'Mặt Kính Tủ Đồng Hồ Không Bị Mờ, Sạch Sẽ.',
  '100% Sản Phẩm Đồng Hồ Được Bọc Wrap Đầy Đủ.',
  'Đèn Trong Tủ 100% Bật Sáng.',
  'Tất Cả Sản Phẩm Trưng Bày Phải Có Hộp/Khay Đựng, Tem Giá Và Tem Xuất Xứ Đầy Đủ.',
  'Mâm Sản Phẩm Bán Kèm Không Được Trống Quá 3 Vị Trí/Mâm.',
];

const THU_NGAN_HTKT: string[] = [
  'Không Để Đồ Ăn, Nước Uống Tại Quầy Thu Ngân, Thùng Rác Tại Quầy Thu Ngân Được Để Trong Khu Vực Khách Hàng Không Nhìn Thấy.',
  'Khu Vực Sau Bán Hàng: Trang Trí, Thu Ngân Sim Số, HTKT Luôn Sắp Xếp Gọn Gàng, Không Có Vật Dụng Thừa Để Bừa Bãi.',
];

const WC: string[] = [
  'Nhà Vệ Sinh Sạch Sẽ, Thơm, Gọn Gàng, Có Đủ Các Vật Dụng: Sáp Thơm, Nước Rửa Tay, Thùng Rác, Giấy Vệ Sinh.',
  'Trong Nhà Vệ Sinh Không Có Người Thì Đèn Trong Nhà Vệ Sinh Để Chế Độ Tắt.',
];

const KHO_TGDD_DMX: string[] = [
  'Không Được Để Đồ Ăn Bừa Bãi Trong Kho.',
  'Thùng Rác Trong Kho Không Được Để Lâu Ngày, Đầy Nhưng Không Đổ.',
  'Trong Kho Cần Gọn Gàng, Sạch Sẽ, Không Có Mùi Hôi Khó Chịu.',
  'Tủ Sever Được Đặt Trong Vạch Sơn Vàng Quy Định, Không Có Thùng Đặt Trên Nóc, Treo Quần Áo, Thùng Giấy Đặt Trên Nóc, Giấy Tờ Gim Trên Mặt Cửa.',
  'Trong Kho Phải Có Bảng Định Vị Từng Khu Vực Và Sơ Đồ Kho.',
  'Hàng Hóa Trong Kho Được Sắp Xếp Gọn Gàng, Ngay Ngắn Và Được Để Đúng Theo Bảng Định Vị.',
];

const LOA_KEO_GIA = 'Loa Kéo Được Trưng Bày Theo Thứ Tự Giá Giảm Dần.';

const TGDD: CriteriaGroup[] = [
  { key: 'BAI_XE', name: 'Bãi xe', items: BAI_XE_TGDD_DMX },
  { key: 'TRONG_ST', name: 'Trong siêu thị', items: TRONG_ST_TGDD_DMX },
  { key: 'BAN_TN', name: 'Bàn trải nghiệm', items: BAN_TN_TGDD_DMX },
  { key: 'TU_PHONE', name: 'Tủ phone', items: TU_PHONE },
  { key: 'LAPTOP', name: 'Laptop', items: LAPTOP },
  { key: 'PHU_KIEN', name: 'Phụ kiện', items: PHU_KIEN_TGDD_DMX },
  { key: 'DONG_HO', name: 'Đồng hồ', items: DONG_HO },
  { key: 'THU_NGAN', name: 'Khu vực thu ngân – HTKT', items: THU_NGAN_HTKT },
  { key: 'WC', name: 'WC', items: WC },
  { key: 'KHO', name: 'Kho', items: KHO_TGDD_DMX },
];

const DMX: CriteriaGroup[] = [
  { key: 'BAI_XE', name: 'Bãi xe', items: BAI_XE_TGDD_DMX },
  { key: 'TRONG_ST', name: 'Trong siêu thị', items: TRONG_ST_TGDD_DMX },
  { key: 'BAN_TN', name: 'Bàn trải nghiệm', items: BAN_TN_TGDD_DMX },
  { key: 'TU_PHONE', name: 'Tủ phone', items: TU_PHONE },
  { key: 'LAPTOP', name: 'Laptop', items: LAPTOP },
  { key: 'PHU_KIEN', name: 'Phụ kiện', items: PHU_KIEN_TGDD_DMX },
  { key: 'DONG_HO', name: 'Đồng hồ', items: DONG_HO },
  {
    key: 'TIVI',
    name: 'Tivi',
    items: [
      'Khu Vực Trưng Bày Tivi Không Được Bụi Bẩn.',
      'Mỗi Tivi Phải Có Đầy Đủ Bảng Cấu Hình Và Có Một Remote Đặt Phía Sau Tivi.',
      'Tivi Ở Vách Sẽ Mở 2 Line Trên Cùng, Vách Hãng Thì Phải Mở 100%, Tivi Ở Kệ Phải Mở Full Mặt Hướng Ra Ngoài Siêu Thị.',
      'Tivi Mở Các Chương Trình Khuyến Mãi Của Hệ Thống Hoặc Demo.',
      'Stock Hàng Không Vượt Ra Ngoài Kệ Trưng Bày Và Full Hàng Mặt Ngoài.',
      'Tivi Được Trưng Bày Theo Trưng Bày Định Danh Và Trong Khu Trưng Bày Tivi Không Có Các Sản Phẩm Khác Trưng Bày Tại Đây.',
      'Loa Thanh Hãng Nào Trưng Theo TV Hãng Đó.',
      LOA_KEO_GIA,
      NOPOSM,
    ],
  },
  {
    key: 'LOA_KEO',
    name: 'Loa kéo',
    items: ['Khu Vực Trưng Bày Loa Kéo Không Được Bụi Bẩn.', LOA_KEO_GIA],
  },
  {
    key: 'TU_LANH',
    name: 'Tủ lạnh',
    items: [
      'Tủ Lạnh Sạch Sẽ, Không Bị Bám Bụi Bẩn, Bên Trong Không Có Giấy Rác, Vật Dụng Thừa.',
      'Trong Tủ Lạnh Được Trang Trí Đầy Đủ Mockup.',
      'Có Đầy Đủ Bảng Cấu Hình.',
      'Khoảng Trống Giữa 2 Sản Phẩm Không Quá 30cm.',
      'Trong Khu Trưng Bày Tủ Lạnh Không Có Các Sản Phẩm Khác Trưng Bày Tại Đây.',
      NOPOSM,
    ],
  },
  {
    key: 'MAY_LANH',
    name: 'Máy lạnh + Máy nước nóng',
    items: [
      'Mô Hình Trưng Bày Máy Lạnh + Máy Nước Nóng Không Được Bụi Bẩn.',
      'Không Có Vị Trí Trống Trên Vách/Dàn Mướp Trưng Bày.',
      NOPOSM,
    ],
  },
  {
    key: 'MAY_GIAT',
    name: 'Máy giặt',
    items: [
      'Máy Giặt Sạch Sẽ, Không Bám Bụi Bẩn, Bên Trong Không Có Giấy Rác, Vật Dụng Thừa.',
      'Có Đầy Đủ Bảng Cấu Hình.',
      'Khoảng Trống Giữa 2 Sản Phẩm Không Quá 30cm.',
      'Trong Khu Trưng Bày Máy Giặt Không Có Các Sản Phẩm Khác Trưng Bày Tại Đây.',
      NOPOSM,
    ],
  },
  {
    key: 'GIA_DUNG',
    name: 'Gia dụng',
    items: [
      'Line/Vách Trưng Bày, Các Sản Phẩm Hàng Gia Dụng Không Được Bụi Bẩn.',
      'Có Đầy Đủ Bảng Giá/Tem Giá Và Không Được Cũ, Rách',
      'Không Có Vị Trí Trống Trên Line/Vách Trưng Bày.',
      'Không Lẫn Lộn Các Nhóm Hàng Với Nhau. Ví Dụ: Nồi Cơm Không Được Để Cùng Với Bếp Điện.',
      NOPOSM,
    ],
  },
  {
    key: 'XE_DAP',
    name: 'Xe đạp',
    items: [
      'Khung Xe, Mâm Xe, Yên Xe, Phụ Kiện Xe Đạp Không Bị Rỉ Sét, Cong Vênh, Bụi Bẩn, Vỡ.',
      'Xe Đạp Trưng Bày Đầy Đủ Bảng Giá Và Bảng Giá Không Bị Mờ, Rách Và Lốp Xe Đạp Phải Được Bơm Căng, Không Nứt Vỡ.',
      '100% Đèn Và Quạt Được Bật Và Không Có Bóng Đèn Cháy.',
      'Xe Phải Để Đúng Nơi Theo Bảng Định Vị Và Phụ Kiện Xe Đạp Treo Đúng Vị Trí.',
    ],
  },
  { key: 'THU_NGAN', name: 'Khu vực thu ngân – HTKT', items: THU_NGAN_HTKT },
  { key: 'WC', name: 'WC', items: WC },
  { key: 'KHO', name: 'Kho', items: KHO_TGDD_DMX },
];

const TOPZONE: CriteriaGroup[] = [
  {
    key: 'BAI_XE',
    name: 'Bãi xe',
    items: [
      'Mặt Tiền Bãi Xe Cửa Hàng Sạch Sẽ, Không Có Các Vật Dụng Phát Sinh Ngoài Quy Hoạch Chuẩn Của Apple. Ví Dụ: Standy Tự Phát, Mockup Máy Lạnh, Thùng Hàng Hoá, Tấm Che Yên Xe, Thùng Rác …',
      'Cửa Ra Vào, Vách Kính Sạch Sẽ, Không Bị Hư Hỏng Và Không Dán Các Nội Dung Tự Phát.',
      'Bảng Hiệu, Đèn Chiếu Sáng Sạch Sẽ Và Không Bị Hư Hỏng.',
      'Các Vách Tường Bên Ngoài Siêu Thị Sạch Sẽ Và Không Bị Hư Hỏng.',
    ],
  },
  {
    key: 'TRONG_ST',
    name: 'Trong siêu thị',
    items: [
      'Sàn Nhà + Trần Nhà Sạch Sẽ, Không Có Bụi Bẩn, Màng Nhện Và Không Bị Bong Tróc, Nứt.',
      'Các Bức Tường Sạch Sẽ, Không Có Bụi Bẩn Và Không Bị Bong Tróc, Nứt.',
      'Đèn Chiếu Sáng Sạch Sẽ, Không Hư Hỏng Và Chiếu Sáng Tốt.',
      'Đèn Led + Khung Tranh Vải Sạch Sẽ Không Hư Hỏng Và Chiếu Sáng Tốt.',
      'Trong Siêu Thị Luôn Sạch Sẽ Gọn Gàng Không Có Các Vật Dụng Thừa Như: Sọt Rác, Thảm Lau Chân, Cây Cảnh, Ticker, Ly Cafe, Thùng Hàng …',
      'Đối Với 37 Shop Có Thảm: Từ Mép Thảm Đến Các Modul Khác, Đảm Bảo Khoản Cách Tối Thiểu 45cm.',
      'Đối Với 4 Shop Có 1 Bàn 2M: Từ Mép Bàn Đến Các Modul Khác, Đảm Bảo Khoản Cách Tối Thiểu: 2 Lối Đi Chính 90Cm – 2 Đầu Bàn 80cm.',
      'Đối Với 158 Shop Có 1 Bàn 1.5M: Từ Mép Bàn Đến Các Modul Khác, Đảm Bảo Khoản Cách Tối Thiểu: 2 Lối Đi Chính 90Cm – 2 Đầu Bàn 80cm.',
      'Trên Trần Nhà Khu Vực Thảm/ Bàn Apple Thông Thoáng: Không Triển Khai Treo Hanging, Nơ, Bong Bóng …',
    ],
  },
  {
    key: 'BAN_TN',
    name: 'Bàn trải nghiệm',
    items: [
      'Bàn, Vách Trải Nghiệm Luôn Sạch Sẽ, Không Hư Hỏng, Không Phát Sinh Các Hạng Mục Khác Ngoài Sơ Đồ Trưng Bày. Ví Dụ: Sticker, Nơ, Bông Hoa, Tờ Rơi …',
      'Tất Cả Máy DEMO iPhone – iPad – Macbook – Applewatch – Keyboar – Pencil Đều Đang Được Trưng Bày Đúng/ Đủ Theo Sơ Đồ Mới Nhất.',
      'Tất Cả Máy DEMO iPhone – iPad – Macbook – Applewatch Đều Đã Được Cài Hoàn Tất DCOTA 100%.',
      'Tất Cả Máy DEMO iPhone – iPad – Macbook – Applewatch – Keyboar – Pencil Luôn Được Sạc 100% Pin.',
      'Bộ Thảm Sạch Sẽ, Không Bong Tróc.',
      'Bàn Trải Nghiệm Sạch Sẽ, Không Có Vết Ố Bẩn, Không Trầy Xước, Hư Hỏng.',
      'Trên Mặt Bàn Không Có Các Vật Dụng Nằm Ngoài Sơ Đồ Trưng Bày Của Apple. Ví Dụ: Sticker, Bông Hoa, Nơ, Tờ Rơi …',
      'Dưới Bàn, Sạch Sẽ Không Để Thùng Hàng Hoá, Thảm Lau Chân, Xô, Chậu Cây …',
      'Thiết Bị Chống Trộm Sạch Sẽ, Và Đang Hoạt Động Tốt.',
    ],
  },
  {
    key: 'THU_NGAN',
    name: 'Khu vực thu ngân',
    items: [
      'Không Để Đồ Ăn, Nước Uống Tại Quầy Thu Ngân, Thùng Rác Tại Quầy Thu Ngân Được Để Trong Khu Vực Khách Hàng Không Nhìn Thấy.',
      'Trên Mặt Bàn Quầy Thu Ngân Không Có Vật Dụng Thừa. (Chỉ Được Để Macbook Và Đồ Trang Trí Nếu Được Sự Đồng Ý Của Bên Apple).',
    ],
  },
  {
    key: 'TRANH_ANH',
    name: 'Tranh – ảnh',
    items: [
      'Tranh LED Vải Treo Tường (4M/2M) Được Trưng Bày Đúng Hướng Và Đúng Nội Dung Theo Sơ Đồ Trưng Bày.',
      'Tất Cả Tranh Trên Bàn Trải Nghiệm (A3/A5) Được Triển Khai Đủ Và Đúng Nội Dung Theo Sơ Đồ Trưng Bày.',
      'Tất Cả Bảng Giá A6 Được Trưng Bày Gọn Gàng Đúng Vị Trí, Đúng Kích Thước Theo Sơ Đồ Trưng Bày.',
      'Tất Cả Khung Tranh, Mica Sạch Sẽ Và Không Bị Hư Hỏng, Nứt, Mẻ …',
    ],
  },
  {
    key: 'KET_NOI',
    name: 'Kết nối',
    items: [
      'Tất Cả Các Thiết Bị Được Kết Nối Với Internet. IT Duy Trì Băng Thông Wifi Tối Thiểu 12Mbps.',
      'Tất Cả Các Phụ Kiện DEMO Được Ghép Đôi Với Macbook/ IPad/ IMac Và Luôn Được Sạc Pin Tối Thiểu 100%.',
    ],
  },
  {
    key: 'PHU_KIEN',
    name: 'Phụ kiện',
    items: [
      'Khu Vực Trưng Bày Phụ Kiện Không Được Bụi Bẩn.',
      'Không Có Móc Trống Trên Vách Trưng Bày Phụ Kiện, Tối Thiểu 2 Sản Phẩm Mỗi Móc.',
      'Tem Giá Trên Các Sản Phẩm Phụ Kiện Được In Đầy Đủ, Chính Xác.',
      'Nhóm Sản Phẩm Phụ Kiện Trưng Bày Theo Vách Quy Hoạch.',
      'Hai Vách Cùng Nhóm Phụ Kiện Trưng Bày Liền Nhau Và Sản Phẩm Phụ Kiện Thuộc Vách Này Không Được Trưng Bày Trong Vách Khác.',
    ],
  },
  { key: 'WC', name: 'WC', items: WC },
  {
    key: 'KHO',
    name: 'Kho',
    items: [
      'Không Được Để Đồ Ăn Bừa Bãi Trong Kho.',
      'Thùng Rác Trong Kho Không Được Để Lâu Ngày, Đầy Nhưng Chưa Được Đổ.',
      'Trong Kho Cần Gọn Gàng, Sạch Sẽ, Không Có Mùi Hôi Khó Chịu.',
      'Tủ Sever Được Đặt Trong Vạch Sơn Vàng Quy Định, Không Có Thùng Đặt Trên Nóc, Không Treo Quần Áo, Không Để Giấy Tờ Ghim Trên Mặt Cửa.',
      'Trong Kho Phải Có Bảng Định Vị Từng Khu Vực Và Sơ Đồ Kho.',
      'Hàng Hóa Được Để Đúng Theo Bảng Định Vị.',
      'Hàng Hóa Trong Kho Được Sắp Xếp Gọn Gàng, Ngay Ngắn.',
    ],
  },
];

export const CRITERIA: Record<Chain, CriteriaGroup[]> = { TGDD, DMX, TOPZONE };

export const CHAIN_LABEL: Record<Chain, string> = {
  TGDD: 'Thế Giới Di Động',
  DMX: 'Điện Máy Xanh',
  TOPZONE: 'TopZone',
};

export const CHAIN_SHORT: Record<Chain, string> = { TGDD: 'TGDĐ', DMX: 'ĐMX', TOPZONE: 'TopZone' };

export function findGroup(chain: Chain, key: string): CriteriaGroup | undefined {
  return CRITERIA[chain].find((g) => g.key === key);
}
