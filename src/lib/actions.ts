// Các thao tác ghi dữ liệu theo nghiệp vụ.
import { api, F, type BatchOp } from './backend';
import { now, vnDate } from './time';
import { capitalizeCode, storeCodeOf, titleCase } from './text';
import { defaultStore, ROLE_LABEL } from './constants';
import { isActor } from './tasks';
import { reportId } from './reports';
import type {
  Activity,
  Area,
  AuthUser,
  Chain,
  ChecklistItem,
  CompletionMode,
  Leave,
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
  msg: { title: string; body: string; link?: string; urgent?: boolean },
) {
  const uniq = [...new Set(to.filter((u) => u && u !== from.uid))];
  if (!uniq.length) return;
  const t = now();
  const ops: BatchOp[] = uniq.map((uid) => {
    const id = api().newId();
    return {
      type: 'set',
      col: 'notifications',
      id,
      data: { uid, storeCode, fromUid: from.uid, fromName: from.name, title: msg.title, body: msg.body, link: msg.link || null, urgent: !!msg.urgent, read: false, createdAt: t },
    };
  });
  for (let i = 0; i < ops.length; i += 400) await api().batch(ops.slice(i, i + 400));
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
  const due = input.dueAt ? ` · Hạn ${new Date(input.dueAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}` : '';
  const link = ops.length === 1 ? `task:${ops[0].id}` : 'tasks';
  await notify(recipients, storeCode, by, { title: `Việc mới từ ${by.name}`, body: `${base.title}${due}`, link, urgent: input.priority === 'urgent' });
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
  if (task.completedBy) await notify([task.completedBy], task.storeCode, by, { title: 'Việc bị trả lại', body: `${task.title} — ${reason}`, link: `task:${task.id}`, urgent: true });
}

export async function commentTask(task: Task, by: Actor, text: string, notifyUids: string[]) {
  await api().update('tasks', task.id, { updatedAt: now(), activity: F.arrayUnion(activity('comment', by, text.trim())) });
  await notify(notifyUids, task.storeCode, by, { title: `${by.name} đã bình luận`, body: `${task.title}: ${text.trim()}`, link: `task:${task.id}` });
}

export async function nudgeTask(task: Task, by: Actor, uids: string[]) {
  await api().update('tasks', task.id, { updatedAt: now(), activity: F.arrayUnion(activity('nudged', by)) });
  await notify(uids, task.storeCode, by, { title: 'Nhắc việc', body: `${by.name} nhắc bạn: ${task.title}`, link: `task:${task.id}`, urgent: task.priority === 'urgent' });
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
      urgent: true,
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
      urgent: post.category === 'notice',
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
  await api().set('stores', c, { ...defaultStore(c, titleCase(name), chain), createdAt: now() });
}
