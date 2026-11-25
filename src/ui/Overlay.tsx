// Hộp thoại, bảng chọn thao tác, thông báo nhanh và sheet — đặt ở tầng trên cùng.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

interface AlertAction {
  label: string;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  value?: string;
}

interface AlertOpts {
  title: string;
  message?: string;
  actions?: AlertAction[];
  input?: { placeholder?: string; value?: string };
}

interface ActionItem {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  value: string;
}

interface ToastOpts {
  text: string;
  icon?: IconName;
  color?: string;
}

type SheetRender = (close: () => void) => ReactNode;

interface UI {
  alert(opts: AlertOpts): Promise<string | null>;
  confirm(title: string, message?: string, ok?: string, destructive?: boolean): Promise<boolean>;
  prompt(title: string, message?: string, placeholder?: string, ok?: string, value?: string): Promise<string | null>;
  actions(items: ActionItem[], title?: string): Promise<string | null>;
  toast(opts: ToastOpts | string): void;
  sheet(render: SheetRender, opts?: { auto?: boolean }): () => void;
}

const Ctx = createContext<UI | null>(null);

interface AlertState extends AlertOpts {
  resolve: (v: string | null) => void;
}
interface ActionState {
  items: ActionItem[];
  title?: string;
  resolve: (v: string | null) => void;
}
interface SheetState {
  id: number;
  render: SheetRender;
  closing: boolean;
  auto?: boolean;
}

let sheetSeq = 0;

