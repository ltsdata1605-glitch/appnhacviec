import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Where } from '../lib/backend';
import { addDays, now, syncServerTime, vnDate } from '../lib/time';
import type { AppNotification, Area, AuthUser, Leave, Permissions, Post, Report, Rollcall, Store, Task, UserProfile } from '../lib/types';

export interface Session {
  ready: boolean;
  auth: AuthUser | null;
  profile: UserProfile | null;
  profileLoaded: boolean;
  isAdmin: boolean;
  storeCode: string | null; // kho đang xem
  setViewStore: (code: string | null) => void;
  store: Store | null;
  isManager: boolean;
  can: (p: keyof Permissions) => boolean;
}

const Ctx = createContext<Session | null>(null);

// Lưu tạm hồ sơ, quyền Admin và thông tin kho trên máy: mở app hiện giao diện ngay,
// dữ liệu thật từ máy chủ về sau sẽ tự cập nhật (thường dưới 1 giây).
interface SessionCache {
  profile: UserProfile | null;
  isAdmin: boolean;
  store: Store | null;
}
const cacheKey = (uid: string) => `nv-session-${uid}`;
function readCache(uid: string): SessionCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as SessionCache) : null;
  } catch {
    return null;
  }
}
function writeCache(uid: string, c: SessionCache) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(c));
  } catch {
    /* bỏ qua */
  }
}
function clearCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('nv-session-'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* bỏ qua */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewStore, setViewStore] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    syncServerTime();
    const id = window.setInterval(syncServerTime, 10 * 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let had = false;
    return api().onAuth((u) => {
      const cached = u ? readCache(u.uid) : null;
      if (!u && had) clearCaches(); // đăng xuất: xoá hồ sơ lưu tạm trên máy
      had = !!u;
      setAuth(u);
      setAuthReady(true);
      setViewStore(null);
      if (cached?.profile) {
        setProfile(cached.profile);
        setIsAdmin(cached.isAdmin);
        setStore(cached.store);
        setProfileLoaded(true);
      } else {
        setProfileLoaded(false);
        setProfile(null);
      }
    });
  }, []);

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!auth) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    api()
      .isAdmin(auth)
      .then((v) => alive && setIsAdmin(v));
    let timer = 0;
    const off = api().watchDoc<UserProfile>(
      'users',
      auth.uid,
      (p) => {
        setProfile(p);
        setProfileLoaded(true);
      },
      // Lỗi tạm thời (mất mạng, máy chủ bận): giữ nguyên hồ sơ đang có và thử lại sau 3 giây,
      // tránh đưa người dùng đã duyệt quay về màn hình đăng ký.
      () => {
        timer = window.setTimeout(() => alive && setRetry((n) => n + 1), 3000);
      },
    );
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
    };
  }, [auth, retry]);

  const active = profile?.status === 'active';
  const storeCode = (isAdmin && viewStore) || (active ? profile!.storeCode : null) || (isAdmin ? viewStore : null);

  useEffect(() => {
    if (!storeCode) {
      setStore(null);
      return;
    }
    // Giữ thông tin kho lưu tạm (nếu đúng kho) trong lúc chờ máy chủ
    setStore((cur) => (cur?.code === storeCode ? cur : null));
    return api().watchDoc<Store>('stores', storeCode, (x) => x && setStore(x));
  }, [storeCode]);

  // Ghi lại bản lưu tạm khi dữ liệu từ máy chủ thay đổi
  useEffect(() => {
    if (!auth || !profileLoaded) return;
    writeCache(auth.uid, { profile, isAdmin, store: store && profile && store.code === profile.storeCode ? store : null });
  }, [auth, profile, profileLoaded, isAdmin, store]);

  const value = useMemo<Session>(() => {
    const viewingOther = isAdmin && !!viewStore && viewStore !== profile?.storeCode;
    const isManager = isAdmin || (!!profile && active && profile.role === 'manager');
    return {
      ready: authReady,
      auth,
      profile,
      profileLoaded,
      isAdmin,
      storeCode,
      setViewStore,
      store,
      isManager: isManager || viewingOther,
      can: (p) => isManager || viewingOther || (!!profile && active && !!profile.permissions?.[p]),
    };
  }, [auth, authReady, profile, profileLoaded, isAdmin, storeCode, viewStore, store, active]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}

/** Đăng ký theo dõi một truy vấn; tự huỷ khi đổi điều kiện. */
export function useWatch<T>(col: string, where: Where[] | null, deps: unknown[] = []): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(where);
  useEffect(() => {
    if (!where) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return api().watch<T>(
      col,
      where,
      (d) => {
        setData(d);
        setLoading(false);
      },
      () => setLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, key, ...deps]);
  return { data, loading };
}

export function useDoc<T>(col: string, id: string | null | undefined): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return api().watchDoc<T>(col, id, (d) => {
      setData(d);
      setLoading(false);
    });
  }, [col, id]);
  return { data, loading };
}

