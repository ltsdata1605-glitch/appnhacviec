// Thành phần dùng chung giữa các màn hình.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSession, useStoreData } from '../state/session';
import { useUI, SheetHead } from '../ui/Overlay';
import { Avatar, Check, Empty, Group, Pill, SearchBar, Section, Switch, Cell } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { matches } from '../lib/text';
import { ROLE_LABEL, APP_NAME } from '../lib/constants';
import { TASK_STATE_META, taskState, targetLabel, myDone, isActor } from '../lib/tasks';
import { dueLabel, relative } from '../lib/time';
import { api } from '../lib/backend';
import { actorOf, markNotificationsRead, completeTask, reopenTask } from '../lib/actions';
import type { Task, UserProfile } from '../lib/types';

export const LinkCtx = createContext<(link: string) => void>(() => {});
export const useOpenLink = () => useContext(LinkCtx);

export function useActor() {
  const s = useSession();
  return actorOf(s.profile, s.auth);
}

export function isStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function roleLine(u: UserProfile): string {
  const parts = [u.role === 'pg' ? `PG ${u.brand || ''}`.trim() : u.position || ROLE_LABEL[u.role]];
  if (u.role !== 'pg' && u.department && u.department !== u.position) parts.push(u.department);
  return parts.join(' · ');
}

// ---------- Nút ảnh đại diện + chuông trên thanh điều hướng ----------
export function NavActions() {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const unread = d.notifications.filter((n) => !n.read).length;
  return (
    <>
      <button className="glass-btn icon" aria-label="Thông báo" onClick={() => ui.sheet((close) => <NotificationsSheet close={close} />)}>
        <Icon name="bell" size={21} />
        {unread > 0 && <span className="badge-dot" />}
      </button>
      <button
        className="avatar-btn"
        aria-label="Tài khoản"
        onClick={async () => {
          const { ProfileSheet } = await import('./profile/Profile');
          ui.sheet((close) => <ProfileSheet close={close} />);
        }}
      >
        <Avatar name={s.profile?.fullName || s.auth?.displayName || '?'} src={s.profile?.photoURL || s.auth?.photoURL} size={44} />
      </button>
    </>
  );
}

function NotificationsSheet({ close }: { close: () => void }) {
  const d = useStoreData();
  const open = useOpenLink();
  const list = d.notifications;
  const unreadIds = list.filter((n) => !n.read).map((n) => n.id);
  return (
    <>
      <SheetHead title="Thông báo" onCancel={close} onDone={unreadIds.length ? () => markNotificationsRead(unreadIds) : undefined} doneLabel={unreadIds.length ? 'Đọc hết' : undefined} />
      <div className="sheet-body">
        {list.length === 0 ? (
          <Empty icon="bell" title="Chưa có thông báo" text="Việc mới, nhắc hạn và kết quả chấm báo cáo sẽ hiện ở đây." />
        ) : (
          <Section>
            <Group>
              {list.map((n) => (
                <Cell
                  key={n.id}
                  leading={<span className={`dot ${n.read ? 'gray' : 'blue'}`} style={{ opacity: n.read ? 0 : 1 }} />}
                  sepInset={36}
                  title={<span className={n.read ? '' : 'semibold'}>{n.title}</span>}
                  sub={
                    <>
                      <span className="clamp2">{n.body}</span>
                      <span className="t-foot c3">{relative(n.createdAt)}</span>
                    </>
                  }
                  onClick={() => {
                    if (!n.read) markNotificationsRead([n.id]);
                    if (n.link) {
                      close();
                      setTimeout(() => open(n.link!), 250);
                    }
                  }}
                />
              ))}
            </Group>
          </Section>
        )}
      </div>
    </>
  );
}

