import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  signInWithCredential,
} from 'firebase/auth';
import {
  arrayUnion,
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  deleteField,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query as fsQuery,
  setDoc,
  updateDoc,
  where as fsWhere,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseConfig, isFieldOp, vapidKey, type Backend, type Where } from './backend';
import type { AuthUser } from './types';
import { uid as randomId } from './text';

function translate(value: unknown): unknown {
  if (isFieldOp(value)) {
    if (value.__op === 'arrayUnion') return arrayUnion(...(value.items || []));
    if (value.__op === 'delete') return deleteField();
    if (value.__op === 'inc') return increment(value.n || 0);
  }
  return value;
}

function translateObj(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = translate(v);
  }
  return out;
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  // Bỏ các giá trị undefined (Firestore không nhận undefined)
  return JSON.parse(JSON.stringify(obj));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  (window.navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

/* iOS 26 (app thêm vào Màn hình chính): sau khi bật thông báo đẩy, WebKit có thể treo các giao dịch ghi IndexedDB
   hàng chục phút (WebKit bug 315804). Firebase Auth ghi phiên đăng nhập vào IndexedDB mỗi lần làm mới token (~1 giờ),
   Firestore ghi hàng đợi vào IndexedDB nếu bật bộ nhớ đệm bền → mọi thao tác lưu bị treo.
   Vì vậy app không dùng IndexedDB: phiên đăng nhập lưu ở localStorage, Firestore dùng bộ nhớ đệm trong RAM. */

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

/** Chuyển phiên đăng nhập cũ (đã lưu trong IndexedDB ở bản trước) sang localStorage — chỉ đọc, có giới hạn thời gian. */
async function migrateAuthFromIndexedDB(apiKey: string) {
  const key = `firebase:authUser:${apiKey}:[DEFAULT]`;
  try {
    if (localStorage.getItem(key) || localStorage.getItem('nv-auth-idb-checked') || !('indexedDB' in window)) return;
  } catch {
    return;
  }
  const read = new Promise<unknown>((resolve) => {
    try {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onupgradeneeded = () => req.transaction?.abort(); // chưa có CSDL → không tạo mới
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const get = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').get(key);
          get.onsuccess = () => resolve((get.result as { value?: unknown } | undefined)?.value ?? null);
          get.onerror = () => resolve(null);
        } catch {
          resolve(null);
        } finally {
          setTimeout(() => db.close(), 0);
        }
      };
    } catch {
      resolve(null);
    }
  });
  const value = await withTimeout(read, 900);
  try {
    if (value && value !== 'timeout') localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('nv-auth-idb-checked', '1');
  } catch {
    /* bỏ qua */
  }
}

