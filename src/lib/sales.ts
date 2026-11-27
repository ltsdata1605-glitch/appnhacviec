// Báo cáo khai thác: danh mục mặt hàng, tính doanh thu, soạn tin gửi Zalo, cộng dồn thống kê.
import type { SalesAgg, SalesExtra, SalesFlags, SalesGroup, SalesGroupKey, SalesItem, SalesReport } from './types';

export const GROUP_ORDER: SalesGroupKey[] = ['main', 'priority', 'accessory', 'appliance', 'vas'];

export const GROUP_META: Record<SalesGroupKey, { name: string; short: string; icon: string; color: string; emoji: string }> = {
  main: { name: 'Sản phẩm chính', short: 'SP chính', icon: 'box', color: 'blue', emoji: '📦' },
  priority: { name: 'Ưu tiên', short: 'Ưu tiên', icon: 'star', color: 'orange', emoji: '⭐' },
  accessory: { name: 'Phụ kiện', short: 'Phụ kiện', icon: 'headphones', color: 'pink', emoji: '🎧' },
  appliance: { name: 'Gia dụng', short: 'Gia dụng', icon: 'home', color: 'green', emoji: '🏠' },
  vas: { name: 'VAS', short: 'VAS', icon: 'shield', color: 'indigo', emoji: '🛡️' },
};

const it = (key: string, name: string, money?: boolean): SalesItem => (money ? { key, name, money } : { key, name });

/** Danh mục mặc định — quản lý chỉnh lại cho kho trong phần cài đặt khai thác */
export const DEFAULT_CATALOG: SalesGroup[] = [
  { key: 'main', name: 'Sản phẩm chính', items: [it('tivi', 'Tivi'), it('tu_lanh', 'Tủ lạnh'), it('may_giat', 'Máy giặt'), it('may_lanh', 'Máy lạnh'), it('smp_tab', 'SMP / Tab'), it('laptop', 'Laptop')] },
  { key: 'priority', name: 'Ưu tiên', items: [it('sim', 'SIM'), it('dong_ho', 'Đồng hồ'), it('bh_roi_vo', 'Bảo hiểm rơi vỡ', true), it('bh_mo_rong', 'Bảo hiểm mở rộng', true)] },
  { key: 'accessory', name: 'Phụ kiện', items: [it('camera', 'Camera'), it('sac_du_phong', 'Sạc dự phòng'), it('den', 'Đèn'), it('loa', 'Loa'), it('tai_nghe', 'Tai nghe')] },
  {
    key: 'appliance',
    name: 'Gia dụng',
    items: [
      it('may_loc_nuoc', 'Máy lọc nước'),
      it('robot_hut_bui', 'Robot hút bụi'),
      it('quat_dieu_hoa', 'Quạt điều hoà'),
      it('quat_gio', 'Quạt gió'),
      it('noi_com', 'Nồi cơm'),
      it('noi_chien', 'Nồi chiên'),
      it('may_loc_kk', 'Máy lọc KK'),
      it('bep_dien', 'Bếp điện'),
      it('bep_gas', 'Bếp gas'),
      it('dcnb', 'DCNB'),
    ],
  },
  { key: 'vas', name: 'VAS', items: [it('vieon', 'Vieon'), it('mango', 'Mango'), it('icalme', 'iCalme'), it('kaspersky', 'Kaspersky')] },
];

/** Danh mục của kho: dùng bản quản lý đã chỉnh, thiếu nhóm nào thì lấy mặc định */
export function catalogOf(stored?: SalesGroup[] | null): SalesGroup[] {
  return GROUP_ORDER.map((k) => stored?.find((g) => g.key === k) || DEFAULT_CATALOG.find((g) => g.key === k)!);
}

/** Tạo khoá ổn định từ tên mặt hàng (bỏ dấu tiếng Việt) */
export function slugKey(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'muc'
  );
}

