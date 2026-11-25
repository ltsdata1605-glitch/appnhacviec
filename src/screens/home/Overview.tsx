import { useMemo } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Group, Pill, Ring, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { longDate, monthRange, vnDate, now, duration, vnAt } from '../../lib/time';
import { isOpen, sortTasks, taskState } from '../../lib/tasks';
import { personStats, todayBoard } from '../../lib/reports';
import { notify } from '../../lib/actions';
import { InstallBanner, NavActions, PushBanner, TaskRow, useActor } from '../shared';
import { TaskDetailScreen } from '../tasks/TaskDetail';
import { PersonReportsScreen } from '../reports/PersonReports';
import { ReportDetailScreen } from '../reports/ReportDetail';
import { AreasScreen } from '../people/Areas';

export function OverviewScreen({ goTab }: { goTab: (k: string) => void }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const store = s.store;
  const today = vnDate();

  const board = useMemo(() => (store ? todayBoard(d.areas, d.reports, store, d.leaves) : []), [d, store]);
  const required = board.filter((x) => x.status !== 'none' && x.status !== 'leave');
  const submitted = board.filter((x) => x.report);
  const waiting = board.filter((x) => x.status === 'pending' || x.status === 'overdue');
  const overdueReports = board.filter((x) => x.status === 'overdue');
  const toReview = board.filter((x) => x.report && !x.report.review);
  const unassigned = board.filter((x) => x.status === 'none').length;

  const todayTasks = d.tasks.filter((t) => (t.dueAt && vnDate(t.dueAt) === today) || (t.completedAt && vnDate(t.completedAt) === today));
  const todayDone = todayTasks.filter((t) => t.status === 'done' || t.status === 'pending_review').length;
  const overdueTasks = sortTasks(d.tasks.filter((t) => isOpen(t) && taskState(t) === 'overdue'));
  const reviewTasks = d.tasks.filter((t) => t.status === 'pending_review');

  const monthStats = useMemo(() => {
    if (!store) return [];
    const { from } = monthRange(today.slice(0, 7));
    return personStats(d.active, d.areas, d.reports, store, d.leaves, from, today)
      .filter((x) => x.missingDays > 0)
      .sort((a, b) => b.missingDays - a.missingDays)
      .slice(0, 5);
  }, [d, store, today]);

  const pendingCount = d.pending.length + d.transfersIn.length + d.leaves.filter((l) => l.status === 'pending').length;
  const deadlineLeft = store ? vnAt(today, store.deadline) - now() : 0;

  const nudgeAll = async () => {
    if (!store) return;
    const uids = waiting.map((x) => x.responsible!).filter(Boolean);
    if (!(await ui.confirm(`Nhắc ${uids.length} người chưa báo cáo?`, undefined, 'Gửi nhắc'))) return;
    await notify(uids, store.code, actor, { title: 'Nhắc báo cáo 8NTTT', body: `${actor.name} nhắc bạn chụp báo cáo khu vực trước ${store.deadline}.`, link: 'reports', level: 'high' });
    ui.toast({ text: `Đã nhắc ${uids.length} người`, icon: 'bell', color: 'orange' });
  };

  return (
    <Page title="Tổng quan" kicker={`${store?.name || ''} · ${longDate()}`} right={<NavActions />}>
      {s.isAdmin && s.profile && s.storeCode !== s.profile.storeCode && (
        <Section>
          <div className="notice">
            <span className="notice-icon bg-indigo">
              <Icon name="eye" size={18} />
            </span>
            <div className="grow t-sub">
              Đang xem kho <b>{s.storeCode}</b> với quyền Admin
            </div>
            <button className="btn sm" onClick={() => s.setViewStore(null)}>
              Thoát
            </button>
          </div>
        </Section>
      )}
      <InstallBanner />
      <PushBanner />

      <Section>
        <div className="stat-grid">
          <button className="stat" onClick={() => goTab('reports')}>
            <div className="stat-label">
              <Icon name="camera" size={17} className="c-green" />
              8NTTT hôm nay
            </div>
            <div className="row gap12" style={{ marginTop: 10 }}>
              <Ring value={submitted.length} total={required.length || 1} size={54} width={7}>
                <span className="t-cap semibold tnum">{required.length ? Math.round((submitted.length / required.length) * 100) : 0}%</span>
              </Ring>
              <div>
                <div className="t-title2 tnum">
                  {submitted.length}
                  <span className="t-sub c2">/{required.length}</span>
                </div>
                <div className={`t-foot ${overdueReports.length ? 'c-red semibold' : 'c2'}`}>
                  {overdueReports.length ? `${overdueReports.length} quá giờ` : deadlineLeft > 3600000 ? `Hạn ${store?.deadline}` : deadlineLeft > 0 ? `Còn ${duration(deadlineLeft)}` : 'Đã qua hạn'}
                </div>
              </div>
            </div>
          </button>
          <button className="stat" onClick={() => goTab('tasks')}>
            <div className="stat-label">
              <Icon name="checklist" size={17} className="tint" />
              Việc hôm nay
            </div>
            <div className="row gap12" style={{ marginTop: 10 }}>
              <Ring value={todayDone} total={todayTasks.length || 1} size={54} width={7} color="var(--tint)">
                <span className="t-cap semibold tnum">{todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0}%</span>
              </Ring>
              <div>
                <div className="t-title2 tnum">
                  {todayDone}
                  <span className="t-sub c2">/{todayTasks.length}</span>
                </div>
                <div className={`t-foot ${overdueTasks.length ? 'c-red semibold' : 'c2'}`}>{overdueTasks.length ? `${overdueTasks.length} quá hạn` : 'Không quá hạn'}</div>
              </div>
            </div>
          </button>
        </div>
      </Section>

      {(pendingCount > 0 || toReview.length > 0 || reviewTasks.length > 0 || unassigned > 0) && (
        <Section title="Chờ bạn xử lý">
          <Group>
            {pendingCount > 0 && <Cell icon="personPlus" iconColor="blue" title="Duyệt nhân sự" sub="Đăng ký mới, chuyển kho, xin nghỉ" detail={pendingCount} chevron onClick={() => goTab('people')} />}
            {toReview.length > 0 && <Cell icon="photo" iconColor="purple" title="Chấm báo cáo 8NTTT" detail={toReview.length} chevron onClick={() => nav.push(<ReportDetailScreen id={toReview[0].report!.id} />)} />}
            {reviewTasks.length > 0 && <Cell icon="shieldCheck" iconColor="indigo" title="Duyệt việc đã hoàn tất" detail={reviewTasks.length} chevron onClick={() => nav.push(<TaskDetailScreen id={reviewTasks[0].id} />)} />}
            {unassigned > 0 && <Cell icon="grid" iconColor="orange" title="Khu vực chưa phân công" detail={unassigned} chevron onClick={() => nav.push(<AreasScreen />)} />}
          </Group>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title={overdueReports.length ? 'Quá giờ chưa báo cáo' : 'Chưa báo cáo'} action="Nhắc tất cả" onAction={nudgeAll}>
          <Group>
            {waiting.map((x) => {
              const p = d.byUid(x.responsible);
              return (
                <Cell
                  key={x.area.id}
                  leading={<Avatar name={p?.fullName || '?'} src={p?.photoURL} size={38} />}
                  sepInset={66}
                  title={p?.fullName || 'Chưa rõ'}
                  sub={x.area.name}
                  trailing={<Pill sm color={x.status === 'overdue' ? 'red' : 'blue'}>{x.status === 'overdue' ? 'Quá giờ' : 'Chưa nộp'}</Pill>}
                  onClick={async () => {
                    const v = await ui.actions([{ label: `Nhắc ${p?.fullName}`, value: 'n', icon: 'bell' }], x.area.name);
                    if (v && store) {
                      await notify([x.responsible!], store.code, actor, { title: 'Nhắc báo cáo 8NTTT', body: `Khu vực ${x.area.name} chưa có báo cáo hôm nay.`, link: 'reports', level: 'high' });
                      ui.toast({ text: 'Đã gửi nhắc', icon: 'bell', color: 'orange' });
                    }
                  }}
                />
              );
            })}
          </Group>
        </Section>
      )}

      {overdueTasks.length > 0 && (
        <Section title="Việc quá hạn" action={`${overdueTasks.length}`}>
          <Group>
            {overdueTasks.slice(0, 6).map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => nav.push(<TaskDetailScreen id={t.id} />)} />
            ))}
          </Group>
        </Section>
      )}

      {monthStats.length > 0 && (
        <Section title="Thiếu báo cáo tháng này" footer="Số ngày không báo cáo 8NTTT, không tính ngày nghỉ đã duyệt.">
          <Group>
            {monthStats.map((x) => {
              const p = d.byUid(x.uid);
              return (
                <Cell
                  key={x.uid}
                  leading={<Avatar name={p?.fullName || '?'} src={p?.photoURL} size={38} />}
                  sepInset={66}
                  title={p?.fullName || ''}
                  sub={x.streak > 1 ? `${x.streak} ngày liên tiếp gần đây` : `Đúng giờ ${x.ontime} · Trễ ${x.late}`}
                  trailing={<Pill sm color="red">{x.missingDays} ngày</Pill>}
                  chevron
                  onClick={() => nav.push(<PersonReportsScreen uid={x.uid} ym={today.slice(0, 7)} />)}
                />
              );
            })}
          </Group>
        </Section>
      )}
    </Page>
  );
}
