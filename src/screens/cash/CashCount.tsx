// Kiểm quỹ: một màn hình, không cuộn, bàn phím số riêng (không bật bàn phím hệ thống → không zoom, chỉ nhập số).
import { useEffect, useMemo, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Group, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { MentionInput } from '../../ui/Mention';
import { DENOMS, DENOM_STYLE, fmt, toWords } from '../../lib/money';
import { cashImage, cashText, shareImage, shareText } from '../../lib/cashExport';
import { saveCashCount } from '../../lib/actions';
import { extractMentions } from '../../lib/mentions';
import { dm, now, vnMinutesOfDay, vnTime } from '../../lib/time';
import { shortName } from '../../lib/text';
import { useActor } from '../shared';
import { CashHistoryScreen } from './CashHistory';

const OTHER = 10;
const EXPECTED = 11;
const MAX_COUNT = 9999;
const MAX_MONEY = 99_999_999_999;

interface Draft {
  counts: number[];
  other: number;
  expected: number | null;
}

const empty = (): Draft => ({ counts: DENOMS.map(() => 0), other: 0, expected: null });

function shiftName(): string {
  const m = vnMinutesOfDay();
  const shift = m < 12 * 60 ? 'Ca sáng' : m < 17 * 60 + 30 ? 'Ca chiều' : 'Ca tối';
  return `${shift} ${dm(now())}`;
}

export function CashCountScreen() {
  const s = useSession();
  const ui = useUI();
  const nav = useNav();
  const actor = useActor();
  const key = `nv-cash-draft-${s.storeCode}-${actor.uid}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...empty(), ...JSON.parse(raw) };
    } catch {
      /* bỏ qua */
    }
    return empty();
  });
  const [sel, setSel] = useState(0);
  const [fresh, setFresh] = useState(true);

  // Lưu nháp để mở lại không mất số đang kiểm
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* bỏ qua */
    }
  }, [draft, key]);

  const total = useMemo(() => DENOMS.reduce((sum, d, i) => sum + d * draft.counts[i], 0) + draft.other, [draft]);
  const sheets = draft.counts.reduce((a, b) => a + b, 0);
  const diff = draft.expected === null ? null : total - draft.expected;
  const isMoney = sel >= OTHER;
  const valueOf = (i: number) => (i < OTHER ? draft.counts[i] : i === OTHER ? draft.other : draft.expected ?? 0);

  const setValue = (i: number, v: number) =>
    setDraft((d) => {
      if (i < OTHER) {
        const counts = [...d.counts];
        counts[i] = Math.max(0, Math.min(MAX_COUNT, v));
        return { ...d, counts };
      }
      if (i === OTHER) return { ...d, other: Math.max(0, Math.min(MAX_MONEY, v)) };
      return { ...d, expected: v === 0 && d.expected === null ? null : Math.max(0, Math.min(MAX_MONEY, v)) };
    });

  const select = (i: number) => {
    setSel(i);
    setFresh(true);
  };

  const press = (k: string) => {
    const cur = valueOf(sel);
    if (/^\d+$/.test(k)) {
      const base = fresh ? '' : String(cur);
      const next = Number((base + k).replace(/^0+(?=\d)/, '')) || 0;
      if (sel < OTHER ? next <= MAX_COUNT : next <= MAX_MONEY) setValue(sel, next);
      setFresh(false);
    } else if (k === 'back') {
      setValue(sel, Math.floor(cur / 10));
      setFresh(false);
    } else if (k === 'clear') {
      if (sel === EXPECTED) setDraft((d) => ({ ...d, expected: null }));
      else setValue(sel, 0);
      setFresh(true);
    } else if (k === 'minus') {
      setValue(sel, cur - 1);
      setFresh(true);
    } else if (k === 'plus') {
      setValue(sel, cur + 1);
      setFresh(true);
    } else if (k === 'next') {
      select((sel + 1) % 12);
    }
  };

  const reset = async () => {
    if (total === 0 && draft.expected === null) return;
    if (await ui.confirm('Làm lần kiểm mới?', 'Các số đang nhập sẽ bị xoá.', 'Làm mới', true)) {
      setDraft(empty());
      select(0);
    }
  };

  const record = (name: string, note = '') => ({
    storeCode: s.storeCode!,
    name,
    counts: Object.fromEntries(DENOMS.map((d, i) => [String(d), draft.counts[i]]).filter(([, n]) => n)) as Record<string, number>,
    other: draft.other,
    total,
    sheets,
    expected: draft.expected,
    diff,
    note,
    createdByName: actor.name,
  });

  const share = async () => {
    const r = await shareText(cashText(record(shiftName())));
    if (r === 'copied') ui.toast({ text: 'Đã sao chép, dán vào Zalo để gửi', icon: 'check', color: 'green' });
  };

  const image = async () => {
    const blob = await cashImage({ ...record(shiftName()), storeName: s.store?.name });
    await shareImage(blob, `kiem-quy-${Date.now()}.png`);
  };

  const save = () =>
    ui.sheet(
      (close) => (
        <SaveSheet
          close={close}
          total={total}
          sheets={sheets}
          expected={draft.expected}
          diff={diff}
          onSave={async (name, note, mentions) => {
            await saveCashCount({ ...record(name, note), mentions, createdBy: actor.uid });
            setDraft(empty());
            select(0);
            ui.toast({ text: `Đã lưu kiểm quỹ lúc ${vnTime(now())}`, icon: 'check', color: 'green' });
          }}
        />
      ),
      { auto: true },
    );

  const tiles = [
    ...DENOMS.map((d, i) => ({ i, label: fmt(d), style: DENOM_STYLE[d], value: draft.counts[i], sub: draft.counts[i] ? fmt(d * draft.counts[i]) : '' })),
    { i: OTHER, label: 'Tiền khác', style: { bg: 'var(--fill-3)', fg: 'var(--label)' }, value: draft.other, sub: 'xu, tiền lẻ' },
    { i: EXPECTED, label: 'Theo sổ', style: { bg: 'color-mix(in srgb, var(--tint) 14%, transparent)', fg: 'var(--tint)' }, value: draft.expected, sub: 'để đối chiếu' },
  ];

  return (
    <Page
      title="Kiểm quỹ"
      large={false}
      fixed
      right={
        <>
          <button className="glass-btn icon" aria-label="Làm lần kiểm mới" onClick={reset}>
            <Icon name="retake" size={20} />
          </button>
          <button className="glass-btn" onClick={() => nav.push(<CashHistoryScreen />)}>
            <Icon name="clock" size={18} />
            Lịch sử
          </button>
        </>
      }
    >
      <div className="cash">
        <div className="cash-sum">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="t-foot c2 semibold">Tổng tiền thực tế</div>
            <div className="cash-total tnum">
              {fmt(total)}
              <span> đ</span>
            </div>
            <div className="t-cap c2 cash-words">{toWords(total)}</div>
          </div>
          <div className="cash-sum-side">
            <span className="pill gray tnum">{sheets} tờ</span>
            {diff !== null && (
              <span className={`pill tnum ${diff === 0 ? 'green' : diff > 0 ? 'orange' : 'red'}`}>
                {diff === 0 ? 'Khớp sổ' : diff > 0 ? `Thừa ${fmt(diff)}` : `Thiếu ${fmt(-diff)}`}
              </span>
            )}
          </div>
        </div>

        <div className="cash-grid">
          {tiles.map((t) => (
            <button key={t.i} className={`cash-tile${sel === t.i ? ' on' : ''}`} onClick={() => select(t.i)} aria-pressed={sel === t.i}>
              <span className="cash-den" style={{ background: t.style.bg, color: t.style.fg }}>
                {t.label}
              </span>
              <span className={`cash-cnt tnum${t.i >= OTHER ? ' money' : ''}${t.value ? '' : ' zero'}`}>
                {t.i >= OTHER ? (t.value === null ? '—' : fmt(t.value)) : t.value}
              </span>
              <span className="cash-sub tnum">{t.sub}</span>
            </button>
          ))}
        </div>

        <div className="keypad" role="group" aria-label="Bàn phím số">
          {['1', '2', '3', 'back', '4', '5', '6', 'minus', '7', '8', '9', 'plus', isMoney ? '000' : '00', '0', 'clear', 'next'].map((k) => (
            <button
              key={k}
              className={`key${/^\d+$/.test(k) ? '' : ' fn'}${k === 'next' ? ' next' : ''}`}
              onClick={() => press(k)}
              disabled={isMoney && (k === 'minus' || k === 'plus')}
              aria-label={k === 'back' ? 'Xoá một số' : k === 'minus' ? 'Bớt 1 tờ' : k === 'plus' ? 'Thêm 1 tờ' : k === 'clear' ? 'Xoá ô' : k === 'next' ? 'Ô tiếp theo' : k}
            >
              {k === 'back' ? <Icon name="chevronLeft" size={22} stroke={2.4} /> : k === 'minus' ? '−1' : k === 'plus' ? '+1' : k === 'clear' ? 'C' : k === 'next' ? <>Tiếp <Icon name="chevronRight" size={16} stroke={2.6} /></> : k}
            </button>
          ))}
        </div>

        <div className="cash-actions">
          <button className="btn gray md" onClick={share} aria-label="Gửi">
            <Icon name="share" size={19} />
            Gửi
          </button>
          <button className="btn gray md" onClick={image} aria-label="Xuất ảnh">
            <Icon name="photo" size={19} />
            Ảnh
          </button>
          <button className="btn md grow" onClick={save} disabled={total === 0}>
            <Icon name="check" size={19} stroke={2.4} />
            Lưu kiểm quỹ
          </button>
        </div>
      </div>
    </Page>
  );
}

function SaveSheet({
  close,
  total,
  sheets,
  expected,
  diff,
  onSave,
}: {
  close: () => void;
  total: number;
  sheets: number;
  expected: number | null;
  diff: number | null;
  onSave: (name: string, note: string, mentions: string[]) => Promise<void>;
}) {
  const d = useStoreData();
  const s = useSession();
  const ui = useUI();
  const [name, setName] = useState(`${shiftName()} · ${shortName(s.profile?.fullName || '')}`.trim());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const quick = ['Ca sáng', 'Ca chiều', 'Ca tối', 'Bàn giao ca', 'Nộp tiền'];

  return (
    <>
      <SheetHead title="Lưu kiểm quỹ" onCancel={close} />
      <div className="sheet-body" style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
        <Section small>
          <Group>
            <div className="cell" style={{ ['--sep-inset' as string]: '16px' }}>
              <div className="cell-body">
                <div className="t-foot c2">Tổng tiền thực tế · {sheets} tờ</div>
                <div className="t-title2 tnum">{fmt(total)} đ</div>
              </div>
              {diff !== null && (
                <span className={`pill tnum ${diff === 0 ? 'green' : diff > 0 ? 'orange' : 'red'}`}>
                  {diff === 0 ? 'Khớp sổ' : diff > 0 ? `Thừa ${fmt(diff)}` : `Thiếu ${fmt(-diff)}`}
                </span>
              )}
            </div>
            {expected !== null && <div className="cell"><div className="cell-body t-sub c2">Theo sổ / hệ thống</div><div className="t-sub tnum">{fmt(expected)}</div></div>}
          </Group>
        </Section>
        <Section title="Tên lần kiểm" small>
          <Group>
            <input className="textarea" style={{ minHeight: 0, height: 52 }} value={name} onChange={(e) => setName(e.target.value)} enterKeyHint="done" aria-label="Tên lần kiểm" />
          </Group>
          <div className="row gap6 wrap" style={{ marginTop: 8 }}>
            {quick.map((q) => (
              <button key={q} className="chip" onClick={() => setName(`${q} ${dm(now())} · ${shortName(s.profile?.fullName || '')}`.trim())}>
                {q}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Ghi chú" small footer="Gõ @ để gắn tên người mượn tiền hoặc người liên quan. Người được gắn tên sẽ nhận thông báo.">
          <Group>
            <MentionInput multiline rows={3} className="textarea" value={note} onChange={setNote} placeholder="Ví dụ: @Nguyễn Văn A mượn 200.000" />
          </Group>
        </Section>
        <div style={{ padding: '18px 16px 0' }}>
          <button
            className="btn block"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name.trim(), note.trim(), extractMentions(note, d.active));
                close();
              } catch {
                ui.alert({ title: 'Chưa lưu được', message: 'Kiểm tra kết nối mạng rồi thử lại. Số liệu vẫn được giữ trên máy.' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : 'Lưu kiểm quỹ'}
          </button>
        </div>
      </div>
    </>
  );
}
