import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { initials } from '../lib/text';
import { resolveSrc } from '../lib/image';

// ---------- Section / Group / Cell ----------
export function Section({
  title,
  action,
  onAction,
  footer,
  children,
  small,
  style,
}: {
  title?: ReactNode;
  action?: string;
  onAction?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  small?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className="section" style={style}>
      {(title || action) && (
        <div className="section-head">
          <div className={`h${small ? ' small' : ''}`}>{title}</div>
          {action && (
            <button className="action" onClick={onAction}>
              {action}
            </button>
          )}
        </div>
      )}
      {children}
      {footer && <div className="section-foot">{footer}</div>}
    </section>
  );
}

/** Nhóm danh sách. cards: mỗi dòng là một thẻ nổi riêng, cách nhau bằng khoảng thở thay cho đường kẻ */
export function Group({ children, style, cards }: { children: ReactNode; style?: CSSProperties; cards?: boolean }) {
  return (
    <div className={`group${cards ? ' cards' : ''}`} style={style}>
      {children}
    </div>
  );
}

interface CellProps {
  icon?: IconName;
  iconColor?: string;
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  centered?: boolean;
  sepInset?: number;
  style?: CSSProperties;
  titleClass?: string;
}

export function Cell({ icon, iconColor = 'blue', leading, title, sub, detail, trailing, chevron, onClick, destructive, centered, sepInset, style, titleClass }: CellProps) {
  const inset = sepInset ?? (icon ? 58 : leading ? 66 : 16);
  const content = (
    <>
      {icon && (
        <span className={`cell-icon bg-${iconColor}`}>
          <Icon name={icon} size={19} stroke={2} />
        </span>
      )}
      {leading}
      <div className="cell-body">
        <div className={`cell-title ${titleClass || ''}`}>{title}</div>
        {sub && <div className="cell-sub">{sub}</div>}
      </div>
      {detail !== undefined && <div className="cell-detail">{detail}</div>}
      {trailing}
      {chevron && <Icon name="chevronRight" size={16} stroke={2} className="chev" />}
    </>
  );
  const cls = `cell${destructive ? ' destructive' : ''}${centered ? ' center-text' : ''}`;
  const st = { ['--sep-inset' as string]: `${inset}px`, ...style } as CSSProperties;
  return onClick ? (
    <button className={cls} onClick={onClick} style={st}>
      {content}
    </button>
  ) : (
    <div className={cls} style={st}>
      {content}
    </div>
  );
}

// ---------- Bộ lọc dạng viên thuốc (thay cho segmented control) ----------
export type SegDot = 'red' | 'orange' | 'green' | 'blue';
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
  fill,
}: {
  value: T;
  options: { value: T; label: string; count?: number; dot?: SegDot | false }[];
  onChange: (v: T) => void;
  style?: CSSProperties;
  /** các nút chia đều chiều ngang (dùng trong biểu mẫu) */
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Đưa mục đang chọn vào tầm nhìn khi dải lọc dài hơn màn hình
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('button.on');
    const box = ref.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    const left = el.offsetLeft - 16;
    const right = el.offsetLeft + el.offsetWidth - box.clientWidth + 16;
    if (box.scrollLeft > left) box.scrollTo({ left, behavior: 'smooth' });
    else if (box.scrollLeft < right) box.scrollTo({ left: right, behavior: 'smooth' });
  }, [value]);
  return (
    <div ref={ref} className={`segmented${fill ? ' fill' : ''}`} role="tablist" style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.dot && <span className={`seg-dot ${o.dot}`} aria-hidden="true" />}
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Switch ----------
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span className="switch">
      {/* thuộc tính switch giúp Safari 18+ rung phản hồi khi bật/tắt */}
      <input type="checkbox" {...{ switch: '' }} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} role="switch" />
      <span className="track" />
      <span className="knob" />
    </span>
  );
}

// ---------- Check circle ----------
export function Check({
  on,
  onClick,
  color,
  ring,
  square,
  label,
  size = 26,
}: {
  on: boolean;
  onClick?: () => void;
  color?: 'green' | 'red';
  ring?: 'red' | 'orange';
  square?: boolean;
  label?: string;
  size?: number;
}) {
  const cls = `check${on ? ' on' : ''}${on && color ? ` ${color}` : ''}${!on && ring ? ` ring-${ring}` : ''}${square ? ' sq' : ''}`;
  const inner = <Icon name="check" size={size * 0.62} stroke={2.8} />;
  return onClick ? (
    <button
      className={cls}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={on}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={{ width: size, height: size }}>
      {inner}
    </span>
  );
}

