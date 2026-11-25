import { useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ScreenIndexCtx, useOptionalNav } from './Nav';

interface PageProps {
  title: string;
  kicker?: ReactNode; // dòng nhỏ phía trên tiêu đề lớn
  large?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  back?: boolean | string;
  children: ReactNode;
  footer?: ReactNode; // thanh hành động cố định phía dưới
  noTab?: boolean;
  headerExtra?: ReactNode; // nội dung ngay dưới tiêu đề lớn (vd thanh tìm kiếm)
  onScrollEnd?: () => void;
}

/** Trang có thanh điều hướng tiêu đề lớn tự thu gọn khi cuộn. */
export function Page({ title, kicker, large = true, left, right, back, children, footer, noTab, headerExtra }: PageProps) {
  const nav = useOptionalNav();
  const [scrolled, setScrolled] = useState(!large);
  const scroller = useRef<HTMLDivElement>(null);
  const index = useContext(ScreenIndexCtx);
  const showBack = back !== false && !!nav && index > 0;

  const onScroll = () => {
    const y = scroller.current?.scrollTop || 0;
    const s = large ? y > 38 : y > 4;
    if (s !== scrolled) setScrolled(s);
  };

  return (
    <>
      <div className={`navbar${scrolled ? ' scrolled' : ''}${large ? '' : ' inline'}`}>
        <div className="navbar-row">
          <div className="navbar-side">
            {showBack ? (
              <button className="glass-btn icon" onClick={() => nav!.pop()} aria-label="Quay lại">
                <Icon name="chevronLeft" size={22} stroke={2.3} />
              </button>
            ) : (
              left
            )}
          </div>
          <div className="navbar-title">{title}</div>
          <div className="navbar-side right">{right}</div>
        </div>
      </div>
      <div ref={scroller} className={`scroll${noTab || index > 0 ? ' no-tab' : ''}`} onScroll={onScroll} style={footer ? { paddingBottom: 'calc(var(--safe-bottom) + 110px)' } : undefined}>
        {large ? (
          <div className="large-title">
            {kicker && <div className="kicker">{kicker}</div>}
            <div className="t-large">{title}</div>
          </div>
        ) : (
          <div className="page-top-inline" />
        )}
        {headerExtra}
        {children}
      </div>
      {footer && <div className="bottom-bar">{footer}</div>}
    </>
  );
}
