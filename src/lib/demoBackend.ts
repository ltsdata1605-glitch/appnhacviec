// Backend dữ liệu mẫu chạy hoàn toàn trên trình duyệt — dùng để xem thử giao diện khi chưa cấu hình Firebase.
import { isFieldOp, type Backend, type Where } from './backend';
import type { AuthUser } from './types';
import { uid as randomId } from './text';

type Doc = Record<string, unknown> & { id: string };
type Listener = { col: string; id?: string; where?: Where[]; cb: (v: unknown) => void };

const KEY = 'nv-demo-db-v3';
const AUTH_KEY = 'nv-demo-auth';

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (isFieldOp(value)) {
    if (value.__op === 'delete') delete o[last];
    else if (value.__op === 'arrayUnion') {
      const arr = Array.isArray(o[last]) ? [...(o[last] as unknown[])] : [];
      for (const it of value.items || []) if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(it))) arr.push(it);
      o[last] = arr;
    } else if (value.__op === 'inc') o[last] = ((o[last] as number) || 0) + (value.n || 0);
  } else o[last] = value;
}

function match(d: Doc, where: Where[]): boolean {
  return where.every(([f, op, v]) => {
    const x = getPath(d, f) as never;
    switch (op) {
      case '==':
        return x === v || (v === null && x === undefined);
      case 'in':
        return (v as unknown[]).includes(x);
      case '>=':
        return x >= (v as never);
      case '<=':
        return x <= (v as never);
      case '>':
        return x > (v as never);
      case '<':
        return x < (v as never);
      case 'array-contains':
        return Array.isArray(x) && (x as unknown[]).includes(v);
    }
  });
}

export async function createDemoBackend(): Promise<Backend> {
  let store: Record<string, Record<string, Doc>> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) store = JSON.parse(raw);
  } catch {
    store = {};
  }
  if (!store.users) {
    const { seedDemo } = await import('./demoSeed');
    store = seedDemo();
  }

  const listeners = new Set<Listener>();
  const authListeners = new Set<(u: AuthUser | null) => void>();
  let saveTimer = 0;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(store));
      } catch {
        /* vượt dung lượng — chỉ giữ trong bộ nhớ */
      }
    }, 300);
  };

  const colOf = (c: string) => (store[c] ||= {});
  const snapshot = (c: string, where: Where[]) =>
    Object.values(colOf(c))
      .filter((d) => match(d, where))
      .map((d) => structuredClone(d));

  const emit = (col: string) => {
    queueMicrotask(() => {
      listeners.forEach((l) => {
        if (l.col !== col) return;
        if (l.id) l.cb(colOf(col)[l.id] ? structuredClone(colOf(col)[l.id]) : null);
        else l.cb(snapshot(col, l.where || []));
      });
    });
    persist();
  };

  const currentAuth = (): AuthUser | null => {
    try {
      const id = localStorage.getItem(AUTH_KEY);
      if (!id) return null;
      const u = colOf('users')[id] as unknown as { uid: string; email: string; fullName: string; photoURL?: string } | undefined;
      const acc = colOf('_accounts')[id] as unknown as AuthUser | undefined;
      if (acc) return acc;
      if (!u) return null;
      return { uid: u.uid, email: u.email, displayName: u.fullName, photoURL: u.photoURL };
    } catch {
      return null;
    }
  };

  const doSet = (col: string, id: string, data: Record<string, unknown>, merge?: boolean) => {
    const c = colOf(col);
    const base: Doc = merge && c[id] ? structuredClone(c[id]) : { id };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) setPath(base, k, v);
    base.id = id;
    c[id] = base;
  };
  const doUpdate = (col: string, id: string, patch: Record<string, unknown>) => {
    const c = colOf(col);
    if (!c[id]) throw new Error('Không tìm thấy dữ liệu');
    const d = structuredClone(c[id]);
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) setPath(d, k, v);
    c[id] = d;
  };

  const backend: Backend = {
    mode: 'demo',
    onAuth(cb) {
      authListeners.add(cb);
      queueMicrotask(() => cb(currentAuth()));
      return () => authListeners.delete(cb);
    },
    async signIn(opts) {
      if (!opts?.demoUid) return;
      localStorage.setItem(AUTH_KEY, opts.demoUid);
      const u = currentAuth();
      authListeners.forEach((cb) => cb(u));
    },
    async signOut() {
      localStorage.removeItem(AUTH_KEY);
      authListeners.forEach((cb) => cb(null));
    },
    async isAdmin(user) {
      return !!colOf('admins')[user.email.toLowerCase()];
    },
    watch(col, where, cb) {
      const l: Listener = { col, where, cb: cb as (v: unknown) => void };
      listeners.add(l);
      queueMicrotask(() => cb(snapshot(col, where) as never));
      return () => listeners.delete(l);
    },
    watchDoc(col, id, cb) {
      const l: Listener = { col, id, cb: cb as (v: unknown) => void };
      listeners.add(l);
      queueMicrotask(() => cb((colOf(col)[id] ? structuredClone(colOf(col)[id]) : null) as never));
      return () => listeners.delete(l);
    },
    async get(col, id) {
      return (colOf(col)[id] ? structuredClone(colOf(col)[id]) : null) as never;
    },
    async query(col, where) {
      return snapshot(col, where) as never;
    },
    async set(col, id, data, merge) {
      doSet(col, id, data, merge);
      emit(col);
    },
    async update(col, id, patch) {
      doUpdate(col, id, patch);
      emit(col);
    },
    async remove(col, id) {
      delete colOf(col)[id];
      emit(col);
    },
    async batch(ops) {
      const touched = new Set<string>();
      for (const op of ops) {
        if (op.type === 'set') doSet(op.col, op.id, op.data, op.merge);
        else if (op.type === 'update') doUpdate(op.col, op.id, op.data);
        else delete colOf(op.col)[op.id];
        touched.add(op.col);
      }
      touched.forEach(emit);
    },
    newId() {
      return randomId(20);
    },
    async upload(_path, blob) {
      // Ảnh chụp thật được giữ dạng data URL (chỉ trong máy này)
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    },
    async removeFile() {},
    pushStatus() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },
    async enablePush() {
      if (!('Notification' in window)) return 'unsupported';
      const p = await Notification.requestPermission();
      return p === 'granted' ? 'granted' : 'denied';
    },
  };
  return backend;
}

export function resetDemo() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(AUTH_KEY);
}