// ---------------- Dữ liệu dùng chung của kho ----------------
export interface StoreData {
  members: UserProfile[]; // tất cả hồ sơ thuộc kho (kể cả chờ duyệt)
  active: UserProfile[];
  pending: UserProfile[];
  transfersIn: UserProfile[];
  areas: Area[];
  leaves: Leave[];
  tasks: Task[];
  reports: Report[]; // ~35 ngày gần nhất
  posts: Post[];
  rollcalls: Rollcall[];
  notifications: AppNotification[];
  loading: boolean;
  byUid: (uid?: string | null) => UserProfile | undefined;
  nameOf: (uid?: string | null) => string;
}

const DataCtx = createContext<StoreData | null>(null);

function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const m = new Map<string, T>();
  lists.forEach((l) => l.forEach((x) => m.set(x.id, x)));
  return [...m.values()];
}

export function StoreDataProvider({ children }: { children: ReactNode }) {
  const s = useSession();
  const code = s.storeCode;
  const uid = s.auth?.uid;
  const reviewer = s.can('review');
  const approver = s.can('approve');
  const since = useMemo(() => now() - 45 * 86400000, []);
  const sinceDate = useMemo(() => addDays(vnDate(), -40), []);
  const notifSince = useMemo(() => now() - 14 * 86400000, []);

  const members = useWatch<UserProfile>('users', code ? [['storeCode', '==', code]] : null);
  const transfers = useWatch<UserProfile>('users', code && approver ? [['transferTo', '==', code]] : null);
  const areas = useWatch<Area>('areas', code ? [['storeCode', '==', code]] : null);
  const leaves = useWatch<Leave>('leaves', code ? [['storeCode', '==', code], ['date', '>=', sinceDate]] : null);
  const allTasks = useWatch<Task>('tasks', code && s.isManager ? [['storeCode', '==', code], ['createdAt', '>=', since]] : null);
  const sharedTasks = useWatch<Task>('tasks', code && !s.isManager ? [['storeCode', '==', code], ['shared', '==', true], ['createdAt', '>=', since]] : null);
  const myTasks = useWatch<Task>('tasks', code && uid && !s.isManager ? [['storeCode', '==', code], ['assigneeUid', '==', uid], ['createdAt', '>=', since]] : null);
  const createdTasks = useWatch<Task>('tasks', code && uid && !s.isManager ? [['storeCode', '==', code], ['createdBy', '==', uid], ['createdAt', '>=', since]] : null);
  const allReports = useWatch<Report>('reports', code && reviewer ? [['storeCode', '==', code], ['date', '>=', sinceDate]] : null);
  const myReports = useWatch<Report>('reports', code && uid && !reviewer ? [['storeCode', '==', code], ['uid', '==', uid], ['date', '>=', sinceDate]] : null);
  const posts = useWatch<Post>('posts', code ? [['storeCode', '==', code]] : null);
  const rollcalls = useWatch<Rollcall>('rollcalls', code ? [['storeCode', '==', code], ['createdAt', '>=', since - 15 * 86400000]] : null);
  const notifications = useWatch<AppNotification>('notifications', uid ? [['uid', '==', uid], ['createdAt', '>=', notifSince]] : null, [uid]);

  const value = useMemo<StoreData>(() => {
    const list = members.data;
    const map = new Map(list.map((m) => [m.uid, m]));
    transfers.data.forEach((m) => map.set(m.uid, m));
    const tasks = s.isManager ? allTasks.data : mergeById(sharedTasks.data, myTasks.data, createdTasks.data);
    return {
      members: list,
      active: list.filter((m) => m.status === 'active').sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
      pending: list.filter((m) => m.status === 'pending'),
      transfersIn: transfers.data.filter((m) => m.transferTo === code),
      areas: areas.data.sort((a, b) => a.order - b.order),
      leaves: leaves.data,
      tasks,
      reports: reviewer ? allReports.data : myReports.data,
      posts: posts.data,
      rollcalls: rollcalls.data,
      notifications: notifications.data.sort((a, b) => b.createdAt - a.createdAt),
      // Đang tải lần đầu: hiện khung chờ thay cho "không có dữ liệu"
      loading:
        members.loading ||
        areas.loading ||
        (s.isManager ? allTasks.loading : sharedTasks.loading || myTasks.loading) ||
        (reviewer ? allReports.loading : myReports.loading) ||
        posts.loading ||
        rollcalls.loading,
      byUid: (id) => (id ? map.get(id) : undefined),
      nameOf: (id) => (id ? map.get(id)?.fullName || 'Không rõ' : ''),
    };
  }, [members, transfers, areas, leaves, allTasks, sharedTasks, myTasks, createdTasks, allReports, myReports, posts, rollcalls, notifications, s.isManager, reviewer, code]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useStoreData(): StoreData {
  const d = useContext(DataCtx);
  if (!d) throw new Error('StoreDataProvider missing');
  return d;
}