export async function createFirebaseBackend(): Promise<Backend> {
  const app = initializeApp(firebaseConfig as Record<string, string>);
  await migrateAuthFromIndexedDB(String(firebaseConfig.apiKey || ''));
  // Không gắn trình xử lý chuyển hướng lúc khởi tạo: nếu gắn, mỗi lần mở app Firebase phải tải khung đăng nhập
  // ẩn và thư viện Google (chậm 1–3 giây trên mạng di động). Chỉ dùng khi đang đăng nhập bằng Google.
  const auth = initializeAuth(app, {
    persistence: [browserLocalPersistence],
  });
  auth.languageCode = 'vi';
  const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';
  if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });

  // Kết nối lại khi mở app từ nền (iPhone đóng băng kết nối khi app ở nền)
  let kicking: Promise<void> | null = null;
  const kick = () =>
    (kicking ||= disableNetwork(db)
      .then(() => enableNetwork(db))
      .catch(() => enableNetwork(db).catch(() => {}))
      .finally(() => {
        kicking = null;
      }));
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
      hiddenAt = 0;
      void kick();
    }
  });

  /** Chờ máy chủ xác nhận ghi; quá lâu thì kết nối lại một lần, vẫn không được thì báo lỗi để nút Lưu không quay mãi. */
  const confirmed = async (p: Promise<void>) => {
    p.catch(() => {}); // tránh lỗi "unhandled" khi đã báo hết giờ
    if ((await withTimeout(p, 9000)) !== 'timeout') return;
    void kick();
    if ((await withTimeout(p, 11000)) !== 'timeout') return;
    throw Object.assign(new Error('Máy chủ chưa xác nhận'), { code: 'timeout' });
  };
  const storage = getStorage(app);
  if (useEmulators) {
    // Chỉ dùng cho kiểm thử tự động trên Firebase Emulator — không có trong bản chạy thật.
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    (window as unknown as { __nvTestSignIn: (email: string, name: string) => Promise<unknown> }).__nvTestSignIn = (email, name) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
  }

  // Hoàn tất đăng nhập sau khi chuyển hướng (iPhone) — chỉ khi vừa bấm "Đăng nhập với Google"
  const REDIRECT_KEY = 'nv-auth-redirect';
  let redirectPending = false;
  try {
    redirectPending = sessionStorage.getItem(REDIRECT_KEY) === '1';
  } catch {
    /* bỏ qua */
  }
  const redirectDone: Promise<void> = redirectPending
    ? getRedirectResult(auth, browserPopupRedirectResolver)
        .then(() => undefined)
        .catch((e) => console.warn('redirect', e))
        .finally(() => {
          try {
            sessionStorage.removeItem(REDIRECT_KEY);
          } catch {
            /* bỏ qua */
          }
        })
    : Promise.resolve();

  const toUser = (u: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }): AuthUser => ({
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    photoURL: u.photoURL || undefined,
  });

  const buildQuery = (col: string, where: Where[]) =>
    fsQuery(collection(db, col), ...where.map(([f, op, v]) => fsWhere(f, op, v)));

  const mapDoc = <T,>(id: string, data: DocumentData) => ({ ...data, id }) as T;

  const backend: Backend = {
    mode: 'firebase',
    onAuth(cb) {
      // Đang quay về từ trang đăng nhập Google: chờ có kết quả rồi mới báo, tránh hiện màn đăng nhập thoáng qua
      let off: () => void = () => {};
      let cancelled = false;
      const start = () => {
        if (!cancelled) off = onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null));
      };
      if (redirectPending) void redirectDone.then(start);
      else start();
      return () => {
        cancelled = true;
        off();
      };
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (isIOS() || isStandalone()) {
        try {
          sessionStorage.setItem(REDIRECT_KEY, '1');
        } catch {
          /* bỏ qua */
        }
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      } else {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      }
    },
    async signOut() {
      await fbSignOut(auth);
    },
    async isAdmin(user) {
      if (!user.email) return false;
      try {
        const snap = await getDoc(doc(db, 'admins', user.email.toLowerCase()));
        return snap.exists();
      } catch {
        return false;
      }
    },
    watch(col, where, cb, onError) {
      return onSnapshot(
        buildQuery(col, where),
        (snap) => cb(snap.docs.map((d) => mapDoc(d.id, d.data()))),
        (e) => {
          console.warn('watch', col, where, e);
          onError?.(e);
        },
      );
    },
    watchDoc(col, id, cb, onError) {
      return onSnapshot(
        doc(db, col, id),
        (snap) => {
          // Chưa có mạng: "không tồn tại" lúc này chỉ là chưa biết — chờ máy chủ trả lời
          if (!snap.exists() && snap.metadata.fromCache) return;
          cb(snap.exists() ? mapDoc(snap.id, snap.data()) : null);
        },
        (e) => {
          console.warn('watchDoc', col, id, e);
          if (onError) onError(e);
          else cb(null);
        },
      );
    },
    async get(col, id) {
      const snap = await getDoc(doc(db, col, id));
      return snap.exists() ? mapDoc(snap.id, snap.data()) : null;
    },
    async query(col, where) {
      const snap = await getDocs(buildQuery(col, where));
      return snap.docs.map((d) => mapDoc(d.id, d.data()));
    },
    async set(col, id, data, merge) {
      await confirmed(setDoc(doc(db, col, id), translateObj(clean({ ...data, id })), { merge: !!merge }));
    },
    async update(col, id, patch) {
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        p[k] = isFieldOp(v) ? translate(v) : v && typeof v === 'object' ? clean(v as Record<string, unknown>) : v;
      }
      await confirmed(updateDoc(doc(db, col, id), p as DocumentData));
    },
    async remove(col, id) {
      await confirmed(deleteDoc(doc(db, col, id)));
    },
    async batch(ops) {
      const b = writeBatch(db);
      for (const op of ops) {
        const r = doc(db, op.col, op.id);
        if (op.type === 'set') b.set(r, translateObj(clean({ ...op.data, id: op.id })), { merge: !!op.merge });
        else if (op.type === 'update') {
          const p: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(op.data)) if (v !== undefined) p[k] = translate(v);
          b.update(r, p as DocumentData);
        } else b.delete(r);
      }
      await confirmed(b.commit());
    },
    newId() {
      return randomId(20);
    },
    async upload(path, blob, contentType) {
      const r = ref(storage, path);
      await uploadBytes(r, blob, { contentType, cacheControl: 'private, max-age=31536000' });
      return getDownloadURL(r);
    },
    async removeFile(path) {
      try {
        await deleteObject(ref(storage, path));
      } catch {
        /* đã xoá */
      }
    },
    pushStatus() {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
      return Notification.permission;
    },
    async enablePush(uid) {
      try {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported())) return 'unsupported';
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return 'denied';
        if (!vapidKey) return 'error';
        const reg = await navigator.serviceWorker.ready;
        const token = await withTimeout(getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg }), 20000);
        if (token === 'timeout') return 'error';
        if (!token) return 'error';
        await setDoc(
          doc(db, 'pushTokens', uid),
          { uid, tokens: arrayUnion(token), updatedAt: Date.now(), ua: navigator.userAgent.slice(0, 180) },
          { merge: true },
        );
        return 'granted';
      } catch (e) {
        console.warn('push', e);
        return 'error';
      }
    },
  };
  return backend;
}
