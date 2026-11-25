// Các thao tác ghi dữ liệu theo nghiệp vụ.
import { api, F, type BatchOp } from './backend';
import { now, vnDate, vnTime } from './time';
import { capitalizeCode, collapse, storeCodeOf, titleCase } from './text';
import { defaultStore, ROLE_LABEL } from './constants';
import { isActor } from './tasks';
import { extractMentions } from './mentions';
import { reportId } from './reports';
import type {
  Activity,
  Area,
  AuthUser,
  Chain,
  ChecklistItem,
  CompletionMode,
  CashCount,
  Leave,
  NotifyLevel,
  Rollcall,
  Photo,
  Post,
  Priority,
  Report,
  Role,
  Store,
  Task,
  TaskScope,
  TaskTemplate,
  UserProfile,
} from './types';

export interface Actor {
  uid: string;
  name: string;
}

export function actorOf(p: UserProfile | null, auth: AuthUser | null): Actor {
  return { uid: p?.uid || auth?.uid || '', name: p?.fullName || auth?.displayName || 'Quản trị' };
}

// ---------------- Thông báo ----------------
export async function notify(
  to: string[],
  storeCode: string,
  from: Actor,
  msg: { title: string; body: string; link?: string; level?: NotifyLevel },
) {
  const level: NotifyLevel = msg.level || 'normal';
  const uniq = [...new Set(to.filter((u) => u && u !== from.uid))];
  if (!uniq.length) return;
  const t = now();
  const ops: BatchOp[] = uniq.map((uid) => {
    const id = api().newId();
    return {
      type: 'set',
      col: 'notifications',
      id,
      data: { uid, storeCode, fromUid: from.uid, fromName: from.name, title: msg.title, body: msg.body, link: msg.link || null, level, urgent: level === 'urgent', read: false, createdAt: t },
    };
  });
  for (let i = 0; i < ops.length; i += 400) await api().batch(ops.slice(i, i + 400));
}

/** "hôm nay 22:30", "mai 08:00", "08:00 · 28/11" */
function dueText(ms: number): string {
  const d = vnDate(ms);
  const t = vnTime(ms);
  if (d === vnDate()) return `hôm nay ${t}`;
  if (d === vnDate(now() + 86400000)) return `mai ${t}`;
  return `${t} · ${d.slice(8)}/${d.slice(5, 7)}`;
}

/** Gửi thông báo thử cho chính mình (kiểm tra âm thanh và cài đặt iPhone) */
export async function sendTestNotification(storeCode: string, me: Actor, level: NotifyLevel) {
  const label = level === 'urgent' ? 'Khẩn' : level === 'high' ? 'Ưu tiên cao' : 'Thường';
  await api().set('notifications', api().newId(), {
    uid: me.uid, storeCode, fromUid: me.uid, fromName: me.name,
    title: `Thông báo thử · ${label}`,
    body: 'Nếu bạn nghe thấy tiếng báo và thấy biểu ngữ này, thông báo đã được cài đặt đúng.',
    link: null, level, urgent: level === 'urgent', test: true, read: false, createdAt: now(),
  });
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  await api().batch(ids.map((id) => ({ type: 'update', col: 'notifications', id, data: { read: true } })));
}

export async function audit(storeCode: string, actor: Actor, action: string, target?: UserProfile, detail?: string) {
  try {
    await api().set('audit', api().newId(), {
      storeCode,
      actorUid: actor.uid,
      actorName: actor.name,
      action,
      targetUid: target?.uid || null,
      targetName: target?.fullName || null,
      detail: detail || null,
      at: now(),
    });
  } catch {
    /* nhật ký không chặn thao tác chính */
  }
}

// ---------------- Đăng ký & nhân sự ----------------
export interface RegisterInput {
  role: Role;
  code: string; // user hoặc hãng
  fullName: string;
  storeCode: string;
  chain?: Chain;
}

