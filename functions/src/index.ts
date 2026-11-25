/**
 * Cloud Functions — Nhắc việc
 * - Gửi thông báo đẩy khi có thông báo mới (tôn trọng giờ yên lặng của kho)
 * - Mỗi 5 phút: nhắc trước hạn, đến hạn, báo quản lý khi quá hạn; nhắc báo cáo 8NTTT; tóm tắt đầu ngày
 * - 0h05 hằng ngày: tạo việc lặp lại, xoá ảnh báo cáo quá hạn lưu trữ
 * - Khi có đăng ký mới / xin chuyển kho: báo cho người duyệt
 * - Khi có báo cáo 8NTTT: gắn cảnh báo nghi vấn (vị trí xa, ảnh trùng ảnh cũ)
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions, logger } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 5 });
const db: Firestore = getFirestore();

// ---------------- Tiện ích thời gian (giờ Việt Nam) ----------------
const VN = 7 * 3600000;
const p2 = (n: number) => String(n).padStart(2, '0');
function vnDate(ms = Date.now()): string {
  const d = new Date(ms + VN);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
function vnMinutes(ms = Date.now()): number {
  const d = new Date(ms + VN);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function vnAt(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - VN;
}
function addDays(date: string, n: number): string {
  return vnDate(vnAt(date, '12:00') + n * 86400000);
}
function weekday(date: string): number {
  const wd = new Date(vnAt(date, '12:00') + VN).getUTCDay();
  return wd === 0 ? 7 : wd;
}
function isQuiet(min: number, start: string, end: string): boolean {
  const s = hm(start);
  const e = hm(end);
  return s > e ? min >= s || min < e : min >= s && min < e;
}
/** Thời điểm hiện tại có nằm trong cửa sổ 5 phút bắt đầu từ `time` */
function inWindow(time: string, now = Date.now()): boolean {
  const m = vnMinutes(now);
  const t = hm(time);
  return m >= t && m < t + 5;
}
const dm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

// ---------------- Kiểu dữ liệu tối thiểu ----------------
interface Store {
  code: string;
  name: string;
  deadline: string;
  reminderTimes: string[];
  digestTime: string;
  quietStart: string;
  quietEnd: string;
  retentionDays: number;
  escalateMinutes: number;
  radius: number;
  location?: { lat: number; lng: number } | null;
}
interface User {
  uid: string;
  fullName: string;
  role: 'manager' | 'staff' | 'pg';
  status: string;
  storeCode: string;
  department?: string;
  brand?: string;
  email: string;
  permissions?: Record<string, boolean>;
  transferTo?: string | null;
  approvedAt?: number;
  createdAt: number;
}
interface Task {
  id: string;
  storeCode: string;
  scope: 'personal' | 'department' | 'brand' | 'store';
  assigneeUid?: string | null;
  department?: string | null;
  brand?: string | null;
  title: string;
  priority: string;
  dueAt?: number | null;
  remindBefore?: number | null;
  status: string;
  completionMode: string;
  completions?: Record<string, number>;
  reminded?: { before?: boolean; due?: boolean; escalated?: boolean };
}
interface Area {
  id: string;
  storeCode: string;
  name: string;
  ownerUid?: string | null;
  ownerSince?: string | null;
  backupUid?: string | null;
  active: boolean;
  createdDate?: string;
}
interface Leave {
  uid: string;
  date: string;
  status: string;
}

const storeCache = new Map<string, { at: number; store: Store | null }>();
async function getStore(code: string): Promise<Store | null> {
  const c = storeCache.get(code);
  if (c && Date.now() - c.at < 60000) return c.store;
  const snap = await db.doc(`stores/${code}`).get();
  const store = snap.exists ? (snap.data() as Store) : null;
  storeCache.set(code, { at: Date.now(), store });
  return store;
}

async function members(storeCode: string): Promise<User[]> {
  const snap = await db.collection('users').where('storeCode', '==', storeCode).get();
  return snap.docs.map((d) => d.data() as User).filter((u) => u.status === 'active');
}

function isActor(t: Task, u: User): boolean {
  if (t.scope === 'personal') return t.assigneeUid === u.uid;
  if (t.scope === 'department') return !!t.department && u.department === t.department;
  if (t.scope === 'brand') return !!t.brand && u.brand === t.brand;
  return true;
}

