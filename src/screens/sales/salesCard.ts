// Ảnh báo cáo khai thác của một đơn hàng
import { cardImage, type CardSection } from '../../lib/salesExport';
import { fmtTr, GROUP_META, GROUP_ORDER, type SalesDraft, type SalesSummary } from '../../lib/sales';
import { stamp, vnTime } from '../../lib/time';

export function salesCard(_text: string, sum: SalesSummary, d: Pick<SalesDraft, 'flags' | 'note'>, who: { name: string; code?: string | null; store: string; at: number }): Promise<Blob> {
  const sections: CardSection[] = [];
  for (const g of GROUP_ORDER) {
    const rows: [string, string][] = [];
    for (const [k, n] of Object.entries(sum.items)) if (n && groupOfKey(sum, k) === g) rows.push([sum.names[k] || k, `× ${n}`]);
    for (const [k, v] of Object.entries(sum.amounts)) if (v && groupOfKey(sum, k) === g) rows.push([sum.names[k] || k, `${fmtTr(v)} Tr`]);
    for (const e of sum.extras) if (e.group === g) rows.push([e.name, `× ${e.qty}`]);
    if (rows.length) sections.push({ title: `${GROUP_META[g].name} · ${sum.groupQty[g] || 0}`, rows });
  }
  return cardImage({
    kicker: 'NHẮC VIỆC · BÁO CÁO KHAI THÁC',
    title: `${who.code ? `${who.code} - ` : ''}${who.name}`,
    subtitle: `${who.store} · ${vnTime(who.at)} ${stamp(who.at).slice(0, 10)}`,
    hero: `${fmtTr(sum.revenue)} Tr`,
    heroLabel: `Doanh thu · ${sum.qty} món`,
    chips: [d.flags.traGop && 'Trả góp', d.flags.moVi && 'Mở Ví', d.flags.chienGia && 'Chiến giá'].filter(Boolean) as string[],
    sections,
    note: d.note,
  });
}

function groupOfKey(sum: SalesSummary, key: string) {
  return sum.groupOf[key];
}
