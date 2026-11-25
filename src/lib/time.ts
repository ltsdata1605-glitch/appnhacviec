// Tiện ích thời gian — mọi tính toán theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
const VN_OFFSET = 7 * 60 * 60 * 1000;
let serverOffset = 0; // chênh lệch đồng hồ máy chủ − đồng hồ máy

/** Đồng bộ giờ với máy chủ bằng header Date của chính tên miền đang chạy app. */
export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch(`/manifest.webmanifest?t=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const header = res.headers.get('date');
    if (!header) return;
    const server = new Date(header).getTime();
    if (Number.isNaN(server)) return;
    // header Date chỉ chính xác tới giây → cộng nửa giây bù sai số làm tròn
    serverOffset = server + 500 - (t0 + t1) / 2;
    if (Math.abs(serverOffset) < 1500) serverOffset = 0;
  } catch {
    /* giữ offset cũ khi mất mạng */
  }
}

export const now = (): number => Date.now() + serverOffset;
export const getServerOffset = () => serverOffset;

function vnParts(ms: number) {
  const d = new Date(ms + VN_OFFSET);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    ss: d.getUTCSeconds(),
    wd: d.getUTCDay(), // 0 = CN
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' theo giờ VN */
export function vnDate(ms: number = now()): string {
  const p = vnParts(ms);
  return `${p.y}-${p2(p.m)}-${p2(p.d)}`;
}

/** 'HH:mm' theo giờ VN */
export function vnTime(ms: number): string {
  const p = vnParts(ms);
  return `${p2(p.hh)}:${p2(p.mm)}`;
}

export function vnMinutesOfDay(ms: number = now()): number {
  const p = vnParts(ms);
  return p.hh * 60 + p.mm;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Mốc ms của ngày `date` (YYYY-MM-DD) lúc `hm` (HH:mm) giờ VN */
export function vnAt(date: string, hm = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - VN_OFFSET;
}

export function addDays(date: string, n: number): string {
  return vnDate(vnAt(date, '12:00') + n * 86400000);
}

export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(last)}` };
}

export function weekdayOf(date: string): number {
  // 1 = Thứ Hai … 7 = Chủ Nhật
  const wd = new Date(vnAt(date, '12:00') + VN_OFFSET).getUTCDay();
  return wd === 0 ? 7 : wd;
}

const WD_LONG = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const WEEKDAY_SHORT = WD_SHORT;

/** "Thứ Tư, 25 tháng 11" */
export function longDate(ms: number = now()): string {
  const p = vnParts(ms);
  return `${WD_LONG[p.wd]}, ${p.d} tháng ${p.m}`;
}

/** "25/11/2026" */
export function dmy(dateOrMs: string | number): string {
  const s = typeof dateOrMs === 'number' ? vnDate(dateOrMs) : dateOrMs;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** "25/11" */
export function dm(dateOrMs: string | number): string {
  const s = typeof dateOrMs === 'number' ? vnDate(dateOrMs) : dateOrMs;
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

/** Dấu thời gian đóng lên ảnh: "25/11/2026 08:42:15" */
export function stamp(ms: number): string {
  const p = vnParts(ms);
  return `${p2(p.d)}/${p2(p.m)}/${p.y} ${p2(p.hh)}:${p2(p.mm)}:${p2(p.ss)}`;
}

/** Hiển thị thân thiện: "08:42", "Hôm qua 08:42", "T2 08:42", "25/11 08:42" */
export function friendly(ms: number): string {
  const today = vnDate();
  const d = vnDate(ms);
  const t = vnTime(ms);
  if (d === today) return t;
  if (d === addDays(today, -1)) return `Hôm qua ${t}`;
  if (d === addDays(today, 1)) return `Mai ${t}`;
  const diff = Math.abs(vnAt(d) - vnAt(today)) / 86400000;
  if (diff < 7) return `${WD_SHORT[vnParts(ms).wd]} ${t}`;
  return `${dm(d)} ${t}`;
}

/** Hạn chót dạng ngắn: "Hôm nay 10:00", "Mai 08:00"… */
export function dueLabel(ms: number): string {
  const today = vnDate();
  const d = vnDate(ms);
  const t = vnTime(ms);
  if (d === today) return `Hôm nay ${t}`;
  return friendly(ms);
}

/** "15 phút", "2 giờ 5 phút", "3 ngày" */
export function duration(msDiff: number): string {
  const m = Math.max(0, Math.round(msDiff / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 24) return r ? `${h} giờ ${r} phút` : `${h} giờ`;
  const d = Math.floor(h / 24);
  return `${d} ngày`;
}

export function relative(ms: number): string {
  const diff = now() - ms;
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 86400000 && vnDate(ms) === vnDate()) return `${Math.floor(diff / 3600000)} giờ trước`;
  return friendly(ms);
}

export function isQuiet(minutes: number, start: string, end: string): boolean {
  const s = hmToMinutes(start);
  const e = hmToMinutes(end);
  return s > e ? minutes >= s || minutes < e : minutes >= s && minutes < e;
}

/** Ghép ngày (YYYY-MM-DD) + giờ (HH:mm) từ input → ms */
export function fromInputs(date: string, time: string): number {
  return vnAt(date, time || '00:00');
}

export function greeting(ms: number = now()): string {
  const h = vnParts(ms).hh;
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}
