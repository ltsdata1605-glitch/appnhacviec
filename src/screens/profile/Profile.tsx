import { useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Avatar, Cell, Group, Pill, Section } from '../../ui/controls';
import { api } from '../../lib/backend';
import { addLeave, cancelTransfer, requestTransfer } from '../../lib/actions';
import { APP_NAME } from '../../lib/constants';
import { CHAIN_LABEL } from '../../lib/criteria';
import { InstallGuide, isIOS, isStandalone, roleLine, useActor } from '../shared';
import { LeaveSheet } from '../people/Leaves';

export function ProfileSheet({ close }: { close: () => void }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const p = s.profile;
  const [push, setPush] = useState(() => api().pushStatus());
  const viewingOther = s.isAdmin && p && s.storeCode !== p.storeCode;

  const enablePush = async () => {
    if (isIOS() && !isStandalone()) {
      ui.sheet((c) => <InstallGuide close={c} />);
      return;
    }
    const r = await api().enablePush(s.auth!.uid);
    setPush(api().pushStatus());
    if (r === 'granted') ui.toast({ text: 'Đã bật thông báo', icon: 'bell', color: 'green' });
    else if (r === 'denied') ui.alert({ title: 'Thông báo đang tắt', message: 'Vào Cài đặt › Thông báo › Nhắc việc để bật lại.' });
    else if (r === 'unsupported') ui.alert({ title: 'Chưa hỗ trợ', message: 'Hãy thêm app vào Màn hình chính rồi mở từ biểu tượng app.' });
    else ui.alert({ title: 'Chưa bật được', message: 'Thử lại sau ít phút.' });
  };

  const transfer = async () => {
    if (!p) return;
    if (p.transferTo) {
      if (await ui.confirm(`Huỷ yêu cầu chuyển sang kho ${p.transferTo}?`, undefined, 'Huỷ yêu cầu', true)) await cancelTransfer(p);
      return;
    }
    const code = await ui.prompt('Chuyển kho', p.role === 'manager' ? 'Admin sẽ duyệt yêu cầu chuyển kho của quản lý.' : 'Quản lý kho mới sẽ duyệt yêu cầu của bạn.', 'Mã kho mới', 'Gửi yêu cầu');
    if (!code?.trim()) return;
    try {
      await requestTransfer(p, code);
      ui.toast({ text: 'Đã gửi yêu cầu chuyển kho', icon: 'transfer', color: 'blue' });
    } catch (e) {
      ui.alert({ title: 'Chưa gửi được', message: (e as Error).message });
    }
  };

  const managers = d.active.filter((m) => m.role === 'manager' || m.permissions?.approve).map((m) => m.uid);

  return (
    <>
      <SheetHead title="Tài khoản" onCancel={close} />
      <div className="sheet-body">
        <div className="center" style={{ padding: '4px 20px 0' }}>
          <div style={{ display: 'inline-block' }}>
            <Avatar name={p?.fullName || s.auth?.displayName || '?'} src={p?.photoURL || s.auth?.photoURL} size={84} />
          </div>
          <div className="t-title2 mt8">{p?.fullName || s.auth?.displayName}</div>
          <div className="t-sub c2">{p ? roleLine(p) : 'Admin'}</div>
          <div className="t-foot c3">{s.auth?.email}</div>
        </div>

        {viewingOther && (
          <Section>
            <div className="notice">
              <div className="grow t-sub">
                Đang xem kho <b>{s.storeCode}</b> với quyền Admin.
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  s.setViewStore(null);
                  close();
                }}
              >
                Về kho của tôi
              </button>
            </div>
          </Section>
        )}

        <Section>
          <Group>
            <Cell icon="store" iconColor="blue" title={s.store?.name || 'Siêu thị'} sub={s.store ? `Kho ${s.store.code} · ${CHAIN_LABEL[s.store.chain]}` : undefined} />
            {s.isAdmin && <Cell icon="shieldCheck" iconColor="indigo" title="Quyền Admin" trailing={<Pill sm color="purple">Admin</Pill>} />}
          </Group>
        </Section>

        <Section title="Thông báo" small>
          <Group>
            <Cell
              icon="bell"
              iconColor="red"
              title="Thông báo đẩy"
              detail={push === 'granted' ? 'Đang bật' : push === 'denied' ? 'Đang tắt' : push === 'unsupported' ? 'Chưa hỗ trợ' : 'Chưa bật'}
              chevron={push !== 'granted'}
              onClick={push !== 'granted' ? enablePush : undefined}
            />
            {isIOS() && !isStandalone() && <Cell icon="plusSquare" iconColor="blue" title="Cài app lên Màn hình chính" chevron onClick={() => ui.sheet((c) => <InstallGuide close={c} />)} />}
          </Group>
        </Section>

        {p && p.status === 'active' && (
          <Section>
            <Group>
              <Cell icon="calendar" iconColor="orange" title="Xin nghỉ" chevron onClick={() => ui.sheet((c) => <LeaveSheet close={c} self onSave={(l) => addLeave(l, actor, managers)} />)} />
              <Cell
                icon="transfer"
                iconColor="purple"
                title="Chuyển kho"
                detail={p.transferTo ? `Chờ duyệt → ${p.transferTo}` : undefined}
                chevron
                onClick={transfer}
              />
            </Group>
          </Section>
        )}

        <Section footer={`${APP_NAME} · phiên bản 1.0${api().mode === 'demo' ? ' · dữ liệu mẫu' : ''}`}>
          <Group>
            {api().mode === 'demo' && (
              <Cell
                centered
                title="Khôi phục dữ liệu mẫu"
                onClick={async () => {
                  const { resetDemo } = await import('../../lib/demoBackend');
                  resetDemo();
                  location.reload();
                }}
              />
            )}
            <Cell
              destructive
              centered
              title="Đăng xuất"
              onClick={async () => {
                if (await ui.confirm('Đăng xuất?', undefined, 'Đăng xuất', true)) {
                  close();
                  await api().signOut();
                }
              }}
            />
          </Group>
        </Section>
      </div>
    </>
  );
}