export async function register(auth: AuthUser, input: RegisterInput, isAdmin: boolean) {
  const store = storeCodeOf(input.storeCode);
  const existing = await api().get<Store>('stores', store).catch(() => null);
  if (input.role !== 'manager' && !existing) throw new Error('Mã kho chưa được kích hoạt. Hãy kiểm tra lại hoặc liên hệ quản lý siêu thị.');
  const t = now();
  const profile: Partial<UserProfile> = {
    uid: auth.uid,
    email: auth.email.toLowerCase(),
    photoURL: auth.photoURL || '',
    fullName: titleCase(input.fullName),
    role: input.role,
    status: isAdmin ? 'active' : 'pending',
    storeCode: store,
    userCode: input.role === 'pg' ? undefined : capitalizeCode(input.code),
    brand: input.role === 'pg' ? capitalizeCode(input.code) : undefined,
    department: input.role === 'pg' ? 'PG' : input.role === 'manager' ? 'Quản lý' : undefined,
    chain: input.role === 'manager' && !existing ? input.chain : undefined,
    createdAt: t,
    updatedAt: t,
  };
  if (isAdmin) {
    profile.approvedAt = t;
    profile.approvedBy = auth.uid;
    if (!existing) await api().set('stores', store, { ...defaultStore(store, `Siêu thị ${store}`, input.chain || 'DMX'), createdAt: t });
  }
  await api().set('users', auth.uid, profile as Record<string, unknown>);
}

export async function approveUser(u: UserProfile, by: Actor, patch: Partial<UserProfile> = {}) {
  const t = now();
  if (u.role === 'manager') {
    const store = await api().get<Store>('stores', u.storeCode);
    if (!store) await api().set('stores', u.storeCode, { ...defaultStore(u.storeCode, u.storeName || `Siêu thị ${u.storeCode}`, u.chain || 'DMX'), createdAt: t });
  }
  await api().update('users', u.uid, { status: 'active', approvedAt: t, approvedBy: by.uid, updatedAt: t, rejectReason: F.del(), ...patch });
  await notify([u.uid], u.storeCode, by, { title: 'Tài khoản đã được duyệt', body: `Chào mừng ${u.fullName} đến với kho ${u.storeCode}.`, link: 'home' });
  await audit(u.storeCode, by, `Duyệt ${ROLE_LABEL[u.role].toLowerCase()}`, u);
}

export async function rejectUser(u: UserProfile, by: Actor, reason: string) {
  await api().update('users', u.uid, { status: 'rejected', rejectReason: reason || 'Không có lý do', updatedAt: now() });
  await audit(u.storeCode, by, 'Từ chối đăng ký', u, reason);
}

export async function updateUser(u: UserProfile, by: Actor, patch: Partial<UserProfile>, what = 'Cập nhật hồ sơ') {
  const p: Record<string, unknown> = { ...patch, updatedAt: now() };
  if (patch.brand !== undefined) p.brand = patch.brand ? capitalizeCode(patch.brand) : null;
  if (patch.userCode !== undefined) p.userCode = patch.userCode ? capitalizeCode(patch.userCode) : null;
  if (patch.fullName !== undefined) p.fullName = titleCase(patch.fullName);
  await api().update('users', u.uid, p);
  await audit(u.storeCode, by, what, u);
}

export async function disableUser(u: UserProfile, by: Actor) {
  await api().update('users', u.uid, { status: 'disabled', updatedAt: now() });
  await audit(u.storeCode, by, 'Vô hiệu hoá', u);
}

export async function enableUser(u: UserProfile, by: Actor) {
  await api().update('users', u.uid, { status: 'active', updatedAt: now() });
  await audit(u.storeCode, by, 'Kích hoạt lại', u);
}

export async function deleteUserForever(u: UserProfile, by: Actor) {
  await api().remove('users', u.uid);
  await audit(u.storeCode, by, 'Xoá vĩnh viễn', u);
}

export async function requestTransfer(me: UserProfile, toStore: string) {
  const code = storeCodeOf(toStore);
  if (code === me.storeCode) throw new Error('Bạn đang ở kho này.');
  const exists = await api().get<Store>('stores', code).catch(() => null);
  if (!exists) throw new Error('Mã kho không tồn tại.');
  await api().update('users', me.uid, { transferTo: code, transferAt: now(), updatedAt: now() });
}

export async function cancelTransfer(me: UserProfile) {
  await api().update('users', me.uid, { transferTo: null, transferAt: null, updatedAt: now() });
}