// ---------- Chọn người ----------
export function PersonPicker({
  title,
  people,
  selected,
  multi,
  onDone,
  close,
  allowNone,
}: {
  title: string;
  people: UserProfile[];
  selected: string[];
  multi?: boolean;
  onDone: (uids: string[]) => void;
  close: () => void;
  allowNone?: boolean;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(selected);
  const list = people.filter((p) => matches(`${p.fullName} ${p.department || ''} ${p.brand || ''} ${p.userCode || ''}`, q));
  const groups = useMemo(() => {
    const m = new Map<string, UserProfile[]>();
    list.forEach((p) => {
      const k = p.role === 'pg' ? 'PG' : p.department || ROLE_LABEL[p.role];
      m.set(k, [...(m.get(k) || []), p]);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [list]);
  const toggle = (uid: string) => {
    if (!multi) {
      onDone([uid]);
      close();
      return;
    }
    setSel((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));
  };
  return (
    <>
      <SheetHead
        title={title}
        onCancel={close}
        onDone={
          multi
            ? () => {
                onDone(sel);
                close();
              }
            : undefined
        }
        doneDisabled={multi && !sel.length && !allowNone}
      />
      <div className="sheet-body">
        <div style={{ padding: '4px 16px 0' }}>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm theo tên, bộ phận, hãng" />
        </div>
        {allowNone && !multi && (
          <Section>
            <Group>
              <Cell
                title="Không chọn"
                trailing={!selected.length ? <Icon name="check" size={20} className="tint" stroke={2.4} /> : undefined}
                onClick={() => {
                  onDone([]);
                  close();
                }}
              />
            </Group>
          </Section>
        )}
        {groups.map(([g, ps]) => (
          <Section key={g} title={g} small>
            <Group>
              {ps.map((p) => (
                <Cell
                  key={p.uid}
                  leading={<Avatar name={p.fullName} src={p.photoURL} size={38} />}
                  sepInset={66}
                  title={p.fullName}
                  sub={roleLine(p)}
                  trailing={
                    multi ? (
                      <Check on={sel.includes(p.uid)} />
                    ) : selected.includes(p.uid) ? (
                      <Icon name="check" size={20} className="tint" stroke={2.4} />
                    ) : undefined
                  }
                  onClick={() => toggle(p.uid)}
                />
              ))}
            </Group>
          </Section>
        ))}
        {!list.length && <Empty icon="search" title="Không tìm thấy" />}
      </div>
    </>
  );
}

// ---------- Hàng công việc ----------
export function TaskRow({ task, onOpen, showTarget = true }: { task: Task; onOpen: () => void; showTarget?: boolean }) {
  const s = useSession();
  const ui = useUI();
  const actor = useActor();
  const me = s.profile;
  const st = taskState(task);
  const meta = TASK_STATE_META[st];
  const canAct = !!me && isActor(task, me);
  const done = me ? myDone(task, me.uid) : task.status === 'done';
  const eachCount = task.completionMode === 'each' && task.scope !== 'personal' ? Object.keys(task.completions || {}).length : null;
  const checklistDone = task.checklist.filter((c) => c.done).length;

  const toggle = async () => {
    if (!canAct) {
      onOpen();
      return;
    }
    if (done) {
      if (task.status === 'pending_review' || task.status === 'done' || task.completionMode === 'each') {
        const ok = await ui.confirm('Mở lại công việc?', 'Việc sẽ trở về trạng thái cần làm.', 'Mở lại');
        if (ok) await reopenTask(task, actor);
      }
      return;
    }
    if (task.requirePhoto) {
      onOpen();
      return;
    }
    await completeTask(task, actor);
    ui.toast({ text: task.requireApproval ? 'Đã gửi quản lý duyệt' : 'Đã hoàn tất', icon: 'check', color: 'green' });
  };

  return (
    <div className="cell tappable" style={{ ['--sep-inset' as string]: '56px', alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }} onClick={onOpen} role="button" tabIndex={0}>
      <div style={{ paddingTop: 1 }}>
        <Check on={done} onClick={toggle} ring={st === 'overdue' ? 'red' : undefined} color={done ? 'green' : undefined} label="Hoàn tất" />
      </div>
      <div className="cell-body">
        <div className="row gap6">
          {task.priority === 'urgent' && <Icon name="bolt" size={16} className="c-red" stroke={2.2} />}
          {task.priority === 'high' && <span className="c-orange bold" style={{ fontSize: 15 }}>!!</span>}
          <div className={`cell-title${done ? ' c2' : ''}`} style={{ textDecoration: done && task.completionMode !== 'each' ? 'line-through' : undefined, textDecorationColor: 'var(--label-3)' }}>
            {task.title}
          </div>
        </div>
        <div className="row gap6 wrap" style={{ marginTop: 4 }}>
          {task.dueAt && (
            <span className={`t-foot ${st === 'overdue' ? 'c-red semibold' : st === 'soon' ? 'c-orange semibold' : 'c2'}`}>
              {st === 'overdue' ? `Quá hạn · ${dueLabel(task.dueAt)}` : dueLabel(task.dueAt)}
            </span>
          )}
          {showTarget && <span className="t-foot c2">{task.dueAt ? '· ' : ''}{targetLabel(task)}</span>}
          {task.checklist.length > 0 && (
            <span className="t-foot c2">
              · {checklistDone}/{task.checklist.length}
            </span>
          )}
          {eachCount !== null && <span className="t-foot c2">· {eachCount} đã xác nhận</span>}
          {task.requirePhoto && <Icon name="camera" size={14} className="c3" />}
          {task.activity.some((a) => a.type === 'comment') && <Icon name="message" size={14} className="c3" />}
        </div>
      </div>
      {(st === 'review' || st === 'returned') && <Pill sm color={meta.color}>{meta.label}</Pill>}
    </div>
  );
}

// ---------- Hướng dẫn cài lên màn hình chính ----------
export function InstallGuide({ close }: { close: () => void }) {
  return (
    <>
      <SheetHead title="Cài app lên iPhone" onCancel={close} />
      <div className="sheet-body">
        <div className="center" style={{ padding: '8px 24px 4px' }}>
          <span className="app-icon" style={{ width: 76, height: 76, margin: '0 auto' }}>
            <Icon name="bell" size={44} stroke={2} />
          </span>
          <div className="t-title2 mt16">{APP_NAME}</div>
          <div className="t-sub c2 mt8">Thêm vào Màn hình chính để mở như app thật, nhận thông báo nhắc việc và số đỏ trên biểu tượng.</div>
        </div>
        <Section>
          <Group>
            <Cell icon="share" iconColor="blue" title="Bước 1" sub={<>Mở bằng Safari, chạm nút <b>Chia sẻ</b> ở thanh dưới.</>} />
            <Cell icon="plusSquare" iconColor="gray" title="Bước 2" sub={<>Kéo xuống, chọn <b>Thêm vào MH chính</b>.</>} />
            <Cell icon="check" iconColor="green" title="Bước 3" sub={<>Bật <b>Mở dưới dạng ứng dụng web</b> rồi chạm <b>Thêm</b>.</>} />
            <Cell icon="bell" iconColor="red" title="Bước 4" sub={<>Mở app từ Màn hình chính, vào <b>Tài khoản › Thông báo</b> để bật nhắc việc.</>} />
          </Group>
        </Section>
      </div>
    </>
  );
}

export function InstallBanner() {
  const ui = useUI();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('nv-install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  if (hidden || isStandalone() || !isIOS()) return null;
  return (
    <Section>
      <div className="notice">
        <span className="notice-icon bg-blue">
          <Icon name="plusSquare" size={19} stroke={2} />
        </span>
        <div className="grow">
          <div className="t-headline">Cài app lên Màn hình chính</div>
          <div className="t-sub c2" style={{ marginTop: 2 }}>
            Để nhận thông báo nhắc việc trên iPhone.
          </div>
          <div className="row gap8 mt12">
            <button className="btn sm" onClick={() => ui.sheet((c) => <InstallGuide close={c} />)}>
              Xem cách cài
            </button>
            <button
              className="btn sm gray"
              onClick={() => {
                setHidden(true);
                try {
                  localStorage.setItem('nv-install-dismissed', '1');
                } catch {
                  /* bỏ qua */
                }
              }}
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PushBanner() {
  const s = useSession();
  const ui = useUI();
  const [status, setStatus] = useState(() => api().pushStatus());
  if (!s.auth || status === 'granted' || status === 'unsupported' || (isIOS() && !isStandalone())) return null;
  return (
    <Section>
      <div className="notice">
        <span className="notice-icon bg-red">
          <Icon name="bell" size={19} stroke={2} />
        </span>
        <div className="grow">
          <div className="t-headline">Bật thông báo nhắc việc</div>
          <div className="t-sub c2" style={{ marginTop: 2 }}>
            {status === 'denied' ? 'Thông báo đang bị tắt. Vào Cài đặt › Thông báo › Nhắc việc để bật lại.' : 'Nhận nhắc khi có việc mới, sắp đến hạn và giờ báo cáo 8NTTT.'}
          </div>
          {status !== 'denied' && (
            <button
              className="btn sm mt12"
              onClick={async () => {
                const r = await api().enablePush(s.auth!.uid);
                setStatus(api().pushStatus());
                if (r === 'granted') ui.toast({ text: 'Đã bật thông báo', icon: 'bell', color: 'green' });
                else if (r === 'error') ui.toast({ text: 'Chưa bật được thông báo, thử lại sau', icon: 'warning', color: 'orange' });
              }}
            >
              Bật thông báo
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

export function ToggleCell({ title, sub, checked, onChange, icon, iconColor }: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; icon?: never; iconColor?: never }) {
  void icon;
  void iconColor;
  return <Cell title={title} sub={sub} trailing={<Switch checked={checked} onChange={onChange} label={title} />} />;
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
