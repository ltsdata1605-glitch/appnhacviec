import { useMemo } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Section, Switch } from '../../ui/controls';
import { PERMISSION_LABEL, ROLE_LABEL } from '../../lib/constants';
import { dmy, monthRange, vnDate } from '../../lib/time';
import { isActor } from '../../lib/tasks';
import { personStats } from '../../lib/reports';
import { addLeave, deleteUserForever, disableUser, enableUser, saveArea, updateUser } from '../../lib/actions';
import { roleLine, useActor } from '../shared';
import { TaskEditor } from '../tasks/TaskEditor';
import { PersonReportsScreen } from '../reports/PersonReports';
import { LeaveSheet } from './Leaves';
import type { Permissions, Role } from '../../lib/types';

export function PersonDetailScreen({ uid }: { uid: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const u = d.byUid(uid);
  const store = s.store;
  const ym = vnDate().slice(0, 7);
  const stats = useMemo(() => {
    if (!u || !store) return null;
    const { from, to } = monthRange(ym);
    return personStats([u], d.areas, d.reports, store, d.leaves, from, to).find((x) => x.uid === uid);
  }, [u, store, d.areas, d.reports, d.leaves, ym, uid]);

  if (!u) return <Page title="Nhân viên" large={false}><Empty icon="person" title="Không tìm thấy" /></Page>;

  const manager = s.isManager;
  const editable = manager && (u.role !== 'manager' || s.isAdmin) && u.uid !== s.auth?.uid;
  const tasks = d.tasks.filter((t) => isActor(t, u) && t.createdAt >= Date.now() - 30 * 86400000);
  const tasksDone = tasks.filter((t) => t.status === 'done' || t.completions?.[u.uid]).length;
  const areas = d.areas.filter((a) => a.ownerUid === u.uid || a.backupUid === u.uid);
  const edit = async (field: 'fullName' | 'userCode' | 'brand' | 'position', label: string) => {
    const v = await ui.prompt(label, undefined, label, 'Lưu', (u[field] as string) || '');
    if (v !== null) await updateUser(u, actor, { [field]: v.trim() }, `Sửa ${label.toLowerCase()}`);
  };

  const setRole = async () => {
    const options: Role[] = s.isAdmin ? ['staff', 'pg', 'manager'] : ['staff', 'pg'];
    const v = await ui.actions(options.map((r) => ({ label: ROLE_LABEL[r], value: r, icon: r === u.role ? 'check' : undefined })), 'Chức vụ');
    if (!v || v === u.role) return;
    await updateUser(u, actor, { role: v as Role, ...(v === 'pg' ? { department: 'PG' } : v === 'manager' ? { department: 'Quản lý' } : {}) }, `Đổi chức vụ thành ${ROLE_LABEL[v as Role]}`);
  };

  const setDept = async () => {
    const v = await ui.actions((store?.departments || []).map((x) => ({ label: x, value: x, icon: x === u.department ? 'check' : undefined })), 'Bộ phận');
    if (v) await updateUser(u, actor, { department: v }, `Chuyển bộ phận ${v}`);
  };

  const setBrand = async () => {
    const v = await ui.actions((store?.brands || []).map((x) => ({ label: x, value: x, icon: x === u.brand ? 'check' : undefined })), 'Hãng');
    if (v) await updateUser(u, actor, { brand: v }, `Đổi hãng ${v}`);
  };

  const assignArea = async () => {
    const v = await ui.actions(
      d.areas.filter((a) => a.active).map((a) => ({ label: `${a.name}${a.ownerUid ? ` · ${d.nameOf(a.ownerUid)}` : ''}`, value: a.id, icon: a.ownerUid === u.uid ? 'check' : undefined })),
      `Giao khu vực cho ${u.fullName}`,
    );
    if (!v) return;
    await saveArea({ id: v, storeCode: u.storeCode, ownerUid: u.uid, ownerSince: vnDate() });
    ui.toast({ text: 'Đã phân công khu vực', icon: 'check' });
  };

  const togglePerm = (k: keyof Permissions, v: boolean) => updateUser(u, actor, { permissions: { ...(u.permissions || {}), [k]: v } }, `${v ? 'Cấp' : 'Gỡ'} quyền ${PERMISSION_LABEL.find((p) => p.key === k)?.label.toLowerCase()}`);

  return (
    <Page title={u.fullName} large={false}>
      <div className="center" style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'inline-block' }}>
          <Avatar name={u.fullName} src={u.photoURL} size={84} />
        </div>
        <div className="t-title2 mt8">{u.fullName}</div>
        <div className="t-sub c2">{roleLine(u)}</div>
        <div className="t-foot c3" style={{ userSelect: 'text' }}>
          {u.email}
        </div>
        {u.status !== 'active' && <div className="pill red mt8">{u.status === 'disabled' ? 'Đã vô hiệu hoá' : u.status === 'pending' ? 'Chờ duyệt' : 'Bị từ chối'}</div>}
      </div>

      {manager && u.status === 'active' && (
        <div className="row gap8" style={{ padding: '18px 16px 0' }}>
          <button className="btn tinted md grow" onClick={() => ui.sheet((c) => <TaskEditor close={c} presetAssignee={u.uid} />)}>
            Giao việc
          </button>
          <button className="btn tinted md grow" onClick={() => ui.sheet((c) => <LeaveSheet close={c} presetUid={u.uid} onSave={(l) => addLeave(l, actor, [])} />)}>
            Báo nghỉ
          </button>
        </div>
      )}

      <Section title="Thông tin" small>
        <Group>
          <Cell title="Họ tên" detail={u.fullName} chevron={editable} onClick={editable ? () => edit('fullName', 'Họ tên') : undefined} />
          {u.role !== 'pg' && <Cell title="User" detail={u.userCode || '—'} chevron={editable} onClick={editable ? () => edit('userCode', 'User') : undefined} />}
          <Cell title="Chức vụ" detail={ROLE_LABEL[u.role]} chevron={editable} onClick={editable ? setRole : undefined} />
          <Cell title="Chức danh" detail={u.position || '—'} chevron={editable} onClick={editable ? () => edit('position', 'Chức danh') : undefined} />
          {u.role !== 'pg' ? (
            <Cell title="Bộ phận" detail={u.department || 'Chưa xếp'} chevron={editable} onClick={editable ? setDept : undefined} />
          ) : (
            <Cell title="Hãng" detail={u.brand || '—'} chevron={editable} onClick={editable ? setBrand : undefined} />
          )}
          <Cell title="Mã kho" detail={u.storeCode} />
          {u.approvedAt && <Cell title="Ngày tham gia" detail={dmy(u.approvedAt)} />}
        </Group>
      </Section>

      <Section title="Khu vực 8NTTT" small action={manager && u.status === 'active' ? 'Phân công' : undefined} onAction={assignArea}>
        <Group>
          {areas.length ? (
            areas.map((a) => <Cell key={a.id} icon="grid" iconColor="teal" title={a.name} detail={a.ownerUid === u.uid ? 'Phụ trách' : 'Dự phòng'} />)
          ) : (
            <Cell title={<span className="c2">Chưa phụ trách khu vực nào</span>} />
          )}
        </Group>
      </Section>

      {stats && (
        <Section title="Tháng này" small>
          <Group>
            <Cell icon="camera" iconColor="green" title="Báo cáo đúng giờ" detail={`${stats.ontime}/${stats.required}`} chevron onClick={() => nav.push(<PersonReportsScreen uid={u.uid} ym={ym} />)} />
            <Cell icon="warning" iconColor="red" title="Ngày không báo cáo" detail={stats.missingDays} />
            <Cell icon="checklist" iconColor="blue" title="Việc hoàn tất (30 ngày)" detail={`${tasksDone}/${tasks.length}`} />
          </Group>
        </Section>
      )}

      {editable && u.role !== 'manager' && u.status === 'active' && (
        <Section title="Quyền bổ sung" small footer="Dành cho trưởng ca, phó quản lý. Quản lý luôn có đủ quyền.">
          <Group>
            {PERMISSION_LABEL.map((p) => (
              <Cell key={p.key} title={p.label} sub={p.desc} trailing={<Switch checked={!!u.permissions?.[p.key]} onChange={(v) => togglePerm(p.key, v)} label={p.label} />} />
            ))}
          </Group>
        </Section>
      )}

      {editable && (
        <Section footer={u.status === 'disabled' ? undefined : 'Vô hiệu hoá giữ lại toàn bộ lịch sử báo cáo và công việc.'}>
          <Group>
            {u.status === 'disabled' ? (
              <Cell centered title="Kích hoạt lại" onClick={() => enableUser(u, actor)} />
            ) : (
              <Cell
                destructive
                centered
                title="Vô hiệu hoá"
                onClick={async () => {
                  if (await ui.confirm(`Vô hiệu hoá ${u.fullName}?`, 'Người này sẽ không truy cập được dữ liệu của kho.', 'Vô hiệu hoá', true)) {
                    await disableUser(u, actor);
                    ui.toast({ text: 'Đã vô hiệu hoá', icon: 'lock', color: 'gray' });
                  }
                }}
              />
            )}
            {s.isAdmin && (
              <Cell
                destructive
                centered
                title="Xoá vĩnh viễn"
                onClick={async () => {
                  if (!(await ui.confirm('Xoá vĩnh viễn?', 'Hồ sơ bị xoá hoàn toàn. Người này phải đăng ký lại nếu quay lại.', 'Tiếp tục', true))) return;
                  if (!(await ui.confirm(`Xác nhận xoá ${u.fullName}`, 'Thao tác này không thể hoàn tác.', 'Xoá', true))) return;
                  await deleteUserForever(u, actor);
                  nav.pop();
                }}
              />
            )}
          </Group>
        </Section>
      )}
    </Page>
  );
}