export async function approveTransfer(u: UserProfile, by: Actor) {
  const to = u.transferTo!;
  const from = u.storeCode;
  await api().update('users', u.uid, {
    storeCode: to,
    transferTo: null,
    transferAt: null,
    department: u.role === 'pg' ? 'PG' : u.role === 'manager' ? 'Quản lý' : null,
    permissions: {},
    updatedAt: now(),
  });
  // Khu vực phụ trách ở kho cũ được máy chủ tự gỡ (Cloud Functions: onUserWritten)
  await notify([u.uid], to, by, { title: 'Đã chuyển kho', body: `Bạn đã được chuyển từ kho ${from} sang kho ${to}.`, link: 'home' });
  await audit(to, by, `Duyệt chuyển kho từ ${from}`, u);
  await audit(from, by, `Chuyển sang kho ${to}`, u);
}

export async function rejectTransfer(u: UserProfile, by: Actor) {
  await api().update('users', u.uid, { transferTo: null, transferAt: null, updatedAt: now() });
  await notify([u.uid], u.transferTo || u.storeCode, by, { title: 'Yêu cầu chuyển kho bị từ chối', body: `Kho ${u.transferTo} chưa chấp nhận yêu cầu chuyển kho của bạn.` });
}

// ---------------- Công việc ----------------
export interface TaskInput {
  title: string;
  note: string;
  scope: TaskScope;
  assigneeUids: string[];
  department?: string | null;
  brand?: string | null;
  priority: Priority;
  dueAt: number | null;
  remindBefore: number | null;
  checklist: string[];
  requirePhoto: boolean;
  requireApproval: boolean;
  completionMode: CompletionMode;
  templateId?: string | null;
}

function activity(type: Activity['type'], by: Actor, note?: string): Activity {
  return { type, uid: by.uid, name: by.name, at: now(), ...(note ? { note } : {}) };
}

export async function createTasks(input: TaskInput, storeCode: string, by: Actor, members: UserProfile[]) {
  const t = now();
  const base = {
    storeCode,
    title: input.title.trim(),
    note: input.note.trim(),
    priority: input.priority,
    dueAt: input.dueAt,
    remindBefore: input.remindBefore,
    checklist: input.checklist.filter((s) => s.trim()).map<ChecklistItem>((text, i) => ({ id: `c${i}${t % 1000}`, text: text.trim(), done: false })),
    requirePhoto: input.requirePhoto,
    requireApproval: input.requireApproval,
    completionMode: input.scope === 'personal' ? 'any' : input.completionMode,
    status: 'open',
    activity: [activity('created', by)],
    seenBy: {},
    completions: {},
    createdBy: by.uid,
    createdByName: by.name,
    createdAt: t,
    updatedAt: t,
    templateId: input.templateId || null,
    reminded: {},
    mentions: extractMentions(input.note, members),
  };
  const ops: BatchOp[] = [];
  let recipients: string[] = [];
  if (input.scope === 'personal') {
    const groupId = input.assigneeUids.length > 1 ? api().newId() : null;
    for (const uid of input.assigneeUids) {
      const m = members.find((x) => x.uid === uid);
      ops.push({
        type: 'set',
        col: 'tasks',
        id: api().newId(),
        data: { ...base, shared: false, scope: 'personal', assigneeUid: uid, assigneeName: m?.fullName || '', groupId, department: null, brand: null },
      });
    }
    recipients = input.assigneeUids;
  } else {
    const data = { ...base, shared: true, scope: input.scope, assigneeUid: null, assigneeName: null, department: input.scope === 'department' ? input.department : null, brand: input.scope === 'brand' ? input.brand : null };
    ops.push({ type: 'set', col: 'tasks', id: api().newId(), data });
    recipients = members.filter((m) => m.status === 'active' && isActor(data as unknown as Task, m)).map((m) => m.uid);
  }
  await api().batch(ops);
  const due = input.dueAt ? dueText(input.dueAt) : '';
  const link = ops.length === 1 ? `task:${ops[0].id}` : 'tasks';
  await notify(recipients, storeCode, by, {
    title: `Việc mới · ${base.title}`,
    body: `${by.name} giao${due ? ` · Hạn ${due}` : ''}${input.checklist.filter((x) => x.trim()).length ? ` · ${input.checklist.filter((x) => x.trim()).length} bước` : ''}`,
    link,
    level: input.priority,
  });
  const extra = base.mentions.filter((u) => !recipients.includes(u));
  if (extra.length) await notifyMentions(extra, storeCode, by, `việc “${base.title}”`, base.note, link);
  return ops.map((o) => o.id);
}

