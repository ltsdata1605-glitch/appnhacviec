import { useDoc, useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Avatar, Cell, Empty, Group, Loading, Pill, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { POST_CATEGORIES } from '../../lib/constants';
import { dmy, friendly } from '../../lib/time';
import { ackPost, deletePost, notify } from '../../lib/actions';
import { useActor } from '../shared';
import { Prose, needsAck, visibleTo } from './Library';
import { PostEditor } from './PostEditor';
import type { Post } from '../../lib/types';

export function PostDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const actor = useActor();
  const { data: p, loading } = useDoc<Post>('posts', id);
  if (loading) return <Page title="Thư viện" large={false}><Loading /></Page>;
  if (!p) return <Page title="Thư viện" large={false}><Empty icon="doc" title="Không tìm thấy bài viết" /></Page>;

  const cat = POST_CATEGORIES.find((c) => c.key === p.category)!;
  const uid = s.auth?.uid || '';
  const need = needsAck(p, uid);
  const canEdit = s.can('library');
  const audience = d.active.filter((m) => visibleTo(p, m, false));
  const acked = audience.filter((m) => p.acks?.[m.uid] && p.acks[m.uid].v >= p.version);
  const notAcked = audience.filter((m) => !(p.acks?.[m.uid] && p.acks[m.uid].v >= p.version));
  const audienceText = p.audience.type === 'all' ? 'Toàn siêu thị' : p.audience.type === 'department' ? `Bộ phận ${p.audience.value}` : p.audience.type === 'brand' ? `PG ${p.audience.value}` : `${p.audience.value}`;

  const more = async () => {
    const v = await ui.actions(
      [
        { label: 'Sửa bài viết', value: 'edit', icon: 'pencil' },
        ...(p.requireAck && notAcked.length ? [{ label: `Nhắc ${notAcked.length} người chưa đọc`, value: 'nudge', icon: 'bell' as const }] : []),
        { label: 'Xoá bài viết', value: 'delete', icon: 'trash', destructive: true },
      ],
      p.title,
    );
    if (v === 'edit') ui.sheet((c) => <PostEditor close={c} post={p} />);
    if (v === 'nudge') {
      await notify(notAcked.map((m) => m.uid), p.storeCode, actor, { title: 'Nhắc đọc thư viện', body: `Vui lòng đọc và xác nhận: ${p.title}`, link: `post:${p.id}` });
      ui.toast({ text: `Đã nhắc ${notAcked.length} người`, icon: 'bell', color: 'orange' });
    }
    if (v === 'delete' && (await ui.confirm('Xoá bài viết?', 'Không thể hoàn tác.', 'Xoá', true))) {
      await deletePost(p);
      nav.pop();
    }
  };

  return (
    <Page
      title={p.title}
      large={false}
      right={
        canEdit ? (
          <button className="glass-btn icon" onClick={more} aria-label="Tuỳ chọn">
            <Icon name="ellipsis" size={22} />
          </button>
        ) : undefined
      }
      footer={
        need ? (
          <button
            className="btn block"
            onClick={async () => {
              await ackPost(p, actor);
              ui.toast({ text: 'Đã xác nhận đã đọc', icon: 'check', color: 'green' });
            }}
          >
            <Icon name="check" size={20} stroke={2.4} />
            Tôi đã đọc và hiểu
          </button>
        ) : undefined
      }
    >
      <article style={{ padding: '4px 20px 0' }}>
        <div className="row gap8 wrap">
          <Pill color={cat.color === 'gray' ? 'gray' : cat.color === 'indigo' ? 'purple' : cat.color}>{cat.label}</Pill>
          {p.pinned && <Pill color="orange" icon="flag">Đã ghim</Pill>}
          {p.version > 1 && <Pill>Bản cập nhật {p.version}</Pill>}
        </div>
        <h1 className="t-title1" style={{ margin: '12px 0 6px', userSelect: 'text' }}>
          {p.title}
        </h1>
        <div className="t-foot c2">
          {p.createdByName} · Cập nhật {friendly(p.updatedAt)}
          {p.effectiveFrom ? ` · Hiệu lực từ ${dmy(p.effectiveFrom)}` : ''}
          {p.expiresOn ? ` · Đến ${dmy(p.expiresOn)}` : ''}
        </div>
        <div className="hairline" style={{ margin: '16px 0' }} />
        <Prose text={p.body} />
      </article>

      {p.attachments.length > 0 && (
        <Section title="Tệp đính kèm" small>
          <Group>
            {p.attachments.map((a, i) => (
              <Cell key={i} icon={a.type.startsWith('image/') ? 'photo' : 'doc'} iconColor={a.type.includes('pdf') ? 'red' : 'blue'} title={a.name} sub={a.size ? `${Math.round(a.size / 1024)} KB` : undefined} trailing={<Icon name="arrowUpRight" size={18} className="c3" />} onClick={() => window.open(a.url, '_blank', 'noopener')} />
            ))}
          </Group>
        </Section>
      )}

      {p.requireAck && !need && !canEdit && (
        <Section>
          <div className="notice">
            <span className="notice-icon bg-green">
              <Icon name="check" size={18} stroke={2.4} />
            </span>
            <div className="t-sub">Bạn đã xác nhận đọc {p.acks[uid] ? friendly(p.acks[uid].at) : ''}.</div>
          </div>
        </Section>
      )}

      {canEdit && p.requireAck && (
        <Section title={`Đã xác nhận ${acked.length}/${audience.length}`} small footer={`Đối tượng: ${audienceText}`}>
          <div className="card" style={{ paddingBottom: 12 }}>
            <div className="bar">
              <i style={{ width: `${audience.length ? (acked.length / audience.length) * 100 : 0}%`, background: 'var(--green)' }} />
            </div>
          </div>
          {notAcked.length > 0 && (
            <>
              <div className="section-head" style={{ paddingTop: 16 }}>
                <div className="h small">Chưa xác nhận ({notAcked.length})</div>
              </div>
              <Group>
                {notAcked.map((m) => (
                  <Cell key={m.uid} leading={<Avatar name={m.fullName} src={m.photoURL} size={32} />} sepInset={60} title={m.fullName} sub={p.acks?.[m.uid] ? 'Đã đọc bản cũ' : undefined} />
                ))}
              </Group>
            </>
          )}
          {acked.length > 0 && (
            <>
              <div className="section-head" style={{ paddingTop: 16 }}>
                <div className="h small">Đã xác nhận ({acked.length})</div>
              </div>
              <Group>
                {acked.map((m) => (
                  <Cell key={m.uid} leading={<Avatar name={m.fullName} src={m.photoURL} size={32} />} sepInset={60} title={m.fullName} detail={friendly(p.acks[m.uid].at)} />
                ))}
              </Group>
            </>
          )}
        </Section>
      )}
    </Page>
  );
}
