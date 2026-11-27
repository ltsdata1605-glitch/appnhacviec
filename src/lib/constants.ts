import type { PostCategory, Priority, Role, Store, TaskScope } from './types';

export const APP_NAME = 'Nhắc việc';

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Quản lý',
  staff: 'Nhân viên',
  pg: 'PG',
};

export const DEFAULT_DEPARTMENTS = ['Quản lý', 'Thu ngân', 'Kho', 'Tư vấn bán hàng', 'Kỹ thuật – Giao lắp', 'PG'];

export const DEFAULT_BRANDS = [
  'Samsung', 'LG', 'Sony', 'TCL', 'Panasonic', 'Toshiba', 'Aqua', 'Casper', 'Daikin',
  'Electrolux', 'Sharp', 'Xiaomi', 'Apple', 'Oppo', 'Vivo', 'Philips', 'Sunhouse',
];

export function defaultStore(code: string, name: string, chain: Store['chain']): Omit<Store, 'createdAt'> {
  return {
    id: code,
    code,
    name,
    chain,
    address: '',
    location: null,
    radius: 200,
    deadline: '21:00',
    reminderTimes: ['17:00', '20:00'],
    digestTime: '07:30',
    quietStart: '22:00',
    quietEnd: '06:00',
    minPhotos: 2,
    retentionDays: 15, // ảnh báo cáo, ảnh xác nhận công việc tự xoá cuốn chiếu sau 15 ngày
    escalateMinutes: 30,
    departments: DEFAULT_DEPARTMENTS,
    brands: DEFAULT_BRANDS,
  };
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: 'Thường',
  high: 'Cao',
  urgent: 'Khẩn',
};

export const SCOPE_LABEL: Record<TaskScope, string> = {
  personal: 'Cá nhân',
  department: 'Bộ phận',
  brand: 'Theo hãng',
  store: 'Toàn siêu thị',
};

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Không nhắc trước' },
  { value: 15, label: 'Trước 15 phút' },
  { value: 30, label: 'Trước 30 phút' },
  { value: 60, label: 'Trước 1 giờ' },
  { value: 180, label: 'Trước 3 giờ' },
  { value: 1440, label: 'Trước 1 ngày' },
];

export const POST_CATEGORIES: { key: PostCategory; label: string; icon: string; color: string }[] = [
  { key: 'notice', label: 'Thông báo', icon: 'megaphone', color: 'red' },
  { key: 'rules', label: 'Nội quy – quy định', icon: 'shield', color: 'indigo' },
  { key: 'campaign', label: 'Triển khai – CTKM', icon: 'tag', color: 'orange' },
  { key: 'policy', label: 'Chính sách', icon: 'doc', color: 'blue' },
  { key: 'process', label: 'Quy trình – hướng dẫn', icon: 'list', color: 'green' },
  { key: 'forms', label: 'Biểu mẫu', icon: 'paperclip', color: 'gray' },
];

export const PERMISSION_LABEL: { key: 'assign' | 'library' | 'review' | 'approve' | 'cash' | 'sales'; label: string; desc: string }[] = [
  { key: 'assign', label: 'Giao việc bộ phận, toàn siêu thị', desc: 'Giao việc cho bộ phận, PG, toàn siêu thị, việc lặp lại và tạo điểm danh. Ai cũng giao được việc cá nhân.' },
  { key: 'cash', label: 'Xem kiểm quỹ toàn kho', desc: 'Xem lịch sử kiểm quỹ của mọi người trong kho' },
  { key: 'sales', label: 'Xem khai thác toàn kho', desc: 'Xem báo cáo khai thác, thống kê và xếp hạng của mọi người trong kho' },
  { key: 'review', label: 'Chấm báo cáo ảnh', desc: 'Xem toàn bộ ảnh 8NTTT và chấm Đạt/Không đạt' },
  { key: 'library', label: 'Đăng thư viện', desc: 'Đăng, sửa quy định và nội dung triển khai' },
  { key: 'approve', label: 'Duyệt nhân viên', desc: 'Duyệt nhân viên và PG mới của kho' },
];

export const MAX_PHOTOS = 6;