export async function updateTaskFields(task: Task, by: Actor, patch: Partial<Task>) {
  await api().update('tasks', task.id, { ...patch, updatedAt: now(), activity: F.arrayUnion(activity('edited', by)) });
}

export async function markSeen(task: Task, by: Actor) {
  if (task.seenBy?.[by.uid]) return;
  await api().update('tasks', task.id, { [`seenBy.${by.uid}`]: now(), activity: F.arrayUnion(activity('seen', by)) });
}

export async function toggleChecklist(task: Task, itemId: string, by: Actor) {
  const list = task.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done, by: by.uid, at: now() } : c));
  await api().update('tasks', task.id, { checklist: list, updatedAt: now() });
}

export async function completeTask(task: Task, by: Actor, photos: Photo[] = [], note?: string) {
  const t = now();
  if (task.completionMode === 'each' && task.scope !== 'personal') {
    await api().update('tasks', task.id, {
      [`completions.${by.uid}`]: t,
      updatedAt: t,
      activity: F.arrayUnion(activity('confirmed', by, note)),
      ...(photos.length ? { photos: F.arrayUnion(...photos) } : {}),
    });
    return;
  }
  const status = task.requireApproval ? 'pending_review' : 'done';
  await api().update('tasks', task.id, {
    status,
    completedBy: by.uid,
    completedByName: by.name,
    completedAt: t,
    updatedAt: t,
    activity: F.arrayUnion(activity(task.requireApproval ? 'submitted' : 'done', by, note)),
    ...(photos.length ? { photos: F.arrayUnion(...photos) } : {}),
  });
  if (task.createdBy !== by.uid) {
    await notify([task.createdBy], task.storeCode, by, {
      title: task.requireApproval ? 'Chờ bạn duyệt' : 'Việc đã hoàn tất',
      body: `${by.name}: ${task.title}`,
      link: `task:${task.id}`,
    });
  }
}

export async function reopenTask(task: Task, by: Actor) {
  await api().update('tasks', task.id, {
    status: 'open',
    completedBy: null,
    completedByName: null,
    completedAt: null,
    updatedAt: now(),
    ...(task.completionMode === 'each' ? { [`completions.${by.uid}`]: F.del() } : {}),
    activity: F.arrayUnion(activity('reopened', by)),
  });
}

export async function approveTask(task: Task, by: Actor) {
  await api().update('tasks', task.id, { status: 'done', updatedAt: now(), activity: F.arrayUnion(activity('approved', by)) });
  if (task.completedBy) await notify([task.completedBy], task.storeCode, by, { title: 'Đã duyệt', body: task.title, link: `task:${task.id}` });
}

export async function returnTask(task: Task, by: Actor, reason: string) {
  await api().update('tasks', task.id, { status: 'returned', updatedAt: now(), activity: F.arrayUnion(activity('returned', by, reason)) });
  if (task.completedBy) await notify([task.completedBy], task.storeCode, by, { title: 'Việc bị trả lại', body: `${task.title} — ${reason}`, link: `task:${task.id}`, level: 'high' });
}

export async function commentTask(task: Task, by: Actor, text: string, notifyUids: string[], mentioned: string[] = []) {
  await api().update('tasks', task.id, { updatedAt: now(), activity: F.arrayUnion(activity('comment', by, text.trim())) });
  await notify(notifyUids.filter((u) => !mentioned.includes(u)), task.storeCode, by, { title: `${by.name} đã bình luận`, body: `${task.title}: ${text.trim()}`, link: `task:${task.id}` });
  if (mentioned.length) await notifyMentions(mentioned, task.storeCode, by, `việc “${task.title}”`, text.trim(), `task:${task.id}`);
}

export async function nudgeTask(task: Task, by: Actor, uids: string[]) {
  await api().update('tasks', task.id, { updatedAt: now(), activity: F.arrayUnion(activity('nudged', by)) });
  await notify(uids, task.storeCode, by, { title: 'Nhắc việc', body: `${by.name} nhắc bạn: ${task.title}`, link: `task:${task.id}`, level: task.priority === 'urgent' ? 'urgent' : 'high' });
}

