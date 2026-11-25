// Gắn tên @ như Zalo/Line: lưu nguyên văn "@Họ Tên" trong nội dung + danh sách uid được nhắc.
import { strip } from './text';
import type { UserProfile } from './types';

export interface MentionCandidate {
  uid: string;
  name: string;
  sub?: string;
  photoURL?: string;
}

/** Tìm đoạn "@từ khoá" ngay trước con trỏ */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[\s(])@([\p{L}\p{N}_.]*(?: [\p{L}\p{N}_.]*){0,2})$/u);
  if (!m) return null;
  const query = m[2];
  if (query.length > 30) return null;
  return { start: caret - query.length - 1, query };
}

export function filterCandidates(list: MentionCandidate[], query: string, limit = 6): MentionCandidate[] {
  const q = strip(query.trim());
  const scored = list
    .map((c) => {
      const n = strip(c.name);
      if (!q) return { c, s: 1 };
      const words = n.split(' ');
      if (words.some((w) => w.startsWith(q))) return { c, s: 3 };
      if (n.includes(q)) return { c, s: 2 };
      if (c.sub && strip(c.sub).includes(q)) return { c, s: 1 };
      return { c, s: 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name, 'vi'));
  return scored.slice(0, limit).map((x) => x.c);
}

/** Các uid được nhắc trong nội dung (khớp "@Họ Tên" đầy đủ, ưu tiên tên dài) */
export function extractMentions(text: string, people: { uid: string; fullName: string }[]): string[] {
  const out = new Set<string>();
  const sorted = [...people].sort((a, b) => b.fullName.length - a.fullName.length);
  let rest = text;
  for (const p of sorted) {
    const tag = `@${p.fullName}`;
    if (rest.includes(tag)) {
      out.add(p.uid);
      rest = rest.split(tag).join(' ');
    }
  }
  return [...out];
}

export function candidatesOf(people: UserProfile[], meUid?: string): MentionCandidate[] {
  return people
    .filter((p) => p.status === 'active' && p.uid !== meUid)
    .map((p) => ({
      uid: p.uid,
      name: p.fullName,
      sub: p.role === 'pg' ? `PG ${p.brand || ''}`.trim() : p.department || (p.role === 'manager' ? 'Quản lý' : 'Nhân viên'),
      photoURL: p.photoURL,
    }));
}

/** Tách nội dung thành đoạn thường và đoạn @tên để hiển thị nổi bật */
export function splitMentions(text: string, names: string[]): { t: string; m: boolean }[] {
  if (!text) return [];
  const tags = [...new Set(names)].sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (!tags.length) return [{ t: text, m: false }];
  const esc = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'g');
  return text
    .split(re)
    .filter(Boolean)
    .map((t) => ({ t, m: tags.includes(t) }));
}
