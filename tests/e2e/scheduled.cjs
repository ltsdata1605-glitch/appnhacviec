/* Kiểm thử các hàm chạy theo giờ (every5Minutes, daily) trên Firebase Emulator có Pub/Sub.
 * Chạy: bash tests/e2e/run-scheduled.sh
 */
const PROJECT = 'demo-nhacviec';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const PS = `http://127.0.0.1:8085/v1/projects/${PROJECT}`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const VN = 7 * 3600000;
const p2 = (n) => String(n).padStart(2, '0');
const vnDate = (ms) => {
  const d = new Date(ms + VN);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};
const vnHM = (ms) => {
  const d = new Date(ms + VN);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};

function val(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
}
function unval(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unval);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unval(x)]));
}
async function put(path, obj) {
  const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, val(v)])) }) });
  if (!r.ok) throw new Error(`put ${path}: ${await r.text()}`);
}
async function get(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  if (!r.ok) return null;
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, unval(v)]));
}
async function notesOf(uid) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notifications' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } } } }),
  });
  return (await r.json()).filter((x) => x.document).map((x) => Object.fromEntries(Object.entries(x.document.fields).map(([k, v]) => [k, unval(v)])));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

// Gọi trực tiếp hàm đã biên dịch (functions/lib) — đúng mã đang chạy trên Firebase.
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
process.env.GCLOUD_PROJECT = PROJECT;
const fns = require('../../functions/lib/index.js');
async function trigger(fn) {
  await fns[fn].run({ scheduleTime: new Date().toISOString(), jobName: fn });
}

