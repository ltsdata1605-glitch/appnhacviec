// Lớp truy cập dữ liệu chung. Có 2 bản cài đặt:
//  - firebase: dữ liệu thật (Firestore, Storage, Auth, Cloud Messaging)
//  - demo: dữ liệu mẫu chạy hoàn toàn trên máy để xem thử giao diện khi chưa cấu hình Firebase
import type { AuthUser } from './types';

export type Op = '==' | 'in' | '>=' | '<=' | '>' | '<' | 'array-contains';
export type Where = [string, Op, unknown];

export interface FieldOpValue {
  __op: 'arrayUnion' | 'delete' | 'inc';
  items?: unknown[];
  n?: number;
}

export const F = {
  arrayUnion: (...items: unknown[]): FieldOpValue => ({ __op: 'arrayUnion', items }),
  del: (): FieldOpValue => ({ __op: 'delete' }),
  inc: (n: number): FieldOpValue => ({ __op: 'inc', n }),
};

export function isFieldOp(v: unknown): v is FieldOpValue {
  return !!v && typeof v === 'object' && '__op' in (v as object);
}

export type BatchOp =
  | { type: 'set'; col: string; id: string; data: Record<string, unknown>; merge?: boolean }
  | { type: 'update'; col: string; id: string; data: Record<string, unknown> }
  | { type: 'delete'; col: string; id: string };

export type PushResult = 'granted' | 'denied' | 'unsupported' | 'error';

export interface Backend {
  mode: 'firebase' | 'demo';
  onAuth(cb: (u: AuthUser | null) => void): () => void;
  signIn(opts?: { demoUid?: string }): Promise<void>;
  signOut(): Promise<void>;
  isAdmin(user: AuthUser): Promise<boolean>;

  watch<T>(col: string, where: Where[], cb: (docs: T[]) => void, onError?: (e: Error) => void): () => void;
  watchDoc<T>(col: string, id: string, cb: (doc: T | null) => void): () => void;
  get<T>(col: string, id: string): Promise<T | null>;
  query<T>(col: string, where: Where[]): Promise<T[]>;
  set(col: string, id: string, data: Record<string, unknown>, merge?: boolean): Promise<void>;
  update(col: string, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  batch(ops: BatchOp[]): Promise<void>;
  newId(): string;

  upload(path: string, blob: Blob, contentType: string): Promise<string>;
  removeFile(path: string): Promise<void>;

  enablePush(uid: string): Promise<PushResult>;
  pushStatus(): 'granted' | 'denied' | 'default' | 'unsupported';
}

let current: Backend | null = null;

export function setBackend(b: Backend) {
  current = b;
}

export function api(): Backend {
  if (!current) throw new Error('Backend chưa khởi tạo');
  return current;
}

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export function hasFirebaseConfig(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export function wantsDemo(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('demo') === '1') localStorage.setItem('nv-demo', '1');
    if (q.get('demo') === '0') localStorage.removeItem('nv-demo');
    return !hasFirebaseConfig() || localStorage.getItem('nv-demo') === '1';
  } catch {
    return !hasFirebaseConfig();
  }
}

export async function initBackend(): Promise<Backend> {
  if (wantsDemo()) {
    const { createDemoBackend } = await import('./demoBackend');
    const b = await createDemoBackend();
    setBackend(b);
    return b;
  }
  const { createFirebaseBackend } = await import('./firebaseBackend');
  const b = await createFirebaseBackend();
  setBackend(b);
  return b;
}