async function createNotes(uids: string[], storeCode: string, msg: { title: string; body: string; link?: string; urgent?: boolean }) {
  const uniq = [...new Set(uids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 400) {
    const batch = db.batch();
    for (const uid of uniq.slice(i, i + 400)) {
      batch.set(db.collection('notifications').doc(), {
        uid,
        storeCode,
        fromUid: 'system',
        fromName: 'Nhắc việc',
        title: msg.title,
        body: msg.body,
        link: msg.link || null,
        urgent: !!msg.urgent,
        read: false,
        createdAt: Date.now(),
      });
    }
    await batch.commit();
  }
}

// ======================================================================
// 1. Gửi thông báo đẩy
// ======================================================================
export const onNotificationCreated = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data();
  if (!n) return;
  const store = n.storeCode ? await getStore(n.storeCode) : null;
  if (store && !n.urgent && isQuiet(vnMinutes(), store.quietStart || '22:00', store.quietEnd || '06:00')) return; // giờ yên lặng
  const tokSnap = await db.doc(`pushTokens/${n.uid}`).get();
  const tokens: string[] = tokSnap.exists ? tokSnap.get('tokens') || [] : [];
  if (!tokens.length) return;
  const unread = await db.collection('notifications').where('uid', '==', n.uid).where('read', '==', false).count().get();
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      title: String(n.title || 'Nhắc việc'),
      body: String(n.body || ''),
      link: String(n.link || ''),
      badge: String(Math.min(unread.data().count, 99)),
      tag: n.link ? String(n.link) : event.params.id,
    },
    webpush: { headers: { Urgency: n.urgent ? 'high' : 'normal', TTL: '86400' } },
  });
  const bad = res.responses
    .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || '') ? tokens[i] : null))
    .filter((x): x is string => !!x);
  if (bad.length) await db.doc(`pushTokens/${n.uid}`).update({ tokens: FieldValue.arrayRemove(...bad) });
});

// ======================================================================
// 2. Đăng ký mới, chuyển kho
// ======================================================================
async function approversOf(storeCode: string, role: string): Promise<string[]> {
  if (role === 'manager') {
    const admins = await db.collection('admins').get();
    const emails = admins.docs.map((d) => d.id);
    if (!emails.length) return [];
    const out: string[] = [];
    for (let i = 0; i < emails.length; i += 10) {
      const s = await db.collection('users').where('email', 'in', emails.slice(i, i + 10)).get();
      s.docs.forEach((d) => out.push(d.id));
    }
    return out;
  }
  const list = await members(storeCode);
  return list.filter((u) => u.role === 'manager' || u.permissions?.approve).map((u) => u.uid);
}

export const onUserWritten = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as User) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as User) : null;
  if (!after) return;

  // Đăng ký mới hoặc đăng ký lại
  if (after.status === 'pending' && (!before || before.status !== 'pending')) {
    const to = await approversOf(after.storeCode, after.role);
    const label = after.role === 'manager' ? 'Quản lý' : after.role === 'pg' ? `PG ${after.brand || ''}` : 'Nhân viên';
    await createNotes(to, after.storeCode, {
      title: 'Có người đăng ký mới',
      body: `${after.fullName} (${label.trim()}) xin vào kho ${after.storeCode}`,
      link: 'people',
    });
  }

  // Xin chuyển kho
  if (after.transferTo && after.transferTo !== before?.transferTo) {
    const to = await approversOf(after.transferTo, after.role);
    await createNotes(to, after.transferTo, {
      title: 'Yêu cầu chuyển kho',
      body: `${after.fullName} xin chuyển từ kho ${after.storeCode} sang kho ${after.transferTo}`,
      link: 'people',
    });
  }

  // Đã chuyển kho hoặc bị vô hiệu hoá: gỡ khỏi khu vực phụ trách ở kho cũ
  const moved = before && before.storeCode !== after.storeCode;
  const disabled = before && before.status === 'active' && after.status === 'disabled';
  if (moved || disabled) {
    const store = before!.storeCode;
    const [own, backup] = await Promise.all([
      db.collection('areas').where('storeCode', '==', store).where('ownerUid', '==', after.uid).get(),
      db.collection('areas').where('storeCode', '==', store).where('backupUid', '==', after.uid).get(),
    ]);
    const batch = db.batch();
    own.docs.forEach((d) => batch.update(d.ref, { ownerUid: null, ownerSince: null }));
    backup.docs.forEach((d) => batch.update(d.ref, { backupUid: null }));
    await batch.commit();
    if (own.size) {
      const mgr = await approversOf(store, 'staff');
      await createNotes(mgr, store, {
        title: 'Khu vực cần phân công lại',
        body: `${after.fullName} ${moved ? 'đã chuyển kho' : 'đã bị vô hiệu hoá'}. ${own.docs.map((d) => d.get('name')).join(', ')} chưa có người phụ trách.`,
        link: 'people',
      });
    }
  }
});