// ---------- Pill ----------
export function Pill({ color = 'gray', children, sm, icon }: { color?: string; children: ReactNode; sm?: boolean; icon?: IconName }) {
  return (
    <span className={`pill ${color}${sm ? ' sm' : ''}`}>
      {icon && <Icon name={icon} size={sm ? 12 : 14} stroke={2.4} />}
      {children}
    </span>
  );
}

// ---------- Avatar ----------
const AV_COLORS = ['#5e8bd6', '#6a9f72', '#c27c4b', '#9b72c7', '#c46a7e', '#4f9fa8', '#8d8a5b', '#7a7f8c'];
export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  const [err, setErr] = useState(false);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AV_COLORS[h % AV_COLORS.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: src && !err ? undefined : bg }}>
      {src && !err ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setErr(true)} /> : initials(name)}
    </span>
  );
}

// ---------- Ring ----------
export function Ring({
  value,
  total,
  size = 64,
  width = 8,
  color = 'var(--green)',
  children,
}: {
  value: number;
  total: number;
  size?: number;
  width?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={width} />
        <circle
          className="ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

// ---------- Empty ----------
export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={52} stroke={1.4} className="empty-icon" />
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

// ---------- Search ----------
export function SearchBar({ value, onChange, placeholder = 'Tìm kiếm' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Icon name="search" size={18} stroke={2.2} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search" type="search" />
      {value && (
        <button onClick={() => onChange('')} aria-label="Xoá" style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 11, background: 'var(--label-3)', color: 'var(--bg-2)' }}>
          <Icon name="xmark" size={13} stroke={3} />
        </button>
      )}
    </div>
  );
}

// ---------- Ảnh (hỗ trợ ảnh mẫu demo:) ----------
export function Img({ src, alt = '', style, className, onClick }: { src?: string | null; alt?: string; style?: CSSProperties; className?: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const real = resolveSrc(src);
  return (
    <img
      src={real}
      alt={alt}
      className={className}
      onClick={onClick}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.25s', ...style }}
    />
  );
}

// ---------- Swipe row ----------
export interface SwipeAction {
  label: string;
  icon: IconName;
  color: string; // css var name, vd 'green'
  onClick: () => void;
}

export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef<{ sx: number; sy: number; base: number; lock: boolean | null } | null>(null);
  const width = actions.length * 78;

  if (!actions.length) return <>{children}</>;

  return (
    <div className="swipe">
      <div className="swipe-actions" style={{ width }}>
        {actions.map((a) => (
          <button
            key={a.label}
            className={`bg-${a.color}`}
            onClick={() => {
              setX(0);
              a.onClick();
            }}
          >
            <Icon name={a.icon} size={22} stroke={2.2} />
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={`swipe-content${drag ? ' dragging' : ''}`}
        style={{ transform: `translateX(${x}px)` }}
        onTouchStart={(e) => {
          st.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, base: x, lock: null };
        }}
        onTouchMove={(e) => {
          const s = st.current;
          if (!s) return;
          const dx = e.touches[0].clientX - s.sx;
          const dy = e.touches[0].clientY - s.sy;
          if (s.lock === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.lock = Math.abs(dx) > Math.abs(dy) && s.sx > 30;
          }
          if (!s.lock) return;
          setDrag(true);
          setX(Math.min(0, Math.max(-width - 40, s.base + dx)));
        }}
        onTouchEnd={() => {
          const s = st.current;
          st.current = null;
          setDrag(false);
          if (!s?.lock) return;
          setX((cur) => (cur < -width / 2 ? -width : 0));
        }}
        onClickCapture={(e) => {
          if (x !== 0) {
            e.stopPropagation();
            e.preventDefault();
            setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Spinner({ style }: { style?: CSSProperties }) {
  return <span className="spinner" style={style} />;
}

export function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
      <Spinner />
    </div>
  );
}

// ---------- Khung chờ khi dữ liệu đang tải lần đầu ----------
export function SkeletonList({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <section className="section sk-section" aria-busy="true" aria-label="Đang tải">
      {title && <span className="skeleton sk-title" />}
      <div className="sk-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sk-card">
            <span className="skeleton sk-icon" />
            <div className="sk-lines">
              <span className="skeleton sk-line" style={{ width: `${72 - i * 13}%` }} />
              <span className="skeleton sk-line short" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SkeletonStats() {
  return (
    <section className="section" aria-busy="true" aria-label="Đang tải">
      <div className="stat-grid">
        {[0, 1].map((i) => (
          <div key={i} className="stat sk-stat">
            <span className="skeleton sk-line" style={{ width: '62%' }} />
            <div className="row gap12" style={{ marginTop: 14 }}>
              <span className="skeleton sk-ring" />
              <div className="sk-lines grow">
                <span className="skeleton sk-line" style={{ width: '50%', height: 16 }} />
                <span className="skeleton sk-line short" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
