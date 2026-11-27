// Xử lý ảnh trên máy: chụp khung hình, đóng dấu thời gian, nén, tạo dấu vân tay ảnh.

export interface Shot {
  blob: Blob;
  thumb: Blob;
  previewUrl: string;
  capturedAt: number;
  hash: string;
  w: number;
  h: number;
  quality?: number; // mức nén JPEG đã chọn
}

export interface StampInfo {
  time: string; // "25/11/2026 08:42:15"
  name: string;
  area: string;
  store: string;
  geo?: string; // "Cách siêu thị 35 m"
}

// Giữ nguyên độ phân giải camera (1920×1440). Đo trên 6 ảnh siêu thị thật (kệ hàng, quầy, kho):
// so với cách cũ (thu về 1600px, nén cố định 82%), ảnh mới nét hơn hoặc bằng (SSIM) mà nhẹ hơn.
const MAX_EDGE = 1920;
const THUMB_EDGE = 480;
/** Mức nén theo độ phức tạp ảnh (số byte/điểm ảnh khi nén thử ở 70%): ảnh đơn giản cần mức cao hơn để
 *  mảng màu trơn không bị vỡ khối; ảnh nhiều chi tiết (kệ hàng dày) giữ chi tiết tốt ở mức thấp hơn. */
const Q_CURVE: [number, number][] = [
  [0.05, 0.74],
  [0.09, 0.7],
  [0.15, 0.66],
  [0.19, 0.58],
];
const PROBE_Q = 0.7;
const Q_MIN = 0.56;
/** Trần dung lượng: ~445 KB cho ảnh 1920×1440 — ảnh quá nhiều chi tiết được nén thêm (không dưới Q_MIN) */
const MAX_BPP = 0.16;

function toBlob(canvas: HTMLCanvasElement, q = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/jpeg', q),
  );
}

function scaled(srcW: number, srcH: number, max: number) {
  const k = Math.min(1, max / Math.max(srcW, srcH));
  return { w: Math.round(srcW * k), h: Math.round(srcH * k) };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
}

/** Thu nhỏ chất lượng cao: giảm từng nửa khi ảnh gốc lớn hơn nhiều lần, tránh răng cưa và mất chi tiết. */
export function resample(src: CanvasImageSource, sw: number, sh: number, w: number, h: number): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= w * 1.05 && ch / 2 >= h * 1.05) {
    const nw = Math.round(cw / 2);
    const nh = Math.round(ch / 2);
    const { c, ctx } = makeCanvas(nw, nh);
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }
  const { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(cur, 0, 0, w, h);
  return c;
}

/** Nội suy tuyến tính trên đường cong mức nén */
export function qualityFor(bpp: number): number {
  if (bpp <= Q_CURVE[0][0]) return Q_CURVE[0][1];
  for (let i = 1; i < Q_CURVE.length; i++) {
    const [x1, y1] = Q_CURVE[i];
    if (bpp <= x1) {
      const [x0, y0] = Q_CURVE[i - 1];
      return Math.round((y0 + ((bpp - x0) / (x1 - x0)) * (y1 - y0)) * 100) / 100;
    }
  }
  return Q_CURVE[Q_CURVE.length - 1][1];
}

/**
 * Nén JPEG theo nội dung ảnh: nén thử ở 70% để đo độ phức tạp, chọn mức nén phù hợp,
 * rồi chặn trần dung lượng. Thường chỉ 2 lần nén (~0,1 giây).
 */
export async function encodeSmart(canvas: HTMLCanvasElement): Promise<{ blob: Blob; quality: number }> {
  const px = canvas.width * canvas.height;
  const probe = await toBlob(canvas, PROBE_Q);
  const q = qualityFor(probe.size / px);
  let out = { blob: probe, quality: PROBE_Q };
  if (Math.abs(q - PROBE_Q) >= 0.01) out = { blob: await toBlob(canvas, q), quality: q };
  if (out.blob.size > px * MAX_BPP && out.quality > Q_MIN) out = { blob: await toBlob(canvas, Q_MIN), quality: Q_MIN };
  return out;
}

async function thumbOf(canvas: HTMLCanvasElement): Promise<Blob> {
  const t = scaled(canvas.width, canvas.height, THUMB_EDGE);
  return toBlob(resample(canvas, canvas.width, canvas.height, t.w, t.h), 0.7);
}

/** dHash 16×16 (256 bit) — dùng để phát hiện ảnh trùng lặp gần như tuyệt đối */
function dhash(source: CanvasImageSource): string {
  const c = document.createElement('canvas');
  c.width = 17;
  c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, 17, 16);
  const px = ctx.getImageData(0, 0, 17, 16).data;
  const lum = (x: number, y: number) => {
    const i = (y * 17 + x) * 4;
    return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  };
  let bits = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += lum(x, y) > lum(x + 1, y) ? '1' : '0';
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, s: StampInfo) {
  const base = Math.max(14, Math.round(w / 38));
  const pad = Math.round(base * 0.8);
  const lines = [s.time, `${s.name} · ${s.area}`, `Kho ${s.store}${s.geo ? ` · ${s.geo}` : ''}`];
  const lh = Math.round(base * 1.35);
  const boxH = pad * 2 + lh * lines.length;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, h - boxH, w, boxH);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(base * 1.1) : base}px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(line, pad, h - boxH + pad + i * lh, w - pad * 2);
  });
  // Dấu nhận diện góc trên
  ctx.font = `600 ${Math.round(base * 0.8)}px -apple-system, "SF Pro Text", Arial, sans-serif`;
  const tag = 'Nhắc việc · Ảnh chụp trực tiếp';
  const tw = ctx.measureText(tag).width + pad * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const th = Math.round(base * 1.5);
  ctx.beginPath();
  ctx.roundRect(pad, pad, tw, th, th / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, pad + pad * 0.7, pad + th / 2);
}

