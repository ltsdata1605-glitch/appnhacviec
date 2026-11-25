// Kiểu dữ liệu dùng chung cho toàn ứng dụng.
// Mọi mốc thời gian lưu dạng số mili-giây (epoch ms); ngày lưu dạng chuỗi 'YYYY-MM-DD' theo giờ Việt Nam.

export type Role = 'manager' | 'staff' | 'pg';
export type UserStatus = 'pending' | 'active' | 'rejected' | 'disabled';
export type Chain = 'TGDD' | 'DMX' | 'TOPZONE';

export interface Permissions {
  assign?: boolean; // Giao việc
  library?: boolean; // Đăng thư viện
  review?: boolean; // Xem & chấm báo cáo ảnh
  approve?: boolean; // Duyệt nhân viên mới
}

export interface UserProfile {
  id: string; // = uid
  uid: string;
  email: string;
  photoURL?: string;
  fullName: string;
  userCode?: string; // User nội bộ (nhân viên, quản lý)
  brand?: string; // Hãng (PG)
  role: Role;
  status: UserStatus;
  storeCode: string;
  department?: string;
  position?: string; // Chức danh hiển thị (tuỳ chọn)
  permissions?: Permissions;
  // Đăng ký quản lý cho kho chưa tồn tại
  storeName?: string;
  chain?: Chain;
  // Yêu cầu chuyển kho
  transferTo?: string | null;
  transferAt?: number | null;
  rejectReason?: string;
  createdAt: number;
  approvedAt?: number;
  approvedBy?: string;
  updatedAt?: number;
}

export interface Store {
  id: string; // = mã kho
  code: string;
  name: string;
  chain: Chain;
  address?: string;
  location?: { lat: number; lng: number } | null;
  radius: number; // mét
  deadline: string; // 'HH:mm' — nộp sau giờ này tính trễ
  reminderTimes: string[]; // nhắc nhân viên chưa báo cáo
  digestTime: string; // tóm tắt đầu ngày
  quietStart: string;
  quietEnd: string;
  minPhotos: number;
  retentionDays: number;
  escalateMinutes: number;
  departments: string[];
  brands: string[];
  createdAt: number;
}

export interface Area {
  id: string;
  storeCode: string;
  name: string;
  templateKey?: string; // khóa mẫu 8NTTT, ví dụ 'DMX:TIVI'
  criteria: string[];
  ownerUid?: string | null;
  ownerSince?: string | null; // 'YYYY-MM-DD'
  backupUid?: string | null;
  minPhotos?: number | null;
  refPhotoUrl?: string | null;
  order: number;
  active: boolean;
  createdAt: number;
  createdDate: string;
}

export interface Photo {
  url: string;
  thumbUrl: string;
  path?: string;
  thumbPath?: string;
  capturedAt: number;
  hash?: string;
  w?: number;
  h?: number;
}

export interface GeoStamp {
  lat: number;
  lng: number;
  accuracy: number;
  distance: number | null; // mét tới siêu thị
}

export type ReviewResult = 'pass' | 'fail';

export interface Report {
  id: string; // `${storeCode}_${date}_${areaId}`
  storeCode: string;
  date: string;
  areaId: string;
  areaName: string;
  uid: string;
  userName: string;
  photos: Photo[];
  checks: boolean[]; // tự đánh giá theo từng tiêu chí
  note?: string;
  geo?: GeoStamp | null;
  submittedAt: number;
  attempt: number;
  previousPhotos?: Photo[];
  review?: {
    result: ReviewResult;
    failed: number[]; // chỉ số tiêu chí không đạt
    note?: string;
    by: string;
    byName: string;
    at: number;
  } | null;
  suspect?: string | null; // cảnh báo nghi vấn (do máy chủ gắn)
  photosPurged?: boolean;
}

export type TaskScope = 'personal' | 'department' | 'brand' | 'store';
export type TaskStatus = 'open' | 'pending_review' | 'done' | 'returned';
export type Priority = 'normal' | 'high' | 'urgent';
export type CompletionMode = 'any' | 'each';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  by?: string;
  at?: number;
}

export interface Activity {
  type: 'created' | 'seen' | 'done' | 'confirmed' | 'reopened' | 'submitted' | 'approved' | 'returned' | 'comment' | 'nudged' | 'edited';
  uid: string;
  name: string;
  at: number;
  note?: string;
}

export interface Task {
  id: string;
  storeCode: string;
  shared: boolean; // true nếu không phải việc cá nhân
  scope: TaskScope;
  assigneeUid?: string | null;
  assigneeName?: string | null;
  department?: string | null;
  brand?: string | null;
  groupId?: string | null;
  title: string;
  note?: string;
  priority: Priority;
  dueAt?: number | null;
  remindBefore?: number | null; // phút
  checklist: ChecklistItem[];
  requirePhoto: boolean;
  requireApproval: boolean;
  completionMode: CompletionMode;
  status: TaskStatus;
  completions?: Record<string, number>; // chế độ 'each'
  seenBy?: Record<string, number>;
  photos?: Photo[];
  completedBy?: string | null;
  completedByName?: string | null;
  completedAt?: number | null;
  activity: Activity[];
  templateId?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt?: number;
  reminded?: { before?: boolean; due?: boolean; escalated?: boolean };
}

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly';
  days?: number[]; // weekly: 1..7 (Thứ Hai = 1); monthly: 1..31
  time: string; // giờ hạn 'HH:mm'
}

export interface TaskTemplate {
  id: string;
  storeCode: string;
  title: string;
  note?: string;
  scope: TaskScope;
  assigneeUids?: string[];
  department?: string | null;
  brand?: string | null;
  priority: Priority;
  checklist: string[];
  requirePhoto: boolean;
  requireApproval: boolean;
  completionMode: CompletionMode;
  remindBefore?: number | null;
  recurrence: Recurrence;
  active: boolean;
  lastGenerated?: string | null;
  createdBy: string;
  createdAt: number;
}

export type PostCategory = 'rules' | 'campaign' | 'policy' | 'process' | 'forms' | 'notice';

export interface Attachment {
  name: string;
  url: string;
  type: string;
  path?: string;
  size?: number;
}

export interface Post {
  id: string;
  storeCode: string;
  category: PostCategory;
  title: string;
  body: string;
  attachments: Attachment[];
  audience: { type: 'all' | 'department' | 'brand' | 'role'; value?: string | null };
  pinned: boolean;
  requireAck: boolean;
  version: number;
  acks: Record<string, { at: number; v: number; name: string }>;
  effectiveFrom?: string | null;
  expiresOn?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

export interface Leave {
  id: string;
  storeCode: string;
  uid: string;
  userName: string;
  date: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  uid: string; // người nhận
  storeCode: string;
  fromUid: string;
  fromName: string;
  title: string;
  body: string;
  link?: string; // ví dụ 'task:ID', 'report:ID', 'post:ID', 'people'
  urgent?: boolean;
  read: boolean;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  storeCode: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetUid?: string;
  targetName?: string;
  detail?: string;
  at: number;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}