// ======================================================================
// 3. Báo cáo 8NTTT: kiểm tra nghi vấn
// ======================================================================
function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export const onReportWritten = onDocumentWritten('reports/{id}', async (event) => {
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const before = event.data?.before.exists ? event.data.before.data() : null;
  if (!after || (before && before.submittedAt === after.submittedAt)) return;
  const notes: string[] = [];
  const store = await getStore(after.storeCode);
  if (store?.location) {
    if (!after.geo) notes.push('Không có vị trí khi gửi báo cáo.');
    else if (after.geo.distance != null && after.geo.distance > (store.radius || 200) + 150) notes.push(`Gửi cách siêu thị ${after.geo.distance} m.`);
  }
  const late = (after.photos || []).some((p: { capturedAt: number }) => after.submittedAt - p.capturedAt > 20 * 60000);
  if (late) notes.push('Có ảnh chụp hơn 20 phút trước khi gửi.');
  // So với ảnh các ngày trước của cùng khu vực
  const since = addDays(after.date, -45);
  const prev = await db
    .collection('reports')
    .where('storeCode', '==', after.storeCode)
    .where('areaId', '==', after.areaId)
    .where('date', '>=', since)
    .get();
  const mine: string[] = (after.photos || []).map((p: { hash?: string }) => p.hash || '').filter(Boolean);
  for (const doc of prev.docs) {
    if (doc.id === event.params.id) continue;
    const hashes: string[] = (doc.get('photos') || []).map((p: { hash?: string }) => p.hash || '').filter(Boolean);
    if (mine.some((h) => hashes.some((x) => hamming(h, x) <= 6))) {
      notes.push(`Có ảnh gần như trùng khớp ảnh ngày ${dm(doc.get('date'))}.`);
      break;
    }
  }
  await event.data!.after.ref.update({ suspect: notes.length ? notes.join(' ') : null });
});

// ======================================================================
// 4. Mỗi 5 phút: nhắc việc, nhắc báo cáo, tóm tắt đầu ngày
// ======================================================================
function responsibleFor(area: Area, date: string, leaves: Leave[]): string | null {
  const off = (uid?: string | null) => !!uid && leaves.some((l) => l.uid === uid && l.date === date && l.status === 'approved');
  if (area.createdDate && date < area.createdDate) return null;
  const owner = area.ownerUid && (!area.ownerSince || date >= area.ownerSince) ? area.ownerUid : null;
  if (!owner) return null;
  if (!off(owner)) return owner;
  if (area.backupUid && area.backupUid !== owner && !off(area.backupUid)) return area.backupUid;
  return null;
}

async function taskReminders(now: number) {
  const snap = await db
    .collection('tasks')
    .where('status', 'in', ['open', 'returned'])
    .where('dueAt', '>=', now - 6 * 3600000)
    .where('dueAt', '<=', now + 26 * 3600000)
    .get();
  const memberCache = new Map<string, User[]>();
  const getMembers = async (s: string) => {
    if (!memberCache.has(s)) memberCache.set(s, await members(s));
    return memberCache.get(s)!;
  };
  for (const doc of snap.docs) {
    const t = { ...(doc.data() as Task), id: doc.id };
    if (!t.dueAt) continue;
    const r = t.reminded || {};
    const store = await getStore(t.storeCode);
    const list = await getMembers(t.storeCode);
    const actors = list.filter((u) => isActor(t, u) && !(t.completionMode === 'each' && t.scope !== 'personal' && t.completions?.[u.uid])).map((u) => u.uid);
    const time = new Date(t.dueAt + VN).toISOString().slice(11, 16);
    const patch: Record<string, boolean> = {};
    if (t.remindBefore && !r.before && now >= t.dueAt - t.remindBefore * 60000 && now < t.dueAt) {
      await createNotes(actors, t.storeCode, { title: 'Sắp đến hạn', body: `${t.title} · hạn ${time}`, link: `task:${t.id}`, urgent: t.priority === 'urgent' });
      patch['reminded.before'] = true;
    }
    if (!r.due && now >= t.dueAt && now < t.dueAt + 60 * 60000) {
      await createNotes(actors, t.storeCode, { title: 'Đã đến hạn', body: `${t.title} chưa hoàn tất`, link: `task:${t.id}`, urgent: t.priority !== 'normal' });
      patch['reminded.due'] = true;
    }
    const esc = (store?.escalateMinutes || 30) * 60000;
    if (!r.escalated && now >= t.dueAt + esc) {
      const managers = list.filter((u) => u.role === 'manager').map((u) => u.uid);
      const who = t.scope === 'personal' ? list.find((u) => u.uid === t.assigneeUid)?.fullName || '' : `${actors.length} người`;
      await createNotes(managers, t.storeCode, { title: 'Việc quá hạn', body: `${t.title} · ${who} · quá hạn ${Math.round((now - t.dueAt) / 60000)} phút`, link: `task:${t.id}` });
      patch['reminded.escalated'] = true;
    }
    if (Object.keys(patch).length) await doc.ref.update(patch);
  }
}