export function UIProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlert] = useState<AlertState | null>(null);
  const [actionState, setAction] = useState<ActionState | null>(null);
  const [toast, setToast] = useState<(ToastOpts & { id: number; out?: boolean }) | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeSheet = useCallback((id: number) => {
    setSheets((s) => s.map((x) => (x.id === id ? { ...x, closing: true } : x)));
    setTimeout(() => setSheets((s) => s.filter((x) => x.id !== id)), 320);
  }, []);

  const ui: UI = {
    alert: (opts) => new Promise((resolve) => setAlert({ ...opts, resolve })),
    confirm: (title, message, ok = 'Đồng ý', destructive = false) =>
      new Promise((resolve) =>
        setAlert({
          title,
          message,
          actions: [
            { label: 'Huỷ', style: 'cancel', value: '' },
            { label: ok, style: destructive ? 'destructive' : 'primary', value: 'ok' },
          ],
          resolve: (v) => resolve(v === 'ok'),
        }),
      ),
    prompt: (title, message, placeholder, ok = 'Gửi', value = '') =>
      new Promise((resolve) =>
        setAlert({
          title,
          message,
          input: { placeholder, value },
          actions: [
            { label: 'Huỷ', style: 'cancel', value: '__cancel' },
            { label: ok, style: 'primary', value: '__ok' },
          ],
          resolve: (v) => resolve(v === '__cancel' || v === null ? null : v),
        }),
      ),
    actions: (items, title) => new Promise((resolve) => setAction({ items, title, resolve })),
    toast: (o) => {
      const opts = typeof o === 'string' ? { text: o } : o;
      const id = Date.now();
      setToast({ ...opts, id });
      setTimeout(() => setToast((t) => (t && t.id === id ? { ...t, out: true } : t)), 2400);
      setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2750);
    },
    sheet: (render, opts) => {
      const id = ++sheetSeq;
      setSheets((s) => [...s, { id, render, closing: false, auto: opts?.auto }]);
      return () => closeSheet(id);
    },
  };

  const finishAlert = (v: string | null) => {
    if (!alertState) return;
    const val = alertState.input && v === '__ok' ? inputRef.current?.value ?? '' : v;
    alertState.resolve(val);
    setAlert(null);
  };

  useEffect(() => {
    if (alertState?.input) setTimeout(() => inputRef.current?.focus(), 50);
  }, [alertState]);

  return (
    <Ctx.Provider value={ui}>
      {children}
      {createPortal(
        <>
          {sheets.map((s) => (
            <SheetFrame key={s.id} state={s} onClose={() => closeSheet(s.id)} />
          ))}
          {actionState && (
            <div
              className="action-wrap"
              onClick={() => {
                actionState.resolve(null);
                setAction(null);
              }}
            >
              <div className="action-card" onClick={(e) => e.stopPropagation()} role="menu">
                {actionState.title && <div className="action-title">{actionState.title}</div>}
                {actionState.items.map((it) => (
                  <button
                    key={it.value}
                    className={`action-btn${it.destructive ? ' destructive' : ''}`}
                    onClick={() => {
                      actionState.resolve(it.value);
                      setAction(null);
                    }}
                    role="menuitem"
                  >
                    <span className="grow">{it.label}</span>
                    {it.icon && <Icon name={it.icon} size={22} />}
                  </button>
                ))}
              </div>
              <button
                className="action-cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  actionState.resolve(null);
                  setAction(null);
                }}
              >
                Huỷ
              </button>
            </div>
          )}
          {alertState && (
            <div className="alert-wrap" role="alertdialog" aria-modal="true">
              <div className="alert">
                <h3>{alertState.title}</h3>
                {alertState.message && <p>{alertState.message}</p>}
                {alertState.input && (
                  <input
                    ref={inputRef}
                    className="alert-input"
                    placeholder={alertState.input.placeholder}
                    defaultValue={alertState.input.value}
                    onKeyDown={(e) => e.key === 'Enter' && finishAlert('__ok')}
                  />
                )}
                <div className={`alert-actions${(alertState.actions?.length || 1) > 2 ? ' stacked' : ''}`}>
                  {(alertState.actions || [{ label: 'OK', style: 'primary', value: 'ok' }]).map((a) => (
                    <button
                      key={a.label}
                      className={`btn ${a.style === 'primary' ? '' : a.style === 'destructive' ? 'danger' : 'gray'}`}
                      onClick={() => finishAlert(a.value ?? a.label)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {toast && (
            <div className="toast-wrap" aria-live="polite">
              <div className={`toast${toast.out ? ' out' : ''}`}>
                {toast.icon && (
                  <span className={`toast-icon bg-${toast.color || 'green'}`}>
                    <Icon name={toast.icon} size={17} stroke={2.6} />
                  </span>
                )}
                <span>{toast.text}</span>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

function SheetFrame({ state, onClose }: { state: SheetState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number; t: number } | null>(null);

  // Kéo thanh nắm xuống để đóng
  const onStart = (e: React.TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, dy: 0, t: Date.now() };
  };
  const onMove = (e: React.TouchEvent) => {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (!drag.current || !ref.current) return;
    const { dy, t } = drag.current;
    const v = dy / Math.max(1, Date.now() - t);
    drag.current = null;
    if (dy > 140 || v > 0.6) {
      ref.current.style.setProperty('--sheet-drag', `${dy}px`);
      ref.current.style.transform = '';
      ref.current.style.transition = '';
      onClose();
    } else {
      ref.current.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)';
      ref.current.style.transform = 'translateY(0)';
    }
  };

  return (
    <>
      <div className={`sheet-backdrop${state.closing ? ' closing' : ''}`} onClick={onClose} />
      <div ref={ref} className={`sheet${state.auto ? ' auto' : ''}${state.closing ? ' closing' : ''}`} role="dialog" aria-modal="true">
        <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} style={{ paddingBottom: 2 }}>
          <div className="sheet-grabber" />
        </div>
        {state.render(onClose)}
      </div>
    </>
  );
}

export function SheetHead({
  title,
  onCancel,
  onDone,
  doneLabel,
  doneDisabled,
  busy,
}: {
  title: string;
  onCancel?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="sheet-head">
      <div style={{ width: 88, display: 'flex' }}>
        {onCancel && (
          <button className="glass-btn icon" onClick={onCancel} aria-label="Đóng">
            <Icon name="xmark" size={20} stroke={2.2} />
          </button>
        )}
      </div>
      <div className="sheet-title">{title}</div>
      <div style={{ width: 88, display: 'flex', justifyContent: 'flex-end' }}>
        {onDone &&
          (doneLabel ? (
            <button className="glass-btn prominent" onClick={onDone} disabled={doneDisabled || busy}>
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff', width: 18, height: 18 }} /> : doneLabel}
            </button>
          ) : (
            <button className="glass-btn icon prominent" onClick={onDone} disabled={doneDisabled || busy} aria-label="Xong">
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff', width: 18, height: 18 }} /> : <Icon name="check" size={21} stroke={2.4} />}
            </button>
          ))}
      </div>
    </div>
  );
}

export function useUI(): UI {
  const u = useContext(Ctx);
  if (!u) throw new Error('UIProvider missing');
  return u;
}
