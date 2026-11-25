// Sinh việc lặp lại từ mẫu. Máy chủ (Cloud Functions) chạy lúc 0h; app của quản lý cũng chạy bù khi mở app.
import { api } from './backend';
import { vnAt, vnDate, weekdayOf } from './time';
import { isActor } from './tasks';
import { notify, type Actor } from './actions';
import type { Task, TaskTemplate, UserProfile } from './types';

export function dueOn(tpl: TaskTemplate, date: string): boolean {
  const r = tpl.recurrence;
  if (r.type === 'daily') return true;
  if (r.type === 'weekly') return (r.days || []).includes(weekdayOf(date));
  if (r.type === 'monthly') return (r.days || []).includes(Number(date.slice(8)));
  return false;
}

export function recurrenceText(tpl: Pick<TaskTemplate, 'recurrence'>): string {
  const r = tpl.recurrence;
  if (r.type === 'daily') return `Hằng ngày · hạn ${r.time}`;
  if (r.type === 'weekly') {
    const names = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    return `Hằng tuần ${(r.days || []).sort().map((d) => names[d]).join(', ')} · hạn ${r.time}`;
  }
  return `Hằng tháng ngày ${(r.days || []).sort((a, b) => a - b).join(', ')} · hạn ${r.time}`;
}

export async function generateForToday(templates: TaskTemplate[], members: UserProfile[], by: Actor): Promise<number> {
  const today = vnDate();
  let created = 0;
  for (const tpl of templates) {
    if (!tpl.active || tpl.lastGenerated === today || !dueOn(tpl, today)) continue;
    const targets = tpl.scope === 'personal' ? tpl.assigneeUids || [] : [null];
    for (const uid of targets) {
      const id = `tpl_${tpl.id}_${today}${uid ? `_${uid}` : ''}`;
      const exists = await api().get<Task>('tasks', id).catch(() => null);
      if (exists) continue;
      const m = uid ? members.find((x) => x.uid === uid) : null;
      const t = Date.now();
      const task: Omit<Task, 'id'> = {
        storeCode: tpl.storeCode,
        shared: tpl.scope !== 'personal',
        scope: tpl.scope,
        assigneeUid: uid,
        assigneeName: m?.fullName || null,
        department: tpl.scope === 'department' ? tpl.department || null : null,
        brand: tpl.scope === 'brand' ? tpl.brand || null : null,
        groupId: null,
        title: tpl.title,
        note: tpl.note || '',
        priority: tpl.priority,
        dueAt: vnAt(today, tpl.recurrence.time),
        remindBefore: tpl.remindBefore ?? null,
        checklist: tpl.checklist.map((text, i) => ({ id: `c${i}`, text, done: false })),
        requirePhoto: tpl.requirePhoto,
        requireApproval: tpl.requireApproval,
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
      await api().set('tasks', id, task as unknown as Record<string, unknown>);
      created++;
      const recipients = uid ? [uid] : members.filter((x) => x.status === 'active' && isActor({ ...task, id } as Task, x)).map((x) => x.uid);
      await notify(recipients, tpl.storeCode, { uid: by.uid, name: 'Việc lặp lại' }, { title: 'Việc hôm nay', body: `${tpl.title} · hạn ${tpl.recurrence.time}`, link: `task:${id}`, level: tpl.priority });
    }
    await api().update('taskTemplates', tpl.id, { lastGenerated: today });
  }
  return created;
}
