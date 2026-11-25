import { useRef, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Avatar, Cell, Check, Empty, Group, Img, Pill, Section, Switch } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { CHAIN_LABEL, CRITERIA } from '../../lib/criteria';
import { api } from '../../lib/backend';
import { compressImageFile } from '../../lib/image';
import { deleteArea, saveArea } from '../../lib/actions';
import { vnDate } from '../../lib/time';
import { PersonPicker } from '../shared';
import type { Area } from '../../lib/types';

export function AreasScreen() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const store = s.store!;
  const areas = d.areas;

  const add = async () => {
    const v = await ui.actions(
      [
        { label: `Thêm từ tiêu chí 8NTTT ${CHAIN_LABEL[store.chain]}`, value: 'tpl', icon: 'shieldCheck' },
        { label: 'Khu vực tuỳ chỉnh', value: 'custom', icon: 'plus' },
      ],
      'Thêm khu vực',
    );
    if (v === 'tpl') ui.sheet((c) => <TemplatePicker close={c} />);
    if (v === 'custom') {
      const name = await ui.prompt('Tên khu vực', 'Ví dụ: Line Tivi Samsung, Quầy sim số', 'Tên khu vực', 'Tạo');
      if (name?.trim()) {
        const id = await saveArea({ storeCode: store.code, name: name.trim(), criteria: [], order: areas.length });
        nav.push(<AreaEditScreen id={id} />);
      }
    }
  };

  const unassigned = areas.filter((a) => a.active && !a.ownerUid).length;

  return (
    <Page
      title="Khu vực 8NTTT"
      large={false}
      right={
        <button className="glass-btn icon prominent" onClick={add} aria-label="Thêm khu vực">
          <Icon name="plus" size={22} stroke={2.4} />
        </button>
      }
    >
      {areas.length === 0 ? (
        <Empty
          icon="grid"
          title="Chưa có khu vực"
          text={`Tạo nhanh các khu vực từ bộ tiêu chí ${CHAIN_LABEL[store.chain]}, sau đó giao mỗi khu vực cho một nhân viên.`}
          action={
            <button className="btn" onClick={() => ui.sheet((c) => <TemplatePicker close={c} />)}>
              Thêm từ tiêu chí 8NTTT
            </button>
          }
        />
      ) : (
        <Section footer={unassigned ? `${unassigned} khu vực chưa có người phụ trách.` : 'Mỗi khu vực có một người phụ trách chính và một người dự phòng khi nghỉ.'}>
          <Group>
            {areas.map((a) => (
              <Cell
                key={a.id}
                leading={
                  a.ownerUid ? (
                    <Avatar name={d.nameOf(a.ownerUid)} src={d.byUid(a.ownerUid)?.photoURL} size={38} />
                  ) : (
                    <span className="avatar" style={{ width: 38, height: 38, background: 'var(--fill-3)', color: 'var(--label-3)' }}>
                      <Icon name="person" size={20} />
                    </span>
                  )
                }
                sepInset={66}
                title={<span className={a.active ? '' : 'c2'}>{a.name}</span>}
                sub={a.ownerUid ? `${d.nameOf(a.ownerUid)}${a.backupUid ? ` · Dự phòng: ${d.nameOf(a.backupUid)}` : ''}` : 'Chưa phân công'}
                trailing={!a.active ? <Pill sm>Tạm dừng</Pill> : !a.ownerUid ? <Pill sm color="red">Trống</Pill> : undefined}
                chevron
                onClick={() => nav.push(<AreaEditScreen id={a.id} />)}
              />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}

function TemplatePicker({ close }: { close: () => void }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const store = s.store!;
  const existing = new Set(d.areas.map((a) => a.templateKey));
  const groups = CRITERIA[store.chain];
  const [sel, setSel] = useState<string[]>(groups.filter((g) => !existing.has(`${store.chain}:${g.key}`)).map((g) => g.key));
  const [busy, setBusy] = useState(false);
  return (
    <>
      <SheetHead
        title="Tiêu chí 8NTTT"
        onCancel={close}
        doneLabel="Thêm"
        doneDisabled={!sel.length}
        busy={busy}
        onDone={async () => {
          setBusy(true);
          let order = d.areas.length;
          for (const g of groups.filter((x) => sel.includes(x.key))) {
            await saveArea({ storeCode: store.code, name: g.name, templateKey: `${store.chain}:${g.key}`, criteria: g.items, order: order++ });
          }
          ui.toast({ text: `Đã thêm ${sel.length} khu vực`, icon: 'check', color: 'green' });
          close();
        }}
      />
      <div className="sheet-body">
        <Section title={CHAIN_LABEL[store.chain]} small footer="Có thể thêm nhiều lần cùng một nhóm (ví dụ chia Gia dụng thành 2 line) bằng cách đổi tên sau khi thêm.">
          <Group>
            {groups.map((g) => {
              const has = existing.has(`${store.chain}:${g.key}`);
              return (
                <button key={g.key} className="cell" onClick={() => setSel((x) => (x.includes(g.key) ? x.filter((k) => k !== g.key) : [...x, g.key]))} style={{ ['--sep-inset' as string]: '54px' }}>
                  <Check on={sel.includes(g.key)} />
                  <div className="cell-body">
                    <div className="cell-title">{g.name}</div>
                    <div className="cell-sub">
                      {g.items.length} tiêu chí{has ? ' · đã có' : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </Group>
        </Section>
      </div>
    </>
  );
}

export function AreaEditScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const a = d.areas.find((x) => x.id === id);
  if (!a) return <Page title="Khu vực" large={false}><Empty icon="grid" title="Không tìm thấy" /></Page>;
  const store = s.store!;
  const patch = (p: Partial<Area>) => saveArea({ id: a.id, storeCode: a.storeCode, ...p });

  const pick = (field: 'ownerUid' | 'backupUid') =>
    ui.sheet((c) => (
      <PersonPicker
        title={field === 'ownerUid' ? 'Người phụ trách' : 'Người dự phòng'}
        people={d.active}
        selected={a[field] ? [a[field]!] : []}
        allowNone
        close={c}
        onDone={(u) => patch(field === 'ownerUid' ? { ownerUid: u[0] || null, ownerSince: u[0] ? vnDate() : null } : { backupUid: u[0] || null })}
      />
    ));

  const onRef = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { blob } = await compressImageFile(f, 1400);
      const path = `areas/${store.code}/${a.id}_${Date.now()}.jpg`;
      const url = await api().upload(path, blob, 'image/jpeg');
      await patch({ refPhotoUrl: url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Page title={a.name} large={false}>
      <Section>
        <Group>
          <Cell
            title="Tên khu vực"
            detail={a.name}
            chevron
            onClick={async () => {
              const v = await ui.prompt('Tên khu vực', undefined, 'Tên', 'Lưu', a.name);
              if (v?.trim()) patch({ name: v.trim() });
            }}
          />
          <Cell title="Người phụ trách" detail={a.ownerUid ? d.nameOf(a.ownerUid) : 'Chưa chọn'} chevron onClick={() => pick('ownerUid')} />
          <Cell title="Người dự phòng" detail={a.backupUid ? d.nameOf(a.backupUid) : 'Không'} chevron onClick={() => pick('backupUid')} />
          <Cell
            title="Số ảnh tối thiểu"
            detail={a.minPhotos ? `${a.minPhotos} ảnh` : `Mặc định (${store.minPhotos})`}
            chevron
            onClick={async () => {
              const v = await ui.actions([{ label: `Theo cài đặt kho (${store.minPhotos})`, value: '0' }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n} ảnh`, value: String(n) }))], 'Số ảnh tối thiểu');
              if (v !== null) patch({ minPhotos: Number(v) || null });
            }}
          />
          <Cell title="Đang áp dụng" trailing={<Switch checked={a.active} onChange={(v) => patch({ active: v })} label="Đang áp dụng" />} />
        </Group>
      </Section>

      <Section title="Ảnh chuẩn" small footer="Ảnh mẫu khu vực đạt chuẩn. Nhân viên có thể bật lớp ảnh chuẩn mờ khi chụp để căn đúng góc.">
        {a.refPhotoUrl ? (
          <div style={{ position: 'relative' }}>
            <div className="thumb" style={{ width: '100%', aspectRatio: '4/3', borderRadius: 22 }}>
              <Img src={a.refPhotoUrl} />
            </div>
            <button className="btn sm gray" style={{ position: 'absolute', right: 10, bottom: 10 }} onClick={() => fileRef.current?.click()}>
              Thay ảnh
            </button>
          </div>
        ) : (
          <Group>
            <Cell icon="photo" iconColor="teal" title={uploading ? 'Đang tải lên…' : 'Thêm ảnh chuẩn'} onClick={() => fileRef.current?.click()} trailing={uploading ? <span className="spinner" /> : undefined} />
          </Group>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onRef(e.target.files)} />
      </Section>

      <Section title={`Tiêu chí (${a.criteria.length})`} small action="Thêm" onAction={async () => {
        const v = await ui.prompt('Thêm tiêu chí', undefined, 'Nội dung tiêu chí', 'Thêm');
        if (v?.trim()) patch({ criteria: [...a.criteria, v.trim()] });
      }}>
        <Group>
          {a.criteria.map((c, i) => (
            <Cell
              key={i}
              leading={<span className="t-sub c2 tnum" style={{ width: 22 }}>{i + 1}.</span>}
              sepInset={50}
              title={<span className="t-sub">{c}</span>}
              style={{ alignItems: 'flex-start' }}
              onClick={async () => {
                const v = await ui.actions(
                  [
                    { label: 'Sửa', value: 'edit', icon: 'pencil' },
                    { label: 'Xoá tiêu chí', value: 'del', icon: 'trash', destructive: true },
                  ],
                  c,
                );
                if (v === 'edit') {
                  const t = await ui.prompt('Sửa tiêu chí', undefined, '', 'Lưu', c);
                  if (t?.trim()) patch({ criteria: a.criteria.map((x, k) => (k === i ? t.trim() : x)) });
                }
                if (v === 'del') patch({ criteria: a.criteria.filter((_, k) => k !== i) });
              }}
            />
          ))}
          {!a.criteria.length && <Cell title={<span className="c2">Chưa có tiêu chí</span>} />}
        </Group>
      </Section>

      <Section>
        <Group>
          <Cell
            destructive
            centered
            title="Xoá khu vực"
            onClick={async () => {
              if (await ui.confirm('Xoá khu vực?', 'Báo cáo cũ vẫn được giữ. Nên dùng “Tạm dừng” nếu chỉ ngưng tạm thời.', 'Xoá', true)) {
                await deleteArea(a.id);
                nav.pop();
              }
            }}
          />
        </Group>
      </Section>
    </Page>
  );
}
