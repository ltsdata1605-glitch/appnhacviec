// Xem ảnh toàn màn hình kiểu app Ảnh của iPhone:
// - chụm 2 ngón để phóng to (tới 5×), chạm 2 lần để phóng to/thu nhỏ đúng chỗ chạm, kéo để xem khi đang phóng to
// - vuốt ngang để sang ảnh khác, vuốt xuống để đóng, chạm 1 lần để ẩn/hiện thanh công cụ
// - hiện ngay ảnh thu nhỏ (đã có trong bộ nhớ đệm) rồi thay bằng ảnh nét khi tải xong; tải sẵn ảnh kế bên
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { resolveSrc } from '../lib/image';
import { stamp } from '../lib/time';
import type { Photo } from '../lib/types';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface Pt {
  x: number;
  y: number;
}
interface View {
  s: number;
  x: number;
  y: number;
}
type Mode = null | 'pending' | 'pan' | 'pinch' | 'page' | 'dismiss';

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function fit(w: number, h: number, W: number, H: number) {
  const k = Math.min(W / w, H / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

type ViewerPhoto = Photo & { label?: string };

export function PhotoViewer({ photos, index, title, onClose }: { photos: ViewerPhoto[]; index: number; title: string; onClose: () => void }) {
  const n = photos.length;
  const [i, setI] = useState(Math.min(Math.max(0, index), n - 1));
  const [chrome, setChrome] = useState(true);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [size, setSize] = useState({ W: window.innerWidth, H: window.innerHeight });
  const [dims, setDims] = useState<Record<number, { w: number; h: number }>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [hint, setHint] = useState(() => {
    try {
      return !localStorage.getItem('nv-pv-hint');
    } catch {
      return false;
    }
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<number, HTMLDivElement>());
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const iRef = useRef(i);
  iRef.current = i;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const animateStrip = useRef(false);

  const g = useRef({
    pointers: new Map<number, Pt>(),
    mode: null as Mode,
    start: { x: 0, y: 0 } as Pt,
    startView: { s: 1, x: 0, y: 0 } as View,
    startDist: 1,
    startMid: { x: 0, y: 0 } as Pt,
    last: { x: 0, y: 0, t: 0 },
    vx: 0,
    vy: 0,
    dx: 0,
    dy: 0,
    lastTap: { x: 0, y: 0, t: 0 },
    tapTimer: 0,
  });

  // Kích thước khung ảnh vừa màn hình theo tỉ lệ ảnh
  const boxOf = useCallback(
    (k: number) => {
      const d = dims[k] || (photos[k]?.w && photos[k]?.h ? { w: photos[k].w!, h: photos[k].h! } : { w: 3, h: 4 });
      return fit(d.w, d.h, size.W, size.H);
    },
    [dims, photos, size],
  );
  const boxRef = useRef(boxOf);
  boxRef.current = boxOf;

  // ---------- áp dụng biến đổi trực tiếp lên DOM (mượt, không vẽ lại React) ----------
  const applyView = useCallback((anim: boolean) => {
    const el = boxes.current.get(iRef.current);
    if (!el) return;
    const v = view.current;
    el.style.transition = anim ? `transform 0.34s ${SPRING}` : 'none';
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
    const z = v.s > 1.01;
    setZoomed((cur) => (cur === z ? cur : z));
  }, []);

  const setStrip = useCallback((dx: number, anim: boolean) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = anim ? `transform 0.38s ${SPRING}` : 'none';
    el.style.transform = `translate3d(${-iRef.current * sizeRef.current.W + dx}px, 0, 0)`;
  }, []);

  const setDismiss = useCallback((dy: number, anim: boolean) => {
    const el = boxes.current.get(iRef.current);
    const H = sizeRef.current.H;
    const k = Math.min(1, Math.abs(dy) / (H * 0.6));
    if (el) {
      el.style.transition = anim ? `transform 0.32s ${SPRING}` : 'none';
      el.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - k * 0.25})`;
    }
    if (backRef.current) {
      backRef.current.style.transition = anim ? 'opacity 0.32s ease' : 'none';
      backRef.current.style.opacity = String(1 - k);
    }
  }, []);

  const bounds = useCallback((s: number) => {
    const b = boxRef.current(iRef.current);
    const { W, H } = sizeRef.current;
    return { mx: Math.max(0, (b.w * s - W) / 2), my: Math.max(0, (b.h * s - H) / 2) };
  }, []);

  /** Đưa về trạng thái hợp lệ: tỉ lệ trong [1, MAX], ảnh không trôi ra ngoài khung */
  const settle = useCallback(() => {
    const v = view.current;
    let s = Math.min(MAX_SCALE, Math.max(1, v.s));
    if (s < 1.02) s = 1;
    const { mx, my } = bounds(s);
    view.current = s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
    applyView(true);
  }, [applyView, bounds]);

  const close = useCallback(
    (fromDrag = false) => {
      // Vuốt xuống để đóng: ảnh tiếp tục trôi xuống; đóng bằng nút: ảnh thu nhỏ mờ dần
      const el = boxes.current.get(iRef.current);
      if (el && fromDrag) {
        el.style.transition = `transform 0.24s ease-in, opacity 0.24s ease-in`;
        el.style.transform = `translate3d(0, ${sizeRef.current.H * 0.7}px, 0) scale(0.8)`;
        el.style.opacity = '0';
      } else if (el) {
        el.style.transition = `transform 0.22s ease, opacity 0.22s ease`;
        el.style.transform = `${el.style.transform || ''} scale(0.9)`;
        el.style.opacity = '0';
      }
      setClosing(true);
      window.setTimeout(onClose, 230);
    },
    [onClose],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setOpening(false), 400);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback(
    (k: number) => {
      if (k < 0 || k >= n) {
        setStrip(0, true);
        return;
      }
      animateStrip.current = true;
      setI(k);
    },
    [n, setStrip],
  );

  // Đổi ảnh: trượt dải ảnh, đưa ảnh mới về tỉ lệ 1
  useLayoutEffect(() => {
    view.current = { s: 1, x: 0, y: 0 };
    boxes.current.forEach((el) => {
      el.style.transition = 'none';
      el.style.transform = '';
    });
    setZoomed(false);
    setStrip(0, animateStrip.current);
    animateStrip.current = false;
  }, [i, size.W, setStrip]);

  // Xoay máy / đổi kích thước
  useEffect(() => {
    const onResize = () => setSize({ W: window.innerWidth, H: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Chặn thu phóng cả trang của Safari và cuộn nền khi đang xem ảnh
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const stage = stageRef.current;
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    stage?.addEventListener('touchmove', stop, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'ArrowRight') go(iRef.current + 1);
      else if (e.key === 'ArrowLeft') go(iRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      stage?.removeEventListener('touchmove', stop);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, go]);

  // Gợi ý thao tác lần đầu
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => {
      setHint(false);
      try {
        localStorage.setItem('nv-pv-hint', '1');
      } catch {
        /* bỏ qua */
      }
    }, 3200);
    return () => clearTimeout(t);
  }, [hint]);

  // ---------- cử chỉ ----------
  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const zoomAt = (p: Pt, target: number) => {
    const v = view.current;
    // giữ nguyên điểm dưới ngón tay khi đổi tỉ lệ
    const ix = (p.x - v.x) / v.s;
    const iy = (p.y - v.y) / v.s;
    view.current = { s: target, x: p.x - target * ix, y: p.y - target * iy };
    settle();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = g.current;
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* bỏ qua */
    }
    st.pointers.set(e.pointerId, rel(e));
    const pts = [...st.pointers.values()];
    if (pts.length === 1) {
      st.mode = 'pending';
      st.start = pts[0];
      st.startView = { ...view.current };
      st.last = { ...pts[0], t: performance.now() };
      st.vx = st.vy = st.dx = st.dy = 0;
    } else if (pts.length === 2) {
      if (st.mode === 'page') setStrip(0, true);
      if (st.mode === 'dismiss') setDismiss(0, true);
      st.mode = 'pinch';
      st.startDist = Math.max(1, dist(pts[0], pts[1]));
      st.startMid = mid(pts[0], pts[1]);
      st.startView = { ...view.current };
      window.clearTimeout(st.tapTimer);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st.pointers.has(e.pointerId)) return;
    const p = rel(e);
    st.pointers.set(e.pointerId, p);
    const pts = [...st.pointers.values()];
    if (st.mode === 'pinch' && pts.length >= 2) {
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);
      let s = (st.startView.s * d) / st.startDist;
      if (s < 1) s = 1 - (1 - s) * 0.45; // co giãn mềm khi thu nhỏ quá
      if (s > MAX_SCALE) s = MAX_SCALE + (s - MAX_SCALE) * 0.3;
      const ix = (st.startMid.x - st.startView.x) / st.startView.s;
      const iy = (st.startMid.y - st.startView.y) / st.startView.s;
      view.current = { s, x: m.x - s * ix, y: m.y - s * iy };
      applyView(false);
      return;
    }
    if (pts.length !== 1) return;
    const now = performance.now();
    const dt = Math.max(1, now - st.last.t);
    st.vx = (p.x - st.last.x) / dt;
    st.vy = (p.y - st.last.y) / dt;
    st.last = { ...p, t: now };
    const dx = p.x - st.start.x;
    const dy = p.y - st.start.y;
    if (st.mode === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      window.clearTimeout(st.tapTimer);
      st.mode = view.current.s > 1.01 ? 'pan' : Math.abs(dx) > Math.abs(dy) || dy < 0 ? 'page' : 'dismiss';
      if (st.mode === 'dismiss') setChrome(false);
    }
    if (st.mode === 'pan') {
      const { mx, my } = bounds(view.current.s);
      let x = st.startView.x + dx;
      let y = st.startView.y + dy;
      if (x > mx) x = mx + (x - mx) * 0.35;
      if (x < -mx) x = -mx + (x + mx) * 0.35;
      if (y > my) y = my + (y - my) * 0.35;
      if (y < -my) y = -my + (y + my) * 0.35;
      view.current = { ...view.current, x, y };
      applyView(false);
    } else if (st.mode === 'page') {
      const edge = (iRef.current === 0 && dx > 0) || (iRef.current === n - 1 && dx < 0);
      st.dx = edge ? dx * 0.35 : dx;
      setStrip(st.dx, false);
    } else if (st.mode === 'dismiss') {
      st.dy = Math.max(0, dy);
      setDismiss(st.dy, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st.pointers.has(e.pointerId)) return;
    const p = st.pointers.get(e.pointerId)!;
    st.pointers.delete(e.pointerId);
    if (st.mode === 'pinch') {
      settle();
      const rest = [...st.pointers.values()];
      if (rest.length === 1 && view.current.s > 1.01) {
        st.mode = 'pan';
        st.start = rest[0];
        st.startView = { ...view.current };
      } else if (!rest.length) st.mode = null;
      return;
    }
    if (st.pointers.size) return;
    const { W, H } = sizeRef.current;
    if (st.mode === 'pending') {
      const now = performance.now();
      const lt = st.lastTap;
      if (now - lt.t < 300 && dist(lt, p) < 40) {
        window.clearTimeout(st.tapTimer);
        st.lastTap = { x: 0, y: 0, t: 0 };
        if (view.current.s > 1.01) {
          view.current = { s: 1, x: 0, y: 0 };
          applyView(true);
        } else zoomAt(p, DOUBLE_TAP_SCALE);
      } else {
        st.lastTap = { ...p, t: now };
        st.tapTimer = window.setTimeout(() => setChrome((c) => !c), 260);
      }
    } else if (st.mode === 'pan') {
      // trôi nhẹ theo quán tính rồi dừng trong khung
      const v = view.current;
      view.current = { ...v, x: v.x + st.vx * 120, y: v.y + st.vy * 120 };
      settle();
    } else if (st.mode === 'page') {
      const next = st.dx < -W * 0.18 || st.vx < -0.45 ? 1 : st.dx > W * 0.18 || st.vx > 0.45 ? -1 : 0;
      if (next && iRef.current + next >= 0 && iRef.current + next < n) go(iRef.current + next);
      else setStrip(0, true);
    } else if (st.mode === 'dismiss') {
      if (st.dy > H * 0.14 || st.vy > 0.6) close(true);
      else {
        setDismiss(0, true);
        setChrome(true);
      }
    }
    st.mode = null;
  };

  // Bàn di chuột / chuột trên máy tính: Ctrl + cuộn (hoặc chụm trên trackpad) để phóng to
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && view.current.s <= 1.01) return;
    if (e.ctrlKey) {
      const target = Math.min(MAX_SCALE, Math.max(1, view.current.s * Math.exp(-e.deltaY * 0.01)));
      zoomAt(rel(e), target);
    } else {
      view.current = { ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY };
      settle();
    }
  };

  const cur = photos[i];
  const note = cur?.capturedAt ? stamp(cur.capturedAt) : cur?.label || '';

  return createPortal(
    <div className={`pv${chrome ? '' : ' no-chrome'}${closing ? ' closing' : ''}${opening ? ' opening' : ''}`} role="dialog" aria-modal="true" aria-label="Xem ảnh">
      <div className="pv-back" ref={backRef} />
      <div
        className="pv-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="pv-strip" ref={stripRef} style={{ width: n * size.W }}>
          {photos.map((p, k) => {
            const near = Math.abs(k - i) <= 1; // chỉ dựng ảnh đang xem và 2 ảnh kế bên (tải sẵn)
            const b = boxOf(k);
            return (
              <div className="pv-slide" key={k} style={{ width: size.W, height: size.H }}>
                {near && (
                  <div
                    className={`pv-box${k === i ? ' current' : ''}`}
                    ref={(el) => {
                      if (el) boxes.current.set(k, el);
                      else boxes.current.delete(k);
                    }}
                    style={{ width: b.w, height: b.h }}
                  >
                    <img
                      className="pv-thumb"
                      src={resolveSrc(p.thumbUrl || p.url)}
                      alt=""
                      draggable={false}
                      onLoad={(e) => {
                        const im = e.currentTarget;
                        if (!dims[k] && im.naturalWidth) setDims((d) => (d[k] ? d : { ...d, [k]: { w: im.naturalWidth, h: im.naturalHeight } }));
                      }}
                    />
                    <img
                      className={`pv-full${loaded[k] ? ' on' : ''}`}
                      src={resolveSrc(p.url)}
                      alt={`Ảnh ${k + 1}`}
                      draggable={false}
                      decoding="async"
                      {...{ fetchpriority: k === i ? 'high' : 'low' }}
                      onLoad={(e) => {
                        const im = e.currentTarget;
                        setLoaded((l) => ({ ...l, [k]: true }));
                        setDims((d) => ({ ...d, [k]: { w: im.naturalWidth, h: im.naturalHeight } }));
                      }}
                    />
                    {k === i && !loaded[k] && <span className="spinner pv-spin" aria-label="Đang tải ảnh nét" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pv-top">
        <button className="glass-btn icon" onClick={() => close(false)} aria-label="Đóng">
          <Icon name="xmark" size={20} stroke={2.4} />
        </button>
        <div className="center grow" style={{ minWidth: 0 }}>
          <div className="t-headline ellipsis">{title}</div>
          <div className="t-foot pv-sub">
            {[n > 1 ? `${i + 1} / ${n}` : '', note].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          className="glass-btn icon"
          aria-label={zoomed ? 'Thu nhỏ' : 'Phóng to'}
          onClick={() => {
            if (view.current.s > 1.01) {
              view.current = { s: 1, x: 0, y: 0 };
              applyView(true);
            } else zoomAt({ x: 0, y: 0 }, DOUBLE_TAP_SCALE);
          }}
        >
          <Icon name={zoomed ? 'minus' : 'plus'} size={20} stroke={2.4} />
        </button>
      </div>

      {n > 1 && n <= 12 && (
        <div className="pv-dots" aria-hidden="true">
          {photos.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
      {hint && <div className="pv-hint">Chụm 2 ngón hoặc chạm 2 lần để phóng to · Vuốt xuống để đóng</div>}
    </div>,
    document.body,
  );
}
