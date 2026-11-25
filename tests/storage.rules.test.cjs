const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const { doc, setDoc } = require('firebase/firestore');
const { ref, uploadBytes, getBytes } = require('firebase/storage');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-nhacviec',
    firestore: { rules: fs.readFileSync(__dirname + '/../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync(__dirname + '/../storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/kho'), { uid: 'kho', status: 'active', storeCode: '1234', role: 'staff' });
    await setDoc(doc(db, 'users/mgr'), { uid: 'mgr', status: 'active', storeCode: '1234', role: 'manager' });
    await setDoc(doc(db, 'users/tn'), { uid: 'tn', status: 'active', storeCode: '1234', role: 'staff' });
    await setDoc(doc(db, 'users/mgr2'), { uid: 'mgr2', status: 'active', storeCode: '5678', role: 'manager' });
  });
  const st = (uid) => env.authenticatedContext(uid, { email: uid + '@gmail.com' }).storage();
  const jpg = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);
  const p = 'reports/1234/2026-11-25/a1/kho/1.jpg';
  let ok = 0, bad = 0;
  const t = async (n, pr) => { try { await pr; ok++; console.log('  ✓', n); } catch (e) { bad++; console.log('  ✗', n, e.message); } };
  await t('NV tải ảnh báo cáo của mình', assertSucceeds(uploadBytes(ref(st('kho'), p), jpg, { contentType: 'image/jpeg' })));
  await t('Không tải ảnh vào thư mục người khác', assertFails(uploadBytes(ref(st('tn'), p.replace('/kho/', '/tn2/')), jpg, { contentType: 'image/jpeg' })));
  await t('Không tải tệp không phải JPEG', assertFails(uploadBytes(ref(st('kho'), p.replace('1.jpg', '2.png')), jpg, { contentType: 'image/png' })));
  await t('QL xem ảnh', assertSucceeds(getBytes(ref(st('mgr'), p))));
  await t('NV khác không xem ảnh', assertFails(getBytes(ref(st('tn'), p))));
  await t('QL kho khác không xem ảnh', assertFails(getBytes(ref(st('mgr2'), p))));
  console.log(`${ok} đạt, ${bad} lỗi`);
  await env.cleanup();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
