// Tải ảnh chụp lên song song (tối đa 3 ảnh cùng lúc, ảnh lớn và ảnh nhỏ đi cùng nhau) thay vì lần lượt từng tệp.
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
    const [url, thumbUrl] = await Promise.all([
      api().upload(`${base}.jpg`, sh.blob, 'image/jpeg').then(tick),
      api().upload(`${base}_t.jpg`, sh.thumb, 'image/jpeg').then(tick),
    ]);
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
  await Promise.all(Array.from({ length: Math.min(3, shots.length) }, worker));
  return out;
}
