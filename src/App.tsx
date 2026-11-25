import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { initBackend, type Backend } from './lib/backend';
import { SessionProvider, StoreDataProvider, useSession, useStoreData } from './state/session';
import { UIProvider } from './ui/Overlay';
import { Stack, type StackHandle } from './ui/Nav';
import { Icon, type IconName } from './ui/Icon';
import { AppIcon } from './ui/AppIcon';
import { LoginScreen } from './screens/auth/Login';
import { OnboardingScreen, StatusScreen } from './screens/auth/Onboarding';
import { TodayScreen } from './screens/home/Today';
import { OverviewScreen } from './screens/home/Overview';
import { TaskListScreen } from './screens/tasks/TaskList';
import { TaskDetailScreen } from './screens/tasks/TaskDetail';
import { ReportsScreen } from './screens/reports/ReportsHome';
import { ReportDetailScreen } from './screens/reports/ReportDetail';
import { LibraryScreen } from './screens/library/Library';
import { PostDetailScreen } from './screens/library/PostDetail';
import { CashDetailScreen } from './screens/cash/CashHistory';
import { RollcallDetailScreen } from './screens/rollcall/Rollcall';
import { PeopleScreen } from './screens/people/People';
import { isOpen, isActor } from './lib/tasks';
import { todayBoard } from './lib/reports';
import { vnDate } from './lib/time';
import { LinkCtx } from './screens/shared';
import { NotificationCenter } from './screens/notify/Notifications';

type TabKey = 'home' | 'tasks' | 'reports' | 'library' | 'people';

export function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    initBackend()
      .then(setBackend)
      .catch((e) => setErr(String(e?.message || e)));
  }, []);
  if (err)
    return (
      <div className="splash">
        <div className="center pad">
          <div className="t-title3">Không khởi động được</div>
          <div className="t-sub c2 mt8">{err}</div>
        </div>
      </div>
    );
  if (!backend) return <Splash />;
  return (
    <SessionProvider>
      <UIProvider>
        <Gate />
      </UIProvider>
    </SessionProvider>
  );
}

function Splash() {
  return (
    <div className="splash">
      <AppIcon size={88} />
    </div>
  );
}

function Gate() {
  const s = useSession();
  if (!s.ready) return <Splash />;
  if (!s.auth) return <LoginScreen />;
  if (!s.profileLoaded) return <Splash />;
  const adminView = s.isAdmin && !!s.storeCode;
  if (!s.profile && !adminView) return <OnboardingScreen />;
  if (s.profile && s.profile.status !== 'active' && !adminView) return <StatusScreen />;
  if (!s.storeCode) return <StatusScreen />;
  return (
    <StoreDataProvider>
      {/* Sheet và hộp thoại cần truy cập dữ liệu kho nên đặt bên trong StoreDataProvider */}
      <UIProvider>
        <Main />
      </UIProvider>
    </StoreDataProvider>
  );
}

