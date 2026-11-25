// Biểu tượng app: chuông trắng trên nền xanh — trùng với biểu tượng trên Màn hình chính.
export function AppIcon({ size = 88 }: { size?: number }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, overflow: 'hidden' }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="nv-icon-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a91f0" />
            <stop offset="1" stopColor="#2a83e9" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#nv-icon-g)" />
        <g transform="translate(512 530) scale(0.86) translate(-512 -546)" fill="#fff">
          <circle cx="512" cy="244" r="36" />
          <path d="M512 258c-116 0-190 94-190 214v126c0 42-20 74-48 102l-18 18c-20 20-7 52 21 52h470c28 0 41-32 21-52l-18-18c-28-28-48-60-48-102V472c0-120-74-214-190-214z" />
          <path d="M442 800h140c0 39-31 70-70 70s-70-31-70-70z" />
        </g>
      </svg>
    </span>
  );
}
