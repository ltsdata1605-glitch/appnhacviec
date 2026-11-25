import { useEffect, useMemo, useState } from 'react';
import { useSession, useStoreData, useWatch } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Cell, Empty, Group, SearchBar, Section, Segmented, SwipeRow, type SwipeAction } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { addDays, vnDate } from '../../lib/time';
import { isActor, isOpen, sortTasks, taskState, targetLabel } from '../../lib/tasks';
import { matches } from '../../lib/text';
import { completeTask, deleteTask, nudgeTask } from '../../lib/actions';
import { generateForToday } from '../../lib/recurring';
import { NavActions, TaskRow, useActor } from '../shared';
import { TaskDetailScreen } from './TaskDetail';
import { TaskEditor } from './TaskEditor';
import { TemplatesScreen } from './Templates';
import type { Task, TaskTemplate } from '../../lib/types';

type StaffSeg = 'mine' | 'shared' | 'done';
type MgrSeg = 'open' | 'review' | 'done';

export function TaskListScreen() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const me = s.profile;
  const manager = s.isManager;
  const canAssign = s.can('assign');
  const [seg, setSeg] = useState<StaffSeg | MgrSeg>(manager ? 'open' : 'mine');
  const [q, setQ] = useState('');

  // Quản lý: chạy bù việc lặp lại khi mở app
  const tpls = useWatch<TaskTemplate>('taskTemplates', s.storeCode && canAssign ? [['storeCode', '==', s.storeCode]] : null);
  useEffect(() => {
    if (!canAssign || tpls.loading || !tpls.data.length || !d.active.length) return;
    generateForToday(tpls.data, d.active, actor).catch((e) => console.warn('recurring', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpls.loading, tpls.data.length, d.active.length, canAssign]);

  const filtered = d.tasks.filter((t) => matches(`${t.title} ${t.note || ''} ${targetLabel(t)}`, q));

  const lists = useMemo(() => {
    const uid = me?.uid || '';
    if (manager) {
      return {
        open: sortTasks(filtered.filter((t) => t.status === 'open' || t.status === 'returned')),
        review: sortTasks(filtered.filter((t) => t.status === 'pending_review')),
        done: sortTasks(filtered.filter((t) => t.status === 'done')).slice(0, 80),
      };
    }
    return {
      mine: sortTasks(filtered.filter((t) => me && isActor(t, me) && isOpen(t, uid))),
      shared: sortTasks(filtered.filter((t) => t.shared && (t.status === 'open' || t.status === 'returned') && !(me && isActor(t, me) && isOpen(t, uid)))),
      done: sortTasks(filtered.filter((t) => me && isActor(t, me) && !isOpen(t, uid))).slice(0, 80),
    };
  }, [filtered, me, manager]);

  const current = (lists as unknown as Record<string, Task[]>)[seg] || [];
  const open = (t: Task) => nav.push(<TaskDetailScreen id={t.id} />);
  const compose = () => ui.sheet((close) => <TaskEditor close={close} />);

  const swipe = (t: Task): SwipeAction[] => {
    const acts: SwipeAction[] = [];
    if (me && isActor(t, me) && isOpen(t, me.uid) && !t.requirePhoto)
      acts.push({ label: 'Xong', icon: 'check', color: 'green', onClick: () => completeTask(t, actor).then(() => ui.toast({ text: 'Đã hoàn tất', icon: 'check' })) });
    if (manager && t.status !== 'done') {
      acts.push({
        label: 'Nhắc',
        icon: 'bell',
        color: 'orange',
        onClick: async () => {
          const uids = t.scope === 'personal' ? [t.assigneeUid!] : d.active.filter((m) => isActor(t, m) && !(t.completions || {})[m.uid]).map((m) => m.uid);
          await nudgeTask(t, actor, uids);
          ui.toast({ text: 'Đã gửi nhắc', icon: 'bell', color: 'orange' });
        },
      });
    }
    if (manager || t.createdBy === me?.uid)
      acts.push({
        label: 'Xoá',
        icon: 'trash',
        color: 'red',
        onClick: async () => {
          if (await ui.confirm('Xoá công việc?', t.title, 'Xoá', true)) await deleteTask(t);
        },
      });
    return acts;
  };

  // Nhóm theo thời hạn
  const groups = useMemo(() => {
    if (seg === 'done') return [{ key: 'done', title: 'Đã hoàn tất', items: current }];
    if (seg === 'shared') {
      const m = new Map<string, Task[]>();
      current.forEach((t) => m.set(targetLabel(t), [...(m.get(targetLabel(t)) || []), t]));
      return [...m.entries()].map(([k, v]) => ({ key: k, title: k, items: v }));
    }
    const today = vnDate();
    const tomorrow = addDays(today, 1);
    const g: Record<string, Task[]> = { overdue: [], today: [], tomorrow: [], later: [], none: [] };
    current.forEach((t) => {
      if (taskState(t) === 'overdue') g.overdue.push(t);
      else if (!t.dueAt) g.none.push(t);
      else if (vnDate(t.dueAt) === today) g.today.push(t);
      else if (vnDate(t.dueAt) === tomorrow) g.tomorrow.push(t);
      else g.later.push(t);
    });
    const titles: Record<string, string> = { overdue: 'Quá hạn', today: 'Hôm nay', tomorrow: 'Ngày mai', later: 'Sắp tới', none: 'Không thời hạn' };
    return Object.entries(g)
      .filter(([, v]) => v.length)
      .map(([k, v]) => ({ key: k, title: titles[k], items: v }));
  }, [current, seg]);

  const options = manager
    ? [
        { value: 'open' as const, label: 'Đang làm', count: lists.open?.length },
        { value: 'review' as const, label: 'Chờ duyệt', count: lists.review?.length },
        { value: 'done' as const, label: 'Đã xong' },
      ]
    : [
        { value: 'mine' as const, label: 'Của tôi', count: lists.mine?.length },
        { value: 'shared' as const, label: 'Toàn kho', count: lists.shared?.length },
        { value: 'done' as const, label: 'Đã xong' },
      ];

  return (
    <Page
      title="Công việc"
      right={
        <>
          {(canAssign || s.profile?.status === 'active') && (
            <button className="glass-btn icon prominent" onClick={compose} aria-label="Giao việc mới">
              <Icon name="plus" size={22} stroke={2.4} />
            </button>
          )}
          <NavActions />
        </>
      }
      headerExtra={
        <div style={{ padding: '6px 16px 0', display: 'grid', gap: 10 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm công việc" />
          <Segmented value={seg as string} onChange={(v) => setSeg(v as StaffSeg | MgrSeg)} options={options as { value: string; label: string; count?: number }[]} />
        </div>
      }
    >
      {canAssign && seg !== 'done' && !q && (
        <Section>
          <Group>
            <Cell icon="repeat" iconColor="indigo" title="Việc lặp lại" sub="Checklist mở cửa, đóng ca, kiểm quỹ…" detail={tpls.data.filter((x) => x.active).length || undefined} chevron onClick={() => nav.push(<TemplatesScreen />)} />
          </Group>
        </Section>
      )}

      {groups.length === 0 ? (
        <Empty
          icon={seg === 'done' ? 'checklist' : 'check'}
          title={seg === 'done' ? 'Chưa có việc hoàn tất' : seg === 'review' ? 'Không có việc chờ duyệt' : q ? 'Không tìm thấy' : 'Không có việc cần làm'}
          text={seg !== 'done' && !q ? (canAssign ? 'Chạm nút + để giao việc cho cá nhân, bộ phận hoặc toàn siêu thị.' : 'Chạm nút + để giao việc cho đồng nghiệp.') : undefined}
        />
      ) : (
        groups.map((g) => (
          <Section key={g.key} title={g.title} small action={`${g.items.length}`}>
            <Group>
              {g.items.map((t) => (
                <SwipeRow key={t.id} actions={swipe(t)}>
                  <TaskRow task={t} onOpen={() => open(t)} showTarget={manager || seg !== 'mine' || t.scope !== 'personal'} />
                </SwipeRow>
              ))}
            </Group>
          </Section>
        ))
      )}
    </Page>
  );
}