function Main() {
  const s = useSession();
  const d = useStoreData();
  const manager = s.isManager;
  const [tab, setTab] = useState<TabKey>('home');
  const [depths, setDepths] = useState<Record<string, number>>({});
  const stacks = useRef<Partial<Record<TabKey, StackHandle | null>>>({});
  // Đổi kho đang xem (Admin) hoặc đổi vai trò: các ngăn điều hướng được tạo lại từ đầu
  useEffect(() => {
    setDepths({});
    setTab('home');
  }, [s.storeCode, manager]);
  const today = new Date().getDate();

  const tabs: { key: TabKey; label: string; icon: IconName }[] = manager
    ? [
        { key: 'home', label: 'Tổng quan', icon: 'gauge' },
        { key: 'tasks', label: 'Công việc', icon: 'checklist' },
        { key: 'reports', label: 'Báo cáo', icon: 'camera' },
        { key: 'library', label: 'Thư viện', icon: 'books' },
        { key: 'people', label: 'Nhân sự', icon: 'people' },
      ]
    : [
        { key: 'home', label: 'Hôm nay', icon: 'today' },
        { key: 'tasks', label: 'Công việc', icon: 'checklist' },
        { key: 'reports', label: 'Báo cáo', icon: 'camera' },
        { key: 'library', label: 'Thư viện', icon: 'books' },
      ];

  // Số đếm trên tab
  const me = s.profile;
  const badges = useMemo(() => {
    const b: Partial<Record<TabKey, number>> = {};
    if (!me) return b;
    const mine = d.tasks.filter((t) => isActor(t, me) && isOpen(t, me.uid) && (!t.dueAt || vnDate(t.dueAt) <= vnDate()));
    b.tasks = mine.length + (manager ? d.tasks.filter((t) => t.status === 'pending_review').length : 0);
    if (s.store) {
      const board = todayBoard(d.areas, d.reports, s.store, d.leaves);
      b.reports = manager
        ? board.filter((x) => x.report && !x.report.review).length
        : board.filter((x) => x.responsible === me.uid && (x.status === 'pending' || x.status === 'overdue')).length;
    }
    b.library = d.posts.filter((p) => p.requireAck && (!p.acks?.[me.uid] || p.acks[me.uid].v < p.version)).length;
    b.home = d.rollcalls.filter((r) => !r.closed && me && !r.progress?.[me.uid]?.doneAt && (r.audience.type === 'all' || (r.audience.type === 'department' && r.audience.value === me.department) || (r.audience.type === 'brand' && me.role === 'pg' && r.audience.value === me.brand) || (r.audience.type === 'role' && r.audience.value === me.role) || (r.audience.type === 'people' && (r.audience.uids || []).includes(me.uid)))).length || undefined;
    if (manager) b.people = d.pending.length + d.transfersIn.length + d.leaves.filter((l) => l.status === 'pending').length;
    return b;
  }, [d, me, manager, s.store]);

  // Số trên icon app (iOS 16.4+ khi đã thêm vào MH chính)
  useEffect(() => {
    const n = (badges.tasks || 0) + (manager ? 0 : badges.reports || 0);
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (nav.setAppBadge) (n ? nav.setAppBadge(n) : nav.clearAppBadge?.())?.catch(() => {});
  }, [badges, manager]);

  const openLink = useCallback(
    (link: string) => {
      const [kind, id] = link.split(':');
      const go = (k: TabKey, node?: ReactNode) => {
        setTab(k);
        const st = stacks.current[k];
        if (st && node) {
          st.popToRoot();
          setTimeout(() => st.push(node), 30);
        }
      };
      if (kind === 'task' && id) go('tasks', <TaskDetailScreen id={id} />);
      else if (kind === 'report' && id) go('reports', <ReportDetailScreen id={id} />);
      else if (kind === 'post' && id) go('library', <PostDetailScreen id={id} />);
      else if (kind === 'cash' && id) go('home', <CashDetailScreen id={id} />);
      else if (kind === 'rollcall' && id) go('home', <RollcallDetailScreen id={id} />);
      else if (kind === 'people' && manager) go('people');
      else if (kind === 'tasks') go('tasks');
      else if (kind === 'reports') go('reports');
      else go('home');
    },
    [manager],
  );

  // Mở từ thông báo đẩy
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const link = q.get('open');
    if (link) {
      setTimeout(() => openLink(link), 300);
      history.replaceState(null, '', location.pathname);
    }
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open' && e.data.link) openLink(e.data.link);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [openLink]);

  const roots: Record<TabKey, ReactNode> = {
    home: manager ? <OverviewScreen goTab={(k) => setTab(k as TabKey)} /> : <TodayScreen goTab={(k) => setTab(k as TabKey)} />,
    tasks: <TaskListScreen />,
    reports: <ReportsScreen />,
    library: <LibraryScreen />,
    people: <PeopleScreen />,
  };

  const hideTabBar = (depths[tab] || 0) > 0;

  return (
    <LinkCtx.Provider value={openLink}>
      <NotificationCenter />
      <div className="app">
        <div className="app-frame">
          {tabs.map((t) => (
            <Stack
              key={`${t.key}-${manager ? 'm' : 's'}-${s.storeCode}`}
              ref={(h) => {
                stacks.current[t.key] = h;
              }}
              root={roots[t.key]}
              hidden={tab !== t.key}
              onDepth={(n) => setDepths((x) => ({ ...x, [t.key]: n }))}
            />
          ))}
          <nav className={`tabbar${hideTabBar ? ' hidden' : ''}`} aria-label="Thanh chính">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`tab${tab === t.key ? ' on' : ''}`}
                onClick={() => {
                  if (tab === t.key) stacks.current[t.key]?.popToRoot();
                  setTab(t.key);
                }}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                <Icon name={t.icon} size={26} stroke={1.9} day={today} />
                <span>{t.label}</span>
                {!!badges[t.key] && <span className="badge">{badges[t.key]! > 99 ? '99+' : badges[t.key]}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </LinkCtx.Provider>
  );
}
