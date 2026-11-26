import { useMemo, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Pill, SearchBar, Section, SkeletonList } from '../../ui/controls';
import { ROLE_LABEL } from '../../lib/constants';
import { matches } from '../../lib/text';
import { dm, relative } from '../../lib/time';
import { approveTransfer, approveUser, decideLeave, rejectTransfer, rejectUser } from '../../lib/actions';
import { NavActions, roleLine, useActor } from '../shared';
import { PersonDetailScreen } from './PersonDetail';
import { AreasScreen } from './Areas';
import { StoreSettingsScreen } from './StoreSettings';
import { LeavesScreen } from './Leaves';
import { AuditScreen } from './Audit';
import { AdminScreen } from '../admin/Admin';
import type { UserProfile } from '../../lib/types';

export function PeopleScreen() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const [q, setQ] = useState('');
  const canApprove = s.can('approve');

  const groups = useMemo(() => {
    const list = d.active.filter((m) => matches(`${m.fullName} ${m.userCode || ''} ${m.brand || ''} ${m.department || ''} ${m.email}`, q));
    const g = new Map<string, UserProfile[]>();
    list.forEach((m) => {
      const k = m.role === 'manager' ? 'Quản lý' : m.role === 'pg' ? 'PG' : m.department || 'Chưa xếp bộ phận';
      g.set(k, [...(g.get(k) || []), m]);
    });
    const order = ['Quản lý', ...(s.store?.departments || [])];
    return [...g.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], 'vi');
    });
  }, [d.active, q, s.store]);

  const disabled = d.members.filter((m) => m.status === 'disabled');
  const pendingLeaves = d.leaves.filter((l) => l.status === 'pending');

  const onPending = async (u: UserProfile) => {
    if (u.role === 'manager' && !s.isAdmin) {
      ui.alert({ title: 'Chờ Admin duyệt', message: 'Tài khoản quản lý do Admin duyệt.' });
      return;
    }
    const v = await ui.actions(
      [
        { label: 'Duyệt', value: 'ok', icon: 'check' },
        { label: 'Từ chối', value: 'no', icon: 'xmark', destructive: true },
      ],
      `${u.fullName} · ${u.role === 'pg' ? `PG ${u.brand}` : `${ROLE_LABEL[u.role]} · ${u.userCode || ''}`}`,
    );
    if (v === 'ok') {
      let department = u.role === 'pg' ? 'PG' : u.role === 'manager' ? 'Quản lý' : undefined;
      if (u.role === 'staff') {
        const dep = await ui.actions((s.store?.departments || []).filter((x) => x !== 'PG').map((x) => ({ label: x, value: x })), 'Xếp vào bộ phận');
        if (!dep) return;
        department = dep;
      }
      await approveUser(u, actor, department ? { department } : {});
      ui.toast({ text: `Đã duyệt ${u.fullName}`, icon: 'check', color: 'green' });
    } else if (v === 'no') {
      const reason = await ui.prompt('Lý do từ chối', 'Người đăng ký sẽ thấy lý do này.', 'Ví dụ: Sai mã kho', 'Từ chối');
      if (reason !== null) await rejectUser(u, actor, reason);
    }
  };

  const onTransfer = async (u: UserProfile) => {
    if (u.role === 'manager' && !s.isAdmin) return;
    const v = await ui.actions(
      [
        { label: `Nhận vào kho ${s.storeCode}`, value: 'ok', icon: 'check' },
        { label: 'Từ chối', value: 'no', icon: 'xmark', destructive: true },
      ],
      `${u.fullName} xin chuyển từ kho ${u.storeCode}`,
    );
    if (v === 'ok') {
      await approveTransfer(u, actor);
      ui.toast({ text: 'Đã nhận chuyển kho', icon: 'check', color: 'green' });
    } else if (v === 'no') await rejectTransfer(u, actor);
  };

  return (
    <Page
      title="Nhân sự"
      kicker={s.store ? `${s.store.name} · Kho ${s.store.code}` : undefined}
      right={<NavActions />}
      headerExtra={
        <div style={{ padding: '6px 16px 0' }}>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm nhân viên" />
        </div>
      }
    >
      {!q && (d.pending.length > 0 || d.transfersIn.length > 0 || pendingLeaves.length > 0) && (
        <Section title="Chờ duyệt">
          <Group>
            {d.pending.map((u) => (
              <Cell
                key={u.uid}
                leading={<Avatar name={u.fullName} src={u.photoURL} size={40} />}
                sepInset={68}
                title={u.fullName}
                sub={`${u.role === 'pg' ? `PG ${u.brand}` : `${ROLE_LABEL[u.role]} · ${u.userCode || ''}`} · ${relative(u.createdAt)}`}
                trailing={canApprove && (u.role !== 'manager' || s.isAdmin) ? <Pill sm color="blue">Duyệt</Pill> : <Pill sm color="gray">Admin duyệt</Pill>}
                onClick={() => onPending(u)}
              />
            ))}
            {d.transfersIn.map((u) => (
              <Cell
                key={`t-${u.uid}`}
                leading={<Avatar name={u.fullName} src={u.photoURL} size={40} />}
                sepInset={68}
                title={u.fullName}
                sub={`Xin chuyển từ kho ${u.storeCode} · ${roleLine(u)}`}
                trailing={<Pill sm color="purple">Chuyển kho</Pill>}
                onClick={() => onTransfer(u)}
              />
            ))}
            {pendingLeaves.map((l) => (
              <Cell
                key={l.id}
                icon="calendar"
                iconColor="orange"
                title={`${l.userName} xin nghỉ ${dm(l.date)}`}
                sub={l.reason || undefined}
                trailing={<Pill sm color="orange">Nghỉ</Pill>}
                onClick={async () => {
                  const v = await ui.actions(
                    [
                      { label: 'Duyệt nghỉ', value: 'ok', icon: 'check' },
                      { label: 'Không duyệt', value: 'no', icon: 'xmark', destructive: true },
                    ],
                    `${l.userName} · ${dm(l.date)}`,
                  );
                  if (v) await decideLeave(l, actor, v === 'ok');
                }}
              />
            ))}
          </Group>
        </Section>
      )}

      {!q && s.isManager && (
        <Section>
          <Group>
            <Cell icon="grid" iconColor="teal" title="Khu vực 8NTTT" detail={d.areas.filter((a) => a.active).length || undefined} chevron onClick={() => nav.push(<AreasScreen />)} />
            <Cell icon="calendar" iconColor="orange" title="Lịch nghỉ" chevron onClick={() => nav.push(<LeavesScreen />)} />
            <Cell icon="store" iconColor="blue" title="Cài đặt siêu thị" chevron onClick={() => nav.push(<StoreSettingsScreen />)} />
            <Cell icon="list" iconColor="gray" title="Nhật ký hoạt động" chevron onClick={() => nav.push(<AuditScreen />)} />
            {s.isAdmin && <Cell icon="shieldCheck" iconColor="indigo" title="Quản trị hệ thống" sub="Duyệt quản lý, danh sách kho" chevron onClick={() => nav.push(<AdminScreen />)} />}
          </Group>
        </Section>
      )}

      {groups.length ? (
        groups.map(([g, list]) => (
          <Section key={g} title={g} small action={`${list.length}`}>
            <Group>
              {list.map((m) => (
                <Cell
                  key={m.uid}
                  leading={<Avatar name={m.fullName} src={m.photoURL} size={40} />}
                  sepInset={68}
                  title={m.fullName}
                  sub={[m.role === 'pg' ? `PG ${m.brand}` : m.position || ROLE_LABEL[m.role], m.userCode].filter(Boolean).join(' · ')}
                  trailing={Object.values(m.permissions || {}).some(Boolean) && m.role !== 'manager' ? <Pill sm color="purple">Có quyền</Pill> : undefined}
                  chevron
                  onClick={() => nav.push(<PersonDetailScreen uid={m.uid} />)}
                />
              ))}
            </Group>
          </Section>
        ))
      ) : d.loading ? (
        <SkeletonList rows={4} />
      ) : (
        <Empty icon="people" title={q ? 'Không tìm thấy' : 'Chưa có nhân viên'} text={q ? undefined : 'Nhân viên đăng nhập Google và chọn mã kho này để gửi yêu cầu.'} />
      )}

      {!q && disabled.length > 0 && (
        <Section title="Đã vô hiệu hoá" small>
          <Group>
            {disabled.map((m) => (
              <Cell key={m.uid} leading={<Avatar name={m.fullName} src={m.photoURL} size={36} />} sepInset={64} title={<span className="c2">{m.fullName}</span>} sub={roleLine(m)} chevron onClick={() => nav.push(<PersonDetailScreen uid={m.uid} />)} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}
