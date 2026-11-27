// Báo cáo khai thác: nhập báo cáo từng đơn, nhật ký, thống kê.
import { useMemo, useState } from 'react';
import { useDoc, useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Empty, Group, Pill, Section, Segmented, SkeletonList } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { deleteSalesReport } from '../../lib/actions';
import { fmtTr, summaryOfReport } from '../../lib/sales';
import { addDays, dm, longDate, stamp, vnAt, vnDate, vnTime } from '../../lib/time';
import { shareImage, shareText } from '../../lib/cashExport';
import { SalesForm } from './SalesForm';
import { SalesStats } from './SalesStats';
import { SalesCatalogScreen } from './SalesCatalog';
import { salesCard } from './salesCard';
import type { SalesReport } from '../../lib/types';

type Tab = 'new' | 'log' | 'stats';

/** Người được xem báo cáo của cả kho: quản lý hoặc được cấp quyền */
export function useSalesAll() {
  const s = useSession();
  return s.can('sales');
}

export function SalesScreen({ initial = 'new' }: { initial?: Tab }) {
  const s = useSession();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <Page
      title="Báo cáo khai thác"
      large={false}
      right={
        s.isManager ? (
          <button className="glass-btn icon" aria-label="Danh mục mặt hàng" onClick={() => nav.push(<SalesCatalogScreen />)}>
            <Icon name="sliders" size={19} />
          </button>
        ) : undefined
      }
      headerExtra={
        <div className="header-pills">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'new', label: 'Nhập báo cáo' },
              { value: 'log', label: 'Nhật ký' },
              { value: 'stats', label: 'Thống kê' },
            ]}
          />
        </div>
      }
    >
      {tab === 'new' ? <SalesForm /> : tab === 'log' ? <SalesLog /> : <SalesStats />}
    </Page>
  );
}

// ---------------- Nhật ký ----------------
function SalesLog() {
  const s = useSession();
  const all = useSalesAll();
  const nav = useNav();
  const today = vnDate();
  const [day, setDay] = useState(today);
  const since = useMemo(() => addDays(today, -30), [today]);
  // Quản lý: xem theo ngày toàn kho. Nhân viên: báo cáo của mình 31 ngày gần nhất.
  const q = useWatch<SalesReport>(
    'salesReports',
    s.storeCode ? (all ? [['storeCode', '==', s.storeCode], ['date', '==', day]] : [['storeCode', '==', s.storeCode], ['uid', '==', s.auth!.uid], ['date', '>=', since]]) : null,
  );
  const list = [...q.data].sort((a, b) => b.createdAt - a.createdAt);
  const byDay = useMemo(() => {
    const m = new Map<string, SalesReport[]>();
    list.forEach((r) => m.set(r.date, [...(m.get(r.date) || []), r]));
    return [...m.entries()];
  }, [list]);
  const total = (rs: SalesReport[]) => ({ rev: rs.reduce((a, r) => a + r.revenue, 0), qty: rs.reduce((a, r) => a + r.qty, 0) });

  return (
    <>
      {all && (
        <div className="chip-row" style={{ marginTop: 6 }}>
          {[
            [today, 'Hôm nay'],
            [addDays(today, -1), 'Hôm qua'],
            [addDays(today, -2), dm(addDays(today, -2))],
          ].map(([v, l]) => (
            <button key={v} className={`chip${day === v ? ' on' : ''}`} onClick={() => setDay(v)}>
              {l}
            </button>
          ))}
          <label className={`chip${![today, addDays(today, -1), addDays(today, -2)].includes(day) ? ' on' : ''}`} style={{ position: 'relative' }}>
            <Icon name="calendar" size={16} />
            {![today, addDays(today, -1), addDays(today, -2)].includes(day) ? dm(day) : 'Chọn ngày'}
            <input type="date" className="chip-date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Chọn ngày" />
          </label>
        </div>
      )}
      {q.loading ? (
        <SkeletonList rows={4} />
      ) : !list.length ? (
        <Empty icon="chart" title={all ? 'Chưa có báo cáo khai thác' : 'Bạn chưa báo cáo khai thác'} text={all ? `Ngày ${dm(day)} chưa có ai gửi báo cáo.` : 'Báo cáo sau mỗi đơn hàng ở mục "Nhập báo cáo".'} />
      ) : (
        byDay.map(([date, rs]) => {
          const t = total(rs);
          return (
            <Section key={date} title={date === today ? 'Hôm nay' : longDate(vnAt(date, '12:00'))} small action={`${fmtTr(t.rev)} Tr · ${rs.length} đơn`}>
              <Group cards>
                {rs.map((r) => (
                  <button key={r.id} className="cell sales-row" onClick={() => nav.push(<SalesDetailScreen id={r.id} />)}>
                    {all && <Avatar name={r.userName} size={36} />}
                    <div className="cell-body">
                      <div className="cell-title">{all ? r.userName : `Đơn ${vnTime(r.createdAt)}`}</div>
                      <div className="cell-sub">
                        {all ? `${vnTime(r.createdAt)} · ` : ''}
                        {r.qty} món
                        {r.flags.traGop ? ' · Trả góp' : ''}
                        {r.flags.moVi ? ' · Mở Ví' : ''}
                        {r.flags.chienGia ? ' · Chiến giá' : ''}
                      </div>
                    </div>
                    <span className="sales-row-rev tnum">{fmtTr(r.revenue)} Tr</span>
                    <Icon name="chevronRight" size={16} stroke={2} className="chev" />
                  </button>
                ))}
              </Group>
            </Section>
          );
        })
      )}
    </>
  );
}