export async function deleteTask(task: Task) {
  await api().remove('tasks', task.id);
}

export async function saveTemplate(tpl: Partial<TaskTemplate> & { storeCode: string }, by: Actor) {
  const id = tpl.id || api().newId();
  await api().set('taskTemplates', id, { ...tpl, id, createdBy: tpl.createdBy || by.uid, createdAt: tpl.createdAt || now(), active: tpl.active ?? true });
  return id;
}

export async function deleteTemplate(id: string) {
  await api().remove('taskTemplates', id);
}

// ---------------- Báo cáo 8NTTT ----------------
export async function submitReport(params: {
  storeCode: string;
  area: Area;
  by: Actor;
  photos: Photo[];
  checks: boolean[];
  note: string;
  geo: Report['geo'];
  existing?: Report | null;
}) {
  const date = vnDate();
  const id = reportId(params.storeCode, date, params.area.id);
  const t = now();
  const data: Partial<Report> = {
    storeCode: params.storeCode,
    date,
    areaId: params.area.id,
    areaName: params.area.name,
    uid: params.by.uid,
    userName: params.by.name,
    photos: params.photos,
    checks: params.checks,
    note: params.note.trim(),
    geo: params.geo,
    submittedAt: t,
    attempt: (params.existing?.attempt || 0) + 1,
    review: null,
    suspect: null,
  };
  if (params.existing) data.previousPhotos = params.existing.photos;
  await api().set('reports', id, data as Record<string, unknown>);
  return id;
}

export async function reviewReport(rep: Report, by: Actor, result: 'pass' | 'fail', failed: number[], note: string) {
  await api().update('reports', rep.id, { review: { result, failed, note: note.trim(), by: by.uid, byName: by.name, at: now() } });
  if (result === 'fail') {
    await notify([rep.uid], rep.storeCode, by, {
      title: 'Báo cáo 8NTTT chưa đạt',
      body: `${rep.areaName}: ${note.trim() || 'Vui lòng chụp lại'}`,
      link: `report:${rep.id}`,
      level: 'high',
    });
  }
}

// ---------------- Khu vực ----------------
export async function saveArea(area: Partial<Area> & { storeCode: string }) {
  if (area.id) {
    // Chỉ cập nhật các trường được truyền vào — không ghi đè tiêu chí, thứ tự, ngày tạo
    const { id, ...patch } = area;
    await api().update('areas', id, patch as Record<string, unknown>);
    return id;
  }
  const id = api().newId();
  const t = now();
  await api().set('areas', id, { active: true, order: 999, criteria: [], ownerUid: null, ownerSince: null, backupUid: null, createdAt: t, createdDate: vnDate(t), ...area, id });
  return id;
}

export async function deleteArea(id: string) {
  await api().remove('areas', id);
}

// ---------------- Nghỉ phép ----------------
export async function addLeave(l: Omit<Leave, 'id' | 'createdAt'>, by: Actor, managers: string[]) {
  const id = `${l.storeCode}_${l.uid}_${l.date}`;
  await api().set('leaves', id, { ...l, createdAt: now() });
  if (l.status === 'pending') await notify(managers, l.storeCode, by, { title: 'Xin nghỉ', body: `${l.userName} xin nghỉ ngày ${l.date.split('-').reverse().join('/')}${l.reason ? ` · ${l.reason}` : ''}`, link: 'people' });
}

export async function decideLeave(l: Leave, by: Actor, ok: boolean) {
  await api().update('leaves', l.id, { status: ok ? 'approved' : 'rejected' });
  await notify([l.uid], l.storeCode, by, { title: ok ? 'Đã duyệt nghỉ' : 'Không duyệt nghỉ', body: `Ngày ${l.date.split('-').reverse().join('/')}` });
}

export async function removeLeave(l: Leave) {
  await api().remove('leaves', l.id);
}

