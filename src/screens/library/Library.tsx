import { useState, type ReactNode } from 'react';
import { useSession, useStoreData } from '../../state/session';
import { useNav } from '../../ui/Nav';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Cell, Empty, Group, Pill, SearchBar, Section, SkeletonList } from '../../ui/controls';
import { Icon, type IconName } from '../../ui/Icon';
import { POST_CATEGORIES } from '../../lib/constants';
import { CHAIN_LABEL, CRITERIA } from '../../lib/criteria';
import { matches } from '../../lib/text';
import { dm, vnDate } from '../../lib/time';
import { NavActions } from '../shared';
import { PostDetailScreen } from './PostDetail';
import { PostEditor } from './PostEditor';
import type { Post, PostCategory, UserProfile } from '../../lib/types';

export function visibleTo(p: Post, me: UserProfile | null, manager: boolean): boolean {
  if (manager || !me) return true;
  const a = p.audience;
  if (a.type === 'all') return true;
  if (a.type === 'department') return a.value === me.department;
  if (a.type === 'brand') return a.value === me.brand;
  if (a.type === 'role') return a.value === me.role;
  return true;
}

export function needsAck(p: Post, uid: string): boolean {
  return p.requireAck && (!p.acks?.[uid] || p.acks[uid].v < p.version);
}

export function isExpired(p: Post): boolean {
  return !!p.expiresOn && p.expiresOn < vnDate();
}

