// Dữ liệu mẫu cho chế độ xem thử. Tên người và mã kho đều là giả lập.
import { CRITERIA } from './criteria';
import { defaultStore } from './constants';
import { addDays, now, vnAt, vnDate } from './time';
import type { Area, Leave, Post, Report, Task, UserProfile } from './types';

type Doc = Record<string, unknown> & { id: string };

const STORE = '1234';

function rand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const DEMO_PERSONAS = [
  { uid: 'u-quan', label: 'Quản lý + Admin', desc: 'Trần Minh Quân · Quản lý kho 1234' },
  { uid: 'u-nam', label: 'Nhân viên', desc: 'Lê Hoàng Nam · Tư vấn bán hàng' },
  { uid: 'u-tram', label: 'PG', desc: 'Huỳnh Ngọc Trâm · PG Samsung' },
  { uid: 'u-new', label: 'Người mới đăng ký', desc: 'Tài khoản Google chưa có hồ sơ' },
];

export function seedDemo(): Record<string, Record<string, Doc>> {
  const t = now();
  const today = vnDate(t);
  const r = rand(42);
  const db: Record<string, Record<string, Doc>> = {};
  const put = (col: string, d: Doc) => ((db[col] ||= {})[d.id] = d);

  put('admins', { id: 'quan.demo@gmail.com', email: 'quan.demo@gmail.com' });
  put('_accounts', { id: 'u-new', uid: 'u-new', email: 'moi.demo@gmail.com', displayName: 'Ngô Gia Huy' });

  put('stores', {
    ...defaultStore(STORE, 'ĐMX Mẫu Quận 7', 'DMX'),
    address: '123 Đường Mẫu, Quận 7, TP.HCM',
    location: { lat: 10.7329, lng: 106.7219 },
    createdAt: t - 90 * 86400000,
  } as unknown as Doc);
  put('stores', {
    ...defaultStore('5678', 'TGDĐ Mẫu Thủ Đức', 'TGDD'),
    createdAt: t - 60 * 86400000,
  } as unknown as Doc);

  const people: [string, string, Partial<UserProfile>][] = [
    ['u-quan', 'Trần Minh Quân', { role: 'manager', userCode: 'Quantm', department: 'Quản lý', position: 'Quản lý siêu thị' }],
    ['u-lan', 'Nguyễn Thị Lan', { role: 'staff', userCode: 'Lannt', department: 'Thu ngân', permissions: { assign: true } }],
    ['u-hung', 'Phạm Văn Hùng', { role: 'staff', userCode: 'Hungpv', department: 'Kho', position: 'Thủ kho' }],
    ['u-nam', 'Lê Hoàng Nam', { role: 'staff', userCode: 'Namlh', department: 'Tư vấn bán hàng' }],
    ['u-mai', 'Võ Thị Mai', { role: 'staff', userCode: 'Maivt', department: 'Tư vấn bán hàng', position: 'Trưởng ca', permissions: { review: true, assign: true } }],
    ['u-bao', 'Đặng Quốc Bảo', { role: 'staff', userCode: 'Baodq', department: 'Kỹ thuật – Giao lắp' }],
    ['u-khoa', 'Trịnh Đăng Khoa', { role: 'staff', userCode: 'Khoatd', department: 'Tư vấn bán hàng' }],
    ['u-tram', 'Huỳnh Ngọc Trâm', { role: 'pg', brand: 'Samsung', department: 'PG' }],
    ['u-tu', 'Bùi Thanh Tú', { role: 'pg', brand: 'LG', department: 'PG' }],
    ['u-vy', 'Phan Tường Vy', { role: 'pg', brand: 'Sony', department: 'PG' }],
  ];
  people.forEach(([id, name, extra], i) => {
    put('users', {
      id,
      uid: id,
      email: id === 'u-quan' ? 'quan.demo@gmail.com' : `${id.slice(2)}.demo@gmail.com`,
      fullName: name,
      status: 'active',
      storeCode: STORE,
      createdAt: t - (80 - i) * 86400000,
      approvedAt: t - (79 - i) * 86400000,
      approvedBy: 'u-quan',
      permissions: {},
      ...extra,
    } as unknown as Doc);
  });
  put('users', {
    id: 'u-pending1', uid: 'u-pending1', email: 'ngan.demo@gmail.com', fullName: 'Đỗ Kim Ngân', role: 'pg', brand: 'Panasonic',
    status: 'pending', storeCode: STORE, createdAt: t - 3600000,
  });
  put('users', {
    id: 'u-pending2', uid: 'u-pending2', email: 'phuc.demo@gmail.com', fullName: 'Lâm Hữu Phúc', role: 'staff', userCode: 'Phuclh',
    status: 'active', storeCode: '5678', transferTo: STORE, transferAt: t - 7200000, createdAt: t - 40 * 86400000,
  });
  put('users', {
    id: 'u-mgr2', uid: 'u-mgr2', email: 'tuan.demo@gmail.com', fullName: 'Cao Minh Tuấn', role: 'manager', userCode: 'Tuancm',
    status: 'pending', storeCode: '9012', storeName: 'ĐMX Mẫu Bình Thạnh', chain: 'DMX', createdAt: t - 5400000,
  });

  // Khu vực 8NTTT
  const groups = CRITERIA.DMX;
  const owners: Record<string, string> = {
    TIVI: 'u-nam', TU_LANH: 'u-khoa', MAY_GIAT: 'u-mai', GIA_DUNG: 'u-tu', TU_PHONE: 'u-tram', PHU_KIEN: 'u-vy',
    THU_NGAN: 'u-lan', KHO: 'u-hung', BAI_XE: 'u-bao', MAY_LANH: 'u-khoa', LAPTOP: 'u-mai', TRONG_ST: 'u-quan',
  };
  const areas: Area[] = groups
    .filter((g) => owners[g.key])
    .map((g, i) => ({
      id: `a-${g.key.toLowerCase()}`,
      storeCode: STORE,
      name: g.name,
      templateKey: `DMX:${g.key}`,
      criteria: g.items,
      ownerUid: owners[g.key],
      ownerSince: addDays(today, -60),
      backupUid: owners[g.key] === 'u-nam' ? 'u-khoa' : null,
      minPhotos: null,
      refPhotoUrl: `demo:ref:${g.key}`,
      order: i,
      active: true,
      createdAt: t - 70 * 86400000,
      createdDate: addDays(today, -70),
    }));
  areas.forEach((a) => put('areas', a as unknown as Doc));

  const nameOf = (id: string) => people.find((p) => p[0] === id)?.[1] || '';

  // Nghỉ phép
  const leaves: Leave[] = [
    { id: 'l1', storeCode: STORE, uid: 'u-khoa', userName: nameOf('u-khoa'), date: addDays(today, -3), status: 'approved', reason: 'Nghỉ phép năm', createdBy: 'u-quan', createdAt: t - 5 * 86400000 },
    { id: 'l2', storeCode: STORE, uid: 'u-tu', userName: nameOf('u-tu'), date: addDays(today, 2), status: 'pending', reason: 'Việc gia đình', createdBy: 'u-tu', createdAt: t - 7200000 },
  ];
  leaves.forEach((l) => put('leaves', l as unknown as Doc));

  // Báo cáo 30 ngày gần nhất
  const deadline = '21:00';
  for (let back = 30; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const a of areas) {
      if (back === 0 && ['a-gia_dung', 'a-bai_xe', 'a-tivi'].includes(a.id)) continue; // hôm nay chưa nộp
      const roll = r();
      if (back > 0 && roll < 0.07) continue; // bỏ báo cáo
      if (leaves.some((l) => l.uid === a.ownerUid && l.date === date && l.status === 'approved')) continue;
      const late = back > 0 && roll > 0.9;
      const hm = late ? `21:${String(10 + Math.floor(r() * 45)).padStart(2, '0')}` : `${String(8 + Math.floor(r() * 9)).padStart(2, '0')}:${String(Math.floor(r() * 59)).padStart(2, '0')}`;
      const at = vnAt(date, hm);
      if (at > t) continue;
      const n = 2 + (r() > 0.6 ? 1 : 0);
      const fail = back > 0 && r() < 0.06;
      const rep: Report = {
        id: `${STORE}_${date}_${a.id}`,
        storeCode: STORE,
        date,
        areaId: a.id,
        areaName: a.name,
        uid: a.ownerUid!,
        userName: nameOf(a.ownerUid!),
        photos: Array.from({ length: n }, (_, k) => ({
          url: `demo:${a.templateKey}:${date}:${k}:${hm.replace(':', 'h')}`,
          thumbUrl: `demo:${a.templateKey}:${date}:${k}:${hm.replace(':', 'h')}`,
          capturedAt: at - (n - k) * 40000,
        })),
        checks: a.criteria.map(() => r() > 0.05),
        note: r() > 0.85 ? 'Đèn line trên cùng chập chờn, đã báo kỹ thuật.' : '',
        geo: { lat: 10.7329, lng: 106.7219, accuracy: 18, distance: Math.round(5 + r() * 40) },
        submittedAt: at,
        attempt: 1,
        review:
          back > 0 && r() > 0.3
            ? { result: fail ? 'fail' : 'pass', failed: fail ? [0] : [], note: fail ? 'Còn bụi trên mặt kệ, lau lại.' : '', by: 'u-quan', byName: 'Trần Minh Quân', at: at + 3600000 }
            : null,
      };
      put('reports', rep as unknown as Doc);
    }
  }
  void deadline;

  // Công việc
  const mk = (id: string, p: Partial<Task>): Task => ({
    id,
    storeCode: STORE,
    shared: p.scope !== 'personal',
    scope: 'personal',
    title: '',
    priority: 'normal',
    checklist: [],
    requirePhoto: false,
    requireApproval: false,
    completionMode: 'any',
    status: 'open',
    activity: [{ type: 'created', uid: 'u-quan', name: 'Trần Minh Quân', at: p.createdAt || t - 3600000 }],
    createdBy: 'u-quan',
    createdByName: 'Trần Minh Quân',
    createdAt: t - 3600000,
    seenBy: {},
    ...p,
  });
  const tasks: Task[] = [
    mk('t1', {
      scope: 'personal', shared: false, assigneeUid: 'u-nam', assigneeName: nameOf('u-nam'),
      title: 'Thay bảng giá CTKM Black Friday line Tivi', note: 'In bảng giá mới từ hệ thống, thay toàn bộ tem giá line Tivi Samsung và LG. Chụp ảnh sau khi thay.',
      priority: 'high', dueAt: vnAt(today, '10:30'), remindBefore: 30, requirePhoto: true,
      checklist: [
        { id: 'c1', text: 'In bảng giá mới', done: true, by: 'u-nam', at: t - 1800000 },
        { id: 'c2', text: 'Thay tem giá line Samsung', done: false },
        { id: 'c3', text: 'Thay tem giá line LG', done: false },
      ],
      seenBy: { 'u-nam': t - 3000000 },
      activity: [
        { type: 'created', uid: 'u-quan', name: 'Trần Minh Quân', at: t - 3600000 },
        { type: 'seen', uid: 'u-nam', name: 'Lê Hoàng Nam', at: t - 3000000 },
      ],
    }),
    mk('t2', {
      scope: 'personal', shared: false, assigneeUid: 'u-nam', assigneeName: nameOf('u-nam'),
      title: 'Gọi lại khách hẹn xem máy giặt Electrolux', priority: 'normal', dueAt: vnAt(today, '15:00'),
      note: 'Khách Hoa, SĐT trong phiếu hẹn. Báo khách hàng đã về.',
    }),
    mk('t3', {
      scope: 'personal', shared: false, assigneeUid: 'u-nam', assigneeName: nameOf('u-nam'),
      title: 'Kiểm tra máy demo bàn trải nghiệm', priority: 'urgent', dueAt: t - 20 * 60000, remindBefore: 15,
      createdAt: t - 4 * 3600000,
    }),
    mk('t4', {
      scope: 'department', department: 'Kho', title: 'Nhận hàng chuyến 2 – Tủ lạnh Aqua', priority: 'high',
      dueAt: vnAt(today, '14:00'), completionMode: 'any', note: '12 thùng, đối chiếu phiếu xuất trước khi ký.',
    }),
    mk('t5', {
      scope: 'department', department: 'Thu ngân', title: 'Kiểm quỹ đầu ca', priority: 'normal', dueAt: vnAt(today, '08:30'),
      status: 'done', completedBy: 'u-lan', completedByName: 'Nguyễn Thị Lan', completedAt: vnAt(today, '08:12'),
      activity: [
        { type: 'created', uid: 'u-quan', name: 'Trần Minh Quân', at: vnAt(today, '00:05') },
        { type: 'done', uid: 'u-lan', name: 'Nguyễn Thị Lan', at: vnAt(today, '08:12') },
      ],
      templateId: 'tpl1', createdAt: vnAt(today, '00:05'),
    }),
    mk('t6', {
      scope: 'store', title: 'Nắm chính sách đổi trả mới áp dụng từ 01/12', priority: 'high', completionMode: 'each',
      dueAt: vnAt(addDays(today, 2), '18:00'), note: 'Đọc bài “Chính sách đổi trả 12/2026” trong Thư viện và bấm xác nhận tại đây.',
      completions: { 'u-lan': t - 7000000, 'u-hung': t - 6000000, 'u-mai': t - 5000000 },
    }),
    mk('t7', {
      scope: 'brand', brand: 'Samsung', title: 'Thay POSM Galaxy mới tại tủ phone', priority: 'normal',
      dueAt: vnAt(addDays(today, 1), '12:00'), requirePhoto: true,
    }),
    mk('t8', {
      scope: 'personal', shared: false, assigneeUid: 'u-hung', assigneeName: nameOf('u-hung'),
      title: 'Sắp xếp lại kệ kho theo bảng định vị mới', priority: 'normal', dueAt: t - 2 * 3600000,
      requireApproval: true, status: 'pending_review', completedBy: 'u-hung', completedByName: nameOf('u-hung'), completedAt: t - 2.5 * 3600000,
    }),
    mk('t9', {
      scope: 'personal', shared: false, assigneeUid: 'u-khoa', assigneeName: nameOf('u-khoa'),
      title: 'Lau mockup tủ lạnh Side by Side', priority: 'normal', dueAt: t - 90 * 60000,
    }),
    mk('t10', {
      scope: 'personal', shared: false, assigneeUid: 'u-tram', assigneeName: nameOf('u-tram'),
      title: 'Cập nhật số lượng máy trưng bày Galaxy S26', priority: 'normal', dueAt: vnAt(today, '17:00'),
    }),
  ];
  tasks.forEach((x) => put('tasks', x as unknown as Doc));

  put('taskTemplates', {
    id: 'tpl1', storeCode: STORE, title: 'Kiểm quỹ đầu ca', scope: 'department', department: 'Thu ngân', priority: 'normal',
    checklist: [], requirePhoto: false, requireApproval: false, completionMode: 'any', remindBefore: 15,
    recurrence: { type: 'daily', time: '08:30' }, active: true, lastGenerated: today, createdBy: 'u-quan', createdAt: t - 30 * 86400000,
  });
  put('taskTemplates', {
    id: 'tpl2', storeCode: STORE, title: 'Checklist đóng cửa siêu thị', scope: 'department', department: 'Quản lý', priority: 'high',
    checklist: ['Tắt đèn pha, máy lạnh', 'Kiểm tra cửa kho', 'Bật hệ thống báo động'], requirePhoto: true, requireApproval: false,
    completionMode: 'any', remindBefore: 30, recurrence: { type: 'daily', time: '22:00' }, active: true, lastGenerated: today,
    createdBy: 'u-quan', createdAt: t - 30 * 86400000,
  });

  // Thư viện
  const posts: Post[] = [
    {
      id: 'p1', storeCode: STORE, category: 'policy', title: 'Chính sách đổi trả 12/2026',
      body: 'Áp dụng từ 01/12/2026 cho toàn bộ ngành hàng điện máy.\n\n**Điểm mới**\n- Lỗi do nhà sản xuất: đổi mới trong 30 ngày đầu.\n- Không lỗi: hoàn tiền 80% trong 7 ngày nếu còn đủ hộp và phụ kiện.\n- Tivi trên 65 inch: kỹ thuật kiểm tra tại nhà trước khi nhận lại.\n\n**Lưu ý khi tư vấn**\nGiải thích rõ điều kiện đổi trả trước khi chốt đơn. Ghi chú vào phiếu bán hàng nếu khách có yêu cầu riêng.',
      attachments: [], audience: { type: 'all' }, pinned: true, requireAck: true, version: 1,
      acks: { 'u-lan': { at: t - 7000000, v: 1, name: 'Nguyễn Thị Lan' }, 'u-hung': { at: t - 6000000, v: 1, name: 'Phạm Văn Hùng' }, 'u-mai': { at: t - 5000000, v: 1, name: 'Võ Thị Mai' }, 'u-quan': { at: t - 9000000, v: 1, name: 'Trần Minh Quân' } },
      effectiveFrom: addDays(today, 6), createdBy: 'u-quan', createdByName: 'Trần Minh Quân', createdAt: t - 9000000, updatedAt: t - 9000000,
    },
    {
      id: 'p2', storeCode: STORE, category: 'campaign', title: 'Triển khai Black Friday 2026',
      body: 'Thời gian: 27/11 – 30/11.\n\n- Thay toàn bộ POSM, PP ô kính theo bộ nhận diện mới.\n- Tivi mở video CTKM của hệ thống.\n- Mỗi line chụp ảnh sau khi thay bảng giá và gửi trong mục Công việc.',
      attachments: [], audience: { type: 'all' }, pinned: false, requireAck: true, version: 2,
      acks: { 'u-quan': { at: t - 86400000, v: 2, name: 'Trần Minh Quân' }, 'u-mai': { at: t - 80000000, v: 2, name: 'Võ Thị Mai' }, 'u-nam': { at: t - 90000000, v: 1, name: 'Lê Hoàng Nam' } },
      createdBy: 'u-quan', createdByName: 'Trần Minh Quân', createdAt: t - 2 * 86400000, updatedAt: t - 86400000,
    },
    {
      id: 'p3', storeCode: STORE, category: 'rules', title: 'Nội quy giờ giấc và đồng phục',
      body: '- Có mặt trước giờ vào ca 10 phút.\n- Đồng phục, thẻ tên đúng quy định.\n- Không sử dụng điện thoại cá nhân khi đang tiếp khách.\n- Báo cáo 8NTTT trước 21:00 mỗi ngày.',
      attachments: [], audience: { type: 'all' }, pinned: false, requireAck: false, version: 1, acks: {},
      createdBy: 'u-quan', createdByName: 'Trần Minh Quân', createdAt: t - 20 * 86400000, updatedAt: t - 20 * 86400000,
    },
    {
      id: 'p4', storeCode: STORE, category: 'process', title: 'Quy trình nhận hàng tại kho',
      body: '1. Đối chiếu số phiếu xuất với tài xế.\n2. Kiểm tra ngoại quan thùng, chụp ảnh thùng móp méo.\n3. Đếm số lượng, quét serial.\n4. Ký nhận và cập nhật hệ thống trong 30 phút.',
      attachments: [], audience: { type: 'department', value: 'Kho' }, pinned: false, requireAck: false, version: 1, acks: {},
      createdBy: 'u-quan', createdByName: 'Trần Minh Quân', createdAt: t - 12 * 86400000, updatedAt: t - 12 * 86400000,
    },
    {
      id: 'p5', storeCode: STORE, category: 'notice', title: 'Đoàn kiểm tra khu vực ghé siêu thị thứ Sáu',
      body: 'Đoàn kiểm tra 8NTTT sẽ ghé khoảng 9:00 thứ Sáu. Các bạn hoàn tất vệ sinh khu vực trước 8:30.',
      attachments: [], audience: { type: 'all' }, pinned: false, requireAck: true, version: 1,
      acks: { 'u-quan': { at: t - 3600000, v: 1, name: 'Trần Minh Quân' } },
      createdBy: 'u-quan', createdByName: 'Trần Minh Quân', createdAt: t - 3600000, updatedAt: t - 3600000,
    },
  ];
  posts.forEach((p) => put('posts', p as unknown as Doc));

  // Thông báo
  const notes = [
    { uid: 'u-nam', title: 'Việc mới từ Trần Minh Quân', body: 'Thay bảng giá CTKM Black Friday line Tivi · Hạn 10:30', link: 'task:t1', at: t - 3600000, read: true },
    { uid: 'u-nam', title: 'Sắp hết hạn', body: 'Kiểm tra máy demo bàn trải nghiệm · còn 15 phút', link: 'task:t3', at: t - 35 * 60000, read: false },
    { uid: 'u-nam', title: 'Bài mới cần xác nhận', body: 'Chính sách đổi trả 12/2026', link: 'post:p1', at: t - 9000000, read: false },
    { uid: 'u-quan', title: 'Có người đăng ký mới', body: 'Đỗ Kim Ngân (PG Panasonic) đang chờ duyệt', link: 'people', at: t - 3600000, read: false },
    { uid: 'u-quan', title: 'Chờ duyệt hoàn tất', body: 'Phạm Văn Hùng đã hoàn tất: Sắp xếp lại kệ kho theo bảng định vị mới', link: 'task:t8', at: t - 2.5 * 3600000, read: false },
  ];
  notes.forEach((n, i) =>
    put('notifications', {
      id: `n${i}`, uid: n.uid, storeCode: STORE, fromUid: 'system', fromName: 'Hệ thống', title: n.title, body: n.body,
      link: n.link, read: n.read, createdAt: n.at,
    }),
  );

  void vnAt;
  return db;
}
