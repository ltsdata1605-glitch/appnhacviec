import { useMemo, useState } from 'react';
import { useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { Avatar, Group, Section } from '../../ui/controls';
import { WEEKDAY_SHORT, dm, monthRange, vnDate, weekdayOf, daysInRange } from '../../lib/time';
import { personStats, ontimeRate, STATUS_META, type DayStatus } from '../../lib/reports';
import { roleLine } from '../shared';
import { ReportDetailScreen } from './ReportDetail';
import { ReportRow } from './ReportsHome';
import type { Leave, Report } from '../../lib/types';

export function MonthCalendar({ ym, days, onDay }: { ym: string; days: Record<string, DayStatus>; onDay?: (date: string) => void }) {
  const { from, to } = monthRange(ym);
  const list = daysInRange(from, to);
  const lead = weekdayOf(from) - 1;
  const today = vnDate();
  const heads = [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAY_SHORT[i]);
  return (
    <div>
      <div className="cal">
        {heads.map((h) => (
          <div key={h} className="cal-h">
            {h}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {list.map((d) => {
          const st = days[d];
          return (
            <button key={d} className={`cal-d ${st || ''}${d === today ? ' today' : ''}`} onClick={() => onDay?.(d)} aria-label={`${dm(d)} ${st ? STATUS_META[st].label : ''}`}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="row gap12 wrap mt12 t-cap c2" style={{ justifyContent: 'center' }}>
        <span className="row gap4">
          <span className="dot green" /> Đúng giờ
        </span>
        <span className="row gap4">
          <span className="dot orange" /> Trễ
        </span>
        <span className="row gap4">
          <span className="dot red" /> Không báo cáo
        </span>
        <span className="row gap4">
          <span className="dot gray" /> Nghỉ
        </span>
      </div>
    </div>
  );
}

export function PersonReportsScreen({ uid, ym: initial }: { uid: string; ym: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const [ym] = useState(initial);
  const { from, to } = monthRange(ym);
  const person = d.byUid(uid);
  const reps = useWatch<Report>('reports', s.storeCode ? [['storeCode', '==', s.storeCode], ['date', '>=', from], ['date', '<=', to]] : null);
  const lv = useWatch<Leave>('leaves', s.storeCode ? [['storeCode', '==', s.storeCode], ['date', '>=', from], ['date', '<=', to]] : null);
  const st = useMemo(
    () => (s.store && person ? personStats([person], d.areas, reps.data, s.store, lv.data, from, to).find((x) => x.uid === uid) : undefined),
    [s.store, person, d.areas, reps.data, lv.data, from, to, uid],
  );
  const mine = reps.data.filter((r) => r.uid === uid).sort((a, b) => b.submittedAt - a.submittedAt);
  const missingDays = st ? Object.entries(st.days).filter(([, v]) => v === 'missing' || v === 'overdue').map(([k]) => k).sort() : [];

  return (
    <Page title={person?.fullName || 'Nhân viên'} large={false}>
      <div className="center" style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'inline-block' }}>
          <Avatar name={person?.fullName || '?'} src={person?.photoURL} size={72} />
        </div>
        <div className="t-title2 mt8">{person?.fullName}</div>
        <div className="t-sub c2">{person ? roleLine(person) : ''}</div>
      </div>
      {st && (
        <>
          <Section>
            <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <Box label="Đúng giờ" value={st.ontime} color="c-green" />
              <Box label="Trễ" value={st.late} color="c-orange" />
              <Box label="Ngày thiếu" value={st.missingDays} color="c-red" />
            </div>
          </Section>
          <Section title={`Tháng ${Number(ym.slice(5))}/${ym.slice(0, 4)}`} small footer={`Tỷ lệ đúng giờ ${ontimeRate(st)}%${st.failed ? ` · ${st.failed} lần không đạt` : ''}${st.streak > 1 ? ` · Đang thiếu ${st.streak} ngày liên tiếp` : ''}.`}>
            <div className="card">
              <MonthCalendar
                ym={ym}
                days={st.days}
                onDay={(date) => {
                  const r = mine.find((x) => x.date === date);
                  if (r) nav.push(<ReportDetailScreen id={r.id} />);
                }}
              />
            </div>
          </Section>
          {missingDays.length > 0 && (
            <Section title="Ngày không báo cáo" small>
              <div className="card t-body">{missingDays.map((x) => dm(x)).join(', ')}</div>
            </Section>
          )}
        </>
      )}
      {mine.length > 0 && (
        <Section title="Báo cáo đã gửi" small>
          <Group>
            {mine.map((r) => (
              <ReportRow key={r.id} r={r} onClick={() => nav.push(<ReportDetailScreen id={r.id} />)} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}

function Box({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat" style={{ padding: '12px 12px 14px' }}>
      <div className="t-foot c2 semibold">{label}</div>
      <div className={`stat-value ${color}`} style={{ fontSize: 30, lineHeight: '36px', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