// ---------------- Thư viện ----------------
export async function savePost(post: Partial<Post> & { storeCode: string }, by: Actor, recipients: string[], bumpVersion: boolean) {
  const t = now();
  const id = post.id || api().newId();
  const isNew = !post.id;
  const data: Partial<Post> = {
    ...post,
    id,
    version: isNew ? 1 : (post.version || 1) + (bumpVersion ? 1 : 0),
    acks: post.acks || {},
    attachments: post.attachments || [],
    createdBy: post.createdBy || by.uid,
    createdByName: post.createdByName || by.name,
    createdAt: post.createdAt || t,
    updatedAt: t,
  };
  await api().set('posts', id, data as Record<string, unknown>);
  if (isNew || bumpVersion) {
    await notify(recipients, post.storeCode, by, {
      title: isNew ? (post.requireAck ? 'Bài mới cần xác nhận' : 'Bài mới trong Thư viện') : 'Bài đã được cập nhật',
      body: post.title || '',
      link: `post:${id}`,
      level: post.category === 'notice' ? 'high' : 'normal',
    });
  }
  return id;
}

export async function ackPost(post: Post, by: Actor) {
  await api().update('posts', post.id, { [`acks.${by.uid}`]: { at: now(), v: post.version, name: by.name } });
}

export async function deletePost(post: Post) {
  for (const a of post.attachments) if (a.path) await api().removeFile(a.path);
  await api().remove('posts', post.id);
}

// ---------------- Siêu thị ----------------
export async function updateStore(code: string, patch: Partial<Store>) {
  await api().update('stores', code, patch as Record<string, unknown>);
}

export async function createStore(code: string, name: string, chain: Chain) {
  const c = storeCodeOf(code);
  await api().set('stores', c, { ...defaultStore(c, collapse(name), chain), createdAt: now() });
}

// ---------------- Gắn tên @ ----------------
export async function notifyMentions(
  uids: string[],
  storeCode: string,
  by: Actor,
  where: string, // "kiểm quỹ", "bình luận công việc"...
  text: string,
  link?: string,
) {
  const snippet = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  await notify(uids, storeCode, by, { title: `${by.name} đã nhắc đến bạn`, body: `Trong ${where}: “${snippet}”`, link, level: 'high' });
}

// ---------------- Kiểm quỹ ----------------
export async function saveCashCount(c: Omit<CashCount, 'id' | 'createdAt' | 'date'>) {
  const id = api().newId();
  const t = now();
  await api().set('cashCounts', id, { ...c, createdAt: t, date: vnDate(t) });
  if (c.mentions.length && c.note.trim()) {
    await notifyMentions(c.mentions, c.storeCode, { uid: c.createdBy, name: c.createdByName }, `kiểm quỹ “${c.name}”`, c.note.trim(), `cash:${id}`);
  }
  return id;
}

export async function deleteCashCount(id: string) {
  await api().remove('cashCounts', id);
}

// ---------------- Bàn giao ca ----------------
export interface HandoverItem {
  text: string;
  target: { type: 'department' | 'person' | 'store'; value: string }; // value: tên bộ phận hoặc uid
  urgent: boolean;
}

export async function submitHandover(storeCode: string, by: Actor, shift: string, items: HandoverItem[], members: UserProfile[], dueAt: number) {
  const t = now();
  const handoverId = api().newId();
  const handover = { id: handoverId, shift, fromUid: by.uid, fromName: by.name, at: t };
  const ops: BatchOp[] = [];
  const notes: { uids: string[]; title: string; body: string; link: string; level: NotifyLevel }[] = [];
  for (const it of items) {
    const text = it.text.trim();
    if (!text) continue;
    const id = api().newId();
    const personal = it.target.type === 'person';
    const m = personal ? members.find((x) => x.uid === it.target.value) : undefined;
    const data = {
      storeCode,
      kind: 'handover',
      handover,
      shared: !personal,
      scope: personal ? 'personal' : it.target.type === 'department' ? 'department' : 'store',
      assigneeUid: personal ? it.target.value : null,
      assigneeName: m?.fullName || null,
      department: it.target.type === 'department' ? it.target.value : null,
      brand: null,
      title: text.split('\n')[0].slice(0, 120),
      note: text,
      priority: it.urgent ? 'urgent' : 'high',
      dueAt,
      remindBefore: 60,
      checklist: [],
      requirePhoto: false,
      requireApproval: false,
      completionMode: 'any',
      status: 'open',
      activity: [{ type: 'created', uid: by.uid, name: by.name, at: t, note: `Bàn giao ${shift}` }],
      seenBy: {},
      completions: {},
      mentions: extractMentions(text, members),
      createdBy: by.uid,
      createdByName: by.name,
      createdAt: t,
      updatedAt: t,
      reminded: {},
    } as unknown as Record<string, unknown>;
    ops.push({ type: 'set', col: 'tasks', id, data });
    const recipients = personal
      ? [it.target.value]
      : members.filter((x) => x.status === 'active' && isActor(data as unknown as Task, x)).map((x) => x.uid);
    const mentioned = (data.mentions as string[]).filter((u) => !recipients.includes(u));
    notes.push({ uids: [...recipients, ...mentioned], title: `Bàn giao từ ${by.name}`, body: `${text.split('\n')[0]} · ${shift}`, link: `task:${id}`, level: it.urgent ? 'urgent' : 'high' });
  }
  if (!ops.length) return 0;
  await api().batch(ops);
  for (const n of notes) await notify(n.uids, storeCode, by, { title: n.title, body: n.body, link: n.link, level: n.level });
  return ops.length;
}