/** Chụp một khung hình từ camera, đóng dấu và nén. */
export async function captureFrame(video: HTMLVideoElement, stampInfo: StampInfo, capturedAt: number): Promise<Shot> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('Camera chưa sẵn sàng');
  const { w, h } = scaled(vw, vh, MAX_EDGE);
  const canvas = resample(video, vw, vh, w, h);
  const ctx = canvas.getContext('2d')!;
  const hash = dhash(canvas); // tính trước khi đóng dấu để dấu thời gian không ảnh hưởng
  drawStamp(ctx, w, h, stampInfo);
  const { blob, quality } = await encodeSmart(canvas);
  const thumb = await thumbOf(canvas);
  return { blob, thumb, previewUrl: URL.createObjectURL(blob), capturedAt, hash, w, h, quality };
}

/**
 * Nén ảnh chọn từ máy (thư viện, điểm danh, ảnh chuẩn khu vực): xoay đúng chiều, thu nhỏ chất lượng cao,
 * nén thích ứng. Ảnh được mã hoá lại nên thông tin EXIF (vị trí GPS, đời máy) bị loại bỏ.
 */
export async function compressImageFile(file: File, max = MAX_EDGE): Promise<{ blob: Blob; thumb: Blob }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(file);
  }
  const { w, h } = scaled(bmp.width, bmp.height, max);
  const c = resample(bmp, bmp.width, bmp.height, w, h);
  bmp.close?.();
  const { blob } = await encodeSmart(c);
  return { blob, thumb: await thumbOf(c) };
}

// ---------- Ảnh mẫu cho chế độ xem thử ----------
const demoCache = new Map<string, string>();

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PALETTES: Record<string, string[]> = {
  TIVI: ['#1c1c1e', '#2c2c2e', '#3a3a3c'],
  TU_LANH: ['#d9dde2', '#c7ccd2', '#eef0f2'],
  MAY_GIAT: ['#e4e6e9', '#cfd3d8', '#b8bec6'],
  TU_PHONE: ['#2b2d31', '#5b6068', '#9aa0a8'],
  PHU_KIEN: ['#3d5a80', '#98c1d9', '#ee6c4d'],
  GIA_DUNG: ['#bc6c25', '#dda15e', '#606c38'],
  THU_NGAN: ['#6b705c', '#a5a58d', '#cb997e'],
  KHO: ['#a68a64', '#936639', '#7f4f24'],
  BAI_XE: ['#5c677d', '#7d8597', '#979dac'],
};

/** Vẽ ảnh mẫu dạng kệ trưng bày đơn giản để minh hoạ giao diện. */
export function demoPhoto(src: string): string {
  const cached = demoCache.get(src);
  if (cached) return cached;
  const parts = src.split(':');
  const key = parts.length >= 3 ? parts[2] : parts[1] || 'X';
  const isRef = parts[1] === 'ref';
  const seed = hashStr(src);
  const rnd = (() => {
    let s = seed || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const W = 600;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eceae6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8d4cd';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  const pal = PALETTES[key] || ['#8e9aaf', '#cbc0d3', '#efd3d7'];
  const shelves = 4;
  for (let i = 0; i < shelves; i++) {
    const y = 90 + i * 150;
    ctx.fillStyle = '#b9b2a6';
    ctx.fillRect(30, y + 110, W - 60, 10);
    let x = 40;
    while (x < W - 80) {
      const w = 50 + rnd() * 70;
      const h = 60 + rnd() * 45;
      ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
      ctx.beginPath();
      ctx.roundRect(x, y + 110 - h, Math.min(w, W - 40 - x), h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x + 6, y + 110 - 16, 26, 10);
      x += w + 10 + rnd() * 8;
    }
  }
  // ánh sáng
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, W, 60);
  if (!isRef && parts[3]) {
    const [y, m, d] = parts[3].split('-');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '700 20px -apple-system, Arial';
    ctx.fillText(`${d}/${m}/${y} ${(parts[5] || '08h30').replace('h', ':')}`, 16, H - 42);
    ctx.font = '500 15px -apple-system, Arial';
    ctx.fillText('Ảnh mẫu · Kho 1234', 16, H - 18);
  }
  const url = c.toDataURL('image/jpeg', 0.7);
  demoCache.set(src, url);
  return url;
}

export function resolveSrc(src?: string | null): string {
  if (!src) return '';
  if (src.startsWith('demo:')) return demoPhoto(src);
  return src;
}
