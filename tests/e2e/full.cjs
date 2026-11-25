/* Kiểm thử toàn bộ tính năng với nhiều vai trò trên Firebase Emulator.
 * Chạy: bash tests/e2e/run.sh
 * Vai trò: Admin (kiêm Quản lý kho 910), Quản lý kho 911, Nhân viên kho 910, PG Samsung kho 910, Nhân viên kho 911.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:4174';
const PROJECT = 'demo-nhacviec';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const NEAR = { latitude: 10.762622, longitude: 106.660172, accuracy: 15 };
const FAR = { latitude: 10.85, longitude: 106.78, accuracy: 15 }; // ~14 km
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SHOTS = process.env.SHOTS || '';

const results = [];
const problems = [];
let section = '';
const sec = (s) => {
  section = s;
  console.log(`\n■ ${s}`);
};
function check(name, ok, extra = '') {
  results.push({ section, name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function fsGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return r.ok ? r.json() : null;
}
async function fsSet(path, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }])) };
  await fetch(`${FS}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function fsQuery(collection, field, value) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }),
  });
  const j = await r.json();
  return j.filter((x) => x.document).map((x) => x.document);
}

const users = {};
async function main() {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  async function login(key, email, name) {
    const ctx = await browser.newContext({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      userAgent: UA,
      geolocation: NEAR,
      permissions: ['geolocation', 'camera'],
      timezoneId: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    });
    await ctx.addInitScript(() => localStorage.setItem('nv-install-dismissed', '1'));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`[${key}] lỗi trang: ${e.message}`));
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' || /permission|PERMISSION_DENIED|FirebaseError|index/i.test(t)) {
        if (/Failed to load resource|favicon|messaging|push/i.test(t)) return;
        problems.push(`[${key}] console ${m.type()}: ${t.slice(0, 240)}`);
      }
    });
    await page.goto(BASE);
    await page.waitForFunction(() => window.__nvTestSignIn, null, { timeout: 20000 });
    await page.evaluate(([e, n]) => window.__nvTestSignIn(e, n), [email, name]);
    users[key] = { ctx, page, email, name };
    return page;
  }

  // ---------- Tiện ích thao tác ----------
  // Chỉ thao tác trên màn hình đang hiện (màn hình bên dưới vẫn hiển thị một phần khi trượt)
  const notUnder = (sel) => sel.split(',').map((x) => `${x.trim()}:not(.screen[aria-hidden="true"] *)`).join(', ');
  const vis = (page, sel, text) => page.locator(notUnder(sel), text ? { hasText: text } : undefined).filter({ visible: true });
  const tap = async (page, sel, text) => {
    await vis(page, sel, text).first().click();
    await page.waitForTimeout(450);
  };
  const cell = (page, text) => tap(page, '.cell', text);
  const has = async (page, text, timeout = 6000) => {
    try {
      await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  };
  const hasNot = async (page, text, wait = 1500) => {
    await page.waitForTimeout(wait);
    return (await page.getByText(text, { exact: false }).filter({ visible: true }).count()) === 0;
  };
  const tab = async (page, label) => {
    await page.locator('nav.tabbar button', { hasText: label }).click();
    await page.waitForTimeout(600);
  };
  const back = async (page) => {
    await vis(page, '.glass-btn[aria-label="Quay lại"]').last().click();
    await page.waitForTimeout(600);
  };
  const action = async (page, text) => {
    await page.locator('.action-btn', { hasText: text }).first().click();
    await page.waitForTimeout(500);
  };
  const alertBtn = async (page, text) => {
    await page.locator('.alert .btn', { hasText: text }).first().click();
    await page.waitForTimeout(500);
  };
  const prompt = async (page, value, ok) => {
    await page.locator('.alert-input').fill(value);
    await alertBtn(page, ok);
  };
  const sheet = (page) => page.locator('.sheet').last();
  const sheetDone = async (page, label) => {
    const s = sheet(page);
    if (label) await s.locator('.sheet-head .glass-btn', { hasText: label }).click();
    else await s.locator('.sheet-head .glass-btn[aria-label="Xong"]').click();
    await page.waitForTimeout(800);
  };
  const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };

  async function register(page, roleDesc, code, name, store, chainLabel) {
    await page.locator('.cell', { hasText: roleDesc }).first().click();
    await page.waitForTimeout(400);
    await page.locator('.field input').nth(0).fill(code);
    await page.locator('.field input').nth(1).fill(name);
    await page.locator('.field input').nth(2).fill(store);
    await page.waitForTimeout(1500);
    if (chainLabel) await page.locator('.cell', { hasText: chainLabel }).first().click();
  }

  async function newTask(page, { title, scope, people = [], pick, each, approval }) {
    await tap(page, '.glass-btn[aria-label="Giao việc mới"]');
    const s = sheet(page);
    await s.locator('input[placeholder="Tiêu đề công việc"]').fill(title);
    if (scope && scope !== 'Cá nhân') await s.locator('.segmented button', { hasText: scope }).first().click();
    if (people.length) {
      await s.locator('.cell', { hasText: 'Nhân viên' }).first().click();
      await page.waitForTimeout(600);
      for (const p of people) await sheet(page).locator('.cell', { hasText: p }).first().click();
      await sheetDone(page);
    }
    if (pick) {
      await sheet(page).locator('.cell', { hasText: pick.cell }).first().click();
      await page.waitForTimeout(400);
      await action(page, pick.value);
    }
    if (each) await sheet(page).locator('.cell', { hasText: 'Từng người phải xác nhận' }).locator('input').check();
    if (approval) await sheet(page).locator('.cell', { hasText: 'Cần quản lý duyệt' }).locator('input').check();
    await sheetDone(page, 'Giao');
  }

  async function captureAndSend(page, { expectBlocked = false } = {}) {
    await page.locator('.camera .shutter').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.locator('.shutter').click();
    await page.waitForTimeout(700);
    await page.locator('.shutter').click();
    await page.waitForTimeout(700);
    await page.locator('.camera-top .glass-btn', { hasText: 'Tiếp' }).click();
    await page.waitForTimeout(1500);
    await page.locator('.section-head .action', { hasText: 'Đạt tất cả' }).click();
    await page.waitForTimeout(300);
    const btn = page.locator('.camera .bottom-bar .btn');
    if (expectBlocked) return btn;
    await btn.click();
    await page.waitForTimeout(2500);
    return btn;
  }

  // =====================================================================
  sec('1. Đăng ký và duyệt tài khoản');
  await fsSet('admins/admin.son@test.vn', { email: 'admin.son@test.vn' });

  const A = await login('Admin', 'admin.son@test.vn', 'MT2 - AM - SƠN');
  await register(A, 'Quản lý siêu thị', '21707', 'lê trường SƠn', '910', 'Điện Máy Xanh');
  check('Đăng ký Quản lý kho mới không còn ô "Tên siêu thị"', (await A.locator('input[placeholder="Ví dụ: ĐMX Quận 7"]').count()) === 0);
  check('Xem trước tên tự viết hoa: "Lê Trường Sơn"', await has(A, 'Lê Trường Sơn'));
  await tap(A, '.btn', 'Hoàn tất');
  check('Admin đăng ký Quản lý được duyệt ngay, vào Tổng quan', await has(A, 'Tổng quan', 10000));
  check('Kho 910 được tạo với tên tạm "Siêu thị 910"', await has(A, 'Siêu thị 910'));
  await shot(A, 'admin-overview');

  const B = await login('Quản lý 911', 'ql911@test.vn', 'Binh');
  await register(B, 'Quản lý siêu thị', 'binhtv', 'trần văn bình', '911', 'Thế Giới Di Động');
  await tap(B, '.btn', 'Gửi yêu cầu duyệt');
  check('Quản lý kho mới 911 chờ Admin duyệt', await has(B, 'Đang chờ duyệt'));

  const C = await login('Nhân viên 910', 'hoa@test.vn', 'Hoa');
  await register(C, 'Thu ngân, kho, tư vấn', 'hoant', 'nguyễn thị hoa', '910');
  await tap(C, '.btn', 'Gửi yêu cầu duyệt');
  check('Nhân viên đăng ký kho 910, chờ Quản lý duyệt', await has(C, 'Đang chờ duyệt'));

  const D = await login('PG 910', 'pg@test.vn', 'Ha');
  await register(D, 'Nhân viên hãng', 'samsung', 'phạm thu hà', '910');
  check('Hãng PG tự viết hoa: "Samsung"', await has(D, 'Samsung'));
  await tap(D, '.btn', 'Gửi yêu cầu duyệt');
  check('PG chờ duyệt', await has(D, 'Đang chờ duyệt'));

  const E = await login('Nhân viên 911', 'nv911@test.vn', 'Tuan');
  await register(E, 'Thu ngân, kho, tư vấn', 'tuanlm', 'lê minh tuấn', '911');
  check('Mã kho chưa kích hoạt (911 chưa duyệt) thì Nhân viên không gửi được', await has(E, 'Mã kho chưa được kích hoạt'));
  check('Nút gửi bị khoá', await E.locator('.btn', { hasText: 'Gửi yêu cầu duyệt' }).isDisabled());

  // Admin duyệt
  await tab(A, 'Nhân sự');
  check('Admin thấy Nhân viên và PG chờ duyệt', (await has(A, 'Nguyễn Thị Hoa')) && (await has(A, 'Phạm Thu Hà')));
  await cell(A, 'Quản trị hệ thống');
  check('Quản trị: thấy Quản lý kho 911 chờ duyệt', await has(A, 'Trần Văn Bình'));
  await cell(A, 'Trần Văn Bình');
  await action(A, 'Duyệt & tạo kho 911');
  await A.waitForTimeout(1500);
  check('Admin duyệt Quản lý → kho 911 được tạo', await has(A, '911 · Siêu thị 911'));
  await back(A);
  await cell(A, 'Nguyễn Thị Hoa');
  await action(A, 'Duyệt');
  await action(A, 'Kho');
  await A.waitForTimeout(800);
  await cell(A, 'Phạm Thu Hà');
  await action(A, 'Duyệt');
  await A.waitForTimeout(1200);
  check('Sau khi duyệt, Hoa vào nhóm Kho', await has(A, 'Kho'));
  check('Quản lý 911 vào được app', await has(B, 'Tổng quan', 10000));
  check('Nhân viên Hoa vào được app (Hôm nay)', await has(C, 'Hôm nay', 10000));
  check('PG Hà vào được app', await has(D, 'Hôm nay', 10000));
  const notesB = await fsQuery('notifications', 'uid', (await fsQuery('users', 'email', 'admin.son@test.vn'))[0].name.split('/').pop());
  check('Máy chủ báo Admin khi có Quản lý đăng ký (Cloud Function)', notesB.some((n) => /đăng ký mới/i.test(n.fields.title.stringValue)));

  // Nhân viên kho 911 đăng ký lại sau khi kho được tạo
  await E.locator('.field input').nth(2).fill('9111');
  await E.locator('.field input').nth(2).fill('911');
  await E.waitForTimeout(1500);
  await tap(E, '.btn', 'Gửi yêu cầu duyệt');
  check('Nhân viên kho 911 gửi được sau khi kho kích hoạt', await has(E, 'Đang chờ duyệt'));
  await tab(B, 'Nhân sự');
  await cell(B, 'Lê Minh Tuấn');
  await action(B, 'Duyệt');
  await action(B, 'Thu ngân');
  check('Quản lý 911 duyệt nhân viên kho mình', await has(E, 'Hôm nay', 10000));
  check('Quản lý 911 không thấy nhân viên kho 910', await hasNot(B, 'Nguyễn Thị Hoa'));

  // =====================================================================
  sec('2. Cài đặt siêu thị và khu vực 8NTTT');
  await cell(A, 'Cài đặt siêu thị');
  await cell(A, 'Chưa cài vị trí');
  await alertBtn(A, 'Dùng vị trí hiện tại');
  check('Lưu vị trí GPS siêu thị', await has(A, 'Đã cài vị trí', 8000));
  await back(A);
  await cell(A, 'Khu vực 8NTTT');
  await tap(A, '.btn', 'Thêm từ tiêu chí 8NTTT');
  await sheetDone(A, 'Thêm');
  await A.waitForTimeout(1200);
  check('Tạo khu vực từ bộ tiêu chí ĐMX (có Tivi, Tủ phone, Kho)', (await has(A, 'Tivi')) && (await has(A, 'Tủ phone')));
  await cell(A, 'Tivi');
  await cell(A, 'Người phụ trách');
  await sheet(A).locator('.cell', { hasText: 'Nguyễn Thị Hoa' }).click();
  await A.waitForTimeout(800);
  check('Giao khu vực Tivi cho Hoa', await has(A, 'Nguyễn Thị Hoa'));
  check('Tivi có 9 tiêu chí', await has(A, 'Tiêu chí (9)'));
  await back(A);
  await cell(A, 'Tủ phone');
  await cell(A, 'Người phụ trách');
  await sheet(A).locator('.cell', { hasText: 'Phạm Thu Hà' }).click();
  await A.waitForTimeout(800);
  await back(A);
  await back(A);

  // =====================================================================
  sec('3. Giao việc và phân quyền xem việc');
  await tab(A, 'Công việc');
  await newTask(A, { title: 'Kiểm kê kho cuối ngày', people: ['Nguyễn Thị Hoa'] });
  await newTask(A, { title: 'Nhận hàng chuyến 2', scope: 'Bộ phận', pick: { cell: 'Bộ phận', value: 'Kho' } });
  await newTask(A, { title: 'Thay POSM Galaxy', scope: 'Hãng', pick: { cell: 'PG hãng', value: 'Samsung' } });
  await newTask(A, { title: 'Đọc chính sách đổi trả', scope: 'Toàn ST', each: true });
  await newTask(A, { title: 'Báo cáo tồn kho tuần', people: ['Nguyễn Thị Hoa'], approval: true });
  check('Quản lý giao 5 việc (cá nhân, bộ phận, hãng, toàn siêu thị, cần duyệt)', await has(A, 'Báo cáo tồn kho tuần'));
  await shot(A, 'admin-tasks');

  await tab(C, 'Hôm nay');
  await C.reload();
  await C.waitForTimeout(2500);
  check('Hoa thấy việc cá nhân của mình', await has(C, 'Kiểm kê kho cuối ngày'));
  check('Hoa thấy việc bộ phận Kho', await has(C, 'Nhận hàng chuyến 2'));
  check('Hoa thấy việc toàn siêu thị', await has(C, 'Đọc chính sách đổi trả'));
  check('Hoa không thấy việc của PG Samsung trong mục cần làm', await hasNot(C, 'Thay POSM Galaxy'));
  await shot(C, 'staff-today');

  await D.reload();
  await D.waitForTimeout(2500);
  check('PG thấy việc của hãng Samsung', await has(D, 'Thay POSM Galaxy'));
  check('PG không thấy việc cá nhân của Hoa', await hasNot(D, 'Kiểm kê kho cuối ngày'));
  await tab(D, 'Công việc');
  await tap(D, '.segmented button', 'Toàn kho');
  check('PG xem được việc bộ phận Kho (mọi nhân viên kho đều thấy)', await has(D, 'Nhận hàng chuyến 2'));

  await tab(E, 'Công việc');
  await tap(E, '.segmented button', 'Toàn kho');
  check('Nhân viên kho 911 không thấy việc của kho 910', await hasNot(E, 'Nhận hàng chuyến 2'));
  await tab(B, 'Công việc');
  check('Quản lý kho 911 không thấy việc kho 910', await hasNot(B, 'Kiểm kê kho cuối ngày'));

  // Thông báo
  await tab(C, 'Hôm nay');
  await tap(C, '.glass-btn[aria-label="Thông báo"]');
  check('Hoa nhận thông báo "Việc mới" trong app', await has(C, 'Việc mới từ Lê Trường Sơn'));
  await sheet(C).locator('.glass-btn[aria-label="Đóng"]').click();
  await C.waitForTimeout(600);

  // Hoàn tất bằng vòng tròn
  await vis(C, '.cell', 'Kiểm kê kho cuối ngày').locator('.check').first().click();
  await C.waitForTimeout(1200);
  check('Hoa đánh dấu hoàn tất', await hasNot(C, 'Kiểm kê kho cuối ngày', 500));
  await tap(A, '.segmented button', 'Đã xong');
  check('Quản lý thấy việc đã xong', await has(A, 'Kiểm kê kho cuối ngày'));

  // Việc cần duyệt: hoàn tất → trả lại → làm lại → duyệt
  await vis(C, '.cell', 'Báo cáo tồn kho tuần').locator('.check').first().click();
  await C.waitForTimeout(1200);
  await tap(A, '.segmented button', 'Chờ duyệt');
  check('Việc cần duyệt vào mục Chờ duyệt', await has(A, 'Báo cáo tồn kho tuần'));
  await cell(A, 'Báo cáo tồn kho tuần');
  await tap(A, '.btn', 'Trả lại');
  await prompt(A, 'Thiếu số liệu tủ lạnh', 'Trả lại');
  check('Quản lý trả lại việc', await has(A, 'Bị trả lại'));
  await back(A);
  await C.waitForTimeout(800);
  check('Hoa thấy việc quay lại danh sách cần làm', await has(C, 'Báo cáo tồn kho tuần'));
  await cell(C, 'Báo cáo tồn kho tuần');
  check('Hoa thấy lý do trả lại trong dòng thời gian', await has(C, 'Thiếu số liệu tủ lạnh'));
  await tap(C, '.btn', 'Hoàn tất & gửi duyệt');
  await back(C);
  await tap(A, '.segmented button', 'Chờ duyệt');
  await cell(A, 'Báo cáo tồn kho tuần');
  await tap(A, '.btn', /^Duyệt$/);
  check('Quản lý duyệt hoàn tất', await has(A, 'Hoàn tất'));
  await back(A);

  // Từng người xác nhận + bình luận
  await cell(C, 'Đọc chính sách đổi trả');
  await tap(C, '.btn', 'Xác nhận đã hoàn tất');
  check('Hoa xác nhận việc toàn siêu thị', await has(C, 'Bạn đã xác nhận'));
  await back(C);
  await cell(C, 'Nhận hàng chuyến 2');
  await vis(C, 'input[placeholder="Viết bình luận"]').fill('Chuyến 2 trễ 30 phút');
  await tap(C, '.glass-btn[aria-label="Gửi"]');
  check('Hoa bình luận trong việc', await has(C, 'Chuyến 2 trễ 30 phút'));
  await back(C);
  await tap(A, '.segmented button', 'Đang làm');
  await cell(A, 'Đọc chính sách đổi trả');
  check('Quản lý thấy tiến độ xác nhận "Xác nhận 1/"', await has(A, 'Xác nhận 1/'));
  check('Quản lý thấy danh sách chưa xác nhận', await has(A, 'Chưa xác nhận'));
  await back(A);
  await cell(A, 'Nhận hàng chuyến 2');
  check('Quản lý đọc được bình luận', await has(A, 'Chuyến 2 trễ 30 phút'));
  check('Quản lý thấy ai đã xem', await has(A, 'đã xem'));
  await back(A);

  // =====================================================================
  sec('4. Báo cáo 8NTTT');
  await tab(C, 'Hôm nay');
  check('Hoa thấy thẻ báo cáo khu vực Tivi', await has(C, 'Tivi'));
  await tap(C, '.btn', 'Chụp báo cáo');
  await shot(C, 'camera');
  await captureAndSend(C);
  check('Hoa chụp trực tiếp và gửi báo cáo Tivi', await has(C, 'Chờ quản lý chấm', 8000));

  await tab(D, 'Hôm nay');
  await D.context().setGeolocation(FAR);
  await tap(D, '.btn', 'Chụp báo cáo');
  const btnD = await captureAndSend(D, { expectBlocked: true });
  await D.waitForTimeout(1500);
  check('PG ở xa siêu thị (~14 km) bị chặn gửi', (await btnD.isDisabled()) && (await has(D, 'Cách siêu thị')));
  await shot(D, 'gps-blocked');
  await D.context().setGeolocation(NEAR);
  await D.locator('.camera .btn', { hasText: 'Thử lại' }).first().click();
  await D.waitForTimeout(2000);
  await btnD.click();
  await D.waitForTimeout(2500);
  check('PG về lại siêu thị thì gửi được', await has(D, 'Chờ quản lý chấm', 8000));

  const rid = (await fsQuery('reports', 'areaName', 'Tivi'))[0];
  check('Ảnh được lưu lên Storage, có dấu giờ', !!rid && rid.fields.photos.arrayValue.values.length === 2);
  await A.waitForTimeout(3000);
  const rid2 = (await fsQuery('reports', 'areaName', 'Tivi'))[0];
  check('Máy chủ kiểm tra nghi vấn báo cáo (Cloud Function onReportWritten)', !!rid2 && 'suspect' in rid2.fields);

  await tab(A, 'Báo cáo');
  check('Quản lý thấy 2 báo cáo chờ chấm', await has(A, 'Chờ chấm 2'));
  await shot(A, 'admin-reports');
  await cell(A, 'Tivi');
  check('Quản lý xem ảnh và người gửi', await has(A, 'Nguyễn Thị Hoa'));
  await tap(A, '.btn', 'Không đạt');
  await sheet(A).locator('textarea').fill('Còn bụi kệ tivi, lau lại');
  await sheetDone(A, 'Gửi');
  check('Quản lý chấm Không đạt', await has(A, 'Không đạt'));
  await back(A);
  await C.waitForTimeout(1500);
  check('Hoa thấy yêu cầu chụp lại', await has(C, 'Chụp lại báo cáo'));
  await tap(C, '.btn', 'Chụp lại báo cáo');
  await captureAndSend(C);
  check('Hoa gửi lại báo cáo', await has(C, 'Chờ quản lý chấm', 8000));
  await cell(A, 'Tủ phone');
  await tap(A, '.btn', /^Đạt$/);
  check('Quản lý chấm Đạt', await has(A, 'Đã chấm Đạt'));
  await back(A);
  await tap(A, '.segmented button', 'Thống kê');
  check('Thống kê tháng hiển thị theo nhân viên', (await has(A, 'Theo nhân viên')) && (await has(A, 'Nguyễn Thị Hoa')));
  await shot(A, 'admin-stats');
  await tap(A, '.segmented button', 'Hôm nay');

  // =====================================================================
  sec('5. Thư viện siêu thị');
  await tab(A, 'Thư viện');
  await tap(A, '.glass-btn[aria-label="Đăng bài"]');
  await sheet(A).locator('input[placeholder="Tiêu đề"]').fill('Nội quy ca tối');
  await sheet(A).locator('textarea').first().fill('- Đóng cửa lúc 22h\n- Tắt đèn pha');
  await sheetDone(A, 'Đăng');
  check('Quản lý đăng bài yêu cầu xác nhận', await has(A, 'Nội quy ca tối'));
  await tab(C, 'Thư viện');
  check('Nhân viên thấy bài cần xác nhận', await has(C, 'Cần xác nhận đã đọc'));
  await cell(C, 'Nội quy ca tối');
  await tap(C, '.btn', 'Tôi đã đọc và hiểu');
  check('Nhân viên xác nhận đã đọc', await hasNot(C, 'Tôi đã đọc và hiểu', 800));
  await back(C);
  await cell(A, 'Nội quy ca tối');
  check('Quản lý thấy số người đã xác nhận', await has(A, 'Đã xác nhận 1/'));
  await back(A);
  await tab(E, 'Thư viện');
  check('Kho 911 không thấy bài của kho 910', await hasNot(E, 'Nội quy ca tối'));

  // =====================================================================
  sec('6. Quyền bổ sung, nghỉ phép, chuyển kho, vô hiệu hoá');
  await tab(A, 'Nhân sự');
  await cell(A, 'Nguyễn Thị Hoa');
  await A.locator('.cell', { hasText: 'Tạo và giao việc' }).locator('input').click();
  await A.waitForTimeout(1000);
  await back(A);
  await tab(C, 'Công việc');
  await C.waitForTimeout(1000);
  check('Cấp quyền giao việc → Hoa có nút giao việc', (await vis(C, '.glass-btn[aria-label="Giao việc mới"]').count()) > 0);
  await newTask(C, { title: 'Hỗ trợ trưng bày tủ phone', people: ['Phạm Thu Hà'] });
  await D.waitForTimeout(1500);
  await tab(D, 'Hôm nay');
  check('PG nhận việc do Hoa giao', await has(D, 'Hỗ trợ trưng bày tủ phone'));

  await tap(C, '.avatar-btn');
  await sheet(C).locator('.cell', { hasText: 'Xin nghỉ' }).click();
  await C.waitForTimeout(600);
  const tomorrow = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  await sheet(C).locator('.field input[type="date"]').nth(1).fill(tomorrow);
  await sheet(C).locator('.field input[type="date"]').nth(0).fill(tomorrow);
  await sheetDone(C, 'Gửi');
  await sheet(C).locator('.glass-btn[aria-label="Đóng"]').click().catch(() => {});
  await A.waitForTimeout(1200);
  check('Quản lý thấy đơn xin nghỉ', await has(A, 'xin nghỉ'));
  await cell(A, 'xin nghỉ');
  await action(A, 'Duyệt nghỉ');
  check('Quản lý duyệt nghỉ', await hasNot(A, 'Hoa xin nghỉ'));

  await D.reload();
  await D.waitForTimeout(2000);
  await tap(D, '.avatar-btn');
  await sheet(D).locator('.cell', { hasText: 'Chuyển kho' }).click();
  await prompt(D, '911', 'Gửi yêu cầu');
  check('PG gửi yêu cầu chuyển kho 911', await has(D, 'Chờ duyệt → 911'));
  await sheet(D).locator('.glass-btn[aria-label="Đóng"]').click();
  await tab(B, 'Nhân sự');
  await B.reload();
  await B.waitForTimeout(2500);
  await tab(B, 'Nhân sự');
  check('Quản lý kho 911 thấy yêu cầu chuyển kho', await has(B, 'Xin chuyển từ kho 910'));
  await cell(B, 'Phạm Thu Hà');
  await action(B, 'Nhận vào kho 911');
  await B.waitForTimeout(1500);
  check('Quản lý kho 911 nhận PG', await has(B, 'Phạm Thu Hà'));
  await D.reload();
  await D.waitForTimeout(3000);
  await tab(D, 'Công việc');
  await tap(D, '.segmented button', 'Toàn kho');
  check('PG sau khi chuyển không còn thấy việc kho 910', await hasNot(D, 'Nhận hàng chuyến 2'));
  await A.waitForTimeout(3000);
  await cell(A, 'Khu vực 8NTTT');
  const tp = vis(A, '.cell', 'Tủ phone').first();
  check('Máy chủ tự gỡ PG khỏi khu vực Tủ phone ở kho cũ', /Chưa phân công|Trống/.test(await tp.innerText()));
  await back(A);

  await cell(B, 'Lê Minh Tuấn');
  await tap(B, '.cell', 'Vô hiệu hoá');
  await alertBtn(B, 'Vô hiệu hoá');
  await E.waitForTimeout(1500);
  check('Vô hiệu hoá → nhân viên mất quyền truy cập', await has(E, 'Tài khoản đã bị vô hiệu hoá', 8000));

  // =====================================================================
  sec('7. Admin xem kho khác');
  await cell(A, 'Quản trị hệ thống');
  await cell(A, '911 · Siêu thị 911');
  await action(A, 'Xem kho này');
  await A.waitForTimeout(1500);
  await tab(A, 'Tổng quan');
  check('Admin xem Tổng quan kho 911', await has(A, 'Đang xem kho'));
  await shot(A, 'admin-view-911');
  await tap(A, '.btn', 'Thoát');
  check('Admin quay về kho của mình', await has(A, 'Siêu thị 910'));

  await browser.close();

  // ---------------- Tổng kết ----------------
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`\n==== KẾT QUẢ: ${pass}/${results.length} đạt ====`);
  if (fail.length) console.log('Chưa đạt:\n' + fail.map((f) => `  - [${f.section}] ${f.name}`).join('\n'));
  const uniq = [...new Set(problems)];
  console.log(`Lỗi/ cảnh báo từ trình duyệt: ${uniq.length}`);
  uniq.slice(0, 30).forEach((p) => console.log('  ! ' + p));
  process.exit(fail.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('DỪNG GIỮA CHỪNG:', e.message.split('\n').slice(0, 3).join(' | '));
  if (SHOTS) for (const [k, u] of Object.entries(users)) await u.page.screenshot({ path: `${SHOTS}/fail-${k.replace(/\s+/g, '_')}.png` }).catch(() => {});
  const pass = results.filter((r) => r.ok).length;
  console.log(`Đã chạy ${results.length} bước, ${pass} đạt trước khi dừng.`);
  [...new Set(problems)].slice(0, 20).forEach((p) => console.log('  ! ' + p));
  process.exit(2);
});