// ---------------- Điểm danh ----------------
export function inAudience(a: Rollcall['audience'], u: UserProfile): boolean {
  if (u.status !== 'active') return false;
  switch (a.type) {
    case 'all':
      return true;
    case 'department':
      return u.department === a.value;
    case 'brand':
      return u.role === 'pg' && u.brand === a.value;
    case 'role':
      return u.role === a.value;
    case 'people':
      return (a.uids || []).includes(u.uid);
  }
}

export function rollcallDone(rc: Rollcall, uid: string): boolean {
  return !!rc.progress?.[uid]?.doneAt;
}

export async function saveRollcall(rc: Partial<Rollcall> & { storeCode: string }, by: Actor, members: UserProfile[]) {
  const t = now();
  const isNew = !rc.id;
  const id = rc.id || api().newId();
  const data = {
    media: [],
    items: [],
    progress: {},
    remindBefore: 60,
    ...rc,
    id,
    mentions: extractMentions(rc.body || '', members),
    createdBy: rc.createdBy || by.uid,
    createdByName: rc.createdByName || by.name,
    createdAt: rc.createdAt || t,
    updatedAt: t,
    reminded: isNew ? {} : rc.reminded || {},
  };
  await api().set('rollcalls', id, data as Record<string, unknown>);
  if (isNew) {
    const audience = members.filter((m) => inAudience(data.audience as Rollcall['audience'], m)).map((m) => m.uid);
    const due = data.dueAt ? ` · Hạn ${dueText(data.dueAt as number)}` : '';
    await notify(audience, rc.storeCode, by, { title: `Điểm danh mới · ${data.title}`, body: `${(data.items as unknown[]).length} việc cần xác nhận${due}`, link: `rollcall:${id}`, level: 'high' });
    const extra = (data.mentions as string[]).filter((u) => !audience.includes(u));
    if (extra.length) await notifyMentions(extra, rc.storeCode, by, `điểm danh “${data.title}”`, (data.body as string) || '', `rollcall:${id}`);
  }
  return id;
}

export async function toggleRollcallItem(rc: Rollcall, itemId: string, by: Actor) {
  const mine = rc.progress?.[by.uid] || { items: {}, name: by.name };
  const items = { ...mine.items };
  if (items[itemId]) delete items[itemId];
  else items[itemId] = now();
  const allDone = rc.items.every((i) => items[i.id]);
  await api().update('rollcalls', rc.id, { [`progress.${by.uid}`]: { items, name: by.name, doneAt: allDone ? now() : null } });
  return allDone;
}

export async function nudgeRollcall(rc: Rollcall, by: Actor, uids: string[]) {
  await notify(uids, rc.storeCode, by, { title: 'Nhắc điểm danh', body: `${by.name} nhắc bạn hoàn tất: ${rc.title}`, link: `rollcall:${rc.id}`, level: 'high' });
}

export async function closeRollcall(rc: Rollcall, closed: boolean) {
  await api().update('rollcalls', rc.id, { closed, updatedAt: now() });
}

export async function deleteRollcall(rc: Rollcall) {
  for (const m of rc.media) if (m.path) await api().removeFile(m.path);
  await api().remove('rollcalls', rc.id);
}