async function storeRoutines(now: number) {
  const stores = await db.collection('stores').get();
  const today = vnDate(now);
  for (const sd of stores.docs) {
    const store = sd.data() as Store;
    const reminderHit = (store.reminderTimes || []).some((t) => inWindow(t, now));
    const deadlineHit = inWindow(store.deadline || '21:00', now);
    const digestHit = inWindow(store.digestTime || '07:30', now);
    if (!reminderHit && !deadlineHit && !digestHit) continue;

    const [areasSnap, leavesSnap, repSnap, list] = await Promise.all([
      db.collection('areas').where('storeCode', '==', store.code).get(),
      db.collection('leaves').where('storeCode', '==', store.code).where('date', '==', today).get(),
      db.collection('reports').where('storeCode', '==', store.code).where('date', '==', today).get(),
      members(store.code),
    ]);
    const leaves = leavesSnap.docs.map((d) => d.data() as Leave);
    const reported = new Set(repSnap.docs.map((d) => d.get('areaId')));
    const missing = areasSnap.docs
      .map((d) => ({ ...(d.data() as Area), id: d.id }))
      .filter((a) => a.active && !reported.has(a.id))
      .map((a) => ({ area: a, uid: responsibleFor(a, today, leaves) }))
      .filter((x) => x.uid);

    if (reminderHit && missing.length) {
      for (const m of missing) {
        await createNotes([m.uid!], store.code, { title: 'Nhắc báo cáo 8NTTT', body: `Khu vực ${m.area.name} chưa có báo cáo hôm nay. Hạn ${store.deadline}.`, link: 'reports', urgent: true });
      }
    }
    if (deadlineHit && missing.length) {
      const managers = list.filter((u) => u.role === 'manager' || u.permissions?.review).map((u) => u.uid);
      const names = missing.map((m) => `${list.find((u) => u.uid === m.uid)?.fullName || '?'} (${m.area.name})`);
      await createNotes(managers, store.code, {
        title: `${missing.length} khu vực quá giờ chưa báo cáo`,
        body: names.slice(0, 8).join(', ') + (names.length > 8 ? `… và ${names.length - 8} khu vực khác` : ''),
        link: 'reports',
      });
    }
    if (digestHit) {
      const tasksSnap = await db.collection('tasks').where('storeCode', '==', store.code).where('createdAt', '>=', now - 45 * 86400000).get();
      const tasks = tasksSnap.docs.map((d) => ({ ...(d.data() as Task), id: d.id })).filter((t) => t.status === 'open' || t.status === 'returned');
      for (const u of list) {
        const mine = tasks.filter((t) => isActor(t, u) && !(t.completionMode === 'each' && t.completions?.[u.uid]) && (!t.dueAt || vnDate(t.dueAt) <= today));
        const overdue = mine.filter((t) => t.dueAt && t.dueAt < now).length;
        const myAreas = missing.filter((m) => m.uid === u.uid).map((m) => m.area.name);
        if (!mine.length && !myAreas.length) continue;
        const parts = [];
        if (mine.length) parts.push(`${mine.length} việc cần làm${overdue ? ` (${overdue} quá hạn)` : ''}`);
        if (myAreas.length) parts.push(`báo cáo 8NTTT ${myAreas.join(', ')} trước ${store.deadline}`);
        await createNotes([u.uid], store.code, { title: 'Hôm nay của bạn', body: parts.join(' · '), link: 'home' });
      }
    }
  }
}

export const every5Minutes = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Asia/Ho_Chi_Minh', retryCount: 0 }, async () => {
  const now = Date.now();
  await Promise.all([
    taskReminders(now).catch((e) => logger.error('taskReminders', e)),
    storeRoutines(now).catch((e) => logger.error('storeRoutines', e)),
  ]);
});

