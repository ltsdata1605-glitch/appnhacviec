import { useState } from 'react';
import { api } from '../../lib/backend';
import { useUI } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { Group, Section, Cell } from '../../ui/controls';
import { APP_NAME } from '../../lib/constants';
import { InstallGuide, isIOS, isStandalone } from '../shared';

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginScreen() {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const demo = api().mode === 'demo';

  const signIn = async () => {
    setBusy(true);
    try {
      await api().signIn();
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (!/popup-closed|cancelled/i.test(msg)) ui.alert({ title: 'Không đăng nhập được', message: 'Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="app-frame" style={{ overflowY: 'auto', height: '100%' }}>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 'calc(var(--safe-top) + 40px) 0 calc(var(--safe-bottom) + 24px)' }}>
          <div className="center" style={{ padding: '24px 32px 0', flex: demo ? 'none' : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="app-icon" style={{ width: 96, height: 96, margin: '0 auto' }}>
              <Icon name="bell" size={56} stroke={1.9} />
            </span>
            <div className="t-large" style={{ marginTop: 24 }}>
              {APP_NAME}
            </div>
            <div className="t-callout c2" style={{ marginTop: 8 }}>
              Giao việc, nhắc việc và báo cáo 8NTTT
              <br />
              cho đội ngũ siêu thị
            </div>
          </div>

          {demo ? (
            <DemoPersonas />
          ) : (
            <div style={{ padding: '32px 24px 0' }}>
              <button className="btn block dark" onClick={signIn} disabled={busy} style={{ gap: 10 }}>
                {busy ? <span className="spinner" style={{ borderTopColor: 'var(--bg-2)' }} /> : <GoogleG />}
                Tiếp tục với Google
              </button>
              <div className="t-foot c2 center" style={{ marginTop: 14, padding: '0 12px' }}>
                Dùng tài khoản Google cá nhân. Lần đầu đăng nhập, bạn sẽ khai báo chức vụ và mã kho để quản lý duyệt.
              </div>
            </div>
          )}

          {isIOS() && !isStandalone() && (
            <div className="center" style={{ marginTop: 18 }}>
              <button className="btn plain sm" onClick={() => ui.sheet((c) => <InstallGuide close={c} />)}>
                <Icon name="plusSquare" size={18} />
                Cài app lên iPhone
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoPersonas() {
  const [list, setList] = useState<typeof import('../../lib/demoSeed').DEMO_PERSONAS | null>(null);
  if (!list) import('../../lib/demoSeed').then((m) => setList(m.DEMO_PERSONAS));
  return (
    <div style={{ marginTop: 28 }}>
      <Section title="Xem thử với vai trò" small footer="Đây là bản xem thử với dữ liệu mẫu, chỉ lưu trên máy này. Khi kết nối Firebase, mọi người đăng nhập bằng Google.">
        <Group>
          {(list || []).map((p) => (
            <Cell
              key={p.uid}
              icon={p.uid === 'u-quan' ? 'shieldCheck' : p.uid === 'u-tram' ? 'tag' : p.uid === 'u-new' ? 'personPlus' : 'person'}
              iconColor={p.uid === 'u-quan' ? 'indigo' : p.uid === 'u-tram' ? 'pink' : p.uid === 'u-new' ? 'gray' : 'blue'}
              title={p.label}
              sub={p.desc}
              chevron
              onClick={() => api().signIn({ demoUid: p.uid })}
            />
          ))}
        </Group>
      </Section>
    </div>
  );
}
