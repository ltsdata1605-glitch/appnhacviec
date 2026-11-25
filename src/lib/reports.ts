// Tính trạng thái báo cáo 8NTTT và thống kê chuyên cần.
import { hmToMinutes, now, vnAt, vnDate, vnMinutesOfDay, daysInRange } from './time';
import type { Area, Leave, Report, Store, UserProfile } from './types';

export type DayStatus =
  | 'ontime' // đã nộp đúng giờ
  | 'late' // nộp sau giờ quy định
  | 'pending' // hôm nay, chưa nộp, còn hạn
  | 'overdue' // hôm nay, quá giờ chưa nộp
  | 'missing' // ngày đã qua, không nộp
  | 'leave' // người phụ trách nghỉ, không tính
  | 'none'; // khu vực chưa có người phụ trách / chưa tồn tại

export const STATUS_META: Record<DayStatus, { label: string; color: string }> = {
  ontime: { label: 'Đúng giờ', color: 'green' },
  late: { label: 'Nộp trễ', color: 'orange' },
  pending: { label: 'Chưa báo cáo', color: 'blue' },
  overdue: { label: 'Quá giờ chưa báo cáo', color: 'red' },
  missing: { label: 'Không báo cáo', color: 'red' },
  leave: { label: 'Nghỉ', color: 'gray' },
  none: { label: 'Chưa phân công', color: 'gray' },
};

export function reportId(storeCode: string, date: string, areaId: string) {
  return `${storeCode}_${date}_${areaId}`;
}

export function isLate(r: Pick<Report, 'submittedAt' | 'date'>, deadline: string): boolean {
  return r.submittedAt > vnAt(r.date, deadline);
}

export function onLeave(leaves: Leave[], uid: string | null | undefined, date: string): boolean {
  if (!uid) return false;
  return leaves.some((l) => l.uid === uid && l.date === date && l.status === 'approved');
}

/** Người chịu trách nhiệm báo cáo khu vực trong ngày (có tính người dự phòng khi nghỉ). */
export function responsibleFor(area: Area, date: string, leaves: Leave[]): string | null {
  if (area.createdDate && date < area.createdDate) return null;
  const owner = area.ownerUid && (!area.ownerSince || date >= area.ownerSince) ? area.ownerUid : null;
  if (!owner) return null;
  if (!onLeave(leaves, owner, date)) return owner;
  if (area.backupUid && area.backupUid !== owner && !onLeave(leaves, area.backupUid, date)) return area.backupUid;
  return null;
}

export function dayStatus(area: Area, date: string, report: Report | undefined, store: Store, leaves: Leave[]): DayStatus {
  if (report) return isLate(report, store.deadline) ? 'late' : 'ontime';
  const today = vnDate();
  if (date > today) return 'none';
  const resp = responsibleFor(area, date, leaves);
  if (!resp) {
    const ownerOff = area.ownerUid && onLeave(leaves, area.ownerUid, date);
    return ownerOff ? 'leave' : 'none';
  }
  if (date === today) return vnMinutesOfDay() >= hmToMinutes(store.deadline) ? 'overdue' : 'pending';
  return 'missing';
}

export function minutesToDeadline(store: Store): number {
  return hmToMinutes(store.deadline) - vnMinutesOfDay();
}

export function reportIndex(reports: Report[]): Map<string, Report> {
  const m = new Map<string, Report>();
  reports.forEach((r) => m.set(`${r.date}|${r.areaId}`, r));
  return m;
}

export interface AreaToday {
  area: Area;
  status: DayStatus;
  report?: Report;
  responsible: string | null;
}

export function todayBoard(areas: Area[], reports: Report[], store: Store, leaves: Leave[]): AreaToday[] {
  const today = vnDate();
  const idx = reportIndex(reports);
  return areas
    .filter((a) => a.active)
    .sort((a, b) => a.order - b.order)
    .map((area) => {
      const report = idx.get(`${today}|${area.id}`);
      return { area, report, status: dayStatus(area, today, report, store, leaves), responsible: responsibleFor(area, today, leaves) };
    });
}

export interface PersonStats {
  uid: string;
  required: number;
  ontime: number;
  late: number;
  missing: number; // số lượt (khu vực × ngày) không báo cáo
  missingDays: number; // số ngày có ít nhất một khu vực không báo cáo
  leave: number;
  failed: number;
  streak: number; // số ngày thiếu liên tiếp gần nhất
  days: Record<string, DayStatus>;
}

/** Thống kê chuyên cần báo cáo theo người trong khoảng ngày. */
export function personStats(
  people: UserProfile[],
  areas: Area[],
  reports: Report[],
  store: Store,
  leaves: Leave[],
  from: string,
  to: string,
): PersonStats[] {
  const today = vnDate();
  const end = to > today ? today : to;
  const days = from <= end ? daysInRange(from, end) : [];
  const idx = reportIndex(reports);
  const map = new Map<string, PersonStats>();
  const get = (uid: string) => {
    let s = map.get(uid);
    if (!s) {
      s = { uid, required: 0, ontime: 0, late: 0, missing: 0, missingDays: 0, leave: 0, failed: 0, streak: 0, days: {} };
      map.set(uid, s);
    }
    return s;
  };
  people.forEach((p) => get(p.uid));
  const joined = new Map(people.map((p) => [p.uid, vnDate(p.approvedAt || p.createdAt)]));
  const rank: Record<DayStatus, number> = { missing: 6, overdue: 5, late: 4, pending: 3, ontime: 2, leave: 1, none: 0 };

  for (const date of days) {
    for (const area of areas) {
      if (!area.active && !idx.has(`${date}|${area.id}`)) continue;
      const rep = idx.get(`${date}|${area.id}`);
      if (rep) {
        const s = get(rep.uid);
        s.required++;
        if (isLate(rep, store.deadline)) s.late++;
        else s.ontime++;
        if (rep.review?.result === 'fail') s.failed++;
        const st: DayStatus = isLate(rep, store.deadline) ? 'late' : 'ontime';
        if (!s.days[date] || rank[st] > rank[s.days[date]]) s.days[date] = st;
        continue;
      }
      const resp = responsibleFor(area, date, leaves);
      if (resp) {
        if ((joined.get(resp) || '') > date) continue;
        const st = dayStatus(area, date, undefined, store, leaves);
        const s = get(resp);
        if (st === 'pending') {
          if (!s.days[date] || rank[st] > rank[s.days[date]]) s.days[date] = st;
          continue;
        }
        s.required++;
        if (st === 'missing' || st === 'overdue') s.missing++;
        if (!s.days[date] || rank[st] > rank[s.days[date]]) s.days[date] = st;
      } else if (area.ownerUid && onLeave(leaves, area.ownerUid, date)) {
        const s = get(area.ownerUid);
        s.leave++;
        if (!s.days[date]) s.days[date] = 'leave';
      }
    }
  }
  // chuỗi ngày thiếu liên tiếp (tính lùi từ ngày gần nhất)
  for (const s of map.values()) {
    s.missingDays = Object.values(s.days).filter((v) => v === 'missing' || v === 'overdue').length;
    let k = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const st = s.days[days[i]];
      if (st === 'pending' || st === undefined || st === 'leave') {
        if (st === undefined) break;
        continue;
      }
      if (st === 'missing' || st === 'overdue') k++;
      else break;
    }
    s.streak = k;
  }
  return [...map.values()];
}

export function ontimeRate(s: Pick<PersonStats, 'required' | 'ontime'>): number {
  return s.required ? Math.round((s.ontime / s.required) * 100) : 100;
}

export const nowMs = now;
