// Âm thanh thông báo trong app — tổng hợp bằng Web Audio, mỗi mức độ một âm riêng.
//  - Thường: chuông 2 nốt nhẹ
//  - Ưu tiên cao: chuông 3 nốt đi lên, lặp 2 lần, to hơn
//  - Khẩn: chuông cảnh báo 2 tông xen kẽ, lặp đến khi người dùng bấm "Đã nhận"
// iPhone chỉ cho phát âm thanh sau khi người dùng đã chạm vào app ít nhất một lần.
import type { NotifyLevel } from './types';

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0..1
}

const KEY = 'nv-sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let alarmTimer = 0;
let alarmUntil = 0;

export function getSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { enabled: true, volume: 1, ...JSON.parse(raw) };
  } catch {
    /* bỏ qua */
  }
  return { enabled: true, volume: 1 };
}

export function setSoundSettings(s: SoundSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* bỏ qua */
  }
  if (master) master.gain.value = s.volume;
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  // Nén nhẹ để âm to rõ mà không rè
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = getSoundSettings().volume;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

/** Gọi trong sự kiện chạm đầu tiên để iPhone cho phép phát âm thanh. */
export function unlockAudio() {
  const c = audio();
  if (!c) return;
  try {
    // Âm báo ngắn: không làm dừng nhạc đang phát, vẫn phát khi gạt im lặng (Safari 17+)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'transient';
  } catch {
    /* trình duyệt không hỗ trợ */
  }
  if (c.state === 'suspended') c.resume().catch(() => {});
  const b = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = b;
  src.connect(c.destination);
  src.start(0);
}

export function installAudioUnlock() {
  const once = () => {
    unlockAudio();
    window.removeEventListener('touchend', once);
    window.removeEventListener('click', once);
  };
  window.addEventListener('touchend', once, { passive: true });
  window.addEventListener('click', once);
}

/** Một nốt chuông: âm cơ bản + hoạ âm, bao âm nhanh – tắt dần */
function bell(c: AudioContext, t: number, freq: number, dur: number, gain: number, wave: OscillatorType = 'sine') {
  const partials: [number, number][] = [
    [1, 1],
    [2, 0.35],
    [3.01, 0.12],
  ];
  for (const [mult, g] of partials) {
    const o = c.createOscillator();
    const env = c.createGain();
    o.type = mult === 1 ? wave : 'sine';
    o.frequency.setValueAtTime(freq * mult, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain * g, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur * (mult === 1 ? 1 : 0.6));
    o.connect(env).connect(master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

function pattern(level: NotifyLevel) {
  const c = audio();
  if (!c || !master) return 0;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  if (level === 'normal') {
    bell(c, t, 1318.5, 0.7, 0.55); // E6
    bell(c, t + 0.14, 1760, 0.9, 0.5); // A6
    return 1.1;
  }
  if (level === 'high') {
    for (const off of [0, 0.62]) {
      bell(c, t + off, 1046.5, 0.5, 0.8, 'triangle'); // C6
      bell(c, t + off + 0.11, 1318.5, 0.5, 0.8, 'triangle'); // E6
      bell(c, t + off + 0.22, 1568, 0.75, 0.85, 'triangle'); // G6
    }
    return 1.5;
  }
  // Khẩn: 4 cặp tông cao – thấp, dứt khoát
  for (let i = 0; i < 4; i++) {
    bell(c, t + i * 0.36, 1760, 0.17, 1, 'triangle');
    bell(c, t + i * 0.36 + 0.18, 1318.5, 0.17, 1, 'triangle');
  }
  return 1.5;
}

export function playSound(level: NotifyLevel, force = false) {
  const s = getSoundSettings();
  if (!force && (!s.enabled || document.visibilityState !== 'visible')) return;
  try {
    pattern(level);
    (window as unknown as { __nvSoundLog?: string[] }).__nvSoundLog?.push(level);
  } catch {
    /* thiết bị không hỗ trợ âm thanh */
  }
}

/** Chuông lặp cho việc khẩn — dừng khi gọi stopAlarm() hoặc sau tối đa 60 giây */
export function startAlarm() {
  stopAlarm();
  alarmUntil = Date.now() + 60000;
  const loop = () => {
    if (Date.now() > alarmUntil) return stopAlarm();
    playSound('urgent');
    alarmTimer = window.setTimeout(loop, 2600);
  };
  loop();
}

export function stopAlarm() {
  clearTimeout(alarmTimer);
  alarmTimer = 0;
}

export const LEVEL_LABEL: Record<NotifyLevel, string> = {
  normal: 'Thường',
  high: 'Ưu tiên cao',
  urgent: 'Khẩn',
};

export function levelOf(n: { level?: NotifyLevel; urgent?: boolean }): NotifyLevel {
  return n.level || (n.urgent ? 'urgent' : 'normal');
}
