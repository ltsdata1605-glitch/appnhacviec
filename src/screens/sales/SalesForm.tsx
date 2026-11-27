// Nhập báo cáo khai thác (một đơn hàng): doanh thu gõ được phép tính, bấm −/+ số lượng, xem trước tin gửi Zalo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Icon, type IconName } from '../../ui/Icon';
import { MentionInput } from '../../ui/Mention';
import { api } from '../../lib/backend';
import { saveErrorText, saveSalesReport } from '../../lib/actions';
import { extractMentions } from '../../lib/mentions';
import { catalogOf, cleanExpr, draftFromReport, emptyDraft, evalRevenue, fmtTr, GROUP_META, salesText, summarize, type SalesDraft } from '../../lib/sales';
import { now, stamp, vnTime, dm } from '../../lib/time';
import { shareImage, shareText } from '../../lib/cashExport';
import { salesCard } from './salesCard';
import { useActor } from '../shared';
import type { SalesGroupKey, SalesReport } from '../../lib/types';

const MAX_QTY = 999;
const EXTRA_DEFAULT: SalesGroupKey[] = ['main', 'accessory', 'appliance', 'vas'];

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className={`stepper${value ? ' has' : ''}`}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={!value} aria-label={`Bớt ${label}`}>
        <Icon name="minus" size={15} stroke={2.4} />
      </button>
      <span className="stepper-n tnum" aria-label={`${label}: ${value}`}>
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(MAX_QTY, value + 1))} aria-label={`Thêm ${label}`}>
        <Icon name="plus" size={15} stroke={2.4} />
      </button>
    </span>
  );
}

/** Ô nhập số tiền (Tr) — bàn phím số iPhone có dấu phẩy */
function MoneyField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="money-field">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder="0"
        aria-label={`${label} (triệu đồng)`}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 8))}
      />
      <span className="money-unit">Tr</span>
    </span>
  );
}

