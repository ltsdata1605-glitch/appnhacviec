// Quy tắc nghiệp vụ cho Công việc.
import { now } from './time';
import type { Task, UserProfile } from './types';

export type TaskState = 'overdue' | 'soon' | 'open' | 'review' | 'returned' | 'done';

export const TASK_STATE_META: Record<TaskState, { label: string; color: string }> = {
  overdue: { label: 'Quá hạn', color: 'red' },
  soon: { label: 'Sắp đến hạn', color: 'orange' },
  open: { label: 'Cần làm', color: 'blue' },
  review: { label: 'Chờ duyệt', color: 'purple' },
  returned: { label: 'Bị trả lại', color: 'orange' },
  done: { label: 'Hoàn tất', color: 'green' },
};

export function taskState(t: Task, at = now()): TaskState {
  if (t.status === 'done') return 'done';
  if (t.status === 'pending_review') return 'review';
  if (t.dueAt && t.dueAt < at) return 'overdue';
  if (t.status === 'returned') return 'returned';
  if (t.dueAt && t.dueAt - at < 60 * 60000) return 'soon';
  return 'open';
}

/** Người dùng có thuộc nhóm thực hiện việc này không. */
export function isActor(t: Task, me: UserProfile): boolean {
  switch (t.scope) {
    case 'personal':
      return t.assigneeUid === me.uid;
    case 'department':
      return !!t.department && me.department === t.department;
    case 'brand':
      return !!t.brand && me.brand === t.brand;
    case 'store':
      return true;
  }
}

/** Với chế độ "từng người xác nhận": người này đã xác nhận chưa */
export function myDone(t: Task, uid: string): boolean {
  if (t.completionMode === 'each' && t.scope !== 'personal') return !!t.completions?.[uid];
  return t.status === 'done' || t.status === 'pending_review';
}

/** Số người trong nhóm thực hiện (cho chế độ từng người) */
export function actorsOf(t: Task, members: UserProfile[]): UserProfile[] {
  return members.filter((m) => m.status === 'active' && isActor(t, m));
}

export function targetLabel(t: Task): string {
  switch (t.scope) {
    case 'personal':
      return t.assigneeName || 'Cá nhân';
    case 'department':
      return `Bộ phận ${t.department}`;
    case 'brand':
      return `PG ${t.brand}`;
    case 'store':
      return 'Toàn siêu thị';
  }
}

export function sortTasks(list: Task[]): Task[] {
  const order: Record<TaskState, number> = { overdue: 0, returned: 1, soon: 2, open: 3, review: 4, done: 5 };
  const at = now();
  return [...list].sort((a, b) => {
    const sa = order[taskState(a, at)];
    const sb = order[taskState(b, at)];
    if (sa !== sb) return sa - sb;
    if (sa === 5) return (b.completedAt || 0) - (a.completedAt || 0);
    const pa = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2;
    const pb = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2;
    const da = a.dueAt || Infinity;
    const db = b.dueAt || Infinity;
    if (da !== db) return da - db;
    return pa - pb;
  });
}

export function isOpen(t: Task, uid?: string): boolean {
  if (t.completionMode === 'each' && t.scope !== 'personal' && uid) return !t.completions?.[uid] && t.status !== 'done';
  return t.status === 'open' || t.status === 'returned';
}
