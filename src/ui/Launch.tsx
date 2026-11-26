// Màn hình khởi động có chuyển động: chuông rung nhẹ, ba chấm chờ, phóng to mờ dần khi vào app.
// Cùng giao diện với màn chờ trong index.html (hiện trước khi JS chạy) nên chuyển tiếp liền mạch.
import { useEffect, useState } from 'react';

/** Độ trễ âm theo thời gian đã mở trang: hoạt ảnh tiếp tục đúng nhịp khi phần tử được tạo lại */
const sinceStart = () => ({ animationDelay: `-${Math.round(performance.now())}ms` });

export function LaunchIcon({ size = 88 }: { size?: number }) {
  const delay = sinceStart();
  return (
    <span className="launch-icon" style={{ width: size, height: size, ...delay }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="nv-launch-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a91f0" />
            <stop offset="1" stopColor="#2a83e9" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#nv-launch-g)" />
        <g transform="translate(512 530) scale(0.86) translate(-512 -546)" fill="#fff">
          <g className="launch-bell" style={delay}>
            <circle cx="512" cy="244" r="36" />
            <path d="M512 258c-116 0-190 94-190 214v126c0 42-20 74-48 102l-18 18c-20 20-7 52 21 52h470c28 0 41-32 21-52l-18-18c-28-28-48-60-48-102V472c0-120-74-214-190-214z" />
          </g>
          <path className="launch-clapper" style={delay} d="M442 800h140c0 39-31 70-70 70s-70-31-70-70z" />
        </g>
      </svg>
    </span>
  );
}

/** done: dữ liệu đã sẵn sàng → phóng to, mờ dần rồi gỡ khỏi màn hình */
export function Launch({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (done) {
      const t = window.setTimeout(() => setGone(true), 560);
      return () => clearTimeout(t);
    }
    setGone(false);
    const t = window.setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(t);
  }, [done]);
  if (gone) return null;
  return (
    <div className={`launch${done ? ' out' : ''}`} aria-hidden={done} role={done ? undefined : 'progressbar'} aria-label={done ? undefined : 'Đang mở Nhắc việc'}>
      <LaunchIcon />
      {/* Ba chấm chỉ hiện khi đã chờ quá 0,7 giây kể từ lúc mở trang */}
      <span className="launch-dots" style={{ animationDelay: `${Math.round(700 - performance.now())}ms` }} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {slow && !done && <span className="launch-slow">Mạng chậm, đang kết nối…</span>}
    </div>
  );
}