export function SalesForm({ report, onSaved }: { report?: SalesReport | null; onSaved?: () => void }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const editing = !!report;
  const key = `nv-sales-draft-${s.storeCode}-${actor.uid}`;
  const catalog = useMemo(() => catalogOf(s.store?.salesCatalog), [s.store?.salesCatalog]);
  const [draft, setDraft] = useState<SalesDraft>(() => {
    if (report) return draftFromReport(report);
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...emptyDraft(), ...JSON.parse(raw) };
    } catch {
      /* bỏ qua */
    }
    return emptyDraft();
  });
  const [id, setId] = useState(() => report?.id || api().newId());
  const [busy, setBusy] = useState(false);
  const revRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* bỏ qua */
    }
  }, [draft, key, editing]);

  const revenue = evalRevenue(draft.revenueExpr);
  const sum = useMemo(() => summarize(draft, catalog), [draft, catalog]);
  const at = report?.createdAt || now();
  const text = useMemo(
    () =>
      salesText(sum, draft, catalog, {
        userCode: report ? report.userCode : s.profile?.userCode,
        userName: report?.userName || actor.name,
        storeCode: s.storeCode || '',
        at,
        timeText: `${vnTime(at)} · ${stamp(at).slice(0, 10)}`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sum, draft.flags, draft.note, draft.revenueExpr, catalog, report, s.profile?.userCode, actor.name, s.storeCode],
  );
  const canSave = revenue !== null && (sum.revenue > 0 || sum.qty > 0) && !busy;

  const set = (patch: Partial<SalesDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const setQty = (k: string, v: number) => setDraft((x) => ({ ...x, items: { ...x.items, [k]: v } }));
  const setMoney = (k: string, txt: string) =>
    setDraft((x) => {
      const v = Number(txt.replace(/,/g, '.'));
      return { ...x, amountText: { ...x.amountText, [k]: txt }, amounts: { ...x.amounts, [k]: Number.isFinite(v) ? Math.max(0, Math.min(10000, v)) : 0 } };
    });
  const extrasOf = (g: SalesGroupKey) => draft.extras.map((e, i) => ({ e, i })).filter((x) => x.e.group === g);
  const setExtra = (i: number, patch: Partial<SalesDraft['extras'][number]>) =>
    setDraft((x) => ({ ...x, extras: x.extras.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const addExtra = (g: SalesGroupKey) => setDraft((x) => ({ ...x, extras: [...x.extras, { group: g, name: '', qty: 0 }] }));
  const removeExtra = (i: number) => setDraft((x) => ({ ...x, extras: x.extras.filter((_, j) => j !== i) }));

  const reset = async () => {
    if (!sum.qty && !draft.revenueExpr && !draft.note) return;
    if (await ui.confirm('Làm mới báo cáo?', 'Các số đang nhập sẽ bị xoá.', 'Làm mới', true)) setDraft(emptyDraft());
  };

  const image = async () => {
    const blob = await salesCard(text, sum, draft, { name: report?.userName || actor.name, code: report ? report.userCode : s.profile?.userCode, store: s.store?.name || `Kho ${s.storeCode}`, at });
    await shareImage(blob, `khai-thac-${dm(at).replace('/', '-')}-${vnTime(at).replace(':', 'h')}.png`);
  };

  const submit = async () => {
    if (!canSave || !s.storeCode) return;
    // Chép tin ngay trong lúc chạm (iPhone chỉ cho chép khi đang thao tác), rồi mới lưu
    const copied = navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    );
    setBusy(true);
    try {
      await saveSalesReport(
        {
          storeCode: s.storeCode,
          by: { ...actor, userCode: s.profile?.userCode || null },
          revenue: sum.revenue,
          revenueExpr: draft.revenueExpr.trim(),
          flags: draft.flags,
          items: sum.items,
          amounts: sum.amounts,
          extras: sum.extras,
          names: sum.names,
          groupOf: sum.groupOf,
          groupQty: sum.groupQty,
          qty: sum.qty,
          note: draft.note.trim(),
          text,
          mentions: extractMentions(draft.note, d.active),
        },
        id,
        report,
      );
      const ok = await copied;
      if (editing) {
        ui.toast({ text: ok ? 'Đã lưu và chép báo cáo' : 'Đã lưu báo cáo', icon: 'check', color: 'green' });
        onSaved?.();
        return;
      }
      const savedText = text;
      const savedSum = sum;
      const savedDraft = draft;
      setDraft(emptyDraft());
      setId(api().newId());
      ui.sheet(
        (close) => (
          <SavedSheet
            close={close}
            copied={!!ok}
            revenue={savedSum.revenue}
            qty={savedSum.qty}
            onShare={() => shareText(savedText)}
            onImage={async () => {
              const blob = await salesCard(savedText, savedSum, savedDraft, { name: actor.name, code: s.profile?.userCode, store: s.store?.name || `Kho ${s.storeCode}`, at });
              await shareImage(blob, `khai-thac-${dm(at).replace('/', '-')}-${vnTime(at).replace(':', 'h')}.png`);
            }}
          />
        ),
        { auto: true },
      );
      onSaved?.();
    } catch (e) {
      ui.alert({ title: 'Chưa lưu được', message: `${saveErrorText(e)} Số liệu vẫn được giữ trên máy.` });
    } finally {
      setBusy(false);
    }
  };

  const showResult = /[+-]/.test(draft.revenueExpr.replace(/^[+-]/, ''));

  return (
    <div className="sales">
      <div className="sales-who">
        <span className="sales-who-pill">
          <Icon name="person" size={15} stroke={2.2} />
          {(report ? report.userCode : s.profile?.userCode) ? `${report ? report.userCode : s.profile?.userCode} · ` : ''}
          {report?.userName || actor.name}
        </span>
        {editing && <span className="pill orange sm">Đang sửa · {vnTime(report!.createdAt)}</span>}
      </div>

      <section className="sales-card">
        <div className="sales-card-head">
          <span className="cell-icon bg-blue sales-gi">
            <Icon name="banknote" size={18} stroke={2} />
          </span>
          <span className="sales-card-title">Doanh thu đơn hàng</span>
        </div>
        <div className="sales-rev">
          <input
            ref={revRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="VD: 8,5 hoặc 5+3+4"
            aria-label="Tổng doanh thu thực (triệu đồng)"
            value={draft.revenueExpr}
            onChange={(e) => set({ revenueExpr: cleanExpr(e.target.value).slice(0, 60) })}
          />
          <span className="money-unit">Tr</span>
          <button
            type="button"
            className="sales-plus"
            aria-label="Thêm dấu cộng"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              set({ revenueExpr: draft.revenueExpr && !/[+-]$/.test(draft.revenueExpr) ? `${draft.revenueExpr}+` : draft.revenueExpr });
              revRef.current?.focus();
            }}
          >
            +
          </button>
        </div>
        <div className={`sales-rev-hint${revenue === null ? ' bad' : ''}`}>
          {revenue === null ? 'Phép tính chưa đúng, ví dụ 5+3+4' : showResult ? `= ${fmtTr(revenue)} Tr` : 'Gõ được phép tính, chạm + để cộng thêm'}
        </div>
        <div className="sales-flags">
          {(
            [
              ['traGop', 'Trả góp', 'banknote'],
              ['moVi', 'Mở Ví', 'key'],
              ['chienGia', 'Chiến giá', 'bolt'],
            ] as [keyof SalesDraft['flags'], string, IconName][]
          ).map(([k, label, icon]) => (
            <button key={k} type="button" className={`sales-flag${draft.flags[k] ? ' on' : ''}`} aria-pressed={draft.flags[k]} onClick={() => set({ flags: { ...draft.flags, [k]: !draft.flags[k] } })}>
              <span className="sales-check">{draft.flags[k] && <Icon name="check" size={13} stroke={3} />}</span>
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {catalog.map((g) => {
        const meta = GROUP_META[g.key];
        const items = g.items.filter((x) => !x.hidden || draft.items[x.key] || draft.amounts[x.key]);
        const extras = extrasOf(g.key);
        const showBlankExtra = EXTRA_DEFAULT.includes(g.key) && extras.length === 0;
        const n = sum.groupQty[g.key] || 0;
        return (
          <section className="sales-card" key={g.key} aria-label={g.name}>
            <div className="sales-card-head">
              <span className={`cell-icon bg-${meta.color} sales-gi`}>
                <Icon name={meta.icon as IconName} size={18} stroke={2} />
              </span>
              <span className="sales-card-title">{g.name}</span>
              {n > 0 && <span className="pill blue sm tnum">{n}</span>}
              <button type="button" className="sales-add" onClick={() => addExtra(g.key)}>
                <Icon name="plus" size={15} stroke={2.4} />
                Thêm mục
              </button>
            </div>
            <div className="sales-grid">
              {items.map((x) => (
                <div className={`sales-item${x.money ? ' money' : ''}${(x.money ? draft.amounts[x.key] : draft.items[x.key]) ? ' has' : ''}`} key={x.key}>
                  <span className="sales-name">{x.name}</span>
                  {x.money ? (
                    <MoneyField value={draft.amountText[x.key] || ''} onChange={(v) => setMoney(x.key, v)} label={x.name} />
                  ) : (
                    <Stepper value={draft.items[x.key] || 0} onChange={(v) => setQty(x.key, v)} label={x.name} />
                  )}
                </div>
              ))}
            </div>
            {/* khoá theo vị trí trong nhóm: dòng trống biến thành dòng thật vẫn giữ con trỏ đang gõ */}
            {[...extras, ...(showBlankExtra ? [{ e: null, i: -1 }] : [])].map(({ e, i }, pos) => (
              <div className="sales-extra" key={`${g.key}-${pos}`}>
                <input
                  type="text"
                  value={e?.name || ''}
                  placeholder={`${meta.short} khác…`}
                  aria-label={`Tên ${meta.short.toLowerCase()} khác`}
                  onChange={(ev) => {
                    if (i < 0) setDraft((x) => ({ ...x, extras: [...x.extras, { group: g.key, name: ev.target.value, qty: 1 }] }));
                    else setExtra(i, { name: ev.target.value });
                  }}
                />
                <Stepper
                  value={e?.qty || 0}
                  label={e?.name || `${meta.short} khác`}
                  onChange={(v) => {
                    if (i < 0) setDraft((x) => ({ ...x, extras: [...x.extras, { group: g.key, name: '', qty: v }] }));
                    else if (v === 0 && !e?.name) removeExtra(i);
                    else setExtra(i, { qty: v });
                  }}
                />
              </div>
            ))}
          </section>
        );
      })}

      <section className="sales-card">
        <div className="sales-card-head">
          <span className="cell-icon bg-gray sales-gi">
            <Icon name="pencil" size={17} stroke={2} />
          </span>
          <span className="sales-card-title">Ghi chú</span>
        </div>
        <MentionInput multiline rows={2} className="textarea sales-note" value={draft.note} onChange={(v) => set({ note: v })} placeholder="Ghi chú thêm cho đơn hàng… gõ @ để gắn tên" />
      </section>

      <section className="sales-card">
        <div className="sales-card-head">
          <span className="cell-icon bg-teal sales-gi">
            <Icon name="doc" size={17} stroke={2} />
          </span>
          <span className="sales-card-title">Xem trước báo cáo</span>
          <span className="t-foot c2 tnum" style={{ marginLeft: 'auto' }}>
            {text.length} ký tự
          </span>
        </div>
        <pre className="sales-preview">{text}</pre>
      </section>

      <div className="sales-bar">
        <div className="sales-bar-sum">
          <span className="tnum">{fmtTr(sum.revenue)} Tr</span>
          <span className="t-foot c2 tnum">{sum.qty} món</span>
        </div>
        <button type="button" className="glass-btn icon" onClick={reset} aria-label="Làm mới">
          <Icon name="retake" size={19} />
        </button>
        <button type="button" className="glass-btn icon" onClick={image} aria-label="Xuất ảnh báo cáo" disabled={!canSave}>
          <Icon name="photo" size={19} />
        </button>
        <button type="button" className="btn md sales-send" onClick={submit} disabled={!canSave}>
          {busy ? (
            <span className="spinner" style={{ borderTopColor: '#fff' }} />
          ) : (
            <>
              <Icon name="copy" size={18} stroke={2.2} />
              {editing ? 'Lưu' : 'Báo cáo'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SavedSheet({ close, copied, revenue, qty, onShare, onImage }: { close: () => void; copied: boolean; revenue: number; qty: number; onShare: () => void; onImage: () => void }) {
  return (
    <>
      <SheetHead title="Đã lưu báo cáo" onCancel={close} />
      <div className="sheet-body" style={{ padding: '4px 20px calc(var(--safe-bottom) + 20px)' }}>
        <div className="center" style={{ padding: '6px 0 18px' }}>
          <div className="saved-check">
            <Icon name="check" size={34} stroke={3} />
          </div>
          <div className="t-title2 tnum" style={{ marginTop: 12 }}>
            {fmtTr(revenue)} Tr · {qty} món
          </div>
          <div className="t-sub c2" style={{ marginTop: 4 }}>
            {copied ? 'Đã chép nội dung, mở Zalo và dán để gửi nhóm.' : 'Chạm "Gửi Zalo" để chia sẻ nội dung báo cáo.'}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn block" onClick={onShare}>
            <Icon name="share" size={19} />
            Gửi Zalo
          </button>
          <button className="btn block gray" onClick={onImage}>
            <Icon name="photo" size={19} />
            Xuất ảnh báo cáo
          </button>
          <button className="btn block plain" onClick={close}>
            Báo cáo đơn tiếp theo
          </button>
        </div>
      </div>
    </>
  );
}
