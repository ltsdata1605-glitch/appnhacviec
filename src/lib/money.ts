// Tiền Việt: định dạng và đọc thành chữ.
export const DENOMS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

const D = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function read3(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h > 0 || full) out.push(D[h], 'trăm');
  if (t === 0) {
    if (u > 0 && (h > 0 || full)) out.push('linh');
  } else if (t === 1) out.push('mười');
  else out.push(D[t], 'mươi');
  if (u > 0) {
    if (u === 1 && t >= 2) out.push('mốt');
    else if (u === 5 && t >= 1) out.push('lăm');
    else if (u === 4 && t >= 2) out.push('tư');
    else out.push(D[u]);
  }
  return out.join(' ');
}

/** 1250500 → "Một triệu hai trăm năm mươi nghìn năm trăm đồng" */
export function toWords(amount: number): string {
  let n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Không đồng';
  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    parts.push(read3(g, i !== groups.length - 1));
    if (scales[i]) parts.push(scales[i]);
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  return (amount < 0 ? 'Âm ' : '') + s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

export const DENOM_STYLE: Record<number, { bg: string; fg: string }> = {
  500000: { bg: '#dff1fb', fg: '#0b5c86' },
  200000: { bg: '#fde9d9', fg: '#9a3b0a' },
  100000: { bg: '#dcf5e6', fg: '#16653a' },
  50000: { bg: '#fde4ee', fg: '#a3164d' },
  20000: { bg: '#e0eafd', fg: '#1d4fbf' },
  10000: { bg: '#fdf2d3', fg: '#8a5a00' },
  5000: { bg: '#e7e5fd', fg: '#4338ca' },
  2000: { bg: '#eceae6', fg: '#3f3a33' },
  1000: { bg: '#ecf9d8', fg: '#3f6212' },
  500: { bg: '#e6e9ef', fg: '#334155' },
};
