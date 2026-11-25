import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDoc, useSession, useStoreData } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI, SheetHead } from '../../ui/Overlay';
import { Avatar, Cell, Check, Empty, Group, Img, Loading, Pill, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { dmy, stamp, vnDate, vnTime } from '../../lib/time';
import { isLate } from '../../lib/reports';
import { reviewReport } from '../../lib/actions';
import { useActor } from '../shared';
import { useCapture } from './Capture';
import type { Photo, Report } from '../../lib/types';

export function ReportDetailScreen({ id }: { id: string }) {
  const s = useSession();
  const d = useStoreData();
  const ui = useUI();
  const actor = useActor();
  const { data: r, loading } = useDoc<Report>('reports', id);
  const [viewer, setViewer] = useState<{ photos: Photo[]; index: number; title: string } | null>(null);
  const { open, element } = useCapture();

  if (loading) return <Page title="Báo cáo" large={false}><Loading /></Page>;
  if (!r) return <Page title="Báo cáo" large={false}><Empty icon="photo" title="Không tìm thấy báo cáo" text="Báo cáo có thể đã bị xoá hoặc bạn không có quyền xem." /></Page>;

  const area = d.areas.find((a) => a.id === r.areaId);
  const criteria = area?.criteria || [];
  const late = s.store ? isLate(r, s.store.deadline) : false;
  const canReview = s.can('review');
  const mine = r.uid === s.auth?.uid;
  const rv = r.review;
  const user = d.byUid(r.uid);
  const isToday = r.date === vnDate();

  const pass = async () => {
    await reviewReport(r, actor, 'pass', [], '');
    ui.toast({ text: 'Đã chấm Đạt', icon: 'check', color: 'green' });
  };
  const fail = () =>
    ui.sheet((close) => <FailSheet criteria={criteria} checks={r.checks} close={close} onSubmit={async (failed, note) => {
      await reviewReport(r, actor, 'fail', failed, note);
      ui.toast({ text: 'Đã yêu cầu chụp lại', icon: 'retake', color: 'red' });
    }} />);

  return (
    <Page
      title={r.areaName}
      large={false}
      footer={
        canReview && !mine ? (
          <>
            <button className="btn danger-tinted" style={{ flex: 1 }} onClick={fail}>
              <Icon name="xmark" size={19} stroke={2.4} />
              Không đạt
            </button>
            <button className="btn green" style={{ flex: 1.3 }} onClick={pass} disabled={rv?.result === 'pass'}>
              <Icon name="check" size={19} stroke={2.4} />
              {rv?.result === 'pass' ? 'Đã chấm Đạt' : 'Đạt'}
            </button>
          </>
        ) : mine && rv?.result === 'fail' && isToday && area ? (
          <button className="btn block" onClick={() => open(area, r)}>
            <Icon name="camera" size={20} />
            Chụp lại báo cáo
          </button>
        ) : undefined
      }
    >
      <div style={{ padding: '4px 20px 0' }}>
        <div className="t-title2">{r.areaName}</div>
        <div className="row gap8 mt8 wrap">
          <Pill color={late ? 'orange' : 'green'} icon="clock">
            {late ? 'Nộp trễ' : 'Đúng giờ'} · {vnTime(r.submittedAt)}
          </Pill>
          {rv ? <Pill color={rv.result === 'pass' ? 'green' : 'red'}>{rv.result === 'pass' ? 'Đạt' : 'Không đạt'}</Pill> : <Pill color="purple">Chờ chấm</Pill>}
          {r.attempt > 1 && <Pill color="gray">Lần {r.attempt}</Pill>}
        </div>
      </div>

      {r.suspect && (
        <Section>
          <div className="notice">
            <span className="notice-icon bg-orange">
              <Icon name="warning" size={18} stroke={2.2} />
            </span>
            <div className="t-sub">{r.suspect}</div>
          </div>
        </Section>
      )}

      <Section title={`${r.photos.length} ảnh`} small>
        {r.photosPurged ? (
          <div className="card t-sub c2">Ảnh đã được tự động xoá theo chính sách lưu trữ.</div>
        ) : (
          <div className="photo-grid" style={{ gridTemplateColumns: r.photos.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
            {r.photos.map((p, i) => (
              <button key={i} className="ph" onClick={() => setViewer({ photos: r.photos, index: i, title: r.areaName })}>
                <Img src={p.thumbUrl || p.url} />
              </button>
            ))}
          </div>
        )}
        {area?.refPhotoUrl && (
          <button className="btn tinted sm mt12" onClick={() => setViewer({ photos: [{ url: area.refPhotoUrl!, thumbUrl: area.refPhotoUrl!, capturedAt: 0 }, ...r.photos], index: 0, title: 'So với ảnh chuẩn' })}>
            <Icon name="photo" size={17} />
            So với ảnh chuẩn
          </button>
        )}
      </Section>

      <Section>
        <Group>
          <Cell leading={<Avatar name={r.userName} src={user?.photoURL} size={36} />} sepInset={64} title={r.userName} sub={user ? (user.role === 'pg' ? `PG ${user.brand}` : user.department) : undefined} />
          <Cell icon="calendar" iconColor="red" title="Ngày báo cáo" detail={dmy(r.date)} />
          <Cell icon="clock" iconColor="blue" title="Gửi lúc" detail={stamp(r.submittedAt)} />
          <Cell
            icon="location"
            iconColor={r.geo?.distance != null && s.store && r.geo.distance <= (s.store.radius || 200) + 100 ? 'green' : 'gray'}
            title="Vị trí"
            detail={r.geo ? (r.geo.distance != null ? `Cách ${r.geo.distance} m` : 'Đã ghi nhận') : 'Không có'}
          />
        </Group>
      </Section>

      {criteria.length > 0 && (
        <Section title={`Tự kiểm tra ${r.checks.filter(Boolean).length}/${criteria.length}`} small footer={rv?.result === 'fail' ? 'Viền đỏ: tiêu chí quản lý chấm không đạt.' : undefined}>
          <Group>
            {criteria.map((c, i) => {
              const bad = rv?.failed.includes(i);
              return (
                <Cell
                  key={i}
                  leading={<Check on={!!r.checks[i] && !bad} color={bad ? 'red' : 'green'} ring={bad ? 'red' : undefined} size={22} />}
                  sepInset={50}
                  title={
                    <span className={`t-sub${bad ? ' c-red' : ''}`}>
                      <span className="c2 tnum">{i + 1}. </span>
                      {c}
                    </span>
                  }
                  style={{ alignItems: 'flex-start' }}
                />
              );
            })}
          </Group>
        </Section>
      )}

      {r.note && (
        <Section title="Ghi chú của nhân viên" small>
          <div className="card t-body">{r.note}</div>
        </Section>
      )}

      {rv && (
        <Section title="Kết quả chấm" small>
          <div className="card">
            <div className="row gap8">
              <Pill color={rv.result === 'pass' ? 'green' : 'red'}>{rv.result === 'pass' ? 'Đạt' : 'Không đạt'}</Pill>
              <span className="t-foot c2">
                {rv.byName} · {stamp(rv.at)}
              </span>
            </div>
            {rv.note && <div className="t-body mt8">{rv.note}</div>}
          </div>
        </Section>
      )}

      {r.previousPhotos && r.previousPhotos.length > 0 && (
        <Section title="Ảnh lần trước" small>
          <div className="row gap6">
            {r.previousPhotos.map((p, i) => (
              <button key={i} className="thumb" style={{ width: 72, height: 72 }} onClick={() => setViewer({ photos: r.previousPhotos!, index: i, title: 'Ảnh lần trước' })}>
                <Img src={p.thumbUrl} />
              </button>
            ))}
          </div>
        </Section>
      )}

      {viewer && <PhotoViewer {...viewer} onClose={() => setViewer(null)} />}
      {element}
    </Page>
  );
}

function FailSheet({ criteria, checks, close, onSubmit }: { criteria: string[]; checks: boolean[]; close: () => void; onSubmit: (failed: number[], note: string) => Promise<void> }) {
  const [failed, setFailed] = useState<number[]>(() => criteria.map((_, i) => i).filter((i) => !checks[i]));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <SheetHead
        title="Không đạt"
        onCancel={close}
        doneLabel="Gửi"
        busy={busy}
        doneDisabled={!failed.length && !note.trim()}
        onDone={async () => {
          setBusy(true);
          await onSubmit(failed, note);
          close();
        }}
      />
      <div className="sheet-body">
        <Section title="Nhận xét" small footer="Nhân viên sẽ nhận thông báo và chụp lại báo cáo.">
          <Group>
            <textarea className="textarea" placeholder="Ví dụ: Còn bụi mặt kệ, thiếu bảng giá tivi 55 inch" value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
          </Group>
        </Section>
        {criteria.length > 0 && (
          <Section title="Tiêu chí không đạt" small>
            <Group>
              {criteria.map((c, i) => (
                <button key={i} className="cell" style={{ alignItems: 'flex-start', ['--sep-inset' as string]: '54px' }} onClick={() => setFailed((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]))}>
                  <Check on={failed.includes(i)} color="red" />
                  <div className="cell-body t-sub">
                    <span className="c2 tnum">{i + 1}. </span>
                    {c}
                  </div>
                </button>
              ))}
            </Group>
          </Section>
        )}
      </div>
    </>
  );
}

export function PhotoViewer({ photos, index, title, onClose }: { photos: Photo[]; index: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(index);
  return createPortal(
    <div className="viewer" role="dialog" aria-label="Xem ảnh">
      <div className="viewer-top">
        <button className="glass-btn icon" onClick={onClose} aria-label="Đóng">
          <Icon name="xmark" size={20} stroke={2.4} />
        </button>
        <div className="center grow">
          <div className="t-headline ellipsis">{title}</div>
          <div className="t-foot" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {i + 1} / {photos.length}
            {photos[i]?.capturedAt ? ` · ${stamp(photos[i].capturedAt)}` : ' · Ảnh chuẩn'}
          </div>
        </div>
        <div style={{ width: 44 }} />
      </div>
      <div
        className="viewer-track"
        ref={(el) => {
          if (el && el.dataset.init !== '1') {
            el.dataset.init = '1';
            el.scrollLeft = index * el.clientWidth;
          }
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const n = Math.round(el.scrollLeft / el.clientWidth);
          if (n !== i) setI(n);
        }}
      >
        {photos.map((p, k) => (
          <div className="viewer-slide" key={k}>
            <Img src={p.url} alt={`Ảnh ${k + 1}`} />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