// ---------------- Xem lại một báo cáo ----------------
export function SalesDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const nav = useNav();
  const { data: r, loading } = useDoc<SalesReport>('salesReports', id);
  if (loading) return <Page title="Báo cáo khai thác" large={false}><SkeletonList rows={3} /></Page>;
  if (!r) return <Page title="Báo cáo khai thác" large={false}><Empty icon="lock" title="Không xem được báo cáo này" text="Báo cáo có thể đã bị xoá hoặc bạn không có quyền xem." /></Page>;
  const mine = r.uid === s.auth?.uid;
  const canEdit = s.isManager || (mine && r.date === vnDate());
  const by = d.byUid(r.uid);
  const image = async () => {
    const blob = await salesCard(r.text, summaryOfReport(r), r, { name: r.userName, code: r.userCode, store: s.store?.name || `Kho ${r.storeCode}`, at: r.createdAt });
    await shareImage(blob, `khai-thac-${r.date}-${vnTime(r.createdAt).replace(':', 'h')}.png`);
  };
  return (
    <Page
      title={mine ? `Đơn ${vnTime(r.createdAt)}` : r.userName}
      large={false}
      right={
        canEdit ? (
          <button
            className="glass-btn icon"
            aria-label="Tuỳ chọn"
            onClick={async () => {
              const v = await ui.actions(
                [
                  { label: 'Sửa báo cáo', value: 'edit', icon: 'pencil' },
                  { label: 'Xoá báo cáo', value: 'del', icon: 'trash', destructive: true },
                ],
                `Đơn ${vnTime(r.createdAt)} · ${fmtTr(r.revenue)} Tr`,
              );
              if (v === 'edit') nav.push(<SalesEditScreen report={r} />);
              if (v === 'del' && (await ui.confirm('Xoá báo cáo này?', 'Số liệu thống kê sẽ được tính lại.', 'Xoá', true))) {
                await deleteSalesReport(r);
                ui.toast({ text: 'Đã xoá báo cáo', icon: 'trash' });
                nav.pop();
              }
            }}
          >
            <Icon name="ellipsis" size={20} />
          </button>
        ) : undefined
      }
      footer={
        <>
          <button
            className="btn gray"
            style={{ flex: 1 }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.text);
                ui.toast({ text: 'Đã chép báo cáo', icon: 'check', color: 'green' });
              } catch {
                await shareText(r.text);
              }
            }}
          >
            <Icon name="copy" size={18} />
            Chép
          </button>
          <button className="btn gray" style={{ flex: 1 }} onClick={() => shareText(r.text)}>
            <Icon name="share" size={18} />
            Gửi
          </button>
          <button className="btn gray" style={{ flex: 1 }} onClick={image}>
            <Icon name="photo" size={18} />
            Ảnh
          </button>
        </>
      }
    >
      <div style={{ padding: '2px 20px 0' }}>
        <div className="row gap8">
          <Avatar name={r.userName} src={by?.photoURL} size={22} />
          <div className="t-foot c2 ellipsis">
            {r.userCode ? `${r.userCode} · ` : ''}
            {r.userName} · {stamp(r.createdAt)}
          </div>
        </div>
        <div className="t-large tnum" style={{ marginTop: 4 }}>
          {fmtTr(r.revenue)}
          <span className="t-title3 c2"> Tr</span>
        </div>
        <div className="row gap8 mt8 wrap">
          <Pill>{r.qty} món</Pill>
          {r.flags.traGop && <Pill color="green">Trả góp</Pill>}
          {r.flags.moVi && <Pill color="green">Mở Ví</Pill>}
          {r.flags.chienGia && <Pill color="green">Chiến giá</Pill>}
          {r.updatedAt - r.createdAt > 60000 && <Pill color="orange">Đã sửa {vnTime(r.updatedAt)}</Pill>}
        </div>
      </div>
      <Section title="Nội dung báo cáo" small>
        <pre className="sales-preview card">{r.text}</pre>
      </Section>
    </Page>
  );
}

function SalesEditScreen({ report }: { report: SalesReport }) {
  const nav = useNav();
  return (
    <Page title="Sửa báo cáo" large={false}>
      <SalesForm report={report} onSaved={() => nav.pop()} />
    </Page>
  );
}
