// Điểm danh: nội dung (chữ, ảnh, video, link) + nhiều đầu việc; từng người tích đủ mới hoàn tất.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useDoc, useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Avatar, Cell, Check, Empty, Group, Img, Loading, Pill, Ring, Section, Segmented, Switch } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { MentionInput, MentionText } from '../../ui/Mention';
import { api } from '../../lib/backend';
import { compressImageFile } from '../../lib/image';
import { closeRollcall, deleteRollcall, inAudience, nudgeRollcall, rollcallDone, saveErrorText, saveRollcall, toggleRollcallItem } from '../../lib/actions';
import { REMIND_OPTIONS } from '../../lib/constants';
import { addDays, dueLabel, fromInputs, friendly, now, vnDate, vnTime } from '../../lib/time';
import { PersonPicker, useActor } from '../shared';
import { PhotoViewer } from '../reports/ReportDetail';
import type { Media, Rollcall, RollcallAudience, UserProfile } from '../../lib/types';

export function audienceLabel(a: RollcallAudience, nameOf: (u: string) => string): string {
  switch (a.type) {
    case 'all':
      return 'Tất cả nhân viên, PG';
    case 'department':
      return `Bộ phận ${a.value}`;
    case 'brand':
      return `PG ${a.value}`;
    case 'role':
      return a.value === 'pg' ? 'Tất cả PG' : a.value === 'staff' ? 'Tất cả nhân viên' : 'Quản lý';
    case 'people':
      return (a.uids || []).length <= 2 ? (a.uids || []).map(nameOf).join(', ') : `${(a.uids || []).length} người`;
  }
}

/** Danh sách điểm danh mà người dùng cần làm (chưa hoàn tất, chưa đóng) */
export function myPendingRollcalls(list: Rollcall[], me: UserProfile | null): Rollcall[] {
  if (!me) return [];
  return list.filter((r) => !r.closed && inAudience(r.audience, me) && !rollcallDone(r, me.uid));
}

/** Tự nhận diện liên kết trong nội dung */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
            {p}
          </a>
        ) : (
          <MentionText key={i} text={p} />
        ),
      )}
    </>
  );
}

export function RollcallListScreen() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const me = s.profile;
  const canCreate = s.can('assign');
  const [seg, setSeg] = useState<'todo' | 'done' | 'closed'>('todo');
  const mine = d.rollcalls.filter((r) => me && inAudience(r.audience, me));
  const list = useMemo(() => {
    const base = canCreate ? d.rollcalls : mine;
    if (seg === 'closed') return base.filter((r) => r.closed);
    if (seg === 'done') return base.filter((r) => !r.closed && me && inAudience(r.audience, me) && rollcallDone(r, me.uid));
    return base.filter((r) => !r.closed && (canCreate ? !(me && inAudience(r.audience, me) && rollcallDone(r, me.uid)) || r.createdBy === me?.uid : !rollcallDone(r, me!.uid)));
  }, [d.rollcalls, mine, seg, canCreate, me]);
  const sorted = [...list].sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity) || b.createdAt - a.createdAt);

  return (
    <Page
      title="Điểm danh"
      large={false}
      right={
        canCreate ? (
          <button className="glass-btn icon prominent" aria-label="Tạo điểm danh" onClick={() => ui.sheet((c) => <RollcallEditor close={c} />)}>
            <Icon name="plus" size={22} stroke={2.4} />
          </button>
        ) : undefined
      }
      headerExtra={
        <div className="header-pills">
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'todo', label: 'Cần làm', count: myPendingRollcalls(d.rollcalls, me).length },
              { value: 'done', label: 'Đã xong' },
              { value: 'closed', label: 'Đã đóng' },
            ]}
          />
        </div>
      }
    >
      {sorted.length === 0 ? (
        <Empty
          icon="hand"
          title={seg === 'todo' ? 'Không có điểm danh cần làm' : 'Chưa có mục nào'}
          text={canCreate && seg === 'todo' ? 'Tạo điểm danh để nhân viên xác nhận đã thực hiện từng việc, kèm hình, video, link hướng dẫn.' : undefined}
        />
      ) : (
        <Section>
          <Group>
            {sorted.map((r) => (
              <RollcallRow key={r.id} r={r} onClick={() => nav.push(<RollcallDetailScreen id={r.id} />)} />
            ))}
          </Group>
        </Section>
      )}
    </Page>
  );
}

