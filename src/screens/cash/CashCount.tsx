// Kiểm quỹ: mệnh giá xếp dọc, vừa một màn hình (không cuộn), nhập bằng bàn phím số của iPhone.
// Ô nhập cỡ chữ 17px → iPhone không tự phóng to; chỉ nhận chữ số.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { MentionInput } from '../../ui/Mention';
import { DENOMS, DENOM_STYLE, fmt, onlyDigits, toWords } from '../../lib/money';
import { cashImage, cashText, shareImage, shareText } from '../../lib/cashExport';
import { saveCashCount, saveErrorText } from '../../lib/actions';
import { extractMentions } from '../../lib/mentions';
import { dm, now, vnMinutesOfDay, vnTime } from '../../lib/time';
import { shortName } from '../../lib/text';
import { useActor } from '../shared';
import { CashHistoryScreen } from './CashHistory';

const MAX_COUNT = 9999;
const MAX_MONEY = 99_999_999_999;
const SHIFTS = ['Ca sáng', 'Ca chiều', 'Ca tối', 'Bàn giao ca', 'Nộp tiền'];

interface Draft {
  counts: number[];
  other: number;
  expected: number | null;
  note: string;
  shift: string | null; // null = tự theo giờ
}

const empty = (): Draft => ({ counts: DENOMS.map(() => 0), other: 0, expected: null, note: '', shift: null });

function autoShift(): string {
  const m = vnMinutesOfDay();
  return m < 12 * 60 ? 'Ca sáng' : m < 17 * 60 + 30 ? 'Ca chiều' : 'Ca tối';
}

/** Khi bàn phím iPhone mở: thu app vào phần màn hình còn nhìn thấy để ô đang nhập không bị che, thanh tiêu đề không bị đẩy lên. */
function useKeyboardFit() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      const full = Math.max(root.clientHeight, window.innerHeight);
      const isOpen = full - vv.height > 120;
      root.classList.toggle('kb-fit', isOpen);
      if (isOpen) {
        root.style.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
        root.style.setProperty('--vv-h', `${vv.height}px`);
      } else {
        root.style.removeProperty('--vv-top');
        root.style.removeProperty('--vv-h');
        if (window.scrollY) window.scrollTo(0, 0);
      }
      setOpen(isOpen);
      if (isOpen) {
        const el = document.activeElement as HTMLElement | null;
        if (el?.closest('.cash-list')) requestAnimationFrame(() => el.closest('.cash-row')?.scrollIntoView({ block: 'nearest' }));
      }
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.classList.remove('kb-fit');
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
    };
  }, []);
  return open;
}

/** Ô nhập số: bàn phím số iPhone, chỉ nhận chữ số, chạm vào là chọn hết để gõ đè nhanh */
function NumField({ value, onChange, money, label, placeholder }: { value: number | null; onChange: (v: number | null) => void; money?: boolean; label: string; placeholder?: string }) {
  const max = money ? MAX_MONEY : MAX_COUNT;
  return (
    <input
      className={`cash-in tnum${money ? ' money' : ''}`}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="next"
      aria-label={label}
      placeholder={placeholder ?? '0'}
      value={value ? (money ? fmt(value) : String(value)) : ''}
      onChange={(e) => {
        const digits = onlyDigits(e.target.value).replace(/^0+/, '').slice(0, money ? 11 : 4);
        onChange(digits ? Math.min(max, Number(digits)) : null);
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        if (document.documentElement.classList.contains('kb-fit')) el.closest('.cash-row')?.scrollIntoView({ block: 'nearest' });
        setTimeout(() => {
          try {
            el.setSelectionRange(0, el.value.length);
          } catch {
            /* bỏ qua */
          }
        }, 0);
      }}
    />
  );
}