(async () => {
  const now = Date.now();
  const today = vnDate(now);
  const hm = vnHM(now);
  console.log(`Giờ Việt Nam hiện tại: ${today} ${hm}`);

  // ----- Dữ liệu mẫu -----
  await put('stores/930', {
    code: '930', name: 'Siêu thị 930', chain: 'DMX', deadline: hm, reminderTimes: [hm], digestTime: hm,
    quietStart: '23:59', quietEnd: '00:00', retentionDays: 15, escalateMinutes: 30, radius: 200, minPhotos: 2, location: null,
    departments: ['Kho'], brands: [], createdAt: now,
  });
  await put('users/m930', { uid: 'm930', email: 'm930@test.vn', fullName: 'Quản Lý Ba', role: 'manager', status: 'active', storeCode: '930', createdAt: now - 864e5 * 10 });
  await put('users/s930', { uid: 's930', email: 's930@test.vn', fullName: 'Nhân Viên Ba', role: 'staff', status: 'active', storeCode: '930', department: 'Kho', createdAt: now - 864e5 * 10, approvedAt: now - 864e5 * 10 });
  await put('areas/ar930', { storeCode: '930', name: 'Kho', ownerUid: 's930', ownerSince: vnDate(now - 864e5 * 5), active: true, criteria: ['Gọn gàng'], order: 0, createdAt: now - 864e5 * 5, createdDate: vnDate(now - 864e5 * 5) });
  const base = { storeCode: '930', shared: false, scope: 'personal', assigneeUid: 's930', priority: 'normal', status: 'open', completionMode: 'any', checklist: [], activity: [], createdBy: 'm930', createdAt: now - 3600000, reminded: {} };
  await put('tasks/soon', { ...base, title: 'Việc sắp đến hạn', dueAt: now + 20 * 60000, remindBefore: 30 });
  await put('tasks/due', { ...base, title: 'Việc vừa đến hạn', dueAt: now - 10 * 60000, remindBefore: null });
  await put('tasks/late', { ...base, title: 'Việc quá hạn lâu', dueAt: now - 45 * 60000, remindBefore: null });
  await put('tasks/later', { ...base, title: 'Việc còn xa', dueAt: now + 5 * 3600000, remindBefore: 30 });
  await put('tasks/urg', { ...base, title: 'Khẩn chưa xem', priority: 'urgent', dueAt: null, createdAt: now - 6 * 60000 });
  await put('tasks/urgSeen', { ...base, title: 'Khẩn đã xem', priority: 'urgent', dueAt: null, createdAt: now - 6 * 60000, seenBy: { s930: now - 60000 } });
  await put('tasks/high', { ...base, title: 'Cao chưa xem', priority: 'high', dueAt: null, createdAt: now - 20 * 60000 });
  await put('tasks/highNew', { ...base, title: 'Cao mới giao', priority: 'high', dueAt: null, createdAt: now - 2 * 60000 });
  await put('rollcalls/rcSoon', { storeCode: '930', title: 'Điểm danh sắp hạn', body: '', media: [], items: [{ id: 'i1', text: 'A' }], audience: { type: 'all' }, dueAt: now + 20 * 60000, remindBefore: 30, progress: {}, createdBy: 'm930', createdAt: now - 3600000, reminded: {} });
  await put('rollcalls/rcLate', { storeCode: '930', title: 'Điểm danh quá hạn', body: '', media: [], items: [{ id: 'i1', text: 'A' }], audience: { type: 'all' }, dueAt: now - 10 * 60000, remindBefore: 30, progress: { m930: { items: { i1: now }, doneAt: now, name: 'QL' } }, createdBy: 'm930', createdAt: now - 3600000, reminded: { before: true } });
  await put('taskTemplates/tplA', {
    storeCode: '930', title: 'Kiểm quỹ đầu ca', scope: 'department', department: 'Kho', priority: 'normal', checklist: ['Đếm tiền'],
    requirePhoto: false, requireApproval: false, completionMode: 'any', remindBefore: 15, recurrence: { type: 'daily', time: '08:30' }, active: true, lastGenerated: null, createdBy: 'm930', createdAt: now,
  });
  const oldDate = vnDate(now - 50 * 864e5);
  const d16 = vnDate(now - 16 * 864e5);
  const d14 = vnDate(now - 14 * 864e5);
  for (const d of [d16, d14])
    await put(`reports/930_${d}_ar930`, { storeCode: '930', date: d, areaId: 'ar930', areaName: 'Kho', uid: 's930', userName: 'Nhân Viên Ba', photos: [{ url: 'x', thumbUrl: 'y', path: `reports/930/${d}/ar930/s930/1.jpg`, thumbPath: `reports/930/${d}/ar930/s930/1_t.jpg`, capturedAt: Date.parse(`${d}T09:00:00+07:00`) }], submittedAt: Date.parse(`${d}T09:00:00+07:00`), attempt: 1 });
  // Việc có ảnh xác nhận tạo 50 ngày trước (quá thời hạn lưu) và việc mới (giữ ảnh)
  const photoTask = (id, created, shot = created) =>
    put(`tasks/${id}`, { storeCode: '930', shared: false, scope: 'personal', assigneeUid: 's930', title: 'Ảnh xác nhận', status: 'done', createdBy: 'm930', createdAt: created, updatedAt: shot, completions: {}, seenBy: {}, checklist: [], activity: [], photos: [{ url: 'x', thumbUrl: 'y', path: `tasks/930/${id}/s930/1.jpg`, thumbPath: `tasks/930/${id}/s930/1_t.jpg`, capturedAt: shot }] });
  await photoTask('oldPhotoTask', now - 16 * 864e5); // vừa quá 15 ngày
  await photoTask('newPhotoTask', now - 13 * 864e5); // còn trong hạn
  await photoTask('lateShotTask', now - 20 * 864e5, now - 2 * 864e5); // việc tạo đã lâu, ảnh mới chụp
  await put(`reports/930_${oldDate}_ar930`, { storeCode: '930', date: oldDate, areaId: 'ar930', areaName: 'Kho', uid: 's930', userName: 'Nhân Viên Ba', photos: [{ url: 'x', thumbUrl: 'y', path: `reports/930/${oldDate}/ar930/s930/1.jpg`, thumbPath: `reports/930/${oldDate}/ar930/s930/1_t.jpg`, capturedAt: now - 50 * 864e5 }], submittedAt: now - 50 * 864e5, attempt: 1 });

  console.log('\n■ Hàm every5Minutes (chạy mỗi 5 phút)');
  await trigger('every5Minutes');
  await sleep(300);
  const s = await notesOf('s930');
  const m = await notesOf('m930');
  check('Nhắc trước hạn (30 phút) cho người được giao', s.some((n) => n.title === 'Sắp đến hạn' && n.body.includes('Việc sắp đến hạn')));
  check('Nhắc "Đã đến hạn"', s.some((n) => n.title === 'Đã đến hạn' && n.body.includes('Việc vừa đến hạn')));
  check('Báo Quản lý khi quá hạn 30 phút', m.some((n) => n.title === 'Việc quá hạn' && n.body.includes('Việc quá hạn lâu')));
  check('Chưa nhắc việc còn xa hạn', !s.some((n) => n.body.includes('Việc còn xa')));
  check('Nhắc nhân viên chưa báo cáo 8NTTT', s.some((n) => n.title === 'Nhắc báo cáo 8NTTT'));
  check('Báo Quản lý danh sách quá giờ chưa báo cáo', m.some((n) => /quá giờ chưa báo cáo/.test(n.title) && n.body.includes('Nhân Viên Ba')));
  check('Tóm tắt đầu ngày cho nhân viên', s.some((n) => n.title === 'Hôm nay của bạn'));
  const soon = await get('tasks/soon');
  check('Đánh dấu đã nhắc để không nhắc lặp', soon?.reminded?.before === true);

  check('Nhắc lại việc Khẩn chưa xem', s.some((n) => n.title === 'Việc khẩn chưa xem' && n.body.includes('Khẩn chưa xem') && n.level === 'urgent'));
  check('Không nhắc lại việc Khẩn đã xem', !s.some((n) => n.body.includes('Khẩn đã xem')));
  check('Nhắc lại việc Ưu tiên cao chưa xem sau 15 phút', s.some((n) => n.title === 'Việc quan trọng chưa xem' && n.body.includes('Cao chưa xem') && n.level === 'high'));
  check('Chưa nhắc lại việc Ưu tiên cao mới giao 2 phút', !s.some((n) => n.body.includes('Cao mới giao')));
  check('Nhắc hạn mang đúng mức độ (Đã đến hạn → Ưu tiên cao)', s.some((n) => n.title === 'Đã đến hạn' && n.level === 'high'));
  check('Nhắc điểm danh sắp hết hạn', s.some((n) => n.title === 'Sắp hết hạn điểm danh' && n.body.includes('Điểm danh sắp hạn')));
  check('Báo nhân viên điểm danh đã quá hạn (Khẩn)', s.some((n) => n.title === 'Đã hết hạn điểm danh' && n.level === 'urgent'));
  check('Báo quản lý danh sách chưa điểm danh', m.some((n) => /chưa điểm danh/.test(n.title) && n.body.includes('Nhân Viên Ba')));
  check('Không nhắc người đã điểm danh xong', !m.some((n) => n.title === 'Đã hết hạn điểm danh'));
  const before = s.length;
  await trigger('every5Minutes');
  await sleep(300);
  const s2 = await notesOf('s930');
  const dupTask = s2.filter((n) => n.title === 'Sắp đến hạn').length;
  check('Chạy lần 2 không nhắc trùng việc', dupTask === 1, `số thông báo ${before} → ${s2.length}`);
  check('Không nhắc lại việc Khẩn dồn dập (cách 5 phút)', s2.filter((n) => n.title === 'Việc khẩn chưa xem').length === 1);

  console.log('\n■ Hàm daily (0h05 hằng ngày)');
  await trigger('daily');
  await sleep(300);
  const gen = await get(`tasks/tpl_tplA_${today}`);
  check('Tạo việc lặp lại hôm nay từ mẫu', !!gen && gen.title === 'Kiểm quỹ đầu ca' && gen.department === 'Kho');
  const tpl = await get('taskTemplates/tplA');
  check('Ghi nhận mẫu đã tạo việc hôm nay', tpl?.lastGenerated === today);
  const s3 = await notesOf('s930');
  check('Báo nhân viên bộ phận về việc lặp lại', s3.some((n) => n.title === 'Việc hôm nay' && n.body.includes('Kiểm quỹ đầu ca')));
  const old = await get(`reports/930_${oldDate}_ar930`);
  check('Xoá ảnh báo cáo tồn lâu (50 ngày) khi rút thời hạn còn 15 ngày', old?.photosPurged === true);
  check('Xoá cuốn chiếu ảnh báo cáo vừa quá 15 ngày', (await get(`reports/930_${d16}_ar930`))?.photosPurged === true);
  check('Giữ ảnh báo cáo 14 ngày (còn trong hạn)', !(await get(`reports/930_${d14}_ar930`))?.photosPurged);
  check('Xoá ảnh xác nhận công việc vừa quá 15 ngày', (await get('tasks/oldPhotoTask'))?.photosPurged === true);
  check('Giữ ảnh xác nhận công việc còn trong hạn', !(await get('tasks/newPhotoTask'))?.photosPurged);
  check('Việc tạo đã lâu nhưng ảnh mới chụp: vẫn giữ ảnh', !(await get('tasks/lateShotTask'))?.photosPurged);

  const pass = results.filter(Boolean).length;
  console.log(`\n==== KẾT QUẢ HÀM THEO GIỜ: ${pass}/${results.length} đạt ====`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(2);
});
