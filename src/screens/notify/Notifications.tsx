// Trung tâm thông báo: biểu ngữ trong app, cảnh báo việc khẩn, danh sách thông báo, cài đặt âm thanh.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Cell, Empty, Group, Pill, Section, Switch } from '../../ui/controls';
import { Icon, type IconName } from '../../ui/Icon';
import { AppIcon } from '../../ui/AppIcon';
import { api } from '../../lib/backend';
import { markNotificationsRead, markSeen, sendTestNotification } from '../../lib/actions';
import { LEVEL_LABEL, getSoundSettings, installAudioUnlock, levelOf, playSound, setSoundSettings, startAlarm, stopAlarm, unlockAudio } from '../../lib/sound';
import { now, relative, vnDate } from '../../lib/time';
import { InstallGuide, isIOS, isStandalone, useActor, useOpenLink } from '../shared';
import type { AppNotification, NotifyLevel, Task } from '../../lib/types';

export function kindOf(link?: string | null): { icon: IconName; color: string; label: string } {
  if (!link) return { icon: 'bell', color: 'gray', label: 'Nhắc việc' };
  if (link.startsWith('task')) return { icon: 'checklist', color: 'blue', label: 'Công việc' };
  if (link.startsWith('report')) return { icon: 'camera', color: 'green', label: 'Báo cáo 8NTTT' };
  if (link.startsWith('post')) return { icon: 'books', color: 'orange', label: 'Thư viện' };
  if (link === 'people') return { icon: 'people', color: 'indigo', label: 'Nhân sự' };
  return { icon: 'bell', color: 'gray', label: 'Nhắc việc' };
}

const LEVEL_COLOR: Record<NotifyLevel, string> = { normal: 'gray', high: 'orange', urgent: 'red' };
const RANK: Record<NotifyLevel, number> = { normal: 0, high: 1, urgent: 2 };

// ------------------------------------------------------------------
// Theo dõi thông báo mới khi app đang mở: phát âm thanh, hiện biểu ngữ / cảnh báo khẩn
// ------------------------------------------------------------------
export function NotificationCenter() {
  const d = useStoreData();
  const open = useOpenLink();
  const actor = useActor();
  const since = useRef(now() - 15000);
  const alerted = useRef(new Set<string>());
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [urgent, setUrgent] = useState<AppNotification | null>(null);

  useEffect(() => {
    installAudioUnlock();
    return () => stopAlarm();
  }, []);

  useEffect(() => {
    const fresh = d.notifications
      .filter((n) => !n.read && n.createdAt >= since.current && !alerted.current.has(n.id))
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!fresh.length) return;
    fresh.forEach((n) => alerted.current.add(n.id));
    const urg = fresh.filter((n) => levelOf(n) === 'urgent');
    if (urg.length) {
      setUrgent(urg[urg.length - 1]);
      startAlarm();
    }
    const rest = fresh.filter((n) => levelOf(n) !== 'urgent');
    if (rest.length) setQueue((q) => [...q, ...rest].slice(-5));
  }, [d.notifications]);

  const acknowledge = async (n: AppNotification, go: boolean) => {
    stopAlarm();
    setUrgent(null);
    markNotificationsRead([n.id]).catch(() => {});
    if (n.link?.startsWith('task:')) {
      const t = await api().get<Task>('tasks', n.link.slice(5)).catch(() => null);
      if (t) markSeen(t, actor).catch(() => {});
    }
    if (go && n.link) open(n.link);
  };

  const current = !urgent ? queue[0] : undefined;
  return (
    <>
      {current && (
        <Banner
          key={current.id}
          n={current}
          onOpen={() => {
            markNotificationsRead([current.id]).catch(() => {});
            setQueue((q) => q.slice(1));
            if (current.link) open(current.link);
          }}
          onClose={() => setQueue((q) => q.slice(1))}
        />
      )}
      {urgent && <UrgentAlert n={urgent} onView={() => acknowledge(urgent, true)} onAck={() => acknowledge(urgent, false)} />}
    </>
  );
}