// ======================================================================
// 5. Hằng ngày 0h05: việc lặp lại + dọn ảnh cũ
// ======================================================================
interface Template {
  id: string;
  storeCode: string;
  title: string;
  note?: string;
  scope: Task['scope'];
  assigneeUids?: string[];
  department?: string | null;
  brand?: string | null;
  priority: string;
  checklist: string[];
  requirePhoto: boolean;
  requireApproval: boolean;
  completionMode: string;
  remindBefore?: number | null;
  recurrence: { type: 'daily' | 'weekly' | 'monthly'; days?: number[]; time: string };
  active: boolean;
  lastGenerated?: string | null;
  createdBy: string;
}

function dueOn(tpl: Template, date: string): boolean {
  const r = tpl.recurrence;
  if (r.type === 'daily') return true;
  if (r.type === 'weekly') return (r.days || []).includes(weekday(date));
  return (r.days || []).includes(Number(date.slice(8)));
}

async function generateRecurring(today: string) {
  const snap = await db.collection('taskTemplates').where('active', '==', true).get();
  for (const doc of snap.docs) {
    const tpl = { ...(doc.data() as Template), id: doc.id };
    if (tpl.lastGenerated === today || !dueOn(tpl, today)) continue;
    const list = await members(tpl.storeCode);
    const targets: (string | null)[] = tpl.scope === 'personal' ? tpl.assigneeUids || [] : [null];
    for (const uid of targets) {
      const id = `tpl_${tpl.id}_${today}${uid ? `_${uid}` : ''}`;
      const ref = db.doc(`tasks/${id}`);
      if ((await ref.get()).exists) continue;
      const t = Date.now();
      const task = {
        storeCode: tpl.storeCode,
        shared: tpl.scope !== 'personal',
        scope: tpl.scope,
        assigneeUid: uid,
        assigneeName: uid ? list.find((u) => u.uid === uid)?.fullName || null : null,
        department: tpl.scope === 'department' ? tpl.department || null : null,
        brand: tpl.scope === 'brand' ? tpl.brand || null : null,
        groupId: null,
        title: tpl.title,
        note: tpl.note || '',
        priority: tpl.priority,
        dueAt: vnAt(today, tpl.recurrence.time),
        remindBefore: tpl.remindBefore ?? null,
        checklist: (tpl.checklist || []).map((text, i) => ({ id: `c${i}`, text, done: false })),
        requirePhoto: !!tpl.requirePhoto,
        requireApproval: !!tpl.requireApproval,
        completionMode: tpl.scope === 'personal' ? 'any' : tpl.completionMode,
        status: 'open',
        completions: {},
        seenBy: {},
        activity: [{ type: 'created', uid: tpl.createdBy, name: 'Việc lặp lại', at: t }],
        templateId: tpl.id,
        createdBy: tpl.createdBy,
        createdByName: 'Việc lặp lại',
        createdAt: t,
        updatedAt: t,
        reminded: {},
      };
      await ref.set(task);
      const recipients = uid ? [uid] : list.filter((u) => isActor(task as unknown as Task, u)).map((u) => u.uid);
      await createNotes(recipients, tpl.storeCode, { title: 'Việc hôm nay', body: `${tpl.title} · hạn ${tpl.recurrence.time}`, link: `task:${id}` });
    }
    await doc.ref.update({ lastGenerated: today });
  }
}

async function purgeOldPhotos(today: string) {
  const stores = await db.collection('stores').get();
  const bucket = getStorage().bucket();
  for (const sd of stores.docs) {
    const days = Number(sd.get('retentionDays')) || 45;
    const cutoff = addDays(today, -days);
    const from = addDays(cutoff, -10);
    const snap = await db.collection('reports').where('storeCode', '==', sd.id).where('date', '>=', from).where('date', '<', cutoff).get();
    for (const doc of snap.docs) {
      if (doc.get('photosPurged')) continue;
      const photos = [...(doc.get('photos') || []), ...(doc.get('previousPhotos') || [])] as { path?: string; thumbPath?: string }[];
      for (const p of photos) {
        for (const path of [p.path, p.thumbPath]) if (path) await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {});
      }
      await doc.ref.update({ photosPurged: true, previousPhotos: FieldValue.delete() });
    }
  }
}

export const daily = onSchedule({ schedule: '5 0 * * *', timeZone: 'Asia/Ho_Chi_Minh', retryCount: 1 }, async () => {
  const today = vnDate();
  await generateRecurring(today).catch((e) => logger.error('recurring', e));
  await purgeOldPhotos(today).catch((e) => logger.error('purge', e));
  // Dọn thông báo cũ hơn 30 ngày
  const old = await db.collection('notifications').where('createdAt', '<', Date.now() - 30 * 86400000).limit(400).get();
  if (!old.empty) {
    const b = db.batch();
    old.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
});