export function CashCountScreen() {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const nav = useNav();
  const actor = useActor();
  const kb = useKeyboardFit();
  const listRef = useRef<HTMLDivElement>(null);
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
  const [busy, setBusy] = useState(false);

  // Lưu nháp để mở lại không mất số đang kiểm
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* bỏ qua */
    }
  }, [draft, key]);

  const total = useMemo(() => DENOMS.reduce((sum, x, i) => sum + x * draft.counts[i], 0) + draft.other, [draft]);
  const sheets = draft.counts.reduce((a, b) => a + b, 0);
  const diff = draft.expected === null ? null : total - draft.expected;
  const shift = draft.shift || autoShift();

  const setCount = (i: number, v: number | null) =>
    setDraft((x) => {
      const counts = [...x.counts];
      counts[i] = v || 0;
      return { ...x, counts };
    });

  const reset = async () => {
    if (total === 0 && draft.expected === null && !draft.note) return;
    if (await ui.confirm('Làm lần kiểm mới?', 'Các số đang nhập sẽ bị xoá.', 'Làm mới', true)) {
      setDraft(empty());
      listRef.current?.scrollTo(0, 0);
    }
  };

  const pickShift = async () => {
    const v = await ui.actions(
      SHIFTS.map((x) => ({ label: x, value: x, icon: x === shift ? 'check' : undefined })),
      'Tên lần kiểm',
    );
    if (v) setDraft((x) => ({ ...x, shift: v }));
  };

  const record = () => ({
    storeCode: s.storeCode!,
    name: `${shift} ${dm(now())} · ${shortName(s.profile?.fullName || actor.name)}`.trim(),
    counts: Object.fromEntries(DENOMS.map((x, i) => [String(x), draft.counts[i]]).filter(([, n]) => n)) as Record<string, number>,
    other: draft.other,
    total,
    sheets,
    expected: draft.expected,
    diff,
    note: draft.note.trim(),
    createdByName: actor.name,
  });

  const share = async () => {
    const r = await shareText(cashText(record()));
    if (r === 'copied') ui.toast({ text: 'Đã sao chép, dán vào Zalo để gửi', icon: 'check', color: 'green' });
  };

  const image = async () => {
    const blob = await cashImage({ ...record(), storeName: s.store?.name });
    await shareImage(blob, `kiem-quy-${Date.now()}.png`);
  };

  const save = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setBusy(true);
    try {
      const r = record();
      await saveCashCount({ ...r, mentions: extractMentions(r.note, d.active), createdBy: actor.uid });
      setDraft(empty());
      listRef.current?.scrollTo(0, 0);
      ui.toast({ text: `Đã lưu kiểm quỹ lúc ${vnTime(now())}`, icon: 'check', color: 'green' });
    } catch (e) {
      ui.alert({ title: 'Chưa lưu được', message: `${saveErrorText(e)} Số liệu vẫn được giữ trên máy.` });
    } finally {
      setBusy(false);
    }
  };

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
          <button className="glass-btn" aria-label="Lịch sử" onClick={() => nav.push(<CashHistoryScreen />)}>
            <Icon name="clock" size={18} />
            <span className="glass-label">Lịch sử</span>
          </button>
        </>
      }
    >
      <div className={`cash${kb ? ' kb' : ''}`}>
        <div className="cash-sum">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="cash-sum-head">
              <span className="t-foot c2 semibold">Tổng tiền thực tế</span>
              <button className="cash-shift" onClick={pickShift} aria-label="Đổi tên lần kiểm">
                {shift}
                <Icon name="chevronDown" size={13} stroke={2.6} />
              </button>
            </div>
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

        <div className="cash-list" ref={listRef}>
          {DENOMS.map((x, i) => (
            <label className="cash-row" key={x}>
              <span className="cash-den" style={{ background: DENOM_STYLE[x].bg, color: DENOM_STYLE[x].fg }}>
                {fmt(x)}
              </span>
              <span className="cash-x">×</span>
              <NumField value={draft.counts[i]} onChange={(v) => setCount(i, v)} label={`Số tờ ${fmt(x)}`} />
              <span className={`cash-amt tnum${draft.counts[i] ? '' : ' zero'}`}>{draft.counts[i] ? fmt(x * draft.counts[i]) : '0'}</span>
            </label>
          ))}
          <label className="cash-row">
            <span className="cash-lbl">Tiền khác</span>
            <NumField money value={draft.other} onChange={(v) => setDraft((x) => ({ ...x, other: v || 0 }))} label="Tiền khác" placeholder="Xu, tiền lẻ…" />
          </label>
          <label className="cash-row">
            <span className="cash-lbl tint">Theo sổ</span>
            <NumField money value={draft.expected} onChange={(v) => setDraft((x) => ({ ...x, expected: v }))} label="Số tiền theo sổ" placeholder="Nhập để đối chiếu" />
          </label>
        </div>

        <div className="cash-note">
          <Icon name="pencil" size={17} />
          <MentionInput
            value={draft.note}
            onChange={(v) => setDraft((x) => ({ ...x, note: v }))}
            placeholder="Ghi chú · gõ @ để gắn tên người mượn"
            ariaLabel="Ghi chú kiểm quỹ"
            className="cash-note-in"
            enterKeyHint="done"
            onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
          />
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
          <button className="btn md grow" onClick={save} disabled={total === 0 || busy}>
            {busy ? (
              <span className="spinner" style={{ borderTopColor: '#fff' }} />
            ) : (
              <>
                <Icon name="check" size={19} stroke={2.4} />
                Lưu kiểm quỹ
              </>
            )}
          </button>
        </div>
      </div>
    </Page>
  );
}