function RollcallRow({ r, onClick }: { r: Rollcall; onClick: () => void }) {
  const s = useSession();
  const d = useStoreData();
  const me = s.profile;
  const audience = d.active.filter((m) => inAudience(r.audience, m));
  const done = audience.filter((m) => rollcallDone(r, m.uid)).length;
  const mineItems = me ? Object.keys(r.progress?.[me.uid]?.items || {}).length : 0;
  const forMe = !!me && inAudience(r.audience, me);
  const overdue = r.dueAt && r.dueAt < now() && forMe && !rollcallDone(r, me!.uid);
  return (
    <Cell
      leading={
        s.can('assign') ? (
          <Ring value={done} total={audience.length || 1} size={40} width={5} color="var(--indigo)">
            <span className="t-cap2 semibold tnum">{done}</span>
          </Ring>
        ) : (
          <span className={`cell-icon bg-${forMe && rollcallDone(r, me!.uid) ? 'green' : 'indigo'}`} style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Icon name={forMe && rollcallDone(r, me!.uid) ? 'check' : 'hand'} size={21} stroke={2} />
          </span>
        )
      }
      sepInset={68}
      title={r.title}
      sub={
        <span className="row gap6 wrap">
          {r.dueAt && <span className={overdue ? 'c-red semibold' : ''}>{overdue ? 'Quá hạn · ' : 'Hạn '}{dueLabel(r.dueAt)}</span>}
          {forMe && !rollcallDone(r, me!.uid) && <span>· {mineItems}/{r.items.length} việc</span>}
          {s.can('assign') && <span>· {done}/{audience.length} người</span>}
        </span>
      }
      chevron
      onClick={onClick}
    />
  );
}

