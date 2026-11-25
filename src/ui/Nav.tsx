// Ngăn xếp điều hướng kiểu iOS: đẩy trang trượt ngang, vuốt từ mép trái để quay lại.
import { createContext, useCallback, useContext, useImperativeHandle, useRef, useState, forwardRef, type ReactNode } from 'react';

interface Entry {
  key: number;
  node: ReactNode;
  phase: 'enter' | 'idle' | 'exit';
}

export interface NavApi {
  push: (node: ReactNode) => void;
  pop: () => void;
  popToRoot: () => void;
  depth: number;
}

const NavCtx = createContext<NavApi | null>(null);
export const ScreenIndexCtx = createContext(0);
let seq = 1;

export interface StackHandle extends NavApi {}

export const Stack = forwardRef<StackHandle, { root: ReactNode; onDepth?: (d: number) => void; hidden?: boolean }>(function Stack(
  { root, onDepth, hidden },
  ref,
) {
  const [entries, setEntries] = useState<Entry[]>([{ key: 0, node: root, phase: 'idle' }]);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const busy = useRef(false);
  const dragState = useRef<{ x: number; y: number; dx: number; t: number; locked: boolean | null } | null>(null);

  const depth = entries.filter((e) => e.phase !== 'exit').length - 1;

  const push = useCallback(
    (node: ReactNode) => {
      const key = seq++;
      setEntries((list) => {
        const next = [...list.map((e) => ({ ...e, phase: 'idle' as const })), { key, node, phase: 'enter' as const }];
        onDepth?.(next.length - 1);
        return next;
      });
      setTimeout(() => setEntries((list) => list.map((e) => (e.key === key && e.phase === 'enter' ? { ...e, phase: 'idle' } : e))), 520);
    },
    [onDepth],
  );

  const pop = useCallback(() => {
    if (busy.current) return;
    setEntries((list) => {
      if (list.length <= 1) return list;
      busy.current = true;
      const top = list[list.length - 1];
      setTimeout(() => {
        setEntries((l) => l.filter((e) => e.key !== top.key));
        busy.current = false;
      }, 420);
      onDepth?.(list.length - 2);
      return list.map((e, i) => (i === list.length - 1 ? { ...e, phase: 'exit' } : e));
    });
  }, [onDepth]);

  const popToRoot = useCallback(() => {
    setEntries((list) => {
      onDepth?.(0);
      return list.slice(0, 1).map((e) => ({ ...e, phase: 'idle' }));
    });
  }, [onDepth]);

  const api: NavApi = { push, pop, popToRoot, depth };
  useImperativeHandle(ref, () => api, [push, pop, popToRoot, depth]);

  // ---- Vuốt từ mép trái để quay lại ----
  const live = entries.filter((e) => e.phase !== 'exit');
  const topKey = live[live.length - 1]?.key;
  const underKey = live[live.length - 2]?.key;

  const onTouchStart = (e: React.TouchEvent) => {
    if (live.length < 2) return;
    const t = e.touches[0];
    if (t.clientX > 28) return;
    dragState.current = { x: t.clientX, y: t.clientY, dx: 0, t: Date.now(), locked: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = dragState.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (d.locked === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.locked = Math.abs(dx) > Math.abs(dy);
      if (!d.locked) {
        dragState.current = null;
        return;
      }
    }
    d.dx = Math.max(0, dx);
    const top = nodes.current.get(topKey!);
    const under = nodes.current.get(underKey!);
    const w = window.innerWidth;
    if (top) {
      top.style.transition = 'none';
      top.style.transform = `translateX(${d.dx}px)`;
    }
    if (under) {
      under.style.transition = 'none';
      under.style.transform = `translateX(${-28 + (d.dx / w) * 28}%)`;
    }
  };
  const onTouchEnd = () => {
    const d = dragState.current;
    dragState.current = null;
    if (!d || !d.locked) return;
    const top = nodes.current.get(topKey!);
    const under = nodes.current.get(underKey!);
    const w = window.innerWidth;
    const v = d.dx / Math.max(1, Date.now() - d.t);
    if (d.dx > w * 0.35 || v > 0.5) {
      if (top) {
        top.style.setProperty('--drag-x', `${d.dx}px`);
        top.style.transform = '';
        top.style.transition = '';
      }
      if (under) {
        under.style.setProperty('--under-x', `${-28 + (d.dx / w) * 28}%`);
        under.style.transform = '';
        under.style.transition = '';
      }
      pop();
    } else {
      [top, under].forEach((n, i) => {
        if (!n) return;
        n.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)';
        n.style.transform = i === 0 ? 'translateX(0)' : 'translateX(-28%)';
        setTimeout(() => {
          n.style.transition = '';
          n.style.transform = '';
        }, 360);
      });
    }
  };

  return (
    <NavCtx.Provider value={api}>
      <div className="stack" style={hidden ? { visibility: 'hidden', pointerEvents: 'none' } : undefined} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {entries.map((e, i) => {
          const isTop = e.key === topKey;
          const exiting = e.phase === 'exit';
          const isUnder = !exiting && e.key === underKey;
          const someoneExiting = entries.some((x) => x.phase === 'exit');
          const topEntering = entries[entries.length - 1]?.phase === 'enter';
          const visible = isTop || exiting || isUnder;
          let cls = 'screen';
          if (exiting) cls += ' push-exit';
          else if (isTop && e.phase === 'enter') cls += ' push-enter';
          else if (isUnder && someoneExiting) cls += ' under-exit';
          else if (isUnder && topEntering) cls += ' under-enter is-under';
          else if (!isTop) cls += ' is-under';
          return (
            <div
              key={e.key}
              ref={(n) => {
                if (n) nodes.current.set(e.key, n);
                else nodes.current.delete(e.key);
              }}
              className={cls}
              style={{ zIndex: i + 1, visibility: visible && !hidden ? 'visible' : 'hidden' }}
              aria-hidden={!isTop}
            >
              <ScreenIndexCtx.Provider value={i}>{e.node}</ScreenIndexCtx.Provider>
              {!isTop && !exiting && <div className="screen-dim" />}
            </div>
          );
        })}
      </div>
    </NavCtx.Provider>
  );
});

export function useNav(): NavApi {
  const n = useContext(NavCtx);
  if (!n) throw new Error('Stack missing');
  return n;
}

export function useOptionalNav(): NavApi | null {
  return useContext(NavCtx);
}

export function NavLink({ to, children, className }: { to: () => ReactNode; children: ReactNode; className?: string }) {
  const nav = useNav();
  return (
    <button className={className} onClick={() => nav.push(to())}>
      {children}
    </button>
  );
}
