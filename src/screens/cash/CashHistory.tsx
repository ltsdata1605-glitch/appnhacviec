import { useMemo, useState } from 'react';
import { useDoc, useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Loading, Pill, Section, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { MentionText } from '../../ui/Mention';
import { DENOMS, DENOM_STYLE, fmt, toWords } from '../../lib/money';
import { cashImage, cashText, shareImage, shareText } from '../../lib/cashExport';
import { deleteCashCount } from '../../lib/actions';
import { addDays, longDate, stamp, vnAt, vnDate, vnTime } from '../../lib/time';
import type { CashCount } from '../../lib/types';

type Range = 'today' | 'yesterday' | '7' | '30';

function DiffPill({ c }: { c: Pick<CashCount, 'diff'> }) {
  if (c.diff === null || c.diff === undefined) return null;
  return (
    <Pill sm color={c.diff === 0 ? 'green' : c.diff > 0 ? 'orange' : 'red'}>
      {c.diff === 0 ? 'Khớp' : c.diff > 0 ? `+${fmt(c.diff)}` : `−${fmt(-c.diff)}`}
    </Pill>
  );
}

export function CashHistoryScreen() {
  const s = useSession();
  const nav = useNav();
  const uid = s.auth?.uid || '';
  const viewAll = s.can('cash');
  const [scope, setScope] = useState<'mine' | 'all'>(viewAll ? 'all' : 'mine');
  const [range, setRange] = useState<Range>('7');
  const since = useMemo(() => {
    const days = range === 'today' ? 0 : range === 'yesterday' ? 1 : range === '7' ? 6 : 29;
    return vnAt(addDays(vnDate(), -days));
  }, [range]);
  const until = range === 'yesterday' ? vnAt(vnDate()) : Infinity;

  const all = useWatch<CashCount>('cashCounts', s.storeCode && viewAll && scope === 'all' ? [['storeCode', '==', s.storeCode], ['createdAt', '>=', since]] : null, [since]);
  const mine = useWatch<CashCount>('cashCounts', s.storeCode && (!viewAll || scope === 'mine') ? [['storeCode', '==', s.storeCode], ['createdBy', '==', uid], ['createdAt', '>=', since]] : null, [since]);
  const tagged = useWatch<CashCount>('cashCounts', s.storeCode && (!viewAll || scope === 'mine') ? [['storeCode', '==', s.storeCode], ['mentions', 'array-contains', uid]] : null);

  const list = useMemo(() => {
    const src = viewAll && scope === 'all' ? all.data : [...mine.data, ...tagged.data.filter((x) => x.createdAt >= since)];
    const map = new Map(src.map((c) => [c.id, c]));
    return [...map.values()].filter((c) => c.createdAt < until).sort((a, b) => b.createdAt - a.createdAt);
  }, [all.data, mine.data, tagged.data, scope, viewAll, since, until]);

  const groups = useMemo(() => {
    const m = new Map<string, CashCount[]>();
    list.forEach((c) => m.set(c.date, [...(m.get(c.date) || []), c]));
    return [...m.entries()];
  }, [list]);
  const loading = (viewAll && scope === 'all' ? all.loading : mine.loading) && !list.length;

  return (
    <Page
      title="Lịch sử kiểm quỹ"
      large={false}
      headerExtra={
        <div style={{ padding: '4px 16px 0', display: 'grid', gap: 10 }}>
          {viewAll && (
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'Toàn kho' },
                { value: 'mine', label: 'Của tôi' },
              ]}
            />
          )}
        </div>
      }
    >
      <div className="chip-row" style={{ marginTop: 10 }}>
        {(
          [
            ['today', 'Hôm nay'],
            ['yesterday', 'Hôm qua'],
            ['7', '7 ngày'],
            ['30', '30 ngày'],
          ] as [Range, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip${range === k ? ' on' : ''}`} onClick={() => setRange(k)}>
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Empty icon="clock" title="Chưa có lần kiểm nào" text="Mỗi lần bấm Lưu kiểm quỹ sẽ được ghi lại kèm ngày giờ tại đây." />
      ) : (
        groups.map(([date, items]) => (
          <Section key={date} title={longDate(vnAt(date, '12:00'))} small action={`${fmt(items.reduce((a, c) => a + c.total, 0))} đ`}>
            <Group>
              {items.map((c) => (
                <Cell
                  key={c.id}
                  leading={
                    <span className="cash-time tnum">
                      {vnTime(c.createdAt)}
                    </span>
                  }
                  sepInset={74}
                  title={
                    <span className="row gap8">
                      <span className="grow ellipsis">{c.name}</span>
                      <span className="semibold tnum">{fmt(c.total)}</span>
                    </span>
                  }
                  sub={
                    <span className="row gap6">
                      <span className="grow ellipsis">
                        {c.createdByName}
                        {c.note ? ` · ${c.note}` : ''}
                      </span>
                      <DiffPill c={c} />
                    </span>
                  }
                  chevron
                  onClick={() => nav.push(<CashDetailScreen id={c.id} />)}
                />
              ))}
            </Group>
          </Section>
        ))
      )}
    </Page>
  );
}

export function CashDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const { data: c, loading } = useDoc<CashCount>('cashCounts', id);
  if (loading) return <Page title="Kiểm quỹ" large={false}><Loading /></Page>;
  if (!c) return <Page title="Kiểm quỹ" large={false}><Empty icon="lock" title="Không xem được lần kiểm này" text="Lần kiểm có thể đã bị xoá hoặc bạn không có quyền xem." /></Page>;
  const rows = DENOMS.filter((x) => c.counts[String(x)]);
  const by = d.byUid(c.createdBy);

  return (
    <Page
      title={c.name}
      large={false}
      right={
        s.isManager ? (
          <button
            className="glass-btn icon"
            aria-label="Xoá"
            onClick={async () => {
              if (await ui.confirm('Xoá lần kiểm này?', 'Không thể hoàn tác.', 'Xoá', true)) {
                await deleteCashCount(c.id);
                nav.pop();
              }
            }}
          >
            <Icon name="trash" size={20} />
          </button>
        ) : undefined
      }
      footer={
        <>
          <button
            className="btn gray"
            style={{ flex: 1 }}
            onClick={async () => {
              const r = await shareText(cashText(c));
              if (r === 'copied') ui.toast({ text: 'Đã sao chép', icon: 'check', color: 'green' });
            }}
          >
            <Icon name="share" size={19} />
            Gửi
          </button>
          <button className="btn gray" style={{ flex: 1 }} onClick={async () => shareImage(await cashImage({ ...c, storeName: s.store?.name }), `kiem-quy-${c.date}.png`)}>
            <Icon name="photo" size={19} />
            Ảnh
          </button>
        </>
      }
    >
      <div style={{ padding: '4px 20px 0' }}>
        <div className="t-foot c2">{stamp(c.createdAt)}</div>
        <div className="t-large tnum" style={{ marginTop: 4 }}>
          {fmt(c.total)}
          <span className="t-title3 c2"> đ</span>
        </div>
        <div className="t-sub c2">{toWords(c.total)}</div>
        <div className="row gap8 mt8">
          <Pill>{c.sheets} tờ</Pill>
          {c.diff !== null && c.diff !== undefined && (
            <Pill color={c.diff === 0 ? 'green' : c.diff > 0 ? 'orange' : 'red'}>{c.diff === 0 ? 'Khớp sổ' : c.diff > 0 ? `Thừa ${fmt(c.diff)}` : `Thiếu ${fmt(-c.diff)}`}</Pill>
          )}
        </div>
      </div>
      <Section title="Chi tiết" small>
        <Group>
          {rows.map((x) => (
            <Cell
              key={x}
              leading={
                <span className="cash-den" style={{ background: DENOM_STYLE[x].bg, color: DENOM_STYLE[x].fg, minWidth: 92, textAlign: 'center' }}>
                  {fmt(x)}
                </span>
              }
              sepInset={16}
              title={<span className="c2 tnum">× {c.counts[String(x)]}</span>}
              detail={<span className="tnum" style={{ color: 'var(--label)' }}>{fmt(x * c.counts[String(x)])}</span>}
            />
          ))}
          {c.other > 0 && <Cell title="Tiền khác" detail={<span className="tnum">{fmt(c.other)}</span>} />}
          {c.expected !== null && c.expected !== undefined && <Cell title="Theo sổ / hệ thống" detail={<span className="tnum">{fmt(c.expected)}</span>} />}
        </Group>
      </Section>
      {c.note && (
        <Section title="Ghi chú" small>
          <div className="card t-body">
            <MentionText text={c.note} />
          </div>
        </Section>
      )}
      <Section>
        <Group>
          <Cell leading={<Avatar name={c.createdByName} src={by?.photoURL} size={34} />} sepInset={62} title={c.createdByName} sub="Người kiểm" />
        </Group>
      </Section>
    </Page>
  );
}
