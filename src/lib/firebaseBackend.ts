import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query as fsQuery,
  setDoc,
  updateDoc,
  where as fsWhere,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
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

export async function createFirebaseBackend(): Promise<Backend> {
  const app = initializeApp(firebaseConfig as Record<string, string>);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  auth.languageCode = 'vi';
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  const storage = getStorage(app);

  // Hoàn tất đăng nhập sau khi chuyển hướng (iPhone)
  getRedirectResult(auth).catch((e) => console.warn('redirect', e));

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
      return onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null));
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (isIOS() || isStandalone()) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
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
    watchDoc(col, id, cb) {
      return onSnapshot(
        doc(db, col, id),
        (snap) => cb(snap.exists() ? mapDoc(snap.id, snap.data()) : null),
        (e) => {
          console.warn('watchDoc', col, id, e);
          cb(null);
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
      await setDoc(doc(db, col, id), translateObj(clean({ ...data, id })), { merge: !!merge });
    },
    async update(col, id, patch) {
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        p[k] = isFieldOp(v) ? translate(v) : v && typeof v === 'object' ? clean(v as Record<string, unknown>) : v;
      }
      await updateDoc(doc(db, col, id), p as DocumentData);
    },
    async remove(col, id) {
      await deleteDoc(doc(db, col, id));
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
      await b.commit();
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
        const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
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
