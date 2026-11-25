import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { useUI } from '../../ui/Overlay';
import { Section } from '../../ui/controls';
import { CashCountScreen } from '../cash/CashCount';
import { HandoverSheet } from '../handover/Handover';
import { RollcallListScreen, QuickTile, myPendingRollcalls } from '../rollcall/Rollcall';
import { TaskEditor } from '../tasks/TaskEditor';

/** Thao tác nhanh dùng hằng ngày */
export function QuickActions() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const pending = myPendingRollcalls(d.rollcalls, s.profile).length;
  return (
    <Section>
      <div className="quick">
        <QuickTile icon="banknote" color="green" label="Kiểm quỹ" onClick={() => nav.push(<CashCountScreen />)} />
        <QuickTile icon="handover" color="orange" label="Bàn giao ca" onClick={() => ui.sheet((c) => <HandoverSheet close={c} />)} />
        <QuickTile icon="hand" color="indigo" label="Điểm danh" badge={pending} onClick={() => nav.push(<RollcallListScreen />)} />
        <QuickTile icon="compose" color="blue" label="Giao việc" onClick={() => ui.sheet((c) => <TaskEditor close={c} />)} />
      </div>
    </Section>
  );
}
