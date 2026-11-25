// Ô nhập có gắn tên @ (giống Zalo/Line): gõ "@" để hiện danh sách nhân viên, PG trong kho.
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSession, useStoreData } from '../state/session';
import { candidatesOf, filterCandidates, mentionQuery, splitMentions, type MentionCandidate } from '../lib/mentions';
import { Avatar } from './controls';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  enterKeyHint?: 'send' | 'done' | 'next' | 'enter';
  onEnter?: () => void;
  ariaLabel?: string;
  /** hiện danh sách gợi ý phía dưới thay vì phía trên ô nhập */
  below?: boolean;
}

export function MentionInput({ value, onChange, placeholder, multiline, rows = 3, className, style, autoFocus, enterKeyHint, onEnter, ariaLabel, below }: Props) {
  const s = useSession();
  const d = useStoreData();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [q, setQ] = useState<{ start: number; query: string } | null>(null);
  const all = useMemo(() => candidatesOf(d.active, s.auth?.uid), [d.active, s.auth?.uid]);
  const list = q ? filterCandidates(all, q.query) : [];
  // Đặt con trỏ ngay sau tên vừa chèn, đồng bộ trước lần gõ phím kế tiếp (không dùng requestAnimationFrame
  // vì khung hình có thể đến trễ và kéo con trỏ ngược lại giữa chừng khi đang gõ).
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current === null || !el) return;
    const p = caret.current;
    caret.current = null;
    if (document.activeElement !== el) el.focus();
    el.setSelectionRange(p, p);
  }, [value]);

  const sync = (el: HTMLTextAreaElement | HTMLInputElement) => {
    setQ(mentionQuery(el.value, el.selectionStart ?? el.value.length));
  };

  const pick = (c: MentionCandidate) => {
    const el = ref.current;
    if (!el || !q) return;
    const at = el.selectionStart ?? value.length;
    const next = `${value.slice(0, q.start)}@${c.name} ${value.slice(at)}`;
    caret.current = q.start + c.name.length + 2;
    onChange(next);
    setQ(null);
  };

  const common = {
    ref,
    value,
    placeholder,
    autoFocus,
    enterKeyHint,
    'aria-label': ariaLabel || placeholder,
    className,
    style,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement & HTMLInputElement>) => {
      onChange(e.target.value);
      sync(e.target);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement & HTMLInputElement>) => sync(e.currentTarget),
    onClick: (e: React.MouseEvent<HTMLTextAreaElement & HTMLInputElement>) => sync(e.currentTarget),
    onBlur: () => setTimeout(() => setQ(null), 180),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement & HTMLInputElement>) => {
      if (q && list.length && (e.key === 'Enter' || e.key === 'Tab')) {
        e.preventDefault();
        pick(list[0]);
        return;
      }
      if (!multiline && e.key === 'Enter' && onEnter) onEnter();
    },
  };

  return (
    <div className="mention-wrap">
      {multiline ? <textarea rows={rows} {...common} /> : <input {...common} autoComplete="off" />}
      {q && list.length > 0 && (
        <div className={`mention-pop${below ? ' below' : ''}`} role="listbox" aria-label="Gắn tên">
          {list.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="mention-item"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <Avatar name={c.name} src={c.photoURL} size={30} />
              <span className="grow ellipsis">
                <span className="semibold">{c.name}</span>
                {c.sub && <span className="c2"> · {c.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hiển thị nội dung có @tên được tô nổi bật */
export function MentionText({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const d = useStoreData();
  const names = useMemo(() => d.members.map((m) => m.fullName), [d.members]);
  const parts = splitMentions(text, names);
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>
      {parts.map((p, i) =>
        p.m ? (
          <span key={i} className="mention-tag">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </span>
  );
}
