// Xuất ảnh báo cáo khai thác / tổng kết để gửi nhóm Zalo.
export interface CardSection {
  title: string;
  rows: [string, string][]; // tên, giá trị
}

export interface CardData {
  kicker: string; // "BÁO CÁO KHAI THÁC"
  title: string; // người báo cáo hoặc tên kỳ
  subtitle: string; // kho · giờ
  hero: string; // "12,5 Tr"
  heroLabel: string; // "Doanh thu · 5 món"
  chips: string[]; // Trả góp, Mở Ví…
  sections: CardSection[];
  note?: string;
}

const FONT = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out.slice(0, 10);
}

/** Vẽ thẻ báo cáo dạng ảnh PNG, cao tự co theo nội dung */
export async function cardImage(d: CardData): Promise<Blob> {
  const W = 1080;
  const pad = 80;
  const inner = W - pad * 2;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `500 34px ${FONT}`;
  const noteLines = d.note?.trim() ? wrap(measure, d.note.trim(), inner) : [];
  const rowsH = d.sections.reduce((h, s) => h + 76 + s.rows.length * 62 + 24, 0);
  const H = 470 + (d.chips.length ? 86 : 0) + rowsH + (noteLines.length ? 80 + noteLines.length * 46 : 0) + 110;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px ${FONT}`;
  g.fillStyle = '#f2f2f7';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(36, 36, W - 72, H - 72, 48);
  g.fill();

  let y = 124;
  g.fillStyle = '#1c74e3';
  g.font = font(700, 30);
  g.fillText(d.kicker, pad, y);
  y += 62;
  g.fillStyle = '#000';
  g.font = font(700, 48);
  g.fillText(d.title, pad, y, inner);
  y += 48;
  g.fillStyle = '#6c6c70';
  g.font = font(500, 30);
  g.fillText(d.subtitle, pad, y, inner);
  y += 104;
  g.fillStyle = '#1c74e3';
  g.font = font(800, 92);
  g.fillText(d.hero, pad, y, inner);
  y += 50;
  g.fillStyle = '#6c6c70';
  g.font = font(600, 32);
  g.fillText(d.heroLabel, pad, y, inner);

  if (d.chips.length) {
    y += 36;
    let x = pad;
    g.font = font(700, 30);
    for (const c of d.chips) {
      const w = g.measureText(c).width + 44;
      g.fillStyle = 'rgba(52,199,89,0.16)';
      g.beginPath();
      g.roundRect(x, y, w, 56, 28);
      g.fill();
      g.fillStyle = '#248a3d';
      g.fillText(c, x + 22, y + 39);
      x += w + 14;
    }
    y += 50;
  }

  for (const s of d.sections) {
    y += 52;
    g.fillStyle = '#e5e5ea';
    g.fillRect(pad, y - 34, inner, 2);
    y += 24;
    g.fillStyle = '#6c6c70';
    g.font = font(700, 28);
    g.fillText(s.title.toUpperCase(), pad, y);
    for (const [a, b] of s.rows) {
      y += 62;
      g.fillStyle = '#000';
      g.font = font(500, 36);
      g.fillText(a, pad, y, inner - 260);
      g.font = font(700, 36);
      g.textAlign = 'right';
      g.fillText(b, W - pad, y);
      g.textAlign = 'left';
    }
    y += 24;
  }

  if (noteLines.length) {
    y += 56;
    g.fillStyle = '#6c6c70';
    g.font = font(700, 28);
    g.fillText('GHI CHÚ', pad, y);
    g.fillStyle = '#000';
    g.font = font(500, 34);
    for (const l of noteLines) {
      y += 46;
      g.fillText(l, pad, y, inner);
    }
  }
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}
