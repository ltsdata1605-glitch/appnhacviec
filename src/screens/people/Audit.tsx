import { useSession, useWatch } from '../../state/session';
import { Page } from '../../ui/Page';
import { Cell, Empty, Group, Section } from '../../ui/controls';
import { addDays, friendly, vnAt, vnDate } from '../../lib/time';
import type { AuditLog } from '../../lib/types';

export function AuditScreen() {
  const s = useSession();
  const since = vnAt(addDays(vnDate(), -60));
  const { data, loading } = useWatch<AuditLog>('audit', s.storeCode ? [['storeCode', '==', s.storeCode], ['at', '>=', since]] : null);
  const list = [...data].sort((a, b) => b.at - a.at);
  return (
    <Page title="Nhật ký hoạt động" large={false}>
      {!loading && !list.length ? (
        <Empty icon="list" title="Chưa có hoạt động" text="Duyệt, phân quyền, chuyển kho, vô hiệu hoá… đều được ghi lại tại đây." />
      ) : (
        <Section footer="Lưu 60 ngày gần nhất.">
          <Group>
            {list.map((l) => (
              <Cell key={l.id} title={<span className="t-sub"><b style={{ fontWeight: 600 }}>{l.actorName}</b> · {l.action}{l.targetName ? `: ${l.targetName}` : ''}</span>} sub={`${friendly(l.at)}${l.detail ? ` · ${l.detail}` : ''}`} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}