export function RollcallDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const { data: r, loading } = useDoc<Rollcall>('rollcalls', id);
  const [viewer, setViewer] = useState<number | null>(null);
  const me = s.profile;
  if (loading) return <Page title="Điểm danh" large={false}><Loading /></Page>;
  if (!r) return <Page title="Điểm danh" large={false}><Empty icon="hand" title="Không tìm thấy" /></Page>;

  const forMe = !!me && inAudience(r.audience, me);
  const mine = r.progress?.[actor.uid];
  const iDone = rollcallDone(r, actor.uid);
  const manage = s.isManager || r.createdBy === actor.uid;
  const audience = d.active.filter((m) => inAudience(r.audience, m));
  const doneList = audience.filter((m) => rollcallDone(r, m.uid));
  const notDone = audience.filter((m) => !rollcallDone(r, m.uid));
  const images = r.media.filter((m) => m.type === 'image');
  const videos = r.media.filter((m) => m.type === 'video');
  const links = r.media.filter((m) => m.type === 'link' || m.type === 'file');

  const toggle = async (itemId: string) => {
    if (!forMe || r.closed) return;
    const all = await toggleRollcallItem(r, itemId, actor);
    if (all) ui.toast({ text: 'Đã điểm danh hoàn tất', icon: 'check', color: 'green' });
  };

  const more = async () => {
    const v = await ui.actions(
      [
        { label: 'Sửa', value: 'edit', icon: 'pencil' },
        { label: r.closed ? 'Mở lại' : 'Đóng điểm danh', value: 'close', icon: 'lock' },
        { label: 'Xoá', value: 'delete', icon: 'trash', destructive: true },
      ],
      r.title,
    );
    if (v === 'edit') ui.sheet((c) => <RollcallEditor close={c} rc={r} />);
    if (v === 'close') await closeRollcall(r, !r.closed);
    if (v === 'delete' && (await ui.confirm('Xoá điểm danh?', 'Không thể hoàn tác.', 'Xoá', true))) {
      await deleteRollcall(r);
      nav.pop();
    }
  };

  return (
    <Page
      title={r.title}
      large={false}
      right={
        manage ? (
          <button className="glass-btn icon" onClick={more} aria-label="Tuỳ chọn">
            <Icon name="ellipsis" size={22} />
          </button>
        ) : undefined
      }
    >
      <div style={{ padding: '4px 20px 0' }}>
        <div className="row gap8 wrap">
          {r.closed ? <Pill>Đã đóng</Pill> : r.dueAt ? <Pill color={r.dueAt < now() ? 'red' : 'orange'} icon="clock">Hạn {dueLabel(r.dueAt)}</Pill> : null}
          <Pill color="purple" icon="people">{audienceLabel(r.audience, d.nameOf)}</Pill>
        </div>
        <div className="t-title2 mt12">{r.title}</div>
        <div className="t-foot c2" style={{ marginTop: 2 }}>
          {r.createdByName} · {friendly(r.createdAt)}
        </div>
        {r.body && (
          <div className="t-body mt12" style={{ userSelect: 'text' }}>
            <Linkified text={r.body} />
          </div>
        )}
      </div>

      {images.length > 0 && (
        <Section title="Hình ảnh" small>
          <div className="media-grid">
            {images.map((m, i) => (
              <button key={i} className="m" onClick={() => setViewer(i)}>
                <Img src={m.thumbUrl || m.url} />
              </button>
            ))}
          </div>
        </Section>
      )}
      {videos.length > 0 && (
        <Section title="Video" small>
          <div style={{ display: 'grid', gap: 10 }}>
            {videos.map((m, i) => (
              <video key={i} src={m.url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 18, background: '#000', maxHeight: 420 }} />
            ))}
          </div>
        </Section>
      )}
      {links.length > 0 && (
        <Section title="Liên kết, tệp" small>
          <div style={{ display: 'grid', gap: 8 }}>
            {links.map((m, i) => (
              <a key={i} className="link-card" href={m.url} target="_blank" rel="noopener noreferrer">
                <span className="cell-icon bg-blue" style={{ width: 34, height: 34, borderRadius: 10 }}>
                  <Icon name={m.type === 'file' ? 'doc' : 'link'} size={18} />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sub semibold ellipsis" style={{ display: 'block', color: 'var(--label)' }}>
                    {m.name || m.url}
                  </span>
                  <span className="t-foot c2 ellipsis" style={{ display: 'block' }}>
                    {m.url.replace(/^https?:\/\//, '')}
                  </span>
                </span>
                <Icon name="arrowUpRight" size={18} className="c3" />
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Việc cần xác nhận (${r.items.length})`} small footer={forMe ? (iDone ? undefined : 'Tích đủ tất cả việc để hoàn tất điểm danh.') : 'Bạn không nằm trong danh sách cần điểm danh.'}>
        <Group>
          {r.items.map((it, i) => {
            const at = mine?.items?.[it.id];
            return (
              <button key={it.id} className="cell rc-item" style={{ ['--sep-inset' as string]: '58px' }} onClick={() => toggle(it.id)} disabled={!forMe || !!r.closed}>
                <Check on={!!at} color="green" />
                <div className="cell-body">
                  <div className="cell-title" style={{ textDecoration: at ? 'line-through' : undefined, color: at ? 'var(--label-2)' : undefined }}>
                    <span className="c2 tnum">{i + 1}. </span>
                    {it.text}
                  </div>
                  {at && <div className="cell-sub">Đã xác nhận {vnTime(at)}</div>}
                </div>
              </button>
            );
          })}
        </Group>
        {forMe && iDone && (
          <div className="notice mt12">
            <span className="notice-icon bg-green">
              <Icon name="check" size={18} stroke={2.4} />
            </span>
            <div className="t-sub">Bạn đã điểm danh hoàn tất lúc {vnTime(mine!.doneAt!)}.</div>
          </div>
        )}
      </Section>

      {manage && (
        <Section
          title={`Hoàn tất ${doneList.length}/${audience.length}`}
          small
          action={notDone.length && !r.closed ? `Nhắc ${notDone.length} người` : undefined}
          onAction={async () => {
            await nudgeRollcall(r, actor, notDone.map((m) => m.uid));
            ui.toast({ text: `Đã nhắc ${notDone.length} người`, icon: 'bell', color: 'orange' });
          }}
        >
          <div className="card" style={{ paddingBottom: 12 }}>
            <div className="bar">
              <i style={{ width: `${audience.length ? (doneList.length / audience.length) * 100 : 0}%`, background: 'var(--green)' }} />
            </div>
          </div>
          {notDone.length > 0 && (
            <>
              <div className="section-head" style={{ paddingTop: 14 }}>
                <div className="h small">Chưa hoàn tất ({notDone.length})</div>
              </div>
              <Group>
                {notDone.map((m) => {
                  const n = Object.keys(r.progress?.[m.uid]?.items || {}).length;
                  return <Cell key={m.uid} leading={<Avatar name={m.fullName} src={m.photoURL} size={32} />} sepInset={60} title={m.fullName} detail={`${n}/${r.items.length}`} />;
                })}
              </Group>
            </>
          )}
          {doneList.length > 0 && (
            <>
              <div className="section-head" style={{ paddingTop: 14 }}>
                <div className="h small">Đã hoàn tất ({doneList.length})</div>
              </div>
              <Group>
                {doneList.map((m) => (
                  <Cell key={m.uid} leading={<Avatar name={m.fullName} src={m.photoURL} size={32} />} sepInset={60} title={m.fullName} detail={friendly(r.progress[m.uid].doneAt!)} />
                ))}
              </Group>
            </>
          )}
        </Section>
      )}
      {viewer !== null && <PhotoViewer photos={images.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl || m.url, capturedAt: 0 }))} index={viewer} title={r.title} onClose={() => setViewer(null)} />}
    </Page>
  );
}

export function RollcallEditor({ close, rc }: { close: () => void; rc?: Rollcall }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const [title, setTitle] = useState(rc?.title || '');
  const [body, setBody] = useState(rc?.body || '');
  const [media, setMedia] = useState<Media[]>(rc?.media || []);
  const [items, setItems] = useState<string[]>(rc ? rc.items.map((i) => i.text) : ['', '']);
  const [audience, setAudience] = useState<RollcallAudience>(rc?.audience || { type: 'all' });
  const [hasDue, setHasDue] = useState(rc ? !!rc.dueAt : true);
  const initDue = rc?.dueAt || now() + 24 * 3600000;
  const [dueDate, setDueDate] = useState(vnDate(initDue));
  const [dueTime, setDueTime] = useState(rc?.dueAt ? vnTime(rc.dueAt) : '18:00');
  const [remind, setRemind] = useState<number | null>(rc?.remindBefore ?? 60);
  const [busy, setBusy] = useState(false);
  const [newId] = useState(() => api().newId());
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = title.trim().length >= 3 && items.some((i) => i.trim());

  const pickAudience = async () => {
    const brands = [...new Set(d.active.filter((m) => m.role === 'pg' && m.brand).map((m) => m.brand!))];
    const v = await ui.actions(
      [
        { label: 'Tất cả nhân viên, PG', value: 'all' },
        { label: 'Tất cả nhân viên', value: 'role:staff' },
        { label: 'Tất cả PG', value: 'role:pg' },
        ...store.departments.filter((x) => x !== 'PG').map((x) => ({ label: `Bộ phận ${x}`, value: `department:${x}` })),
        ...brands.map((b) => ({ label: `PG ${b}`, value: `brand:${b}` })),
        { label: 'Chọn từng người…', value: 'people', icon: 'person' as const },
      ],
      'Ai cần điểm danh?',
    );
    if (!v) return;
    if (v === 'all') setAudience({ type: 'all' });
    else if (v === 'people')
      ui.sheet((c) => <PersonPicker title="Người cần điểm danh" people={d.active} selected={audience.uids || []} multi close={c} onDone={(u) => setAudience({ type: 'people', uids: u })} />);
    else {
      const [type, value] = v.split(':');
      setAudience({ type: type as RollcallAudience['type'], value });
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const isImg = f.type.startsWith('image/');
      const isVid = f.type.startsWith('video/');
      if (!isImg && !isVid) continue;
      if (isVid && f.size > 100 * 1024 * 1024) {
        ui.alert({ title: 'Video quá lớn', message: `${f.name} lớn hơn 100 MB. Hãy cắt ngắn hoặc dán link video (YouTube, Drive) thay thế.` });
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const base = `rollcalls/${store.code}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (isImg) {
          const { blob, thumb } = await compressImageFile(f, 1800);
          const url = await api().upload(`${base}.jpg`, blob, 'image/jpeg');
          const thumbUrl = await api().upload(`${base}_t.jpg`, thumb, 'image/jpeg');
          setMedia((m) => [...m, { type: 'image', url, thumbUrl, path: `${base}.jpg`, name: f.name }]);
        } else {
          const ext = (f.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 5);
          const url = await api().upload(`${base}.${ext}`, f, f.type || 'video/mp4');
          setMedia((m) => [...m, { type: 'video', url, path: `${base}.${ext}`, name: f.name }]);
        }
      } catch {
        ui.alert({ title: 'Chưa tải được', message: `${f.name}: kiểm tra kết nối mạng rồi thử lại.` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const addLink = async () => {
    const url = await ui.prompt('Thêm liên kết', 'Dán link video YouTube, Google Drive, tài liệu…', 'https://', 'Thêm');
    if (!url?.trim()) return;
    const u = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const name = await ui.prompt('Tên hiển thị', undefined, 'Ví dụ: Video hướng dẫn trưng bày', 'Xong');
    setMedia((m) => [...m, { type: 'link', url: u, name: name?.trim() || undefined }]);
  };

  const save = async () => {
    setBusy(true);
    try {
      const list = items.filter((i) => i.trim()).map((text, i) => ({ id: rc?.items.find((x) => x.text === text.trim())?.id || `i${i}${Date.now() % 10000}`, text: text.trim() }));
      await saveRollcall(
        {
          ...(rc || {}),
          storeCode: store.code,
          title: title.trim(),
          body: body.trim(),
          media,
          items: list,
          audience,
          dueAt: hasDue ? fromInputs(dueDate, dueTime) : null,
          remindBefore: hasDue ? remind : null,
          reminded: rc && rc.dueAt === (hasDue ? fromInputs(dueDate, dueTime) : null) ? rc.reminded : {},
        },
        actor,
        d.active,
        newId,
      );
      ui.toast({ text: rc ? 'Đã lưu' : 'Đã tạo điểm danh', icon: 'check', color: 'green' });
      close();
    } catch (e) {
      ui.alert({ title: 'Chưa lưu được', message: saveErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const audienceCount = d.active.filter((m) => inAudience(audience, m)).length;

  return (
    <>
      <SheetHead title={rc ? 'Sửa điểm danh' : 'Điểm danh mới'} onCancel={close} onDone={save} doneLabel={rc ? 'Lưu' : 'Tạo'} doneDisabled={!valid || uploading > 0} busy={busy} />
      <div className="sheet-body">
        <Section>
          <div className="group">
            <input className="textarea" style={{ minHeight: 0, height: 54, fontWeight: 600 }} placeholder="Tiêu đề, ví dụ: Thay POSM Black Friday" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="hairline" style={{ marginLeft: 16 }} />
            <MentionInput multiline rows={4} className="textarea" value={body} onChange={setBody} placeholder="Mô tả chi tiết, hướng dẫn. Dán link được tự nhận. Gõ @ để gắn tên." below />
          </div>
        </Section>

        <Section title="Hình ảnh, video, liên kết" small footer="Video tối đa 100 MB; video dài nên dán link YouTube hoặc Google Drive.">
          {media.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {media.map((m, i) => (
                <div key={i} className="link-card">
                  {m.type === 'image' ? (
                    <div className="thumb" style={{ width: 40, height: 40, borderRadius: 10 }}>
                      <Img src={m.thumbUrl || m.url} />
                    </div>
                  ) : (
                    <span className={`cell-icon bg-${m.type === 'video' ? 'pink' : 'blue'}`} style={{ width: 40, height: 40, borderRadius: 10 }}>
                      <Icon name={m.type === 'video' ? 'video' : 'link'} size={20} />
                    </span>
                  )}
                  <span className="grow t-sub ellipsis">{m.name || m.url}</span>
                  <button className="c3" onClick={() => setMedia((x) => x.filter((_, k) => k !== i))} aria-label="Bỏ">
                    <Icon name="minus" size={20} stroke={2.4} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="row gap8">
            <button className="btn tinted md grow" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
              {uploading > 0 ? <span className="spinner" /> : <Icon name="photo" size={18} />}
              {uploading > 0 ? `Đang tải ${uploading}…` : 'Ảnh / video'}
            </button>
            <button className="btn tinted md grow" onClick={addLink}>
              <Icon name="link" size={18} />
              Liên kết
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </Section>

        <Section title="Các việc phải xác nhận" small footer="Người điểm danh phải tích đủ tất cả việc mới được tính hoàn tất.">
          <div className="group">
            {items.map((it, i) => (
              <div className="field" key={i}>
                <span className="step-num" style={{ width: 24, height: 24, fontSize: 13 }}>
                  {i + 1}
                </span>
                <input value={it} placeholder={`Việc ${i + 1}`} onChange={(e) => setItems((x) => x.map((v, k) => (k === i ? e.target.value : v)))} />
                {items.length > 1 && (
                  <button onClick={() => setItems((x) => x.filter((_, k) => k !== i))} aria-label="Bỏ việc" className="c3">
                    <Icon name="minus" size={20} stroke={2.4} />
                  </button>
                )}
              </div>
            ))}
            <Cell icon="plus" iconColor="green" title="Thêm việc" onClick={() => setItems((x) => [...x, ''])} />
          </div>
        </Section>

        <Section title="Người điểm danh và hạn chót" small footer={audienceCount === 0 ? 'Nhóm này chưa có ai trong kho. Vẫn tạo được, người được duyệt vào kho sau sẽ thấy ngay.' : undefined}>
          <div className="group">
            <Cell icon="people" iconColor="indigo" title="Ai cần điểm danh" detail={`${audienceLabel(audience, d.nameOf)} (${audienceCount})`} chevron onClick={pickAudience} />
            <Cell icon="calendar" iconColor="red" title="Có hạn chót" trailing={<Switch checked={hasDue} onChange={setHasDue} label="Có hạn chót" />} />
            {hasDue && (
              <>
                <div className="field">
                  <label>Ngày</label>
                  <input type="date" value={dueDate} min={vnDate()} max={addDays(vnDate(), 180)} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Giờ</label>
                  <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                </div>
                <Cell
                  icon="bell"
                  iconColor="orange"
                  title="Nhắc người chưa xong"
                  detail={REMIND_OPTIONS.find((o) => o.value === remind)?.label}
                  chevron
                  onClick={async () => {
                    const v = await ui.actions(REMIND_OPTIONS.map((o) => ({ label: o.label, value: String(o.value), icon: o.value === remind ? 'check' : undefined })), 'Nhắc trước hạn');
                    if (v !== null) setRemind(v === 'null' ? null : Number(v));
                  }}
                />
              </>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

export function QuickTile({ icon, color, label, badge, onClick }: { icon: Parameters<typeof Icon>[0]['name']; color: string; label: string; badge?: number; onClick: () => void }): ReactNode {
  return (
    <button onClick={onClick}>
      <span className={`q-icon bg-${color}`}>
        <Icon name={icon} size={24} stroke={2} />
      </span>
      {label}
      {!!badge && <span className="badge">{badge}</span>}
    </button>
  );
}
