import { useEffect, useState } from 'react';
import { useDoc, useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Check, Empty, Group, Img, Loading, Pill, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { dueLabel, friendly, stamp } from '../../lib/time';
import { TASK_STATE_META, actorsOf, isActor, myDone, taskState, targetLabel } from '../../lib/tasks';
import { PRIORITY_LABEL } from '../../lib/constants';
import { uploadShots } from '../../lib/photos';
import { approveTask, commentTask, completeTask, deleteTask, markSeen, nudgeTask, reopenTask, returnTask, toggleChecklist } from '../../lib/actions';
import { useActor } from '../shared';
import { useProofCamera } from '../reports/Capture';
import { MentionInput, MentionText } from '../../ui/Mention';
import { extractMentions } from '../../lib/mentions';
import { PhotoViewer } from '../reports/ReportDetail';
import { TaskEditor } from './TaskEditor';
import type { Activity, Photo, Task } from '../../lib/types';

const ACT_TEXT: Record<Activity['type'], string> = {
  created: 'đã giao việc',
  seen: 'đã xem',
  done: 'đã hoàn tất',
  confirmed: 'đã xác nhận hoàn tất',
  reopened: 'đã mở lại',
  submitted: 'đã gửi duyệt',
  approved: 'đã duyệt',
  returned: 'đã trả lại',
  comment: '',
  nudged: 'đã nhắc việc',
  edited: 'đã chỉnh sửa',
};
const ACT_COLOR: Partial<Record<Activity['type'], string>> = { done: 'green', confirmed: 'green', approved: 'green', returned: 'red', nudged: 'orange', submitted: 'blue', created: 'blue' };

export function TaskDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const { data: t, loading } = useDoc<Task>('tasks', id);
  const [comment, setComment] = useState('');
  const [viewer, setViewer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const proof = useProofCamera();
  const me = s.profile;

  useEffect(() => {
    if (t && me && isActor(t, me) && !t.seenBy?.[me.uid]) markSeen(t, actor).catch(() => {});
  }, [t?.id, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Page title="Công việc" large={false}><Loading /></Page>;
  if (!t) return <Page title="Công việc" large={false}><Empty icon="checklist" title="Không tìm thấy công việc" text="Việc có thể đã bị xoá." /></Page>;

  const st = taskState(t);
  const meta = TASK_STATE_META[st];
  const actorMe = !!me && isActor(t, me);
  const done = me ? myDone(t, me.uid) : false;
  const manage = s.isManager || t.createdBy === me?.uid;
  const each = t.completionMode === 'each' && t.scope !== 'personal';
  const group = t.scope !== 'personal' ? actorsOf(t, d.active) : [];
  const confirmed = group.filter((m) => t.completions?.[m.uid]);
  const notYet = group.filter((m) => !t.completions?.[m.uid]);
  const seenCount = Object.keys(t.seenBy || {}).length;

  const finish = async (photos: Photo[] = []) => {
    setBusy(true);
    try {
      await completeTask(t, actor, photos);
      ui.toast({ text: t.requireApproval && !each ? 'Đã gửi quản lý duyệt' : 'Đã hoàn tất', icon: 'check', color: 'green' });
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (t.requirePhoto) {
      const shots = await proof.capture(t.title);
      if (!shots?.length) return;
      setBusy(true);
      try {
        const photos = await uploadShots(shots, (sh, i) => `tasks/${t.storeCode}/${t.id}/${actor.uid}/${sh.capturedAt}_${i}`);
        await finish(photos);
      } catch {
        ui.alert({ title: 'Chưa gửi được ảnh', message: 'Kiểm tra kết nối mạng rồi thử lại.' });
        setBusy(false);
      }
      return;
    }
    await finish();
  };

  const more = async () => {
    const items = [
      ...(manage ? [{ label: 'Sửa công việc', value: 'edit', icon: 'pencil' as const }] : []),
      ...(manage && t.status !== 'done' ? [{ label: 'Nhắc người chưa làm', value: 'nudge', icon: 'bell' as const }] : []),
      ...(manage ? [{ label: 'Xoá công việc', value: 'delete', icon: 'trash' as const, destructive: true }] : []),
    ];
    const v = await ui.actions(items, t.title);
    if (v === 'edit') ui.sheet((close) => <TaskEditor close={close} task={t} />);
    if (v === 'nudge') {
      const uids = t.scope === 'personal' ? [t.assigneeUid!] : notYet.map((m) => m.uid);
      await nudgeTask(t, actor, uids);
      ui.toast({ text: `Đã nhắc ${uids.length} người`, icon: 'bell', color: 'orange' });
    }
    if (v === 'delete' && (await ui.confirm('Xoá công việc?', 'Không thể hoàn tác.', 'Xoá', true))) {
      await deleteTask(t);
      nav.pop();
    }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    const to = [t.createdBy, ...(t.scope === 'personal' ? [t.assigneeUid!] : []), ...t.activity.filter((a) => a.type === 'comment').map((a) => a.uid)];
    await commentTask(t, actor, comment, to, extractMentions(comment, d.active).filter((u) => u !== actor.uid));
    setComment('');
  };

  let footer: React.ReactNode;
  if (s.isManager && t.status === 'pending_review') {
    footer = (
      <>
        <button
          className="btn danger-tinted"
          style={{ flex: 1 }}
          onClick={async () => {
            const reason = await ui.prompt('Trả lại công việc', 'Ghi rõ điều cần làm lại.', 'Lý do', 'Trả lại');
            if (reason !== null) await returnTask(t, actor, reason || 'Cần làm lại');
          }}
        >
          Trả lại
        </button>
        <button className="btn green" style={{ flex: 1.3 }} onClick={() => approveTask(t, actor)}>
          <Icon name="check" size={19} stroke={2.4} />
          Duyệt
        </button>
      </>
    );
  } else if (actorMe && !done) {
    footer = (
      <button className="btn block" onClick={onComplete} disabled={busy}>
        {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : <Icon name={t.requirePhoto ? 'camera' : 'check'} size={20} stroke={2.3} />}
        {each ? 'Xác nhận đã hoàn tất' : t.requirePhoto ? 'Chụp ảnh & hoàn tất' : t.requireApproval ? 'Hoàn tất & gửi duyệt' : 'Đánh dấu hoàn tất'}
      </button>
    );
  } else if (actorMe && done && t.status !== 'done') {
    footer = (
      <button className="btn block gray" onClick={() => reopenTask(t, actor)}>
        Mở lại
      </button>
    );
  }

  const photos = t.photos || [];

  return (
    <Page
      title={t.title}
      large={false}
      right={
        manage ? (
          <button className="glass-btn icon" onClick={more} aria-label="Tuỳ chọn">
            <Icon name="ellipsis" size={22} />
          </button>
        ) : undefined
      }
      footer={footer}
    >
      <div style={{ padding: '4px 20px 0' }}>
        <div className="row gap8 wrap">
          <Pill color={done && each ? 'green' : meta.color}>{done && each ? 'Bạn đã xác nhận' : meta.label}</Pill>
          {t.priority !== 'normal' && (
            <Pill color={t.priority === 'urgent' ? 'red' : 'orange'} icon={t.priority === 'urgent' ? 'bolt' : undefined}>
              {PRIORITY_LABEL[t.priority]}
            </Pill>
          )}
          {t.templateId && <Pill icon="repeat">Lặp lại</Pill>}
        </div>
        <div className="t-title2 mt12" style={{ userSelect: 'text' }}>
          {t.title}
        </div>
        {t.note && t.note !== t.title && (
          <div className="t-body mt8" style={{ userSelect: 'text' }}>
            <MentionText text={t.note} />
          </div>
        )}
        {t.handover && (
          <div className="notice mt12">
            <span className="notice-icon bg-orange">
              <Icon name="handover" size={18} />
            </span>
            <div className="t-sub">
              Bàn giao từ <b>{t.handover.fromName}</b> · {t.handover.shift}
              <div className="t-foot c2">Người hoặc bộ phận nhận phải xử lý xong và bấm hoàn tất.</div>
            </div>
          </div>
        )}
      </div>

      <Section>
        <Group>
          <Cell icon={t.scope === 'personal' ? 'person' : t.scope === 'store' ? 'store' : 'people'} iconColor="blue" title="Giao cho" detail={targetLabel(t)} />
          <Cell icon="clock" iconColor={st === 'overdue' ? 'red' : 'orange'} title="Hạn chót" detail={t.dueAt ? dueLabel(t.dueAt) : 'Không có'} />
          <Cell icon="person" iconColor="gray" title="Người giao" detail={t.createdByName} />
          {t.scope === 'personal' ? (
            <Cell icon="eye" iconColor="teal" title="Đã xem" detail={t.assigneeUid && t.seenBy?.[t.assigneeUid] ? friendly(t.seenBy[t.assigneeUid]) : 'Chưa xem'} />
          ) : (
            <Cell icon="eye" iconColor="teal" title="Đã xem" detail={`${seenCount}/${group.length || '—'} người`} />
          )}
          {t.completedByName && !each && <Cell icon="check" iconColor="green" title="Hoàn tất bởi" detail={`${t.completedByName} · ${friendly(t.completedAt!)}`} />}
        </Group>
      </Section>

      {each && (
        <Section title={`Xác nhận ${confirmed.length}/${group.length}`} small>
          <div className="card">
            <div className="bar">
              <i style={{ width: `${group.length ? (confirmed.length / group.length) * 100 : 0}%`, background: 'var(--green)' }} />
            </div>
            {s.isManager && notYet.length > 0 && (
              <>
                <div className="t-foot c2 mt12 semibold">Chưa xác nhận</div>
                <div className="row gap6 wrap mt8">
                  {notYet.map((m) => (
                    <span key={m.uid} className="pill gray">
                      {m.fullName}
                    </span>
                  ))}
                </div>
              </>
            )}
            {confirmed.length > 0 && (
              <>
                <div className="t-foot c2 mt12 semibold">Đã xác nhận</div>
                <div className="row gap6 wrap mt8">
                  {confirmed.map((m) => (
                    <span key={m.uid} className="pill green">
                      {m.fullName}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {t.checklist.length > 0 && (
        <Section title={`Checklist ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`} small>
          <Group>
            {t.checklist.map((c) => (
              <Cell
                key={c.id}
                leading={<Check on={c.done} size={24} onClick={actorMe || manage ? () => toggleChecklist(t, c.id, actor) : undefined} />}
                sepInset={54}
                title={<span style={{ textDecoration: c.done ? 'line-through' : undefined, color: c.done ? 'var(--label-2)' : undefined }}>{c.text}</span>}
                sub={c.done && c.by ? `${d.nameOf(c.by)} · ${friendly(c.at!)}` : undefined}
                onClick={actorMe || manage ? () => toggleChecklist(t, c.id, actor) : undefined}
              />
            ))}
          </Group>
        </Section>
      )}

      {photos.length > 0 && (
        <Section title="Ảnh xác nhận" small>
          <div className="photo-grid">
            {photos.map((p, i) => (
              <button key={i} className="ph" onClick={() => setViewer(i)}>
                <Img src={p.thumbUrl} />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Hoạt động" small>
        <div className="card">
          <div className="timeline">
            {[...t.activity]
              .sort((a, b) => a.at - b.at)
              .map((a, i) => (
                <div key={i} className={`tl-item ${ACT_COLOR[a.type] || ''}`}>
                  {a.type === 'comment' ? (
                    <div className="row gap8" style={{ alignItems: 'flex-start' }}>
                      <Avatar name={a.name} src={d.byUid(a.uid)?.photoURL} size={28} />
                      <div className="grow">
                        <div className="t-foot">
                          <b>{a.name}</b> <span className="c2">· {friendly(a.at)}</span>
                        </div>
                        <div className="t-sub" style={{ userSelect: 'text' }}>
                          <MentionText text={a.note || ''} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="t-sub">
                      <b style={{ fontWeight: 600 }}>{a.name}</b> {ACT_TEXT[a.type]}
                      {a.note ? `: “${a.note}”` : ''}
                      <div className="t-foot c2">{stamp(a.at)}</div>
                    </div>
                  )}
                </div>
              ))}
          </div>
          <div className="row gap8 mt12">
            <MentionInput
              className="input"
              style={{ height: 40, background: 'var(--fill-3)', borderRadius: 20, padding: '0 14px', fontSize: 16, width: '100%' }}
              placeholder="Viết bình luận, gõ @ để gắn tên"
              value={comment}
              onChange={setComment}
              onEnter={sendComment}
              enterKeyHint="send"
            />
            <button className="glass-btn icon prominent" style={{ width: 40, height: 40, minWidth: 40 }} onClick={sendComment} disabled={!comment.trim()} aria-label="Gửi">
              <Icon name="chevronUp" size={20} stroke={2.6} />
            </button>
          </div>
        </div>
      </Section>
      {viewer !== null && <PhotoViewer photos={photos} index={viewer} title={t.title} onClose={() => setViewer(null)} />}
      {proof.element}
    </Page>
  );
}
