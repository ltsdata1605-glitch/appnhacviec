import { useSession, useWatch } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Pill, Section } from '../../ui/controls';
import { CHAIN_LABEL, CHAIN_SHORT } from '../../lib/criteria';
import { relative } from '../../lib/time';
import { api } from '../../lib/backend';
import { approveTransfer, approveUser, createStore, rejectTransfer, rejectUser } from '../../lib/actions';
import { storeCodeOf } from '../../lib/text';
import { useActor } from '../shared';
import type { Chain, Store, UserProfile } from '../../lib/types';

export function AdminScreen() {
  const s = useSession();
  const ui = useUI();
  const actor = useActor();
  const managers = useWatch<UserProfile>('users', s.isAdmin ? [['role', '==', 'manager']] : null);
  const stores = useWatch<Store>('stores', s.isAdmin ? [] : null);
  const admins = useWatch<{ id: string; email: string }>('admins', s.isAdmin ? [] : null);

  const pending = managers.data.filter((m) => m.status === 'pending');
  const transfers = managers.data.filter((m) => m.status === 'active' && m.transferTo);
  const byStore = (code: string) => managers.data.filter((m) => m.storeCode === code && m.status === 'active');

  const onPending = async (u: UserProfile) => {
    const v = await ui.actions(
      [
        { label: u.storeName ? `Duyệt & tạo kho ${u.storeCode}` : `Duyệt quản lý kho ${u.storeCode}`, value: 'ok', icon: 'check' },
        { label: 'Từ chối', value: 'no', icon: 'xmark', destructive: true },
      ],
      `${u.fullName} · ${u.userCode || ''}${u.storeName ? ` · ${u.storeName} (${CHAIN_SHORT[u.chain || 'DMX']})` : ''}`,
    );
    if (v === 'ok') {
      await approveUser(u, actor, { department: 'Quản lý' });
      ui.toast({ text: 'Đã duyệt quản lý', icon: 'check', color: 'green' });
    } else if (v === 'no') {
      const r = await ui.prompt('Lý do từ chối', undefined, 'Lý do', 'Từ chối');
      if (r !== null) await rejectUser(u, actor, r);
    }
  };

  const onStore = async (st: Store) => {
    const v = await ui.actions(
      [
        { label: 'Xem kho này', value: 'view', icon: 'eye' },
        { label: `Chuỗi: ${CHAIN_LABEL[st.chain]}`, value: 'chain', icon: 'store' },
      ],
      `${st.name} · Kho ${st.code}`,
    );
    if (v === 'view') {
      s.setViewStore(st.code);
      ui.toast({ text: `Đang xem kho ${st.code}`, icon: 'eye', color: 'blue' });
    }
    if (v === 'chain') {
      const c = await ui.actions((Object.keys(CHAIN_LABEL) as Chain[]).map((k) => ({ label: CHAIN_LABEL[k], value: k })), 'Chuỗi');
      if (c) await api().update('stores', st.code, { chain: c });
    }
  };

  const newStore = async () => {
    const code = await ui.prompt('Mã kho mới', undefined, 'Ví dụ: 1234', 'Tiếp');
    if (!code?.trim()) return;
    const c = storeCodeOf(code);
    if (await api().get('stores', c)) {
      ui.alert({ title: 'Mã kho đã tồn tại' });
      return;
    }
    const name = await ui.prompt('Tên siêu thị', undefined, 'Ví dụ: ĐMX Quận 7', 'Tiếp');
    if (!name?.trim()) return;
    const chain = await ui.actions((Object.keys(CHAIN_LABEL) as Chain[]).map((k) => ({ label: CHAIN_LABEL[k], value: k })), 'Chuỗi');
    if (!chain) return;
    await createStore(c, name, chain as Chain);
    ui.toast({ text: `Đã tạo kho ${c}`, icon: 'check', color: 'green' });
  };

  const addAdmin = async () => {
    const email = await ui.prompt('Thêm Admin', 'Nhập Gmail của người được cấp quyền Admin.', 'ten@gmail.com', 'Thêm');
    if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    const e = email.trim().toLowerCase();
    await api().set('admins', e, { email: e, addedBy: actor.uid, addedAt: Date.now() });
  };

  if (!s.isAdmin) return <Page title="Quản trị" large={false}><Empty icon="lock" title="Chỉ dành cho Admin" /></Page>;

  return (
    <Page title="Quản trị hệ thống" large={false}>
      <Section title="Quản lý chờ duyệt" small>
        <Group>
          {pending.length ? (
            pending.map((u) => (
              <Cell
                key={u.uid}
                leading={<Avatar name={u.fullName} src={u.photoURL} size={40} />}
                sepInset={68}
                title={u.fullName}
                sub={`Kho ${u.storeCode}${u.storeName ? ` (mới) · ${u.storeName}` : ''} · ${relative(u.createdAt)}`}
                trailing={<Pill sm color="blue">Duyệt</Pill>}
                onClick={() => onPending(u)}
              />
            ))
          ) : (
            <Cell title={<span className="c2">Không có yêu cầu</span>} />
          )}
          {transfers.map((u) => (
            <Cell
              key={`t-${u.uid}`}
              leading={<Avatar name={u.fullName} src={u.photoURL} size={40} />}
              sepInset={68}
              title={u.fullName}
              sub={`Quản lý xin chuyển kho ${u.storeCode} → ${u.transferTo}`}
              trailing={<Pill sm color="purple">Chuyển kho</Pill>}
              onClick={async () => {
                const v = await ui.actions(
                  [
                    { label: 'Duyệt chuyển kho', value: 'ok', icon: 'check' },
                    { label: 'Từ chối', value: 'no', icon: 'xmark', destructive: true },
                  ],
                  u.fullName,
                );
                if (v === 'ok') await approveTransfer(u, actor);
                if (v === 'no') await rejectTransfer(u, actor);
              }}
            />
          ))}
        </Group>
      </Section>

      <Section title={`Danh sách kho (${stores.data.length})`} small action="Thêm kho" onAction={newStore}>
        {stores.data.length ? (
          <Group>
            {[...stores.data]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((st) => {
                const mg = byStore(st.code);
                return (
                  <Cell
                    key={st.code}
                    icon="store"
                    iconColor={st.code === s.storeCode ? 'green' : 'blue'}
                    title={`${st.code} · ${st.name}`}
                    sub={`${CHAIN_SHORT[st.chain]} · ${mg.length ? mg.map((m) => m.fullName).join(', ') : 'Chưa có quản lý'}`}
                    trailing={st.code === s.storeCode ? <Pill sm color="green">Đang xem</Pill> : undefined}
                    chevron
                    onClick={() => onStore(st)}
                  />
                );
              })}
          </Group>
        ) : (
          <div className="card t-sub c2">Chưa có kho.</div>
        )}
      </Section>

      <Section title="Admin" small action="Thêm" onAction={addAdmin} footer="Admin duyệt quản lý, tạo kho và xem được mọi kho.">
        <Group>
          {admins.data.map((a) => (
            <Cell key={a.id} icon="shieldCheck" iconColor="indigo" title={a.email || a.id} trailing={a.id === s.auth?.email.toLowerCase() ? <Pill sm>Bạn</Pill> : undefined} />
          ))}
        </Group>
      </Section>
    </Page>
  );
}
