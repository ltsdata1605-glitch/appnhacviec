import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Where } from '../lib/backend';
import { addDays, now, syncServerTime, vnDate } from '../lib/time';
import type { AppNotification, Area, AuthUser, Leave, Permissions, Post, Report, Store, Task, UserProfile } from '../lib/types';

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

  useEffect(
    () =>
      api().onAuth((u) => {
        setAuth(u);
        setAuthReady(true);
        setProfileLoaded(false);
        setProfile(null);
        setViewStore(null);
      }),
    [],
  );

  useEffect(() => {
    if (!auth) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    api()
      .isAdmin(auth)
      .then((v) => alive && setIsAdmin(v));
    const off = api().watchDoc<UserProfile>('users', auth.uid, (p) => {
      setProfile(p);
      setProfileLoaded(true);
    });
    return () => {
      alive = false;
      off();
    };
  }, [auth]);

  const active = profile?.status === 'active';
  const storeCode = (isAdmin && viewStore) || (active ? profile!.storeCode : null) || (isAdmin ? viewStore : null);

  useEffect(() => {
    if (!storeCode) {
      setStore(null);
      return;
    }
    return api().watchDoc<Store>('stores', storeCode, setStore);
  }, [storeCode]);

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
  const assigner = s.can('assign');
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
  const createdTasks = useWatch<Task>('tasks', code && uid && !s.isManager && assigner ? [['storeCode', '==', code], ['createdBy', '==', uid], ['createdAt', '>=', since]] : null);
  const allReports = useWatch<Report>('reports', code && reviewer ? [['storeCode', '==', code], ['date', '>=', sinceDate]] : null);
  const myReports = useWatch<Report>('reports', code && uid && !reviewer ? [['storeCode', '==', code], ['uid', '==', uid], ['date', '>=', sinceDate]] : null);
  const posts = useWatch<Post>('posts', code ? [['storeCode', '==', code]] : null);
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
      notifications: notifications.data.sort((a, b) => b.createdAt - a.createdAt),
      loading: members.loading || areas.loading,
      byUid: (id) => (id ? map.get(id) : undefined),
      nameOf: (id) => (id ? map.get(id)?.fullName || 'Không rõ' : ''),
    };
  }, [members, transfers, areas, leaves, allTasks, sharedTasks, myTasks, createdTasks, allReports, myReports, posts, notifications, s.isManager, reviewer, code]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useStoreData(): StoreData {
  const d = useContext(DataCtx);
  if (!d) throw new Error('StoreDataProvider missing');
  return d;
}
