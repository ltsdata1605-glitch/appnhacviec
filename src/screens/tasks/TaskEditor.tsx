import { useMemo, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Cell, Group, Section, Segmented, Switch } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { PRIORITY_LABEL, REMIND_OPTIONS, SCOPE_LABEL } from '../../lib/constants';
import { addDays, fromInputs, vnDate, vnTime, now, WEEKDAY_SHORT } from '../../lib/time';
import { createTasks, saveTemplate, updateTaskFields } from '../../lib/actions';
import { generateForToday } from '../../lib/recurring';
import { api } from '../../lib/backend';
import { PersonPicker, useActor } from '../shared';
import type { Priority, Recurrence, Task, TaskScope, TaskTemplate } from '../../lib/types';

interface Props {
  close: () => void;
  task?: Task; // sửa việc
  template?: TaskTemplate; // sửa mẫu lặp lại
  forceRepeat?: boolean;
  presetAssignee?: string;
}

export function TaskEditor({ close, task, template, forceRepeat, presetAssignee }: Props) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const editing = !!task;
  const src = task || template;

  const [title, setTitle] = useState(src?.title || '');
  const [note, setNote] = useState(src?.note || '');
  const [scope, setScope] = useState<TaskScope>(src?.scope || (presetAssignee ? 'personal' : 'personal'));
  const [assignees, setAssignees] = useState<string[]>(template?.assigneeUids || (task?.assigneeUid ? [task.assigneeUid] : presetAssignee ? [presetAssignee] : []));
  const [department, setDepartment] = useState<string>(src?.department || store.departments[1] || store.departments[0] || '');
  const brands = useMemo(() => [...new Set([...d.active.filter((m) => m.role === 'pg' && m.brand).map((m) => m.brand!), ...store.brands])], [d.active, store.brands]);
  const [brand, setBrand] = useState<string>(src?.brand || brands[0] || '');
  const [priority, setPriority] = useState<Priority>(src?.priority || 'normal');
  const initialDue = task?.dueAt ?? now() + 3 * 3600000;
  const [hasDue, setHasDue] = useState(task ? !!task.dueAt : true);
  const [dueDate, setDueDate] = useState(vnDate(initialDue));
  const [dueTime, setDueTime] = useState(template?.recurrence.time || (task?.dueAt ? vnTime(task.dueAt) : roundTime(initialDue)));
  const [remind, setRemind] = useState<number | null>(src?.remindBefore ?? 30);
  const [checklist, setChecklist] = useState<string[]>(task ? task.checklist.map((c) => c.text) : template?.checklist || []);
  const [requirePhoto, setRequirePhoto] = useState(src?.requirePhoto || false);
  const [requireApproval, setRequireApproval] = useState(src?.requireApproval || false);
  const [each, setEach] = useState(src?.completionMode === 'each');
  const [repeat, setRepeat] = useState<Recurrence['type'] | 'none'>(template ? template.recurrence.type : forceRepeat ? 'daily' : 'none');
  const [repeatDays, setRepeatDays] = useState<number[]>(template?.recurrence.days || [1, 2, 3, 4, 5, 6, 7]);
  const [busy, setBusy] = useState(false);

  const canRepeat = !editing && s.isManager;
  const valid =
    title.trim().length >= 2 &&
    (scope !== 'personal' || assignees.length > 0) &&
    (scope !== 'department' || !!department) &&
    (scope !== 'brand' || !!brand) &&
    (repeat === 'none' || repeat === 'daily' || repeatDays.length > 0);

  const pickPeople = () =>
    ui.sheet((c) => <PersonPicker title="Giao cho" people={d.active} selected={assignees} multi onDone={setAssignees} close={c} />);

  const pickFrom = async (items: string[], current: string, setter: (v: string) => void, title: string) => {
    const v = await ui.actions(
      items.map((x) => ({ label: x, value: x, icon: x === current ? 'check' : undefined })),
      title,
    );
    if (v) setter(v);
  };

  const save = async () => {
    setBusy(true);
    try {
      const dueAt = hasDue || repeat !== 'none' ? fromInputs(repeat !== 'none' ? vnDate() : dueDate, dueTime) : null;
      if (editing && task) {
        const list = checklist.filter((x) => x.trim()).map((text, i) => {
          const old = task.checklist.find((c) => c.text === text);
          return old || { id: `c${i}${Date.now() % 1000}`, text: text.trim(), done: false };
        });
        await updateTaskFields(task, actor, { title: title.trim(), note: note.trim(), priority, dueAt, remindBefore: remind, checklist: list, requirePhoto, requireApproval, reminded: {} });
        ui.toast({ text: 'Đã lưu', icon: 'check' });
      } else if (repeat !== 'none') {
        const tplId = await saveTemplate(
          {
            id: template?.id,
            storeCode: store.code,
            title: title.trim(),
            note: note.trim(),
            scope,
            assigneeUids: scope === 'personal' ? assignees : [],
            department: scope === 'department' ? department : null,
            brand: scope === 'brand' ? brand : null,
            priority,
            checklist: checklist.filter((x) => x.trim()),
            requirePhoto,
            requireApproval,
            completionMode: each ? 'each' : 'any',
            remindBefore: remind,
            recurrence: { type: repeat, days: repeat === 'daily' ? [] : repeatDays, time: dueTime },
            active: template?.active ?? true,
            lastGenerated: template?.lastGenerated || null,
            createdAt: template?.createdAt,
            createdBy: template?.createdBy,
          },
          actor,
        );
        if (!template) {
          const tpl = await api().get<TaskTemplate>('taskTemplates', tplId);
          if (tpl) await generateForToday([tpl], d.active, actor);
        }
        ui.toast({ text: template ? 'Đã lưu việc lặp lại' : 'Đã tạo việc lặp lại', icon: 'repeat', color: 'indigo' });
      } else {
        const ids = await createTasks(
          {
            title,
            note,
            scope,
            assigneeUids: assignees,
            department,
            brand,
            priority,
            dueAt,
            remindBefore: hasDue ? remind : null,
            checklist,
            requirePhoto,
            requireApproval,
            completionMode: each ? 'each' : 'any',
          },
          store.code,
          actor,
          d.active,
        );
        ui.toast({ text: ids.length > 1 ? `Đã giao ${ids.length} việc` : 'Đã giao việc', icon: 'check', color: 'green' });
      }
      close();
    } catch (e) {
      console.error(e);
      ui.alert({ title: 'Chưa lưu được', message: 'Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setBusy(false);
    }
  };

  const assigneeText = assignees.length === 0 ? 'Chọn người' : assignees.length === 1 ? d.nameOf(assignees[0]) : `${assignees.length} người`;

  return (
    <>
      <SheetHead title={editing ? 'Sửa công việc' : template || forceRepeat ? 'Việc lặp lại' : 'Giao việc mới'} onCancel={close} onDone={save} doneLabel={editing || template ? 'Lưu' : 'Giao'} doneDisabled={!valid} busy={busy} />
      <div className="sheet-body">
        <Section>
          <Group>
            <input className="textarea" style={{ minHeight: 0, height: 54, fontWeight: 600 }} placeholder="Tiêu đề công việc" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!editing} />
            <div className="hairline" style={{ marginLeft: 16 }} />
            <textarea className="textarea" placeholder="Mô tả, hướng dẫn (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Group>
        </Section>

        {!editing && (
          <Section title="Giao cho" small footer={scope === 'personal' ? 'Mỗi người nhận một việc riêng. Chỉ quản lý và người được giao thấy việc cá nhân.' : 'Mọi nhân viên trong kho đều xem được. Thành viên được giao mới đánh dấu hoàn tất.'}>
            <Segmented
              value={scope}
              onChange={setScope}
              options={(['personal', 'department', 'brand', 'store'] as TaskScope[]).map((k) => ({ value: k, label: k === 'store' ? 'Toàn ST' : k === 'brand' ? 'Hãng' : SCOPE_LABEL[k] }))}
              style={{ marginBottom: 10 }}
            />
            <Group>
              {scope === 'personal' && <Cell icon="person" iconColor="blue" title="Nhân viên" detail={assigneeText} chevron onClick={pickPeople} />}
              {scope === 'department' && <Cell icon="people" iconColor="blue" title="Bộ phận" detail={department} chevron onClick={() => pickFrom(store.departments, department, setDepartment, 'Chọn bộ phận')} />}
              {scope === 'brand' && <Cell icon="tag" iconColor="pink" title="PG hãng" detail={brand || 'Chọn hãng'} chevron onClick={() => pickFrom(brands, brand, setBrand, 'Chọn hãng')} />}
              {scope === 'store' && <Cell icon="store" iconColor="blue" title="Toàn siêu thị" detail={`${d.active.length} người`} />}
              {scope !== 'personal' && (
                <Cell title="Từng người phải xác nhận" sub="Dùng cho phổ biến chính sách, quy định" trailing={<Switch checked={each} onChange={setEach} label="Từng người xác nhận" />} />
              )}
            </Group>
          </Section>
        )}

        <Section title="Thời hạn" small>
          <Group>
            {canRepeat || template ? (
              <Cell
                icon="repeat"
                iconColor="indigo"
                title="Lặp lại"
                detail={repeat === 'none' ? 'Không' : repeat === 'daily' ? 'Hằng ngày' : repeat === 'weekly' ? 'Hằng tuần' : 'Hằng tháng'}
                chevron
                onClick={async () => {
                  const v = await ui.actions(
                    [
                      ...(template ? [] : [{ label: 'Không lặp lại', value: 'none' }]),
                      { label: 'Hằng ngày', value: 'daily' },
                      { label: 'Hằng tuần', value: 'weekly' },
                      { label: 'Hằng tháng', value: 'monthly' },
                    ],
                    'Lặp lại',
                  );
                  if (!v) return;
                  setRepeat(v as Recurrence['type'] | 'none');
                  if (v === 'monthly') setRepeatDays([1]);
                  if (v === 'weekly') setRepeatDays([1, 2, 3, 4, 5, 6, 7]);
                }}
              />
            ) : null}
            {repeat === 'none' && (
              <Cell icon="calendar" iconColor="red" title="Có hạn chót" trailing={<Switch checked={hasDue} onChange={setHasDue} label="Có hạn chót" />} />
            )}
            {repeat === 'none' && hasDue && (
              <div className="field">
                <label>Ngày</label>
                <input type="date" value={dueDate} min={editing ? undefined : vnDate()} max={addDays(vnDate(), 365)} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            {(hasDue || repeat !== 'none') && (
              <div className="field">
                <label>{repeat === 'none' ? 'Giờ' : 'Hạn trong ngày'}</label>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
              </div>
            )}
            {(hasDue || repeat !== 'none') && (
              <Cell
                icon="bell"
                iconColor="orange"
                title="Nhắc"
                detail={REMIND_OPTIONS.find((o) => o.value === remind)?.label}
                chevron
                onClick={async () => {
                  const v = await ui.actions(REMIND_OPTIONS.map((o) => ({ label: o.label, value: String(o.value), icon: o.value === remind ? 'check' : undefined })), 'Nhắc trước hạn');
                  if (v !== null) setRemind(v === 'null' ? null : Number(v));
                }}
              />
            )}
          </Group>
          {repeat === 'weekly' && (
            <div className="row gap6 mt12" style={{ justifyContent: 'space-between' }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  className={`chip${repeatDays.includes(n) ? ' on' : ''}`}
                  style={{ width: 44, padding: 0, justifyContent: 'center' }}
                  onClick={() => setRepeatDays((x) => (x.includes(n) ? x.filter((k) => k !== n) : [...x, n]))}
                >
                  {WEEKDAY_SHORT[n % 7]}
                </button>
              ))}
            </div>
          )}
          {repeat === 'monthly' && (
            <div className="cal mt12" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`cal-d${repeatDays.includes(n) ? ' ontime' : ''}`} style={{ color: repeatDays.includes(n) ? undefined : 'var(--label)' }} onClick={() => setRepeatDays((x) => (x.includes(n) ? x.filter((k) => k !== n) : [...x, n]))}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Mức ưu tiên" small>
          <Segmented value={priority} onChange={setPriority} options={(['normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </Section>

        <Section title="Checklist" small footer="Chia nhỏ việc thành các bước để nhân viên tích từng mục.">
          <Group>
            {checklist.map((c, i) => (
              <div className="field" key={i}>
                <Icon name="checklist" size={18} className="c3" />
                <input value={c} placeholder={`Bước ${i + 1}`} onChange={(e) => setChecklist((x) => x.map((v, k) => (k === i ? e.target.value : v)))} />
                <button onClick={() => setChecklist((x) => x.filter((_, k) => k !== i))} aria-label="Xoá bước" className="c3">
                  <Icon name="minus" size={20} stroke={2.4} />
                </button>
              </div>
            ))}
            <Cell icon="plus" iconColor="green" title="Thêm bước" onClick={() => setChecklist((x) => [...x, ''])} />
          </Group>
        </Section>

        <Section title="Khi hoàn tất" small>
          <Group>
            <Cell icon="camera" iconColor="teal" title="Bắt buộc chụp ảnh" sub="Chụp trực tiếp, có đóng dấu giờ" trailing={<Switch checked={requirePhoto} onChange={setRequirePhoto} label="Bắt buộc chụp ảnh" />} />
            {(scope === 'personal' || !each) && (
              <Cell icon="shieldCheck" iconColor="purple" title="Cần quản lý duyệt" trailing={<Switch checked={requireApproval} onChange={setRequireApproval} label="Cần duyệt" />} />
            )}
          </Group>
        </Section>
      </div>
    </>
  );
}

function roundTime(ms: number): string {
  const t = vnTime(ms);
  const [h, m] = t.split(':').map(Number);
  const mm = m < 30 ? '30' : '00';
  const hh = m < 30 ? h : (h + 1) % 24;
  return `${String(hh).padStart(2, '0')}:${mm}`;
}
