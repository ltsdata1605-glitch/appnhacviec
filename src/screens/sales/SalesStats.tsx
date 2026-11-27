// Thống kê khai thác: doanh thu, số đơn, bán kèm, cơ cấu nhóm hàng, xếp hạng nhân viên.
import { useMemo, useState } from 'react';
import { useDoc, useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Empty, Section, SkeletonList, SkeletonStats } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { emptyContrib, fmtTr, GROUP_META, GROUP_ORDER, pct, sumAggs, summaryText, type Contrib } from '../../lib/sales';
import { cardImage, type CardSection } from '../../lib/salesExport';
import { shareImage, shareText } from '../../lib/cashExport';
import { addDays, dm, monthRange, vnDate, weekdayOf } from '../../lib/time';
import { useSalesAll } from './Sales';
import type { SalesAgg, SalesRanks } from '../../lib/types';

type Range = 'today' | 'week' | 'month' | 'prev';
const RANGE_LABEL: Record<Range, string> = { today: 'Hôm nay', week: '7 ngày', month: 'Tháng này', prev: 'Tháng trước' };

function rangeOf(r: Range, today: string) {
  const ym = today.slice(0, 7);
  if (r === 'today') return { from: today, to: today, ym };
  if (r === 'week') return { from: addDays(today, -6), to: today, ym };
  if (r === 'month') return { ...monthRange(ym), ym };
  const prevYm = addDays(`${ym}-01`, -1).slice(0, 7);
  return { ...monthRange(prevYm), ym: prevYm };
}