export function LibraryScreen() {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const ui = useUI();
  const [q, setQ] = useState('');
  const me = s.profile;
  const uid = s.auth?.uid || '';
  const posts = d.posts.filter((p) => visibleTo(p, me, s.isManager));
  const live = posts.filter((p) => !isExpired(p));
  const pinned = live.filter((p) => p.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const unread = live.filter((p) => needsAck(p, uid));
  const recent = [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const results = q ? posts.filter((p) => matches(`${p.title} ${p.body}`, q)) : [];

  return (
    <Page
      title="Thư viện"
      right={
        <>
          {s.can('library') && (
            <button className="glass-btn icon prominent" aria-label="Đăng bài" onClick={() => ui.sheet((c) => <PostEditor close={c} />)}>
              <Icon name="compose" size={21} />
            </button>
          )}
          <NavActions />
        </>
      }
      headerExtra={
        <div style={{ padding: '6px 16px 0' }}>
          <SearchBar value={q} onChange={setQ} placeholder="Tìm quy định, chính sách…" />
        </div>
      }
    >
      {q ? (
        <Section title={`${results.length} kết quả`} small>
          {results.length ? <PostGroup posts={results} uid={uid} onOpen={(p) => nav.push(<PostDetailScreen id={p.id} />)} /> : <Empty icon="search" title="Không tìm thấy" />}
        </Section>
      ) : (
        <>
          {unread.length > 0 && (
            <Section title="Cần xác nhận đã đọc">
              <PostGroup posts={unread} uid={uid} onOpen={(p) => nav.push(<PostDetailScreen id={p.id} />)} />
            </Section>
          )}

          <Section title="Danh mục">
            <Group>
              {POST_CATEGORIES.map((c) => {
                const n = live.filter((p) => p.category === c.key).length;
                return <Cell key={c.key} icon={c.icon as IconName} iconColor={c.color} title={c.label} detail={n || undefined} chevron onClick={() => nav.push(<CategoryScreen category={c.key} />)} />;
              })}
              <Cell icon="shieldCheck" iconColor="teal" title="Tiêu chí 8NTTT" detail={s.store ? CHAIN_LABEL[s.store.chain] : undefined} chevron onClick={() => nav.push(<CriteriaLibrary />)} />
              <Cell icon="clock" iconColor="gray" title="Đã hết hiệu lực" detail={posts.filter(isExpired).length || undefined} chevron onClick={() => nav.push(<CategoryScreen category="expired" />)} />
            </Group>
          </Section>

          {pinned.length > 0 && (
            <Section title="Đã ghim">
              <PostGroup posts={pinned} uid={uid} onOpen={(p) => nav.push(<PostDetailScreen id={p.id} />)} />
            </Section>
          )}

          <Section title="Mới cập nhật">
            {recent.length ? (
              <PostGroup posts={recent} uid={uid} onOpen={(p) => nav.push(<PostDetailScreen id={p.id} />)} />
            ) : d.loading ? (
              <SkeletonList rows={3} title={false} />
            ) : (
              <Empty icon="books" title="Chưa có bài viết" text={s.can('library') ? 'Đăng nội quy, chính sách, chương trình triển khai để mọi người tra cứu.' : undefined} />
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

export function PostGroup({ posts, uid, onOpen }: { posts: Post[]; uid: string; onOpen: (p: Post) => void }) {
  return (
    <Group>
      {posts.map((p) => {
        const cat = POST_CATEGORIES.find((c) => c.key === p.category)!;
        const need = needsAck(p, uid);
        return (
          <Cell
            key={p.id}
            icon={cat.icon as IconName}
            iconColor={cat.color}
            title={<span className={need ? 'semibold' : ''}>{p.title}</span>}
            sub={
              <span className="row gap6 wrap">
                <span>
                  {cat.label} · {dm(p.updatedAt)}
                </span>
                {p.version > 1 && <span>· Bản {p.version}</span>}
              </span>
            }
            trailing={need ? <Pill sm color="orange">Chưa đọc</Pill> : p.pinned ? <Icon name="flag" size={16} className="c-orange" /> : undefined}
            chevron
            onClick={() => onOpen(p)}
          />
        );
      })}
    </Group>
  );
}

function CategoryScreen({ category }: { category: PostCategory | 'expired' }) {
  const s = useSession();
  const d = useStoreData();
  const nav = useNav();
  const cat = POST_CATEGORIES.find((c) => c.key === category);
  const list = d.posts
    .filter((p) => visibleTo(p, s.profile, s.isManager))
    .filter((p) => (category === 'expired' ? isExpired(p) : p.category === category && !isExpired(p)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  return (
    <Page title={cat?.label || 'Đã hết hiệu lực'} large={false}>
      {list.length ? (
        <Section>
          <PostGroup posts={list} uid={s.auth?.uid || ''} onOpen={(p) => nav.push(<PostDetailScreen id={p.id} />)} />
        </Section>
      ) : (
        <Empty icon="doc" title="Chưa có bài viết" />
      )}
    </Page>
  );
}

function CriteriaLibrary() {
  const s = useSession();
  const nav = useNav();
  const chain = s.store?.chain || 'DMX';
  return (
    <Page title="Tiêu chí 8NTTT" large={false}>
      <div style={{ padding: '4px 20px 0' }} className="t-sub c2">
        Bộ tiêu chí {CHAIN_LABEL[chain]}. Quản lý có thể điều chỉnh tiêu chí riêng cho từng khu vực.
      </div>
      <Section>
        <Group>
          {CRITERIA[chain].map((g) => (
            <Cell key={g.key} icon="shieldCheck" iconColor="teal" title={g.name} detail={`${g.items.length}`} chevron onClick={() => nav.push(<CriteriaGroupScreen chain={chain} k={g.key} />)} />
          ))}
        </Group>
      </Section>
    </Page>
  );
}

function CriteriaGroupScreen({ chain, k }: { chain: keyof typeof CRITERIA; k: string }) {
  const g = CRITERIA[chain].find((x) => x.key === k)!;
  return (
    <Page title={g.name} large={false}>
      <Section>
        <Group>
          {g.items.map((c, i) => (
            <Cell key={i} leading={<span className="t-sub c2 tnum" style={{ width: 24 }}>{i + 1}.</span>} sepInset={52} title={<span className="t-sub">{c}</span>} style={{ alignItems: 'flex-start' }} />
          ))}
        </Group>
      </Section>
    </Page>
  );
}

/** Hiển thị nội dung bài viết: hỗ trợ **đậm**, danh sách "- " và "1. ". */
export function Prose({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>));
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.length === 1 && /^\*\*[^*]+\*\*$/.test(lines[0].trim())) return <h4 key={i}>{lines[0].trim().slice(2, -2)}</h4>;
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>)}</ol>;
        if (lines.length > 1 && /^\*\*[^*]+\*\*$/.test(lines[0].trim())) {
          const rest = lines.slice(1);
          return (
            <div key={i}>
              <h4>{lines[0].trim().slice(2, -2)}</h4>
              {rest.every((l) => /^\s*[-•]\s+/.test(l)) ? (
                <ul>{rest.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>)}</ul>
              ) : (
                <p>{rest.map((l, k) => <span key={k}>{inline(l)}{k < rest.length - 1 && <br />}</span>)}</p>
              )}
            </div>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, k) => (
              <span key={k}>
                {inline(l)}
                {k < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