// ---------- Doanh thu: gõ được phép tính ----------
/** Tính biểu thức cộng/trừ đơn giản: "5+3+4", "8,5", "12.5-1.2". Trả về null nếu không hợp lệ. Không dùng eval. */
export function evalRevenue(expr: string): number | null {
  const s = expr.replace(/\s+/g, '').replace(/,/g, '.');
  if (!s) return 0;
  if (!/^[+-]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(s)) return null;
  let total = 0;
  for (const m of s.matchAll(/([+-]?)(\d*\.?\d+)/g)) total += (m[1] === '-' ? -1 : 1) * Number(m[2]);
  if (!Number.isFinite(total) || total < 0 || total > 100000) return null;
  return Math.round(total * 100) / 100;
}

/** Chỉ giữ ký tự hợp lệ của phép tính doanh thu */
export function cleanExpr(raw: string): string {
  return raw.replace(/[^0-9.,+\-\s]/g, '').replace(/\s+/g, '');
}

/** 12.5 → "12,5"; 3 → "3"; 1234.25 → "1.234,25" */
export function fmtTr(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

// ---------- Đơn hàng ----------
export interface SalesDraft {
  revenueExpr: string;
  flags: SalesFlags;
  items: Record<string, number>;
  amounts: Record<string, number>; // triệu đồng
  amountText: Record<string, string>; // ô đang gõ số tiền
  extras: SalesExtra[];
  note: string;
}

export const emptyDraft = (): SalesDraft => ({
  revenueExpr: '',
  flags: { traGop: false, moVi: false, chienGia: false },
  items: {},
  amounts: {},
  amountText: {},
  extras: [],
  note: '',
});

/** Dựng lại số liệu đơn hàng từ báo cáo đã lưu (xem lại, xuất ảnh) */
export function summaryOfReport(r: SalesReport): SalesSummary {
  return { groupOf: r.groupOf || {}, revenue: r.revenue, items: r.items || {}, amounts: r.amounts || {}, extras: r.extras || [], groupQty: r.groupQty || {}, qty: r.qty || 0, names: r.names || {} };
}

export function draftFromReport(r: SalesReport): SalesDraft {
  return {
    revenueExpr: r.revenueExpr || (r.revenue ? String(r.revenue).replace('.', ',') : ''),
    flags: { ...r.flags },
    items: { ...r.items },
    amounts: { ...r.amounts },
    amountText: Object.fromEntries(Object.entries(r.amounts).map(([k, v]) => [k, fmtTr(v)])),
    extras: r.extras.map((x) => ({ ...x })),
    note: r.note || '',
  };
}

export interface SalesSummary {
  groupOf: Record<string, SalesGroupKey>; // khoá mặt hàng → nhóm
  revenue: number;
  items: Record<string, number>;
  amounts: Record<string, number>;
  extras: SalesExtra[];
  groupQty: Partial<Record<SalesGroupKey, number>>;
  qty: number;
  names: Record<string, string>;
}

/** Gom số liệu đơn hàng từ bản nháp theo danh mục */
export function summarize(d: SalesDraft, catalog: SalesGroup[]): SalesSummary {
  const items: Record<string, number> = {};
  const amounts: Record<string, number> = {};
  const names: Record<string, string> = {};
  const groupOf: Record<string, SalesGroupKey> = {};
  const groupQty: Partial<Record<SalesGroupKey, number>> = {};
  let qty = 0;
  for (const g of catalog) {
    for (const x of g.items) groupOf[x.key] = g.key;
    for (const x of g.items) {
      if (x.money) {
        const v = Math.round((d.amounts[x.key] || 0) * 100) / 100;
        if (v > 0) {
          amounts[x.key] = v;
          names[x.key] = x.name;
          groupQty[g.key] = (groupQty[g.key] || 0) + 1; // một gói bảo hiểm tính là 1 món
          qty += 1;
        }
      } else {
        const n = d.items[x.key] || 0;
        if (n > 0) {
          items[x.key] = n;
          names[x.key] = x.name;
          groupQty[g.key] = (groupQty[g.key] || 0) + n;
          qty += n;
        }
      }
    }
  }
  const extras = d.extras.filter((e) => e.name.trim() && e.qty > 0).map((e) => ({ group: e.group, name: e.name.trim(), qty: e.qty }));
  for (const e of extras) {
    groupQty[e.group] = (groupQty[e.group] || 0) + e.qty;
    qty += e.qty;
  }
  return { groupOf, revenue: evalRevenue(d.revenueExpr) ?? 0, items, amounts, extras, groupQty, qty, names };
}

// ---------- Tin nhắn gửi Zalo ----------
export interface TextInfo {
  userCode?: string | null;
  userName: string;
  storeCode: string;
  at: number;
  timeText: string; // "14:35 · 27/11/2026"
}

export function salesText(sum: SalesSummary, d: Pick<SalesDraft, 'flags' | 'note' | 'revenueExpr'>, catalog: SalesGroup[], info: TextInfo): string {
  const L: string[] = [];
  L.push('📊 BÁO CÁO KHAI THÁC');
  L.push(`👤 ${info.userCode ? `${info.userCode} - ` : ''}${info.userName} · Kho ${info.storeCode}`);
  L.push(`🕒 ${info.timeText}`);
  const expr = d.revenueExpr.replace(/\s+/g, '');
  const showExpr = /[+-]/.test(expr.replace(/^[+-]/, ''));
  L.push(`💰 Doanh thu: ${fmtTr(sum.revenue)} Tr${showExpr ? ` (${expr.replace(/\./g, ',')})` : ''}`);
  const flags = [d.flags.traGop && 'Trả góp', d.flags.moVi && 'Mở Ví', d.flags.chienGia && 'Chiến giá'].filter(Boolean);
  if (flags.length) L.push(`✅ ${flags.join(' · ')}`);
  const lines: string[] = [];
  for (const g of catalog) {
    const parts: string[] = [];
    for (const x of g.items) {
      if (x.money && sum.amounts[x.key]) parts.push(`${x.name} ${fmtTr(sum.amounts[x.key])} Tr`);
      else if (!x.money && sum.items[x.key]) parts.push(`${x.name} ${sum.items[x.key]}`);
    }
    for (const e of sum.extras.filter((e) => e.group === g.key)) parts.push(`${e.name} ${e.qty}`);
    if (parts.length) lines.push(`${GROUP_META[g.key].emoji} ${GROUP_META[g.key].short}: ${parts.join(', ')}`);
  }
  if (lines.length) {
    L.push('━━━━━━━━━━');
    L.push(...lines);
  }
  L.push(`🧾 Tổng: ${sum.qty} món`);
  if (d.note.trim()) L.push(`📝 ${d.note.trim()}`);
  return L.join('\n');
}

// ---------- Thống kê ----------
export interface Contrib {
  orders: number;
  rev100: number;
  qty: number;
  groupQty: Partial<Record<SalesGroupKey, number>>;
  items: Record<string, number>;
  amounts100: Record<string, number>;
  names: Record<string, string>;
  flags: { traGop: number; moVi: number; chienGia: number };
  attach: { main: number; accessory: number; insurance: number; sim: number; vas: number; appliance: number };
}

export const emptyContrib = (): Contrib => ({
  orders: 0,
  rev100: 0,
  qty: 0,
  groupQty: {},
  items: {},
  amounts100: {},
  names: {},
  flags: { traGop: 0, moVi: 0, chienGia: 0 },
  attach: { main: 0, accessory: 0, insurance: 0, sim: 0, vas: 0, appliance: 0 },
});

/** Tỷ lệ bán kèm tính trên các đơn có sản phẩm chính */
export function contribOf(r: Pick<SalesReport, 'revenue' | 'qty' | 'groupQty' | 'items' | 'amounts' | 'names' | 'flags'>): Contrib {
  const c = emptyContrib();
  c.orders = 1;
  c.rev100 = Math.round((r.revenue || 0) * 100);
  c.qty = r.qty || 0;
  c.groupQty = { ...r.groupQty };
  c.items = { ...r.items };
  c.amounts100 = Object.fromEntries(Object.entries(r.amounts || {}).map(([k, v]) => [k, Math.round(v * 100)]));
  c.names = { ...r.names };
  c.flags = { traGop: r.flags?.traGop ? 1 : 0, moVi: r.flags?.moVi ? 1 : 0, chienGia: r.flags?.chienGia ? 1 : 0 };
  const main = (r.groupQty?.main || 0) > 0;
  const hasIns = Object.keys(r.amounts || {}).length > 0;
  c.attach = {
    main: main ? 1 : 0,
    accessory: main && (r.groupQty?.accessory || 0) > 0 ? 1 : 0,
    insurance: main && hasIns ? 1 : 0,
    sim: main && (r.items?.sim || 0) > 0 ? 1 : 0,
    vas: main && (r.groupQty?.vas || 0) > 0 ? 1 : 0,
    appliance: main && (r.groupQty?.appliance || 0) > 0 ? 1 : 0,
  };
  return c;
}

const addMap = (a: Record<string, number>, b: Record<string, number>) => {
  for (const [k, v] of Object.entries(b || {})) a[k] = (a[k] || 0) + (v || 0);
};

/** Cộng nhiều phần số liệu (đơn hàng hoặc bản cộng dồn theo ngày/tháng) */
export function addContrib(into: Contrib, c: Partial<Contrib>): Contrib {
  into.orders += c.orders || 0;
  into.rev100 += c.rev100 || 0;
  into.qty += c.qty || 0;
  addMap(into.groupQty as Record<string, number>, (c.groupQty || {}) as Record<string, number>);
  addMap(into.items, c.items || {});
  addMap(into.amounts100, c.amounts100 || {});
  Object.assign(into.names, c.names || {});
  addMap(into.flags as unknown as Record<string, number>, (c.flags || {}) as unknown as Record<string, number>);
  addMap(into.attach as unknown as Record<string, number>, (c.attach || {}) as unknown as Record<string, number>);
  return into;
}

export const sumAggs = (list: Partial<Contrib>[]): Contrib => list.reduce<Contrib>((acc, x) => addContrib(acc, x), emptyContrib());

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Tóm tắt số liệu để gửi nhóm (tổng kết ngày/tháng) */
export function summaryText(title: string, c: Contrib, people?: { name: string; c: Contrib }[]): string {
  const L: string[] = [];
  L.push(`📈 ${title}`);
  L.push(`💰 Doanh thu: ${fmtTr(c.rev100 / 100)} Tr · ${c.orders} đơn · ${c.qty} món`);
  if (c.orders) L.push(`🧾 TB/đơn: ${fmtTr(c.rev100 / 100 / c.orders)} Tr`);
  const ins = Object.values(c.amounts100).reduce((a, b) => a + b, 0) / 100;
  if (ins) L.push(`🛡️ Bảo hiểm: ${fmtTr(ins)} Tr`);
  L.push(`✅ Trả góp ${c.flags.traGop} · Mở Ví ${c.flags.moVi} · Chiến giá ${c.flags.chienGia}`);
  if (c.attach.main) L.push(`🔗 Bán kèm: PK ${pct(c.attach.accessory, c.attach.main)}% · BH ${pct(c.attach.insurance, c.attach.main)}% · SIM ${pct(c.attach.sim, c.attach.main)}% · VAS ${pct(c.attach.vas, c.attach.main)}%`);
  const g = GROUP_ORDER.filter((k) => c.groupQty[k]).map((k) => `${GROUP_META[k].short} ${c.groupQty[k]}`);
  if (g.length) L.push(`📦 ${g.join(' · ')}`);
  if (people?.length) {
    L.push('━━━━━━━━━━');
    people.forEach((p, i) => L.push(`${i + 1}. ${p.name}: ${fmtTr(p.c.rev100 / 100)} Tr · ${p.c.orders} đơn`));
  }
  return L.join('\n');
}

export function ymOf(date: string) {
  return date.slice(0, 7);
}

export type { SalesAgg };
