import { useMemo, useState } from 'react';
import { useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Img, Pill, Ring, Section, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { dm, longDate, monthRange, vnAt, vnDate, vnTime } from '../../lib/time';
import { STATUS_META, todayBoard, personStats, ontimeRate, type AreaToday, type PersonStats } from '../../lib/reports';
import { notify } from '../../lib/actions';
import { NavActions, useActor } from '../shared';
import { AreaCard } from './AreaCard';
import { ReportDetailScreen } from './ReportDetail';
import { PersonReportsScreen, MonthCalendar } from './PersonReports';
import { AreasScreen } from '../people/Areas';
import type { Leave, Report } from '../../lib/types';

export function ReportsScreen() {
  const s = useSession();
  return s.can('review') ? <ManagerReports /> : <StaffReports />;
}

// ---------------- Nhân viên ----------------
function StaffReports() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const me = s.profile!;
  const store = s.store;
  const board = useMemo(() => (store ? todayBoard(d.areas, d.reports, store, d.leaves) : []), [d, store]);
  const mine = board.filter((x) => x.responsible === me.uid);
  const owned = d.areas.filter((a) => a.ownerUid === me.uid || a.backupUid === me.uid);
  const ym = vnDate().slice(0, 7);
  const { from, to } = monthRange(ym);
  const stats = useMemo(() => (store ? personStats([me], d.areas, d.reports, store, d.leaves, from, to).find((x) => x.uid === me.uid) : undefined), [d, store, me, from, to]);
  const recent = [...d.reports].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 10);

  return (
    <Page title="Báo cáo 8NTTT" kicker={store ? `${longDate()} · Hạn ${store.deadline}` : undefined} right={<NavActions />}>
      <Section title="Hôm nay">
        {mine.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {mine.map((x) => (
              <AreaCard key={x.area.id} item={x} store={store!} onOpenReport={(id) => nav.push(<ReportDetailScreen id={id} />)} />
            ))}
          </div>
        ) : (
          <div className="card t-sub c2">Hôm nay bạn không phụ trách khu vực nào. Liên hệ quản lý nếu cần phân công.</div>
        )}
      </Section>

      {stats && (
        <Section title={`Tháng ${Number(ym.slice(5))}`}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
              <Metric value={stats.ontime} label="Đúng giờ" color="c-green" />
              <Metric value={stats.late} label="Trễ" color="c-orange" />
              <Metric value={stats.missingDays} label="Ngày thiếu" color="c-red" />
            </div>
            <div className="hairline" style={{ margin: '14px 0' }} />
            <MonthCalendar ym={ym} days={stats.days} />
          </div>
        </Section>
      )}

      {owned.length > 0 && (
        <Section title="Khu vực phụ trách" small>
          <Group>
            {owned.map((a) => (
              <Cell key={a.id} icon="grid" iconColor="teal" title={a.name} sub={a.ownerUid === me.uid ? `${a.criteria.length} tiêu chí` : 'Dự phòng khi người phụ trách nghỉ'} chevron onClick={() => nav.push(<CriteriaScreen areaId={a.id} />)} />
            ))}
          </Group>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Đã gửi gần đây" small>
          <Group>
            {recent.map((r) => (
              <ReportRow key={r.id} r={r} onClick={() => nav.push(<ReportDetailScreen id={r.id} />)} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}

function Metric({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className={`t-title1 tnum ${color}`} style={{ fontFamily: 'var(--font-round)' }}>
        {value}
      </div>
      <div className="t-foot c2">{label}</div>
    </div>
  );
}

function ReportRow({ r, onClick, showUser }: { r: Report; onClick: () => void; showUser?: boolean }) {
  const s = useSession();
  const late = s.store ? r.submittedAt > vnAt(r.date, s.store.deadline) : false;
  const rv = r.review?.result;
  return (
    <Cell
      leading={
        <div className="thumb" style={{ width: 44, height: 44 }}>
          <Img src={r.photos[0]?.thumbUrl} />
        </div>
      }
      sepInset={72}
      title={showUser ? r.userName : r.areaName}
      sub={`${showUser ? r.areaName + ' · ' : ''}${dm(r.date)} ${vnTime(r.submittedAt)}${late ? ' · Trễ' : ''}`}
      trailing={rv ? <Pill sm color={rv === 'pass' ? 'green' : 'red'}>{rv === 'pass' ? 'Đạt' : 'Không đạt'}</Pill> : <Pill sm color="purple">Chờ chấm</Pill>}
      onClick={onClick}
    />
  );
}

export function CriteriaScreen({ areaId }: { areaId: string }) {
  const d = useStoreData();
  const area = d.areas.find((a) => a.id === areaId);
  if (!area) return <Page title="Khu vực" large={false}><Empty icon="grid" title="Không tìm thấy khu vực" /></Page>;
  return (
    <Page title={area.name} large={false}>
      <Section title="Tiêu chí đánh giá" small footer="Chụp đủ góc để quản lý kiểm tra được từng tiêu chí.">
        <Group>
          {area.criteria.map((c, i) => (
            <Cell key={i} leading={<span className="t-sub c2 tnum" style={{ width: 22 }}>{i + 1}.</span>} sepInset={50} title={<span className="t-sub">{c}</span>} />
          ))}
        </Group>
      </Section>
      {area.refPhotoUrl && (
        <Section title="Ảnh chuẩn" small>
          <div className="thumb" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 22 }}>
            <Img src={area.refPhotoUrl} />
          </div>
        </Section>
      )}
    </Page>
  );
}

// ---------------- Quản lý ----------------
type Filter = 'all' | 'todo' | 'review' | 'fail';

function ManagerReports() {
  const s = useSession();
  const [tab, setTab] = useState<'today' | 'stats'>('today');
  const nav = useNav();
  return (
    <Page
      title="Báo cáo 8NTTT"
      kicker={s.store ? `${longDate()} · Hạn ${s.store.deadline}` : undefined}
      right={
        <>
          {s.isManager && (
            <button className="glass-btn icon" aria-label="Khu vực" onClick={() => nav.push(<AreasScreen />)}>
              <Icon name="sliders" size={21} />
            </button>
          )}
          <NavActions />
        </>
      }
      headerExtra={
        <div style={{ padding: '6px 16px 2px' }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'stats', label: 'Thống kê' },
            ]}
          />
        </div>
      }
    >
      {tab === 'today' ? <TodayBoard /> : <StatsBoard />}
    </Page>
  );
}

