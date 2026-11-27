// Tải ảnh chụp lên song song: tối đa 2 ảnh cùng lúc (mỗi ảnh tải ảnh lớn rồi ảnh nhỏ).
// Không mở quá nhiều kết nối cùng lúc để việc tải ổn định trên mạng di động.
import { api } from './backend';
import type { Shot } from './image';
import type { Photo } from './types';

export async function uploadShots(shots: Shot[], baseOf: (shot: Shot, index: number) => string, onProgress?: (pct: number) => void): Promise<Photo[]> {
  const total = shots.length * 2;
  let done = 0;
  const tick = <T,>(v: T) => {
    done++;
    onProgress?.(Math.round((done / total) * 100));
    return v;
  };
  const one = async (sh: Shot, i: number): Promise<Photo> => {
    const base = baseOf(sh, i);
    const url = tick(await api().upload(`${base}.jpg`, sh.blob, 'image/jpeg'));
    const thumbUrl = tick(await api().upload(`${base}_t.jpg`, sh.thumb, 'image/jpeg'));
    return { url, thumbUrl, path: `${base}.jpg`, thumbPath: `${base}_t.jpg`, capturedAt: sh.capturedAt, hash: sh.hash, w: sh.w, h: sh.h };
  };
  const out: Photo[] = new Array(shots.length);
  let next = 0;
  const worker = async () => {
    while (next < shots.length) {
      const i = next++;
      out[i] = await one(shots[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, shots.length) }, worker));
  return out;
}