function Banner({ n, onOpen, onClose }: { n: AppNotification; onOpen: () => void; onClose: () => void }) {
  const level = levelOf(n);
  const [out, setOut] = useState(false);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playSound(level);
    const ms = level === 'high' ? 9000 : 5500;
    const t1 = setTimeout(() => setOut(true), ms);
    const t2 = setTimeout(onClose, ms + 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOut(true);
    setTimeout(onClose, 280);
  };

  return createPortal(
    <div className="nbanner-wrap" role="status" aria-live="assertive">
      <div
        ref={ref}
        className={`nbanner ${level}${out ? ' out' : ''}`}
        onClick={onOpen}
        onTouchStart={(e) => (drag.current = { y: e.touches[0].clientY, dy: 0 })}
        onTouchMove={(e) => {
          if (!drag.current || !ref.current) return;
          drag.current.dy = Math.min(0, e.touches[0].clientY - drag.current.y);
          ref.current.style.transform = `translateY(${drag.current.dy}px)`;
        }}
        onTouchEnd={() => {
          if (drag.current && drag.current.dy < -30) close();
          else if (ref.current) ref.current.style.transform = '';
          drag.current = null;
        }}
      >
        <AppIcon size={38} />
        <div className="grow">
          <div className="nb-head">
            <span className="nb-app">NHẮC VIỆC</span>
            {level !== 'normal' && <span className={`nb-level ${level}`}>{LEVEL_LABEL[level]}</span>}
            <span className="nb-time">bây giờ</span>
          </div>
          <div className="nb-title">{n.title}</div>
          <div className="nb-body">{n.body}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UrgentAlert({ n, onView, onAck }: { n: AppNotification; onView: () => void; onAck: () => void }) {
  return createPortal(
    <div className="ualert-wrap" role="alertdialog" aria-modal="true" aria-label="Thông báo khẩn">
      <div className="ualert">
        <div className="ualert-head">
          <div className="ualert-ring">
            <Icon name="bolt" size={34} stroke={2.2} />
          </div>
          <div className="t-headline" style={{ letterSpacing: 0.4 }}>
            KHẨN
          </div>
          <div className="t-foot" style={{ opacity: 0.85 }}>
            {n.fromName && n.fromName !== 'Nhắc việc' ? `${n.fromName} · ` : ''}
            {relative(n.createdAt)}
          </div>
        </div>
        <div className="ualert-body">
          <div className="t-title3">{n.title}</div>
          <div className="t-body mt8 c2" style={{ whiteSpace: 'pre-wrap' }}>
            {n.body}
          </div>
        </div>
        <div className="ualert-actions">
          {n.link && (
            <button className="btn danger block" onClick={onView}>
              Xem ngay
            </button>
          )}
          <button className="btn gray block" onClick={onAck}>
            Đã nhận
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------
// Danh sách thông báo
// ------------------------------------------------------------------
export function NotificationsSheet({ close }: { close: () => void }) {
  const d = useStoreData();
  const ui = useUI();
  const open = useOpenLink();
  const [filter, setFilter] = useState<'all' | 'unread' | 'important'>('all');
  const today = vnDate();
  const all = d.notifications;
  const list = all.filter((n) => (filter === 'unread' ? !n.read : filter === 'important' ? levelOf(n) !== 'normal' : true));
  const unreadIds = all.filter((n) => !n.read).map((n) => n.id);
  const groups: [string, AppNotification[]][] = [
    ['Hôm nay', list.filter((n) => vnDate(n.createdAt) === today)],
    ['Trước đó', list.filter((n) => vnDate(n.createdAt) !== today)],
  ];

  return (
    <>
      <SheetHead title="Thông báo" onCancel={close} onDone={unreadIds.length ? () => markNotificationsRead(unreadIds) : undefined} doneLabel={unreadIds.length ? 'Đọc hết' : undefined} />
      <div className="sheet-body">
        <div className="chip-row" style={{ paddingTop: 4 }}>
          {(
            [
              ['all', 'Tất cả'],
              ['unread', `Chưa đọc${unreadIds.length ? ` ${unreadIds.length}` : ''}`],
              ['important', 'Quan trọng'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty icon="bell" title={filter === 'all' ? 'Chưa có thông báo' : 'Không có thông báo'} text="Việc mới, nhắc hạn và kết quả chấm báo cáo sẽ hiện ở đây." />
        ) : (
          groups
            .filter(([, g]) => g.length)
            .map(([title, g]) => (
              <Section key={title} title={title} small>
                <Group>
                  {g.map((n) => {
                    const k = kindOf(n.link);
                    const level = levelOf(n);
                    return (
                      <button
                        key={n.id}
                        className="cell"
                        style={{ alignItems: 'flex-start', ['--sep-inset' as string]: '62px' }}
                        onClick={() => {
                          if (!n.read) markNotificationsRead([n.id]);
                          if (n.link) {
                            close();
                            setTimeout(() => open(n.link!), 250);
                          }
                        }}
                      >
                        <span className={`cell-icon bg-${level === 'normal' ? k.color : LEVEL_COLOR[level]}`} style={{ width: 34, height: 34, borderRadius: 17, marginTop: 2 }}>
                          <Icon name={level === 'urgent' ? 'bolt' : k.icon} size={18} stroke={2.1} />
                        </span>
                        <div className="cell-body">
                          <div className="row gap6">
                            <span className="t-cap c2 grow ellipsis">{k.label}</span>
                            <span className="t-cap c3">{relative(n.createdAt)}</span>
                            {!n.read && <span className="dot blue" />}
                          </div>
                          <div className={`t-sub ${n.read ? '' : 'semibold'}`} style={{ marginTop: 2 }}>
                            {n.title}
                          </div>
                          <div className="t-sub c2 clamp2">{n.body}</div>
                          {level !== 'normal' && (
                            <div style={{ marginTop: 6 }}>
                              <Pill sm color={LEVEL_COLOR[level]} icon={level === 'urgent' ? 'bolt' : undefined}>
                                {LEVEL_LABEL[level]}
                              </Pill>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </Group>
              </Section>
            ))
        )}
        <Section>
          <Group>
            <Cell icon="sliders" iconColor="gray" title="Cài đặt thông báo & âm thanh" chevron onClick={() => ui.sheet((c) => <NotifySettingsSheet close={c} />)} />
          </Group>
        </Section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------
// Cài đặt thông báo & âm thanh
// ------------------------------------------------------------------
export function NotifySettingsSheet({ close }: { close: () => void }) {
  const s = useSession();
  const ui = useUI();
  const actor = useActor();
  const [push, setPush] = useState(() => api().pushStatus());
  const [snd, setSnd] = useState(getSoundSettings);
  const needInstall = isIOS() && !isStandalone();

  const update = (p: Partial<typeof snd>) => {
    const next = { ...snd, ...p };
    setSnd(next);
    setSoundSettings(next);
  };

  const enablePush = async () => {
    if (needInstall) {
      ui.sheet((c) => <InstallGuide close={c} />);
      return;
    }
    const r = await api().enablePush(s.auth!.uid);
    setPush(api().pushStatus());
    if (r === 'granted') ui.toast({ text: 'Đã bật thông báo', icon: 'bell', color: 'green' });
    else if (r === 'denied') ui.alert({ title: 'Thông báo đang tắt', message: 'Vào Cài đặt › Thông báo › Nhắc việc và bật Cho phép thông báo.' });
    else ui.alert({ title: 'Chưa bật được', message: 'Hãy mở app từ biểu tượng trên Màn hình chính rồi thử lại.' });
  };

  const test = async (level: NotifyLevel) => {
    if (!s.storeCode) return;
    unlockAudio();
    await sendTestNotification(s.storeCode, actor, level);
    ui.toast({ text: 'Đã gửi. Khoá màn hình ngay để nghe âm báo của iPhone', icon: 'bell', color: LEVEL_COLOR[level] === 'gray' ? 'blue' : LEVEL_COLOR[level] });
  };

  return (
    <>
      <SheetHead title="Thông báo & âm thanh" onCancel={close} />
      <div className="sheet-body">
        <Section title="Thông báo đẩy" small footer={needInstall ? 'iPhone chỉ nhận thông báo khi app được thêm vào Màn hình chính và mở từ biểu tượng.' : undefined}>
          <Group>
            <Cell
              icon="bell"
              iconColor={push === 'granted' ? 'green' : 'red'}
              title={push === 'granted' ? 'Đang bật' : push === 'denied' ? 'Đang tắt trong Cài đặt' : 'Chưa bật'}
              sub={push === 'granted' ? 'Nhận thông báo cả khi đã khoá màn hình' : 'Bật để không bỏ lỡ việc mới và nhắc hạn'}
              trailing={push !== 'granted' ? <button className="btn sm" onClick={enablePush}>Bật</button> : undefined}
            />
          </Group>
        </Section>

        <Section title="Gửi thử" small footer="Bấm rồi khoá màn hình ngay để nghe âm báo của iPhone. Việc Khẩn hoặc Ưu tiên cao chưa được mở sẽ được nhắc lại vài lần.">
          <Group>
            {(['normal', 'high', 'urgent'] as NotifyLevel[]).map((l) => (
              <Cell
                key={l}
                icon={l === 'urgent' ? 'bolt' : 'bell'}
                iconColor={l === 'normal' ? 'blue' : LEVEL_COLOR[l]}
                title={`Thông báo ${LEVEL_LABEL[l].toLowerCase()}`}
                trailing={<span className="tint t-sub semibold">Gửi</span>}
                onClick={() => test(l)}
              />
            ))}
          </Group>
        </Section>

        <Section title="Âm thanh trong app" small footer="Khi đang mở app, mỗi mức độ có âm riêng. Việc Khẩn hiện cảnh báo và đổ chuông đến khi bấm Đã nhận.">
          <Group>
            <Cell title="Phát âm thanh" trailing={<Switch checked={snd.enabled} onChange={(v) => update({ enabled: v })} label="Phát âm thanh" />} />
            <div className="field" style={{ gap: 14 }}>
              <Icon name="minus" size={18} className="c3" />
              <input
                type="range"
                className="range"
                min={0.2}
                max={1}
                step={0.05}
                value={snd.volume}
                onChange={(e) => update({ volume: Number(e.target.value) })}
                aria-label="Âm lượng"
              />
              <Icon name="plus" size={18} className="c3" />
            </div>
            {(['normal', 'high', 'urgent'] as NotifyLevel[]).map((l) => (
              <Cell
                key={l}
                title={`Nghe thử: ${LEVEL_LABEL[l]}`}
                trailing={<Icon name="chevronRight" size={16} stroke={2.4} className="c3" />}
                onClick={() => {
                  unlockAudio();
                  playSound(l, true);
                }}
              />
            ))}
          </Group>
        </Section>

        <Section title="Để không bỏ lỡ thông báo trên iPhone" small footer="Âm báo của thông báo đẩy do iPhone quyết định, app không đổi được. Các bước trên giúp thông báo to và nổi bật hơn.">
          <Group>
            <Step n={1} title="Đổi âm báo mặc định" text="Cài đặt › Âm thanh & Cảm ứng › Cảnh báo mặc định (Default Alerts): chọn một âm to, dài hơn và kiểu rung mạnh. Áp dụng cho iOS 17.2 trở lên." />
            <Step n={2} title="Tăng âm lượng báo" text="Cài đặt › Âm thanh & Cảm ứng: kéo thanh Chuông và cảnh báo lên cao." />
            <Step n={3} title="Tắt chế độ im lặng" text="Gạt công tắc bên hông, hoặc dùng nút Tác vụ trên iPhone 15 Pro trở lên." />
            <Step n={4} title="Giữ thông báo trên màn hình" text="Cài đặt › Thông báo › Nhắc việc: bật Âm thanh, chọn Kiểu biểu ngữ là Liên tục (Persistent)." />
            <Step n={5} title="Cho phép khi đang Tập trung" text="Cài đặt › Tập trung › chế độ đang dùng › Ứng dụng: thêm Nhắc việc." />
          </Group>
        </Section>
      </div>
    </>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="cell" style={{ alignItems: 'flex-start', ['--sep-inset' as string]: '56px' }}>
      <span className="step-num">{n}</span>
      <div className="cell-body">
        <div className="t-headline" style={{ fontSize: 16 }}>
          {title}
        </div>
        <div className="t-sub c2" style={{ marginTop: 2 }}>
          {text}
        </div>
      </div>
    </div>
  );
}

export const levelRank = RANK;
