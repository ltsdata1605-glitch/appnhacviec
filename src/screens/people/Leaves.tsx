import { useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Pill, Section, SwipeRow } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { addDays, dm, longDate, vnAt, vnDate } from '../../lib/time';
import { addLeave, decideLeave, removeLeave } from '../../lib/actions';
import { PersonPicker, useActor } from '../shared';
import type { Leave } from '../../lib/types';

export function LeaveSheet({ close, presetUid, onSave, self }: { close: () => void; presetUid?: string; onSave: (l: Omit<Leave, 'id' | 'createdAt'>) => Promise<void>; self?: boolean }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const [uid, setUid] = useState(presetUid || '');
  const [from, setFrom] = useState(vnDate());
  const [to, setTo] = useState(vnDate());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const person = d.byUid(uid) || (self ? s.profile : undefined);
  const days: string[] = [];
  for (let x = from; x <= to && days.length < 31; x = addDays(x, 1)) days.push(x);

  return (
    <>
      <SheetHead
        title={self ? 'Xin nghỉ' : 'Báo nghỉ'}
        onCancel={close}
        doneLabel={self ? 'Gửi' : 'Lưu'}
        doneDisabled={!person || !days.length}
        busy={busy}
        onDone={async () => {
          setBusy(true);
          for (const date of days)
            await onSave({ storeCode: s.storeCode!, uid: person!.uid, userName: person!.fullName, date, reason: reason.trim(), status: self ? 'pending' : 'approved', createdBy: actor.uid });
          ui.toast({ text: self ? 'Đã gửi đơn xin nghỉ' : `Đã báo nghỉ ${days.length} ngày`, icon: 'calendar', color: 'orange' });
          close();
        }}
      />
      <div className="sheet-body">
        <Section footer={self ? 'Quản lý sẽ duyệt. Ngày nghỉ được duyệt không tính thiếu báo cáo 8NTTT, người dự phòng sẽ báo cáo thay.' : 'Ngày nghỉ không tính thiếu báo cáo. Người dự phòng của khu vực sẽ được giao báo cáo thay.'}>
          <Group>
            {!self && (
              <Cell
                leading={person ? <Avatar name={person.fullName} src={person.photoURL} size={32} /> : undefined}
                title="Nhân viên"
                detail={person?.fullName || 'Chọn'}
                chevron
                onClick={() => ui.sheet((c) => <PersonPicker title="Nhân viên nghỉ" people={d.active} selected={uid ? [uid] : []} close={c} onDone={(u) => setUid(u[0])} />)}
              />
            )}
            <div className="field">
              <label>Từ ngày</label>
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
            </div>
            <div className="field">
              <label>Đến ngày</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="field">
              <label>Lý do</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tuỳ chọn" />
            </div>
          </Group>
        </Section>
        {days.length > 1 && <div className="t-foot c2 center">{days.length} ngày</div>}
      </div>
    </>
  );
}

export function LeavesScreen() {
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const today = vnDate();
  const upcoming = d.leaves.filter((l) => l.date >= today && l.status !== 'rejected').sort((a, b) => a.date.localeCompare(b.date));
  const past = d.leaves.filter((l) => l.date < today && l.status === 'approved').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const byDate = new Map<string, Leave[]>();
  upcoming.forEach((l) => byDate.set(l.date, [...(byDate.get(l.date) || []), l]));

  const row = (l: Leave) => (
    <SwipeRow key={l.id} actions={[{ label: 'Xoá', icon: 'trash', color: 'red', onClick: () => removeLeave(l) }]}>
      <Cell
        leading={<Avatar name={l.userName} src={d.byUid(l.uid)?.photoURL} size={36} />}
        sepInset={64}
        title={l.userName}
        sub={l.reason || undefined}
        trailing={l.status === 'pending' ? <Pill sm color="orange">Chờ duyệt</Pill> : undefined}
        onClick={
          l.status === 'pending'
            ? async () => {
                const v = await ui.actions(
                  [
                    { label: 'Duyệt nghỉ', value: 'ok', icon: 'check' },
                    { label: 'Không duyệt', value: 'no', icon: 'xmark', destructive: true },
                  ],
                  `${l.userName} · ${dm(l.date)}`,
                );
                if (v) await decideLeave(l, actor, v === 'ok');
              }
            : undefined
        }
      />
    </SwipeRow>
  );

  return (
    <Page
      title="Lịch nghỉ"
      large={false}
      right={
        <button className="glass-btn icon prominent" aria-label="Báo nghỉ" onClick={() => ui.sheet((c) => <LeaveSheet close={c} onSave={(l) => addLeave(l, actor, [])} />)}>
          <Icon name="plus" size={22} stroke={2.4} />
        </button>
      }
    >
      {byDate.size === 0 && !past.length ? (
        <Empty icon="calendar" title="Chưa có lịch nghỉ" text="Báo nghỉ để hệ thống không tính thiếu báo cáo và chuyển cho người dự phòng." />
      ) : (
        [...byDate.entries()].map(([date, list]) => (
          <Section key={date} title={date === today ? 'Hôm nay' : longDate(vnAt(date, '12:00'))} small>
            <Group>{list.map(row)}</Group>
          </Section>
        ))
      )}
      {past.length > 0 && (
        <Section title="Đã nghỉ gần đây" small>
          <Group>
            {past.map((l) => (
              <Cell key={l.id} leading={<Avatar name={l.userName} size={32} />} sepInset={60} title={l.userName} detail={dm(l.date)} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}
