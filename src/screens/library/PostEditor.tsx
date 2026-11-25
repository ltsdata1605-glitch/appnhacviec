import { useRef, useState } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Cell, Group, Section, Switch } from '../../ui/controls';
import { Icon, type IconName } from '../../ui/Icon';
import { POST_CATEGORIES, ROLE_LABEL } from '../../lib/constants';
import { api } from '../../lib/backend';
import { saveErrorText, savePost } from '../../lib/actions';
import { compressImageFile } from '../../lib/image';
import { useActor } from '../shared';
import { visibleTo } from './Library';
import type { Attachment, Post, PostCategory } from '../../lib/types';

export function PostEditor({ close, post }: { close: () => void; post?: Post }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const [category, setCategory] = useState<PostCategory>(post?.category || 'notice');
  const [title, setTitle] = useState(post?.title || '');
  const [body, setBody] = useState(post?.body || '');
  const [audience, setAudience] = useState<Post['audience']>(post?.audience || { type: 'all' });
  const [pinned, setPinned] = useState(post?.pinned || false);
  const [requireAck, setRequireAck] = useState(post?.requireAck ?? true);
  const [effectiveFrom, setEffectiveFrom] = useState(post?.effectiveFrom || '');
  const [expiresOn, setExpiresOn] = useState(post?.expiresOn || '');
  const [attachments, setAttachments] = useState<Attachment[]>(post?.attachments || []);
  const [bump, setBump] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cat = POST_CATEGORIES.find((c) => c.key === category)!;
  const audienceText = audience.type === 'all' ? 'Toàn siêu thị' : audience.type === 'department' ? `Bộ phận ${audience.value}` : audience.type === 'brand' ? `PG ${audience.value}` : ROLE_LABEL[audience.value as 'staff'] || '';

  const pickAudience = async () => {
    const v = await ui.actions(
      [
        { label: 'Toàn siêu thị', value: 'all' },
        ...store.departments.map((x) => ({ label: `Bộ phận ${x}`, value: `department:${x}` })),
        ...[...new Set(d.active.filter((m) => m.role === 'pg' && m.brand).map((m) => m.brand!))].map((b) => ({ label: `PG ${b}`, value: `brand:${b}` })),
      ],
      'Ai cần đọc bài này?',
    );
    if (!v) return;
    if (v === 'all') setAudience({ type: 'all' });
    else {
      const [type, value] = v.split(':');
      setAudience({ type: type as 'department' | 'brand', value });
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 15 * 1024 * 1024) {
          ui.alert({ title: 'Tệp quá lớn', message: `${f.name} lớn hơn 15 MB.` });
          continue;
        }
        const isImg = f.type.startsWith('image/');
        const blob = isImg ? (await compressImageFile(f, 2000)).blob : f;
        const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const path = `library/${store.code}/${Date.now()}_${safe}${isImg && !/\.jpe?g$/i.test(safe) ? '.jpg' : ''}`;
        const url = await api().upload(path, blob, isImg ? 'image/jpeg' : f.type || 'application/octet-stream');
        setAttachments((a) => [...a, { name: f.name, url, type: isImg ? 'image/jpeg' : f.type, path, size: blob.size }]);
      }
    } catch {
      ui.alert({ title: 'Chưa tải được tệp', message: 'Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const data: Partial<Post> & { storeCode: string } = {
        ...(post || {}),
        storeCode: store.code,
        category,
        title: title.trim(),
        body: body.trim(),
        audience,
        pinned,
        requireAck,
        effectiveFrom: effectiveFrom || null,
        expiresOn: expiresOn || null,
        attachments,
      };
      const recipients = d.active.filter((m) => visibleTo(data as Post, m, false)).map((m) => m.uid);
      await savePost(data, actor, recipients, !!post && bump);
      ui.toast({ text: post ? 'Đã cập nhật bài viết' : 'Đã đăng bài', icon: 'check', color: 'green' });
      close();
    } catch (e) {
      ui.alert({ title: 'Chưa lưu được', message: saveErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHead title={post ? 'Sửa bài viết' : 'Bài viết mới'} onCancel={close} onDone={save} doneLabel={post ? 'Lưu' : 'Đăng'} doneDisabled={title.trim().length < 3 || !body.trim() || uploading} busy={busy} />
      <div className="sheet-body">
        <Section>
          <Group>
            <Cell
              icon={cat.icon as IconName}
              iconColor={cat.color}
              title="Danh mục"
              detail={cat.label}
              chevron
              onClick={async () => {
                const v = await ui.actions(POST_CATEGORIES.map((c) => ({ label: c.label, value: c.key, icon: c.key === category ? 'check' : undefined })), 'Danh mục');
                if (v) setCategory(v as PostCategory);
              }}
            />
            <Cell icon="people" iconColor="blue" title="Đối tượng" detail={audienceText} chevron onClick={pickAudience} />
          </Group>
        </Section>
        <Section>
          <Group>
            <input className="textarea" style={{ minHeight: 0, height: 54, fontWeight: 600 }} placeholder="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="hairline" style={{ marginLeft: 16 }} />
            <textarea className="textarea" style={{ minHeight: 220 }} placeholder={'Nội dung\n\nMẹo: dòng bắt đầu bằng “- ” để tạo danh sách, **chữ** để in đậm.'} value={body} onChange={(e) => setBody(e.target.value)} />
          </Group>
        </Section>
        <Section title="Tệp đính kèm" small footer="Ảnh, PDF tối đa 15 MB mỗi tệp.">
          <Group>
            {attachments.map((a, i) => (
              <Cell
                key={i}
                icon={a.type.startsWith('image/') ? 'photo' : 'doc'}
                iconColor={a.type.includes('pdf') ? 'red' : 'blue'}
                title={a.name}
                trailing={
                  <button onClick={() => setAttachments((x) => x.filter((_, k) => k !== i))} aria-label="Bỏ tệp" className="c3">
                    <Icon name="minus" size={20} stroke={2.4} />
                  </button>
                }
              />
            ))}
            <Cell icon="paperclip" iconColor="gray" title={uploading ? 'Đang tải lên…' : 'Thêm tệp'} onClick={() => fileRef.current?.click()} trailing={uploading ? <span className="spinner" /> : undefined} />
          </Group>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </Section>
        <Section title="Tuỳ chọn" small>
          <Group>
            <Cell icon="check" iconColor="green" title="Yêu cầu xác nhận đã đọc" trailing={<Switch checked={requireAck} onChange={setRequireAck} label="Yêu cầu xác nhận" />} />
            <Cell icon="flag" iconColor="orange" title="Ghim lên đầu" trailing={<Switch checked={pinned} onChange={setPinned} label="Ghim" />} />
            <div className="field">
              <label>Hiệu lực từ</label>
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>Hết hiệu lực</label>
              <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
            {post && (
              <Cell title="Báo cập nhật mới" sub="Mọi người nhận thông báo và xác nhận lại" trailing={<Switch checked={bump} onChange={setBump} label="Báo cập nhật" />} />
            )}
          </Group>
        </Section>
      </div>
    </>
  );
}
