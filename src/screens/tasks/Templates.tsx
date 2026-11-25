import { useSession, useStoreData, useWatch } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Cell, Empty, Group, Section, Switch, SwipeRow } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { recurrenceText } from '../../lib/recurring';
import { deleteTemplate, saveTemplate } from '../../lib/actions';
import { useActor } from '../shared';
import { TaskEditor } from './TaskEditor';
import type { TaskTemplate } from '../../lib/types';

export function TemplatesScreen() {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const { data } = useWatch<TaskTemplate>('taskTemplates', s.storeCode ? [['storeCode', '==', s.storeCode]] : null);
  const list = [...data].sort((a, b) => a.recurrence.time.localeCompare(b.recurrence.time));
  const target = (t: TaskTemplate) =>
    t.scope === 'personal' ? (t.assigneeUids || []).map((u) => d.nameOf(u)).join(', ') : t.scope === 'department' ? `Bộ phận ${t.department}` : t.scope === 'brand' ? `PG ${t.brand}` : 'Toàn siêu thị';

  return (
    <Page
      title="Việc lặp lại"
      large={false}
      right={
        s.isManager ? (
          <button className="glass-btn icon prominent" aria-label="Thêm" onClick={() => ui.sheet((c) => <TaskEditor close={c} forceRepeat />)}>
            <Icon name="plus" size={22} stroke={2.4} />
          </button>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <Empty icon="repeat" title="Chưa có việc lặp lại" text="Tạo checklist mở cửa, đóng ca, kiểm quỹ… hệ thống sẽ tự giao mỗi ngày lúc 0h." />
      ) : (
        <Section footer="Việc lặp lại được tự động giao lúc 0h mỗi ngày phù hợp. Vuốt trái để xoá.">
          <Group>
            {list.map((t) => (
              <SwipeRow
                key={t.id}
                actions={
                  s.isManager
                    ? [
                        {
                          label: 'Xoá',
                          icon: 'trash',
                          color: 'red',
                          onClick: async () => {
                            if (await ui.confirm('Xoá việc lặp lại?', 'Các việc đã giao trước đó vẫn giữ nguyên.', 'Xoá', true)) await deleteTemplate(t.id);
                          },
                        },
                      ]
                    : []
                }
              >
                <Cell
                  icon="repeat"
                  iconColor={t.active ? 'indigo' : 'gray'}
                  title={t.title}
                  sub={`${recurrenceText(t)} · ${target(t)}`}
                  trailing={s.isManager ? <Switch checked={t.active} onChange={(v) => saveTemplate({ ...t, active: v }, actor)} label="Bật" /> : undefined}
                  onClick={s.isManager ? () => ui.sheet((c) => <TaskEditor close={c} template={t} />) : undefined}
                />
              </SwipeRow>
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}
