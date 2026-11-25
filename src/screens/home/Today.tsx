import { useMemo } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { Cell, Empty, Group, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { greeting, longDate, vnDate, now } from '../../lib/time';
import { isActor, isOpen, sortTasks } from '../../lib/tasks';
import { todayBoard } from '../../lib/reports';
import { shortName } from '../../lib/text';
import { InstallBanner, NavActions, PushBanner, TaskRow } from '../shared';
import { TaskDetailScreen } from '../tasks/TaskDetail';
import { ReportDetailScreen } from '../reports/ReportDetail';
import { PostDetailScreen } from '../library/PostDetail';
import { AreaCard } from '../reports/AreaCard';

export function TodayScreen({ goTab }: { goTab: (k: string) => void }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const me = s.profile!;
  const today = vnDate();

  const myAreas = useMemo(() => (s.store ? todayBoard(d.areas, d.reports, s.store, d.leaves).filter((x) => x.responsible === me.uid) : []), [d, s.store, me.uid]);

  const mine = sortTasks(d.tasks.filter((t) => t.scope === 'personal' && t.assigneeUid === me.uid && isOpen(t, me.uid)));
  const group = sortTasks(d.tasks.filter((t) => t.scope !== 'personal' && isActor(t, me) && isOpen(t, me.uid) && (!t.dueAt || vnDate(t.dueAt) <= vnDate(now() + 2 * 86400000))));
  const doneToday = d.tasks.filter((t) => isActor(t, me) && !isOpen(t, me.uid) && ((t.completedAt && vnDate(t.completedAt) === today) || (t.completions?.[me.uid] && vnDate(t.completions[me.uid]) === today))).length;
  const acks = d.posts.filter((p) => p.requireAck && (!p.acks?.[me.uid] || p.acks[me.uid].v < p.version) && (p.audience.type === 'all' || (p.audience.type === 'department' && p.audience.value === me.department) || (p.audience.type === 'brand' && p.audience.value === me.brand) || (p.audience.type === 'role' && p.audience.value === me.role)));

  return (
    <Page title="Hôm nay" kicker={`${greeting()}, ${shortName(me.fullName)} · ${longDate()}`} right={<NavActions />}>
      <InstallBanner />
      <PushBanner />

      <Section title="Báo cáo 8NTTT" action={myAreas.length ? undefined : 'Xem'} onAction={() => goTab('reports')}>
        {myAreas.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {myAreas.map((x) => (
              <AreaCard key={x.area.id} item={x} store={s.store!} onOpenReport={(id) => nav.push(<ReportDetailScreen id={id} />)} />
            ))}
          </div>
        ) : (
          <div className="card t-sub c2">Bạn chưa được phân công khu vực báo cáo hôm nay.</div>
        )}
      </Section>

      <Section title="Việc của tôi" action={mine.length ? `${mine.length}` : undefined}>
        {mine.length ? (
          <Group>
            {mine.map((t) => (
              <TaskRow key={t.id} task={t} showTarget={false} onOpen={() => nav.push(<TaskDetailScreen id={t.id} />)} />
            ))}
          </Group>
        ) : (
          <div className="card row gap12">
            <Icon name="check" size={22} className="c-green" stroke={2.4} />
            <span className="t-sub c2">Không có việc cá nhân cần làm.</span>
          </div>
        )}
      </Section>

      {group.length > 0 && (
        <Section title="Việc chung" footer={doneToday ? `Đã hoàn tất ${doneToday} việc hôm nay.` : undefined}>
          <Group>
            {group.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => nav.push(<TaskDetailScreen id={t.id} />)} />
            ))}
          </Group>
        </Section>
      )}

      {acks.length > 0 && (
        <Section title="Cần xác nhận đã đọc">
          <Group>
            {acks.map((p) => (
              <Cell key={p.id} icon="doc" iconColor="orange" title={p.title} sub={p.acks?.[me.uid] ? 'Đã cập nhật nội dung mới' : 'Chưa xác nhận'} chevron onClick={() => nav.push(<PostDetailScreen id={p.id} />)} />
            ))}
          </Group>
        </Section>
      )}

      {!mine.length && !group.length && !acks.length && myAreas.every((a) => a.status === 'ontime' || a.status === 'late') && (
        <Empty icon="sun" title="Bạn đã xong mọi việc" text="Việc mới được giao sẽ hiện ở đây và có thông báo nhắc." />
      )}
    </Page>
  );
}