function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** uid: xem riêng một người (quản lý chạm vào bảng xếp hạng) */
export function SalesStats({ uid }: { uid?: string }) {
  const s = useSession();
  const all = useSalesAll();
  const today = vnDate();
  const [range, setRange] = useState<Range>('today');
  const { from, to, ym } = rangeOf(range, today);
  const store = s.storeCode;
  const personUid = uid || (all ? null : s.auth?.uid || null);
  const isMonth = range === 'month' || range === 'prev';

  // Một người: số liệu từng ngày của người đó. Toàn kho: theo ngày (hôm nay, 7 ngày) hoặc theo tháng.
  const personDays = useWatch<SalesAgg>('salesDaily', store && personUid ? [['storeCode', '==', store], ['uid', '==', personUid], ['date', '>=', from], ['date', '<=', to]] : null);
  const storeDays = useWatch<SalesAgg>('salesDaily', store && !personUid && !isMonth ? [['storeCode', '==', store], ['date', '>=', from], ['date', '<=', to]] : null);
  const storeMonth = useWatch<SalesAgg>('salesMonthly', store && !personUid && isMonth ? [['storeCode', '==', store], ['ym', '==', ym]] : null);
  const storeChart = useWatch<SalesAgg>('salesStoreDaily', store && !personUid && range !== 'today' ? [['storeCode', '==', store], ['date', '>=', from], ['date', '<=', to]] : null);
  const ranks = useDoc<SalesRanks>('salesRanks', store && personUid && personUid === s.auth?.uid ? `${store}_${isMonth ? ym : today.slice(0, 7)}` : null);

  const loading = personUid ? personDays.loading : isMonth ? storeMonth.loading : storeDays.loading;

  const people = useMemo(() => {
    if (personUid) return [];
    const rows = isMonth ? storeMonth.data : storeDays.data;
    const m = new Map<string, { uid: string; name: string; code?: string | null; c: Contrib }>();
    for (const r of rows) {
      const cur = m.get(r.uid!) || { uid: r.uid!, name: r.userName || '', code: r.userCode, c: emptyContrib() };
      cur.c = sumAggs([cur.c, r]);
      m.set(r.uid!, cur);
    }
    return [...m.values()].filter((p) => p.c.orders > 0).sort((a, b) => b.c.rev100 - a.c.rev100);
  }, [personUid, isMonth, storeMonth.data, storeDays.data]);

  const total: Contrib = useMemo(() => (personUid ? sumAggs(personDays.data) : sumAggs(people.map((p) => p.c))), [personUid, personDays.data, people]);

  const chart = useMemo(() => {
    if (range === 'today') return [];
    const src = personUid ? personDays.data : storeChart.data;
    const byDate = new Map(src.map((x) => [x.date!, x.rev100 / 100]));
    const end = to > today ? today : to;
    return daysBetween(from, end).map((d) => ({ key: d, value: byDate.get(d) || 0, label: range === 'week' ? ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][weekdayOf(d)] : String(Number(d.slice(8))) }));
  }, [range, personUid, personDays.data, storeChart.data, from, to, today]);

  const myRank = ranks.data && personUid ? ranks.data.ranks?.[personUid] : undefined;
  const ins = Object.values(total.amounts100).reduce((a, b) => a + b, 0) / 100;
  const periodName = range === 'today' ? `hôm nay ${dm(today)}` : range === 'week' ? `7 ngày ${dm(from)}–${dm(to)}` : `tháng ${Number(ym.slice(5))}/${ym.slice(0, 4)}`;
  const d = useStoreData();
  const who = personUid ? d.byUid(personUid) : null;
  const title = personUid ? `KHAI THÁC ${periodName.toUpperCase()} · ${who?.fullName || ''}` : `KHAI THÁC ${periodName.toUpperCase()} · KHO ${store}`;

  const exportText = () => summaryText(title, total, personUid ? undefined : people.slice(0, 10));
  const exportImage = async () => {
    const sections: CardSection[] = [
      {
        title: 'Tổng quan',
        rows: [
          ['Số đơn', String(total.orders)],
          ['Số món', String(total.qty)],
          ['TB/đơn', total.orders ? `${fmtTr(total.rev100 / 100 / total.orders)} Tr` : '0'],
          ['Bảo hiểm', `${fmtTr(ins)} Tr`],
          ['Trả góp · Mở Ví · Chiến giá', `${total.flags.traGop} · ${total.flags.moVi} · ${total.flags.chienGia}`],
        ],
      },
    ];
    if (total.attach.main)
      sections.push({
        title: `Bán kèm (trên ${total.attach.main} đơn có SP chính)`,
        rows: [
          ['Phụ kiện', `${pct(total.attach.accessory, total.attach.main)}%`],
          ['Bảo hiểm', `${pct(total.attach.insurance, total.attach.main)}%`],
          ['SIM', `${pct(total.attach.sim, total.attach.main)}%`],
          ['VAS', `${pct(total.attach.vas, total.attach.main)}%`],
        ],
      });
    if (!personUid && people.length) sections.push({ title: 'Xếp hạng', rows: people.slice(0, 10).map((p, i) => [`${i + 1}. ${p.name}`, `${fmtTr(p.c.rev100 / 100)} Tr`]) });
    const blob = await cardImage({
      kicker: 'NHẮC VIỆC · THỐNG KÊ KHAI THÁC',
      title: personUid ? who?.fullName || '' : s.store?.name || `Kho ${store}`,
      subtitle: periodName.charAt(0).toUpperCase() + periodName.slice(1),
      hero: `${fmtTr(total.rev100 / 100)} Tr`,
      heroLabel: `Doanh thu · ${total.orders} đơn`,
      chips: [],
      sections,
    });
    await shareImage(blob, `thong-ke-khai-thac-${from}.png`);
  };
  const ui = useUI();

  return (
    <>
      <div className="chip-row" style={{ marginTop: 6 }}>
        {(Object.keys(RANGE_LABEL) as Range[]).map((k) => (
          <button key={k} className={`chip${range === k ? ' on' : ''}`} onClick={() => setRange(k)}>
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <>
          <SkeletonStats />
          <SkeletonList rows={3} />
        </>
      ) : !total.orders ? (
        <Empty icon="chart" title="Chưa có số liệu" text={`Chưa có báo cáo khai thác ${periodName}.`} />
      ) : (
        <>
          <Section>
            <div className="card sales-hero">
              <div className="t-foot c2 semibold">{personUid ? (who?.fullName || 'Doanh thu') : 'Doanh thu toàn kho'}</div>
              <div className="sales-hero-v tnum">
                {fmtTr(total.rev100 / 100)}
                <span> Tr</span>
              </div>
              <div className="t-sub c2 tnum">
                {total.orders} đơn · {total.qty} món · TB {fmtTr(total.rev100 / 100 / total.orders)} Tr/đơn
              </div>
              {myRank !== undefined && (
                <div className="sales-rank">
                  <Icon name="trend" size={16} stroke={2.2} />
                  Hạng tháng {Number((isMonth ? ym : today).slice(5, 7))}:{' '}
                  <b className="tnum">
                    {myRank}/{ranks.data?.total}
                  </b>
                </div>
              )}
            </div>
          </Section>

          <Section>
            <div className="stat-grid">
              <Tile label="Bảo hiểm" value={`${fmtTr(ins)} Tr`} sub={total.attach.main ? `${pct(total.attach.insurance, total.attach.main)}% đơn có SP chính` : 'Doanh số bảo hiểm'} />
              <Tile label="Trả góp" value={String(total.flags.traGop)} sub={`${pct(total.flags.traGop, total.orders)}% số đơn`} />
              <Tile label="Mở Ví" value={String(total.flags.moVi)} sub={`${pct(total.flags.moVi, total.orders)}% số đơn`} />
              <Tile label="Chiến giá" value={String(total.flags.chienGia)} sub={`${pct(total.flags.chienGia, total.orders)}% số đơn`} />
            </div>
          </Section>

          {total.attach.main > 0 && (
            <Section title="Bán kèm" small footer={`Tính trên ${total.attach.main} đơn có sản phẩm chính.`}>
              <div className="card sales-meters">
                {(
                  [
                    ['Phụ kiện', total.attach.accessory],
                    ['Bảo hiểm', total.attach.insurance],
                    ['SIM', total.attach.sim],
                    ['VAS', total.attach.vas],
                    ['Gia dụng', total.attach.appliance],
                  ] as [string, number][]
                ).map(([l, n]) => (
                  <div className="meter-row" key={l}>
                    <span className="meter-l">{l}</span>
                    <span className="meter-track">
                      <span className="meter-fill" style={{ width: `${pct(n, total.attach.main)}%` }} />
                    </span>
                    <span className="meter-v tnum">{pct(n, total.attach.main)}%</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {chart.length > 1 && (
            <Section title="Doanh thu theo ngày" small footer="Chạm vào cột để xem số.">
              <div className="card">
                <DayBars data={chart} />
              </div>
            </Section>
          )}

          <Section title="Theo nhóm hàng" small>
            <div className="card sales-meters">
              {GROUP_ORDER.map((k) => {
                const n = total.groupQty[k] || 0;
                const max = Math.max(1, ...GROUP_ORDER.map((g) => total.groupQty[g] || 0));
                return (
                  <div className="meter-row" key={k}>
                    <span className="meter-l">{GROUP_META[k].short}</span>
                    <span className="meter-track">
                      <span className="meter-fill" style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span className="meter-v tnum">{n}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          <TopItems c={total} />

          {!personUid && people.length > 0 && <Leaderboard people={people} />}

          <Section>
            <div className="row gap8">
              <button
                className="btn gray md grow"
                onClick={async () => {
                  const r = await shareText(exportText());
                  if (r === 'copied') ui.toast({ text: 'Đã chép tổng kết', icon: 'check', color: 'green' });
                }}
              >
                <Icon name="share" size={18} />
                Gửi tổng kết
              </button>
              <button className="btn gray md grow" onClick={exportImage}>
                <Icon name="photo" size={18} />
                Ảnh tổng kết
              </button>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value tnum" style={{ fontSize: 26, lineHeight: '32px' }}>
        {value}
      </div>
      <div className="t-foot c2">{sub}</div>
    </div>
  );
}

/** Biểu đồ cột một màu: doanh thu theo ngày. Chạm cột để xem số. */
function DayBars({ data }: { data: { key: string; label: string; value: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const many = data.length > 10;
  return (
    <div className="bars">
      <div className="bars-grid">
        <span className="bars-max tnum">{fmtTr(max)} Tr</span>
      </div>
      <div className="bars-plot" role="list" aria-label="Doanh thu theo ngày">
        {data.map((d, i) => (
          <button
            key={d.key}
            role="listitem"
            className={`bar-col${sel === i ? ' on' : ''}`}
            onClick={() => setSel(sel === i ? null : i)}
            aria-label={`${dm(d.key)}: ${fmtTr(d.value)} triệu`}
          >
            <span className="bar-fill" style={{ height: max ? `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%` : 0 }} />
            {sel === i && (
              <span className={`bar-tip${i > data.length * 0.7 ? ' right' : i < data.length * 0.3 ? ' left' : ''}`}>
                {dm(d.key)}: <b className="tnum">{fmtTr(d.value)} Tr</b>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="bars-x">
        {data.map((d, i) => (
          <span key={d.key}>{!many || i === 0 || i === data.length - 1 || Number(d.key.slice(8)) % 5 === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
}

function TopItems({ c }: { c: Contrib }) {
  const top = Object.entries(c.items)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const money = Object.entries(c.amounts100).filter(([, v]) => v > 0);
  if (!top.length && !money.length) return null;
  return (
    <Section title="Mặt hàng bán nhiều" small>
      <div className="card sales-top">
        {top.map(([k, n]) => (
          <div className="sales-top-row" key={k}>
            <span className="grow ellipsis">{c.names[k] || k}</span>
            <span className="tnum semibold">{n}</span>
          </div>
        ))}
        {money.map(([k, v]) => (
          <div className="sales-top-row" key={k}>
            <span className="grow ellipsis">{c.names[k] || k}</span>
            <span className="tnum semibold">{fmtTr(v / 100)} Tr</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Leaderboard({ people }: { people: { uid: string; name: string; code?: string | null; c: Contrib }[] }) {
  const nav = useNav();
  const d = useStoreData();
  const max = Math.max(1, ...people.map((p) => p.c.rev100));
  return (
    <Section title="Xếp hạng nhân viên" small footer="Chạm vào tên để xem chi tiết từng người.">
      <div className="card sales-board">
        {people.map((p, i) => (
          <button key={p.uid} className="board-row" onClick={() => nav.push(<SalesPersonScreen uid={p.uid} name={p.name} />)}>
            <span className={`board-rank tnum${i < 3 ? ' top' : ''}`}>{i + 1}</span>
            <Avatar name={p.name} src={d.byUid(p.uid)?.photoURL} size={32} />
            <span className="board-body">
              <span className="board-name ellipsis">{p.name}</span>
              <span className="board-track">
                <span className="board-fill" style={{ width: `${(p.c.rev100 / max) * 100}%` }} />
              </span>
            </span>
            <span className="board-v">
              <b className="tnum">{fmtTr(p.c.rev100 / 100)} Tr</b>
              <span className="t-foot c2 tnum">{p.c.orders} đơn</span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function SalesPersonScreen({ uid, name }: { uid: string; name: string }) {
  return (
    <Page title={name} large={false}>
      <SalesStats uid={uid} />
    </Page>
  );
}

