// Chuẩn hoá chữ: viết hoa chữ cái đầu mỗi từ, bỏ khoảng trắng thừa.
export function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function titleCase(s: string): string {
  return collapse(s)
    .toLocaleLowerCase('vi-VN')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('vi-VN') + w.slice(1) : w))
    .join(' ');
}

/** User / Hãng: viết hoa chữ cái đầu, giữ nguyên phần còn lại nếu người dùng đã viết hoa có chủ đích (vd "LG", "TCL"). */
export function capitalizeCode(s: string): string {
  const c = collapse(s);
  if (!c) return c;
  // Từ viết tắt toàn chữ hoa ngắn (LG, TCL, JBL) giữ nguyên
  return c
    .split(' ')
    .map((w) => {
      if (w.length <= 4 && w === w.toLocaleUpperCase('vi-VN') && /[A-Z]/.test(w)) return w;
      return w.charAt(0).toLocaleUpperCase('vi-VN') + w.slice(1).toLocaleLowerCase('vi-VN');
    })
    .join(' ');
}

export function storeCodeOf(s: string): string {
  return collapse(s).replace(/\s/g, '').toUpperCase();
}

export function initials(name: string): string {
  const parts = collapse(name).split(' ').filter(Boolean);
  if (!parts.length) return '?';
  const last = parts[parts.length - 1];
  const first = parts.length > 1 ? parts[0] : '';
  return (first.charAt(0) + last.charAt(0)).toLocaleUpperCase('vi-VN') || last.charAt(0).toUpperCase();
}

/** Tên ngắn: "Nguyễn Văn An" → "An" (người Việt gọi theo tên) */
export function shortName(name: string): string {
  const parts = collapse(name).split(' ');
  return parts[parts.length - 1] || name;
}

export function strip(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function matches(hay: string, needle: string): boolean {
  if (!needle) return true;
  return strip(hay).includes(strip(needle));
}

export function uid(len = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function plural(n: number, unit: string): string {
  return `${n} ${unit}`;
}