function TodayBoard() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const [filter, setFilter] = useState<Filter>('all');
  const store = s.store;
  const board = useMemo(() => (store ? todayBoard(d.areas, d.reports, store, d.leaves) : []), [d, store]);
  if (!store) return null;

  const required = board.filter((x) => x.status !== 'none' && x.status !== 'leave');
  const submitted = board.filter((x) => x.report);
  const ontime = board.filter((x) => x.status === 'ontime').length;
  const late = board.filter((x) => x.status === 'late').length;
  const waiting = board.filter((x) => x.status === 'pending' || x.status === 'overdue');
  const overdue = board.filter((x) => x.status === 'overdue');
  const toReview = board.filter((x) => x.report && !x.report.review);
  const failed = board.filter((x) => x.report?.review?.result === 'fail');

  const list = board.filter((x) =>
    filter === 'all' ? true : filter === 'todo' ? x.status === 'pending' || x.status === 'overdue' : filter === 'review' ? x.report && !x.report.review : x.report?.review?.result === 'fail',
  );

  const nudgeAll = async () => {
    const uids = waiting.map((x) => x.responsible!).filter(Boolean);
    if (!uids.length) return;
    const ok = await ui.confirm(`Nhắc ${uids.length} người chưa báo cáo?`, 'Mỗi người sẽ nhận thông báo nhắc chụp báo cáo 8NTTT.', 'Gửi nhắc');
    if (!ok) return;
    await notify(uids, store.code, actor, { title: 'Nhắc báo cáo 8NTTT', body: `${actor.name} nhắc bạn chụp báo cáo khu vực trước ${store.deadline}.`, link: 'reports', urgent: true });
    ui.toast({ text: `Đã nhắc ${uids.length} người`, icon: 'bell', color: 'orange' });
  };

  const onRow = async (x: AreaToday) => {
    if (x.report) {
      nav.push(<ReportDetailScreen id={x.report.id} />);
      return;
    }
    if (!x.responsible) {
      nav.push(<AreasScreen />);
      return;
    }
    const v = await ui.actions([{ label: `Nhắc ${d.nameOf(x.responsible)}`, value: 'nudge', icon: 'bell' }], `${x.area.name} · ${STATUS_META[x.status].label}`);
    if (v === 'nudge') {
      await notify([x.responsible], store.code, actor, { title: 'Nhắc báo cáo 8NTTT', body: `Khu vực ${x.area.name} chưa có báo cáo hôm nay. Hạn ${store.deadline}.`, link: 'reports', urgent: true });
      ui.toast({ text: 'Đã gửi nhắc', icon: 'bell', color: 'orange' });
    }
  };

  return (
    <>
      <Section>
        <div className="card">
          <div className="row gap12">
            <Ring value={submitted.length} total={required.length || 1} size={84} width={10} color="var(--green)">
              <div>
                <div className="t-title3 tnum">{submitted.length}</div>
                <div className="t-cap2 c2">/{required.length}</div>
              </div>
            </Ring>
            <div className="grow" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
              <Mini label="Đúng giờ" value={ontime} color="green" />
              <Mini label="Nộp trễ" value={late} color="orange" />
              <Mini label={overdue.length ? 'Quá giờ' : 'Chưa nộp'} value={overdue.length || waiting.length} color={overdue.length ? 'red' : 'blue'} />
              <Mini label="Chờ chấm" value={toReview.length} color="purple" />
            </div>
          </div>
          {waiting.length > 0 && (
            <button className="btn block tinted mt16" onClick={nudgeAll}>
              <Icon name="bell" size={19} />
              Nhắc {waiting.length} người chưa báo cáo
            </button>
          )}
        </div>
      </Section>

      <div className="chip-row" style={{ marginTop: 18 }}>
        {(
          [
            ['all', `Tất cả ${board.length}`],
            ['todo', `Chưa báo cáo ${waiting.length}`],
            ['review', `Chờ chấm ${toReview.length}`],
            ['fail', `Không đạt ${failed.length}`],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      <Section style={{ paddingTop: 12 }}>
        {list.length ? (
          <Group>
            {list.map((x) => {
              const meta = STATUS_META[x.status];
              const rv = x.report?.review?.result;
              return (
                <Cell
                  key={x.area.id}
                  leading={
                    x.report ? (
                      <div className="thumb" style={{ width: 52, height: 52 }}>
                        <Img src={x.report.photos[0]?.thumbUrl} />
                      </div>
                    ) : (
                      <div className="thumb" style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', color: 'var(--label-3)' }}>
                        <Icon name="camera" size={22} />
                      </div>
                    )
                  }
                  sepInset={80}
                  title={x.area.name}
                  sub={
                    x.responsible
                      ? `${d.nameOf(x.report?.uid || x.responsible)}${x.report ? ` · ${vnTime(x.report.submittedAt)}` : ''}${x.report?.suspect ? ' · Cần kiểm tra' : ''}`
                      : x.status === 'leave'
                        ? `${d.nameOf(x.area.ownerUid)} nghỉ`
                        : 'Chưa phân công'
                  }
                  trailing={
                    rv ? (
                      <Pill sm color={rv === 'pass' ? 'green' : 'red'}>{rv === 'pass' ? 'Đạt' : 'Không đạt'}</Pill>
                    ) : (
                      <Pill sm color={x.report ? (x.status === 'late' ? 'orange' : 'purple') : meta.color}>
                        {x.report ? (x.status === 'late' ? 'Trễ · chờ chấm' : 'Chờ chấm') : meta.label}
                      </Pill>
                    )
                  }
                  onClick={() => onRow(x)}
                />
              );
            })}
          </Group>
        ) : (
          <Empty icon={filter === 'all' ? 'grid' : 'check'} title={filter === 'all' ? 'Chưa có khu vực' : 'Không có mục nào'} text={filter === 'all' ? 'Tạo khu vực từ bộ tiêu chí 8NTTT trong phần cài đặt khu vực.' : undefined} />
        )}
      </Section>
    </>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="row gap8">
      <span className={`dot ${color}`} />
      <span className="t-sub grow c2">{label}</span>
      <span className="t-headline tnum">{value}</span>
    </div>
  );
}

function StatsBoard() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const [ym, setYm] = useState(vnDate().slice(0, 7));
  const { from, to } = monthRange(ym);
  const reps = useWatch<Report>('reports', s.storeCode ? [['storeCode', '==', s.storeCode], ['date', '>=', from], ['date', '<=', to]] : null);
  const lv = useWatch<Leave>('leaves', s.storeCode ? [['storeCode', '==', s.storeCode], ['date', '>=', from], ['date', '<=', to]] : null);
  const people = d.active;
  const stats = useMemo(
    () => (s.store ? personStats(people, d.areas, reps.data, s.store, lv.data, from, to).filter((x) => x.required > 0 || x.leave > 0) : []),
    [people, d.areas, reps.data, lv.data, s.store, from, to],
  );
  const sorted = [...stats].sort((a, b) => b.missingDays - a.missingDays || b.missing - a.missing || b.late - a.late || a.uid.localeCompare(b.uid));
  const tot = stats.reduce((acc, x) => ({ req: acc.req + x.required, on: acc.on + x.ontime, late: acc.late + x.late, miss: acc.miss + x.missing }), { req: 0, on: 0, late: 0, miss: 0 });
  const missingPeople = stats.filter((x) => x.missingDays > 0).length;
  const shift = (n: number) => {
    const [y, m] = ym.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const isCurrent = ym === vnDate().slice(0, 7);

  return (
    <>
      <Section>
        <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px 10px' }}>
          <button className="glass-btn icon" onClick={() => shift(-1)} aria-label="Tháng trước">
            <Icon name="chevronLeft" size={20} stroke={2.3} />
          </button>
          <div className="center">
            <div className="t-headline">Tháng {Number(ym.slice(5))}/{ym.slice(0, 4)}</div>
            <div className="t-foot c2">{isCurrent ? `Đến hôm nay ${dm(vnDate())}` : `${dm(from)} – ${dm(to)}`}</div>
          </div>
          <button className="glass-btn icon" onClick={() => shift(1)} disabled={isCurrent} aria-label="Tháng sau">
            <Icon name="chevronRight" size={20} stroke={2.3} />
          </button>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">
              <Icon name="check" size={17} className="c-green" stroke={2.4} />
              Tỷ lệ đúng giờ
            </div>
            <div className="stat-value">
              {ontimeRate({ required: tot.req, ontime: tot.on })}
              <span className="stat-unit">%</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">
              <Icon name="warning" size={17} className="c-red" stroke={2.2} />
              Lượt không báo cáo
            </div>
            <div className="stat-value c-red">{tot.miss}</div>
          </div>
        </div>
      </Section>

      <Section title="Theo nhân viên" small footer={missingPeople ? `${missingPeople} người có ngày không báo cáo trong tháng. Chạm để xem lịch chi tiết.` : 'Chạm vào từng người để xem lịch báo cáo chi tiết.'}>
        {reps.loading ? (
          <div className="card center">
            <span className="spinner" />
          </div>
        ) : sorted.length ? (
          <Group>
            {sorted.map((x) => (
              <PersonStatRow key={x.uid} x={x} onClick={() => nav.push(<PersonReportsScreen uid={x.uid} ym={ym} />)} />
            ))}
          </Group>
        ) : (
          <Empty icon="chart" title="Chưa có dữ liệu" text="Thống kê xuất hiện khi khu vực đã được phân công." />
        )}
      </Section>
    </>
  );
}

function PersonStatRow({ x, onClick }: { x: PersonStats; onClick: () => void }) {
  const d = useStoreData();
  const p = d.byUid(x.uid);
  const rate = ontimeRate(x);
  return (
    <button className="cell" style={{ ['--sep-inset' as string]: '66px', alignItems: 'center' }} onClick={onClick}>
      <Avatar name={p?.fullName || '?'} src={p?.photoURL} size={38} />
      <div className="cell-body">
        <div className="row gap8">
          <span className="cell-title grow ellipsis">{p?.fullName || 'Không rõ'}</span>
          {x.missingDays > 0 ? <Pill sm color="red">Thiếu {x.missingDays} ngày</Pill> : <Pill sm color="green">Đủ</Pill>}
        </div>
        <div className="t-foot c2" style={{ marginTop: 3 }}>
          Đúng giờ {x.ontime} · Trễ {x.late}
          {x.leave ? ` · Nghỉ ${x.leave}` : ''}
          {x.failed ? ` · Không đạt ${x.failed}` : ''}
          {x.streak > 1 ? ` · ${x.streak} ngày liên tiếp` : ''}
        </div>
        <div className="bar" style={{ marginTop: 6 }}>
          <i style={{ width: `${rate}%`, background: rate >= 90 ? 'var(--green)' : rate >= 70 ? 'var(--orange)' : 'var(--red)' }} />
        </div>
      </div>
      <Icon name="chevronRight" size={17} stroke={2.4} className="chev" />
    </button>
  );
}

export { ReportRow };
