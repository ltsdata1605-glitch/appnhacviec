// Xuất kiểm quỹ: nội dung chữ để gửi Zalo và ảnh phiếu kiểm quỹ.
import { DENOMS, fmt, toWords } from './money';
import { stamp } from './time';
import type { CashCount } from './types';

export function cashText(c: Pick<CashCount, 'name' | 'counts' | 'other' | 'total' | 'sheets' | 'expected' | 'diff' | 'note' | 'createdByName' | 'storeCode'> & { createdAt?: number }): string {
  const lines: string[] = [];
  lines.push(`KIỂM QUỸ · ${c.name}`);
  lines.push(`Kho ${c.storeCode} · ${stamp(c.createdAt || Date.now()).slice(0, 16)} · ${c.createdByName}`);
  lines.push('');
  for (const d of DENOMS) {
    const n = c.counts[String(d)] || 0;
    if (n) lines.push(`${fmt(d)} × ${n} = ${fmt(d * n)}`);
  }
  if (c.other) lines.push(`Tiền khác: ${fmt(c.other)}`);
  lines.push('');
  lines.push(`TỔNG: ${fmt(c.total)} đ (${c.sheets} tờ)`);
  lines.push(toWords(c.total));
  if (c.expected !== null && c.expected !== undefined) {
    const diff = c.diff ?? c.total - c.expected;
    lines.push(`Theo sổ: ${fmt(c.expected)} · ${diff === 0 ? 'Khớp' : diff > 0 ? `Thừa ${fmt(diff)}` : `Thiếu ${fmt(-diff)}`}`);
  }
  if (c.note?.trim()) lines.push(`Ghi chú: ${c.note.trim()}`);
  return lines.join('\n');
}

export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Vẽ phiếu kiểm quỹ thành ảnh PNG */
export async function cashImage(c: Parameters<typeof cashText>[0] & { storeName?: string }): Promise<Blob> {
  const rows = DENOMS.filter((d) => c.counts[String(d)]).map((d) => [fmt(d), `× ${c.counts[String(d)]}`, fmt(d * c.counts[String(d)])]);
  if (c.other) rows.push(['Tiền khác', '', fmt(c.other)]);
  const W = 1080;
  const pad = 72;
  const rowH = 76;
  const noteLines = c.note?.trim() ? wrap(c.note.trim(), 34) : [];
  const H = 520 + rows.length * rowH + (c.expected !== null && c.expected !== undefined ? 90 : 0) + (noteLines.length ? 70 + noteLines.length * 48 : 0) + 120;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = '#f2f2f7';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(36, 36, W - 72, H - 72, 48);
  g.fill();
  let y = 120;
  g.fillStyle = '#2a83e9';
  g.font = font(700, 30);
  g.fillText('NHẮC VIỆC · KIỂM QUỸ', pad, y);
  y += 64;
  g.fillStyle = '#000';
  g.font = font(700, 52);
  g.fillText(c.name, pad, y, W - pad * 2);
  y += 50;
  g.fillStyle = '#6c6c70';
  g.font = font(500, 30);
  g.fillText(`${c.storeName || `Kho ${c.storeCode}`} · ${stamp(c.createdAt || Date.now()).slice(0, 16)} · ${c.createdByName}`, pad, y, W - pad * 2);
  y += 50;
  g.fillStyle = '#e5e5ea';
  g.fillRect(pad, y, W - pad * 2, 2);
  y += 30;
  for (const [a, b, t] of rows) {
    y += rowH;
    g.fillStyle = '#000';
    g.font = font(600, 38);
    g.fillText(a, pad, y - 22);
    g.fillStyle = '#6c6c70';
    g.font = font(500, 36);
    g.fillText(b, pad + 360, y - 22);
    g.fillStyle = '#000';
    g.font = font(600, 38);
    g.textAlign = 'right';
    g.fillText(t, W - pad, y - 22);
    g.textAlign = 'left';
  }
  y += 24;
  g.fillStyle = '#e5e5ea';
  g.fillRect(pad, y, W - pad * 2, 2);
  y += 86;
  g.fillStyle = '#000';
  g.font = font(700, 40);
  g.fillText(`Tổng · ${c.sheets} tờ`, pad, y);
  g.textAlign = 'right';
  g.fillStyle = '#1c74e3';
  g.font = font(800, 64);
  g.fillText(`${fmt(c.total)} đ`, W - pad, y + 6);
  g.textAlign = 'left';
  y += 56;
  g.fillStyle = '#6c6c70';
  g.font = font(500, 30);
  g.fillText(toWords(c.total), pad, y, W - pad * 2);
  if (c.expected !== null && c.expected !== undefined) {
    const diff = c.diff ?? c.total - c.expected;
    y += 70;
    g.fillStyle = '#000';
    g.font = font(500, 34);
    g.fillText(`Theo sổ: ${fmt(c.expected)}`, pad, y);
    g.textAlign = 'right';
    g.fillStyle = diff === 0 ? '#248a3d' : diff > 0 ? '#c93400' : '#d70015';
    g.font = font(700, 36);
    g.fillText(diff === 0 ? 'Khớp sổ' : diff > 0 ? `Thừa ${fmt(diff)}` : `Thiếu ${fmt(-diff)}`, W - pad, y);
    g.textAlign = 'left';
  }
  if (noteLines.length) {
    y += 70;
    g.fillStyle = '#6c6c70';
    g.font = font(600, 30);
    g.fillText('Ghi chú', pad, y);
    g.fillStyle = '#000';
    g.font = font(500, 34);
    for (const l of noteLines) {
      y += 48;
      g.fillText(l, pad, y, W - pad * 2);
    }
  }
  return await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if ((line + ' ' + w).trim().length > max) {
        if (line) out.push(line);
        line = w;
      } else line = (line + ' ' + w).trim();
    }
    out.push(line);
  }
  return out.slice(0, 8);
}

export async function shareImage(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'failed'> {
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
