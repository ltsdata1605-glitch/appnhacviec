// Bàn giao ca: nhân viên/PG bàn giao nhanh việc còn tồn cho Kho, Thu ngân, Quản lý hoặc một người cụ thể rồi về.
// Mỗi mục bàn giao trở thành một công việc có hạn, người/bộ phận nhận phải hoàn tất và được nhắc như việc bình thường.
import { useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { MentionInput } from '../../ui/Mention';
import { saveErrorText, submitHandover, type HandoverItem } from '../../lib/actions';
import { api } from '../../lib/backend';
import { addDays, dm, now, vnAt, vnDate, vnMinutesOfDay } from '../../lib/time';
import { PersonPicker, useActor } from '../shared';

const SUGGEST: { text: string; target: string }[] = [
  { text: 'Hàng chưa nhập kho: ', target: 'Kho' },
  { text: 'Khách hẹn lấy hàng: ', target: 'Kho' },
  { text: 'Đơn chưa thu tiền: ', target: 'Thu ngân' },
  { text: 'Khách đổi trả chờ xử lý: ', target: 'Thu ngân' },
  { text: 'Hàng lỗi chờ xử lý: ', target: 'Kho' },
  { text: 'Giao lắp chưa xong: ', target: 'Kỹ thuật – Giao lắp' },
  { text: 'Khách cần gọi lại: ', target: '__store' },
];

function currentShift(): string {
  const m = vnMinutesOfDay();
  return m < 12 * 60 ? 'Ca sáng' : m < 17 * 60 + 30 ? 'Ca chiều' : 'Ca tối';
}

type Due = 'shift' | 'noon' | 'eod';

export function HandoverSheet({ close }: { close: () => void }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const depts = store.departments.filter((x) => x !== 'PG');
  const defaultDept = depts.includes('Kho') ? 'Kho' : depts[0] || 'Quản lý';
  const [shift, setShift] = useState(currentShift());
  const [items, setItems] = useState<HandoverItem[]>([{ text: '', target: { type: 'department', value: defaultDept }, urgent: false }]);
  const [due, setDue] = useState<Due>('shift');
  const [busy, setBusy] = useState(false);
  const [seed] = useState(() => api().newId());
  const valid = items.filter((i) => i.text.trim().length >= 3);

  const update = (k: number, p: Partial<HandoverItem>) => setItems((list) => list.map((x, i) => (i === k ? { ...x, ...p } : x)));
  const targetLabel = (t: HandoverItem['target']) =>
    t.type === 'store' ? 'Toàn siêu thị' : t.type === 'person' ? d.nameOf(t.value) : t.value;

  const pickTarget = async (k: number) => {
    const v = await ui.actions(
      [
        ...depts.map((x) => ({ label: `Bộ phận ${x}`, value: `d:${x}` })),
        { label: 'Toàn siêu thị (ca sau)', value: 'store' },
        { label: 'Một người cụ thể…', value: 'person', icon: 'person' as const },
      ],
      'Bàn giao cho',
    );
    if (!v) return;
    if (v === 'store') update(k, { target: { type: 'store', value: '' } });
    else if (v === 'person')
      ui.sheet((c) => (
        <PersonPicker title="Bàn giao cho" people={d.active.filter((m) => m.uid !== actor.uid)} selected={[]} close={c} onDone={(u) => u[0] && update(k, { target: { type: 'person', value: u[0] } })} />
      ));
    else update(k, { target: { type: 'department', value: v.slice(2) } });
  };

  const dueAt = () => {
    const t = now();
    if (due === 'shift') return t + 4 * 3600000;
    if (due === 'noon') return vnAt(addDays(vnDate(), 1), '12:00');
    return vnAt(addDays(vnDate(), 1), '21:00');
  };

  const submit = async () => {
    setBusy(true);
    try {
      const n = await submitHandover(store.code, actor, `${shift} ${dm(now())}`, valid, d.active, dueAt(), seed);
      ui.toast({ text: `Đã bàn giao ${n} việc. Về an toàn nhé!`, icon: 'check', color: 'green' });
      close();
    } catch (e) {
      ui.alert({ title: 'Chưa bàn giao được', message: saveErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHead title="Bàn giao ca" onCancel={close} />
      <div className="sheet-body" style={{ paddingBottom: 'calc(var(--safe-bottom) + 110px)' }}>
        <div className="row gap8" style={{ padding: '2px 16px 0' }}>
          {['Ca sáng', 'Ca chiều', 'Ca tối'].map((x) => (
            <button key={x} className={`chip${shift === x ? ' on' : ''}`} onClick={() => setShift(x)}>
              {x}
            </button>
          ))}
        </div>

        <Section title="Việc chưa xử lý xong" small footer="Mỗi mục sẽ thành một việc giao cho bộ phận hoặc người nhận, có nhắc hạn. Gõ @ để gắn tên người liên quan.">
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((it, k) => (
              <div key={k} className="card" style={{ padding: 12 }}>
                <div className="row gap8" style={{ marginBottom: 8 }}>
                  <span className="t-foot c2 semibold grow">Mục {k + 1}</span>
                  <button className={`pill sm ${it.urgent ? 'red' : 'gray'}`} onClick={() => update(k, { urgent: !it.urgent })} aria-pressed={it.urgent}>
                    <Icon name="bolt" size={12} stroke={2.4} />
                    Khẩn
                  </button>
                  {items.length > 1 && (
                    <button className="c3" onClick={() => setItems((l) => l.filter((_, i) => i !== k))} aria-label="Bỏ mục">
                      <Icon name="xmark" size={18} stroke={2.4} />
                    </button>
                  )}
                </div>
                <MentionInput
                  multiline
                  rows={2}
                  className="textarea handover-text"
                  value={it.text}
                  onChange={(v) => update(k, { text: v })}
                  placeholder="Ví dụ: Khách Lan hẹn 9h mai lấy tủ lạnh Aqua, đã thu cọc 2 triệu"
                />
                <button className="row gap8 mt8" style={{ width: '100%' }} onClick={() => pickTarget(k)}>
                  <Icon name="handover" size={18} className="tint" />
                  <span className="t-sub c2">Giao cho</span>
                  <span className="t-sub semibold tint grow" style={{ textAlign: 'right' }}>
                    {targetLabel(it.target)}
                  </span>
                  <Icon name="chevronRight" size={15} stroke={2.4} className="c3" />
                </button>
              </div>
            ))}
          </div>
          <button className="btn tinted block mt12" onClick={() => setItems((l) => [...l, { text: '', target: { type: 'department', value: defaultDept }, urgent: false }])}>
            <Icon name="plus" size={18} stroke={2.4} />
            Thêm mục
          </button>
        </Section>

        <Section title="Gợi ý nhanh" small>
          <div className="row gap6 wrap">
            {SUGGEST.map((x) => (
              <button
                key={x.text}
                className="chip"
                onClick={() => {
                  const target: HandoverItem['target'] =
                    x.target === '__store' ? { type: 'store', value: '' } : { type: 'department', value: depts.includes(x.target) ? x.target : defaultDept };
                  setItems((l) => {
                    const emptyIdx = l.findIndex((i) => !i.text.trim());
                    const item = { text: x.text, target, urgent: false };
                    return emptyIdx >= 0 ? l.map((i, k) => (k === emptyIdx ? item : i)) : [...l, item];
                  });
                }}
              >
                {x.text.replace(': ', '')}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Cần xử lý trước" small>
          <div className="segmented" style={{ gridAutoFlow: 'column' }}>
            <div className="seg-thumb" style={{ width: 'calc((100% - 4px) / 3)', transform: `translateX(${due === 'shift' ? 0 : due === 'noon' ? 100 : 200}%)` }} />
            {(
              [
                ['shift', 'Trong 4 giờ'],
                ['noon', '12:00 mai'],
                ['eod', 'Cuối ngày mai'],
              ] as [Due, string][]
            ).map(([k, l]) => (
              <button key={k} className={due === k ? 'on' : ''} onClick={() => setDue(k)}>
                {l}
              </button>
            ))}
          </div>
        </Section>
      </div>
      <div className="bottom-bar" style={{ background: 'linear-gradient(to top, var(--bg) 60%, transparent)' }}>
        <button className="btn block" disabled={!valid.length || busy} onClick={submit}>
          {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : `Bàn giao ${valid.length || ''} việc và kết thúc ca`.replace('  ', ' ')}
        </button>
      </div>
    </>
  );
}
