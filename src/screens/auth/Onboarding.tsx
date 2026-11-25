import { useEffect, useState } from 'react';
import { useSession } from '../../state/session';
import { useUI } from '../../ui/Overlay';
import { Icon, type IconName } from '../../ui/Icon';
import { Cell, Group, Section, Avatar } from '../../ui/controls';
import { api } from '../../lib/backend';
import { register } from '../../lib/actions';
import { capitalizeCode, storeCodeOf, titleCase } from '../../lib/text';
import { CHAIN_LABEL } from '../../lib/criteria';
import { ROLE_LABEL } from '../../lib/constants';
import type { Chain, Role, Store } from '../../lib/types';

const ROLES: { role: Role; title: string; desc: string; icon: IconName; color: string }[] = [
  { role: 'manager', title: 'Quản lý', desc: 'Quản lý siêu thị. Admin sẽ duyệt.', icon: 'shieldCheck', color: 'indigo' },
  { role: 'staff', title: 'Nhân viên', desc: 'Thu ngân, kho, tư vấn, kỹ thuật…', icon: 'person', color: 'blue' },
  { role: 'pg', title: 'PG', desc: 'Nhân viên hãng tại siêu thị.', icon: 'tag', color: 'pink' },
];

function Shell({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  const s = useSession();
  return (
    <div className="app">
      <div className="app-frame" style={{ position: 'relative', height: '100%' }}>
        <div className="navbar inline">
          <div className="navbar-row">
            <div className="navbar-side">
              {onBack && (
                <button className="glass-btn icon" onClick={onBack} aria-label="Quay lại">
                  <Icon name="chevronLeft" size={22} stroke={2.3} />
                </button>
              )}
            </div>
            <div className="navbar-title">{title}</div>
            <div className="navbar-side right">
              <button className="glass-btn" onClick={() => api().signOut()}>
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
        <div className="scroll no-tab" style={{ height: '100%' }}>
          <div className="page-top-inline" />
          <div className="row gap12" style={{ padding: '8px 20px 0' }}>
            <Avatar name={s.auth?.displayName || '?'} src={s.auth?.photoURL} size={44} />
            <div className="grow">
              <div className="t-headline ellipsis">{s.auth?.displayName}</div>
              <div className="t-sub c2 ellipsis">{s.auth?.email}</div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function OnboardingScreen({ initial }: { initial?: { role: Role; code: string; fullName: string; storeCode: string } }) {
  const s = useSession();
  const ui = useUI();
  const [role, setRole] = useState<Role | null>(initial?.role || null);
  const [code, setCode] = useState(initial?.code || '');
  const [fullName, setFullName] = useState(initial?.fullName || s.auth?.displayName || '');
  const [storeCode, setStoreCode] = useState(initial?.storeCode || '');
  const [store, setStore] = useState<Store | null | undefined>(undefined);
  const [chain, setChain] = useState<Chain>('DMX');
  const [busy, setBusy] = useState(false);

  const sc = storeCodeOf(storeCode);
  useEffect(() => {
    setStore(undefined);
    if (sc.length < 3) return;
    const id = setTimeout(() => {
      api()
        .get<Store>('stores', sc)
        .then((x) => setStore(x))
        .catch(() => setStore(null));
    }, 400);
    return () => clearTimeout(id);
  }, [sc]);

  if (!role) {
    return (
      <Shell title="Đăng ký">
        <div style={{ padding: '28px 20px 4px' }}>
          <div className="t-title1">Bạn là ai?</div>
          <div className="t-callout c2 mt8">Chọn chức vụ để hệ thống gửi yêu cầu duyệt đến đúng người.</div>
        </div>
        <Section>
          <Group>
            {ROLES.map((r) => (
              <Cell key={r.role} icon={r.icon} iconColor={r.color} title={r.title} sub={r.desc} chevron onClick={() => setRole(r.role)} style={{ minHeight: 68 }} />
            ))}
          </Group>
        </Section>
      </Shell>
    );
  }

  const isPG = role === 'pg';
  const needStore = role === 'manager' && store === null;
  const valid = code.trim().length >= 2 && fullName.trim().split(' ').length >= 2 && sc.length >= 3 && (role === 'manager' ? store !== undefined : !!store);

  const submit = async () => {
    setBusy(true);
    try {
      await register(s.auth!, { role, code, fullName, storeCode: sc, chain }, s.isAdmin);
    } catch (e) {
      ui.alert({ title: 'Chưa gửi được', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={ROLE_LABEL[role]} onBack={() => setRole(null)}>
      <div style={{ padding: '24px 20px 0' }}>
        <div className="t-title1">Thông tin {ROLE_LABEL[role].toLowerCase()}</div>
        <div className="t-callout c2 mt8">
          {role === 'manager' ? 'Admin sẽ duyệt quyền quản lý cho mã kho này.' : 'Quản lý của kho sẽ duyệt tài khoản của bạn.'}
        </div>
      </div>
      <Section>
        <Group>
          <div className="field">
            <label>{isPG ? 'Hãng' : 'User'}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={isPG ? 'Ví dụ: Samsung' : 'User nội bộ'} autoCapitalize="words" autoComplete="off" />
          </div>
          <div className="field">
            <label>Họ và tên</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Họ tên đầy đủ" autoCapitalize="words" autoComplete="name" />
          </div>
          <div className="field">
            <label>Mã kho</label>
            <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="Ví dụ: 1234" inputMode="text" autoCapitalize="characters" autoComplete="off" />
            {sc.length >= 3 && store === undefined && <span className="spinner" style={{ width: 18, height: 18 }} />}
            {store && <Icon name="check" size={20} className="c-green" stroke={2.4} />}
          </div>
        </Group>
        <div className="field-hint">
          Sẽ lưu là: <b>{isPG ? capitalizeCode(code) || '—' : capitalizeCode(code) || '—'}</b> · <b>{titleCase(fullName) || '—'}</b>
          {store && (
            <>
              {' '}
              · <b>{store.name}</b>
            </>
          )}
        </div>
        {store === null && role !== 'manager' && sc.length >= 3 && <div className="field-hint c-red">Mã kho chưa được kích hoạt. Kiểm tra lại với quản lý siêu thị.</div>}
      </Section>

      {needStore && (
        <Section title="Kho mới · chọn chuỗi" small footer="Mã kho này chưa có trên hệ thống. Admin sẽ tạo kho khi duyệt. Chuỗi quyết định bộ tiêu chí 8NTTT; tên siêu thị đổi sau trong Cài đặt siêu thị.">
          <Group>
            {(Object.keys(CHAIN_LABEL) as Chain[]).map((c) => (
              <Cell key={c} title={CHAIN_LABEL[c]} trailing={chain === c ? <Icon name="check" size={20} className="tint" stroke={2.4} /> : undefined} onClick={() => setChain(c)} />
            ))}
          </Group>
        </Section>
      )}

      <div style={{ padding: '28px 20px 0' }}>
        <button className="btn block" disabled={!valid || busy} onClick={submit}>
          {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : s.isAdmin ? 'Hoàn tất' : 'Gửi yêu cầu duyệt'}
        </button>
      </div>
    </Shell>
  );
}

export function StatusScreen() {
  const s = useSession();
  const p = s.profile;
  const [editing, setEditing] = useState(false);
  if (!p) return <OnboardingScreen />;
  if (editing || p.status === 'rejected')
    return editing ? (
      <OnboardingScreen initial={{ role: p.role, code: (p.role === 'pg' ? p.brand : p.userCode) || '', fullName: p.fullName, storeCode: p.storeCode }} />
    ) : (
      <Shell title="Đăng ký">
        <StatusBody icon="xmark" color="red" title="Đăng ký chưa được duyệt" text={p.rejectReason ? `Lý do: ${p.rejectReason}` : 'Liên hệ quản lý siêu thị để biết thêm.'} />
        <div style={{ padding: '24px 20px 0' }}>
          <button className="btn block" onClick={() => setEditing(true)}>
            Đăng ký lại
          </button>
        </div>
      </Shell>
    );
  if (p.status === 'disabled')
    return (
      <Shell title="Tài khoản">
        <StatusBody icon="lock" color="gray" title="Tài khoản đã bị vô hiệu hoá" text="Liên hệ quản lý siêu thị nếu bạn vẫn đang làm việc tại kho." />
      </Shell>
    );
  return (
    <Shell title="Chờ duyệt">
      <StatusBody
        icon="clock"
        color="orange"
        title="Đang chờ duyệt"
        text={p.role === 'manager' ? 'Admin sẽ duyệt quyền quản lý của bạn. Bạn sẽ nhận thông báo khi được duyệt.' : `Quản lý kho ${p.storeCode} sẽ duyệt tài khoản của bạn.`}
      />
      <Section>
        <Group>
          <Cell title="Chức vụ" detail={ROLE_LABEL[p.role]} />
          <Cell title={p.role === 'pg' ? 'Hãng' : 'User'} detail={(p.role === 'pg' ? p.brand : p.userCode) || '—'} />
          <Cell title="Họ tên" detail={p.fullName} />
          <Cell title="Mã kho" detail={p.storeCode} />
          {p.storeName && <Cell title="Siêu thị" detail={p.storeName} />}
        </Group>
      </Section>
      <div style={{ padding: '20px 20px 0' }}>
        <button className="btn block gray" onClick={() => setEditing(true)}>
          Sửa thông tin
        </button>
      </div>
    </Shell>
  );
}

function StatusBody({ icon, color, title, text }: { icon: IconName; color: string; title: string; text: string }) {
  return (
    <div className="center" style={{ padding: '40px 32px 8px' }}>
      <span className={`bg-${color}`} style={{ width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', margin: '0 auto', color: '#fff' }}>
        <Icon name={icon} size={38} stroke={2} />
      </span>
      <div className="t-title2 mt16">{title}</div>
      <div className="t-callout c2 mt8">{text}</div>
    </div>
  );
}
