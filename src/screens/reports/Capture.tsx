// Chụp báo cáo 8NTTT: chỉ dùng camera trong app, đóng dấu giờ máy chủ, kiểm tra vị trí.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../../state/session';
import { useUI } from '../../ui/Overlay';
import { Icon } from '../../ui/Icon';
import { Check, Group, Section, Cell, Img } from '../../ui/controls';
import { captureFrame, type Shot } from '../../lib/image';
import { distanceMeters, geoErrorText, getPosition, type Position } from '../../lib/geo';
import { now, stamp, vnDate } from '../../lib/time';
import { api } from '../../lib/backend';
import { submitReport } from '../../lib/actions';
import { MAX_PHOTOS } from '../../lib/constants';
import { useActor } from '../shared';
import type { Area, Photo, Report } from '../../lib/types';

const MAX_AGE_MS = 15 * 60000; // ảnh phải gửi trong 15 phút sau khi chụp

export function useCapture() {
  const [state, setState] = useState<{ area: Area; existing?: Report | null } | null>(null);
  return {
    open: (area: Area, existing?: Report | null) => setState({ area, existing }),
    element: state ? createPortal(<CaptureFlow area={state.area} existing={state.existing} onClose={() => setState(null)} />, document.body) : null,
  };
}

/** Camera chụp ảnh xác nhận hoàn tất công việc (không cần định vị). */
export function useProofCamera() {
  const [state, setState] = useState<{ title: string; resolve: (s: Shot[] | null) => void } | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const s = useSession();
  const actor = useActor();
  return {
    capture: (title: string) =>
      new Promise<Shot[] | null>((resolve) => {
        setShots([]);
        setState({ title, resolve });
      }),
    element: state ? (
      <CameraView
        area={{ id: 'proof', storeCode: s.storeCode || '', name: state.title, criteria: [], order: 0, active: true, createdAt: 0, createdDate: '' }}
        storeCode={s.storeCode || ''}
        name={actor.name}
        geo={{ status: 'loading' }}
        shots={shots}
        minPhotos={1}
        onShot={(sh) => setShots((x) => [...x, sh])}
        onClose={() => {
          state.resolve(null);
          setState(null);
        }}
        onNext={() => {
          state.resolve(shots);
          setState(null);
        }}
      />
    ) : null,
  };
}

type GeoState = { status: 'loading' } | { status: 'ok'; pos: Position; distance: number | null } | { status: 'error'; code: string };

function CaptureFlow({ area, existing, onClose }: { area: Area; existing?: Report | null; onClose: () => void }) {
  const s = useSession();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const minPhotos = area.minPhotos || store.minPhotos || 2;
  const [shots, setShots] = useState<Shot[]>([]);
  const [mode, setMode] = useState<'camera' | 'compose'>('camera');
  const [geo, setGeo] = useState<GeoState>({ status: 'loading' });

  const locate = () => {
    setGeo({ status: 'loading' });
    getPosition()
      .then((pos) => setGeo({ status: 'ok', pos, distance: store.location ? distanceMeters(pos, store.location) : null }))
      .catch((e: Error) => setGeo({ status: 'error', code: e.message }));
  };
  useEffect(locate, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => shots.forEach((x) => URL.revokeObjectURL(x.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = async () => {
    if (shots.length && !(await ui.confirm('Huỷ báo cáo?', 'Các ảnh vừa chụp sẽ bị bỏ.', 'Huỷ báo cáo', true))) return;
    onClose();
  };

  if (mode === 'camera')
    return (
      <CameraView
        area={area}
        storeCode={store.code}
        name={actor.name}
        geo={geo}
        shots={shots}
        minPhotos={minPhotos}
        onShot={(sh) => setShots((x) => [...x, sh])}
        onClose={close}
        onNext={() => setMode('compose')}
      />
    );

  return (
    <Compose
      area={area}
      existing={existing}
      shots={shots}
      setShots={setShots}
      minPhotos={minPhotos}
      geo={geo}
      relocate={locate}
      onMore={() => setMode('camera')}
      onClose={close}
      onDone={onClose}
    />
  );
}

function CameraView({
  area,
  storeCode,
  name,
  geo,
  shots,
  minPhotos,
  onShot,
  onClose,
  onNext,
}: {
  area: Area;
  storeCode: string;
  name: string;
  geo: GeoState;
  shots: Shot[];
  minPhotos: number;
  onShot: (s: Shot) => void;
  onClose: () => void;
  onNext: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showRef, setShowRef] = useState(!!area.refPhotoUrl);
  const [clock, setClock] = useState(stamp(now()));
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClock(stamp(now())), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
      } catch (e) {
        const n = (e as Error).name;
        setError(
          n === 'NotAllowedError'
            ? 'Chưa cho phép dùng camera. Vào Cài đặt › Safari › Camera (hoặc Cài đặt › Nhắc việc) và chọn Cho phép, rồi mở lại.'
            : 'Không mở được camera trên thiết bị này. Báo cáo 8NTTT bắt buộc chụp trực tiếp bằng camera.',
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const geoText = geo.status === 'ok' && geo.distance !== null ? `Cách siêu thị ${geo.distance} m` : undefined;

  const shoot = async () => {
    if (!video.current || busy || shots.length >= MAX_PHOTOS) return;
    setBusy(true);
    setFlash((f) => f + 1);
    try {
      const at = now();
      const shot = await captureFrame(video.current, { time: stamp(at), name, area: area.name, store: storeCode, geo: geoText }, at);
      onShot(shot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const last = shots[shots.length - 1];
  const enough = shots.length >= minPhotos;

  return createPortal(
    <div className="camera" role="dialog" aria-label="Chụp báo cáo">
      <div className="camera-top">
        <button className="glass-btn icon" style={{ color: '#fff', background: 'rgba(60,60,64,0.6)' }} onClick={onClose} aria-label="Đóng">
          <Icon name="xmark" size={20} stroke={2.4} />
        </button>
        <div className="cam-title">
          <div className="t-headline ellipsis">{area.name}</div>
          <div className="t-foot" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {shots.length}/{minPhotos} ảnh tối thiểu
          </div>
        </div>
        <button
          className="glass-btn"
          style={{ color: enough ? '#fff' : 'rgba(255,255,255,0.4)', background: enough ? 'var(--tint)' : 'rgba(60,60,64,0.6)', fontWeight: 600 }}
          onClick={onNext}
          disabled={!shots.length}
        >
          Tiếp
        </button>
      </div>
      <div className="camera-view">
        <video ref={video} playsInline muted autoPlay onLoadedMetadata={() => setReady(true)} style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
        {showRef && area.refPhotoUrl && <Img className="ref-overlay" src={area.refPhotoUrl} />}
        <div className="camera-grid" />
        <div key={flash} className={`camera-flash${flash ? ' go' : ''}`} />
        <div className="camera-live">{clock}</div>
        {!ready && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
            <div>
              <Icon name="camera" size={48} stroke={1.5} style={{ color: 'rgba(255,255,255,0.5)' }} />
              <div className="t-callout mt12">{error}</div>
            </div>
          </div>
        )}
        {area.refPhotoUrl && (
          <button
            className="glass-btn"
            style={{ position: 'absolute', left: 12, bottom: 12, color: '#fff', background: showRef ? 'rgba(255,204,0,0.85)' : 'rgba(60,60,64,0.6)', height: 36, fontSize: 14, fontWeight: 600 }}
            onClick={() => setShowRef((v) => !v)}
          >
            <Icon name="photo" size={17} />
            Ảnh chuẩn
          </button>
        )}
      </div>
      <div className="camera-bottom">
        <div>
          {last ? (
            <button className="cam-thumb" onClick={onNext} aria-label="Xem ảnh đã chụp">
              <img src={last.previewUrl} alt="" />
              <span className="badge">{shots.length}</span>
            </button>
          ) : (
            <span className="t-foot" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Chụp trực tiếp
            </span>
          )}
        </div>
        <button className="shutter" onClick={shoot} disabled={!ready || busy || shots.length >= MAX_PHOTOS} aria-label="Chụp">
          <span />
        </button>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="glass-btn icon" style={{ color: '#fff', background: 'rgba(60,60,64,0.6)' }} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label="Đổi camera">
            <Icon name="flip" size={22} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Compose({
  area,
  existing,
  shots,
  setShots,
  minPhotos,
  geo,
  relocate,
  onMore,
  onClose,
  onDone,
}: {
  area: Area;
  existing?: Report | null;
  shots: Shot[];
  setShots: (f: (s: Shot[]) => Shot[]) => void;
  minPhotos: number;
  geo: GeoState;
  relocate: () => void;
  onMore: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const s = useSession();
  const ui = useUI();
  const actor = useActor();
  const store = s.store!;
  const [checks, setChecks] = useState<boolean[]>(() => area.criteria.map(() => false));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const failedIdx = existing?.review?.result === 'fail' ? existing.review.failed : [];

  const radius = store.radius || 200;
  const geoOk =
    !store.location || (geo.status === 'ok' && geo.distance !== null && geo.distance - Math.min(geo.pos.accuracy, 100) <= radius);
  const tooOld = shots.some((x) => now() - x.capturedAt > MAX_AGE_MS);
  const unchecked = checks.filter((c) => !c).length;
  const canSend = shots.length >= minPhotos && geoOk && !tooOld && !busy;

  const send = async () => {
    if (unchecked > 0) {
      const ok = await ui.confirm(
        `Còn ${unchecked} tiêu chí chưa đạt`,
        'Các tiêu chí chưa đánh dấu sẽ được ghi nhận là chưa đạt. Hãy ghi chú lý do để quản lý nắm.',
        'Vẫn gửi',
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const date = vnDate();
      const photos: Photo[] = [];
      for (let i = 0; i < shots.length; i++) {
        const sh = shots[i];
        const base = `reports/${store.code}/${date}/${area.id}/${actor.uid}/${sh.capturedAt}_${i}`;
        const url = await api().upload(`${base}.jpg`, sh.blob, 'image/jpeg');
        const thumbUrl = await api().upload(`${base}_t.jpg`, sh.thumb, 'image/jpeg');
        photos.push({ url, thumbUrl, path: `${base}.jpg`, thumbPath: `${base}_t.jpg`, capturedAt: sh.capturedAt, hash: sh.hash, w: sh.w, h: sh.h });
        setProgress(Math.round(((i + 1) / shots.length) * 100));
      }
      await submitReport({
        storeCode: store.code,
        area,
        by: actor,
        photos,
        checks,
        note,
        geo: geo.status === 'ok' ? { lat: geo.pos.lat, lng: geo.pos.lng, accuracy: geo.pos.accuracy, distance: geo.distance } : null,
        existing,
      });
      ui.toast({ text: 'Đã gửi báo cáo', icon: 'check', color: 'green' });
      onDone();
    } catch (e) {
      console.error(e);
      ui.alert({ title: 'Chưa gửi được', message: 'Kiểm tra kết nối mạng rồi thử lại. Ảnh vẫn được giữ trên máy.' });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="camera" style={{ background: 'var(--bg)', color: 'var(--label)' }} role="dialog" aria-label="Gửi báo cáo">
      <div className="sheet-head" style={{ paddingTop: 'calc(var(--safe-top) + 6px)' }}>
        <div style={{ width: 88 }}>
          <button className="glass-btn icon" onClick={onClose} aria-label="Huỷ" disabled={busy}>
            <Icon name="xmark" size={20} stroke={2.2} />
          </button>
        </div>
        <div className="sheet-title">{area.name}</div>
        <div style={{ width: 88 }} />
      </div>
      <div className="sheet-body" style={{ paddingBottom: 'calc(var(--safe-bottom) + 110px)' }}>
        <Section title={`Ảnh (${shots.length})`} small action={shots.length < MAX_PHOTOS ? 'Chụp thêm' : undefined} onAction={onMore} footer={`Tối thiểu ${minPhotos} ảnh. Ảnh được đóng dấu giờ máy chủ và phải gửi trong 15 phút sau khi chụp.`}>
          <div className="photo-grid">
            {shots.map((sh, i) => (
              <div className="ph" key={sh.capturedAt + '-' + i}>
                <img src={sh.previewUrl} alt={`Ảnh ${i + 1}`} />
                <button
                  onClick={() => setShots((x) => x.filter((_, k) => k !== i))}
                  aria-label="Xoá ảnh"
                  style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'grid', placeItems: 'center' }}
                  disabled={busy}
                >
                  <Icon name="xmark" size={14} stroke={2.8} />
                </button>
              </div>
            ))}
            {shots.length < MAX_PHOTOS && (
              <button className="ph" onClick={onMore} style={{ display: 'grid', placeItems: 'center', color: 'var(--tint)' }} disabled={busy}>
                <div className="center">
                  <Icon name="camera" size={28} />
                  <div className="t-foot semibold mt8">Chụp thêm</div>
                </div>
              </button>
            )}
          </div>
          {tooOld && <div className="field-hint c-red">Có ảnh đã chụp hơn 15 phút. Xoá ảnh đó và chụp lại.</div>}
        </Section>

        <Section title="Vị trí" small>
          <Group>
            {geo.status === 'loading' && <Cell icon="location" iconColor="gray" title="Đang xác định vị trí…" trailing={<span className="spinner" />} />}
            {geo.status === 'error' && (
              <Cell icon="location" iconColor="red" title="Chưa có vị trí" sub={geoErrorText(geo.code)} trailing={<button className="btn sm tinted" onClick={relocate}>Thử lại</button>} />
            )}
            {geo.status === 'ok' && (
              <Cell
                icon="location"
                iconColor={geoOk ? 'green' : 'red'}
                title={geo.distance === null ? 'Đã ghi nhận vị trí' : geoOk ? `Tại siêu thị · cách ${geo.distance} m` : `Cách siêu thị ${geo.distance} m`}
                sub={
                  !store.location
                    ? 'Siêu thị chưa cài vị trí chuẩn, quản lý cần cài trong Cài đặt kho.'
                    : geoOk
                      ? `Sai số ±${geo.pos.accuracy} m`
                      : `Báo cáo phải chụp trong bán kính ${radius} m quanh siêu thị.`
                }
                trailing={!geoOk ? <button className="btn sm tinted" onClick={relocate}>Thử lại</button> : undefined}
              />
            )}
          </Group>
        </Section>

        <Section
          title={`Tự kiểm tra (${checks.filter(Boolean).length}/${checks.length})`}
          small
          action={checks.every(Boolean) ? 'Bỏ chọn' : 'Đạt tất cả'}
          onAction={() => setChecks((c) => c.map(() => !c.every(Boolean)))}
        >
          <Group>
            {area.criteria.map((c, i) => (
              <button
                key={i}
                className="cell"
                style={{ alignItems: 'flex-start', ['--sep-inset' as string]: '54px' }}
                onClick={() => setChecks((x) => x.map((v, k) => (k === i ? !v : v)))}
              >
                <Check on={checks[i]} color="green" ring={failedIdx.includes(i) ? 'red' : undefined} />
                <div className="cell-body">
                  <div className="t-sub" style={{ letterSpacing: -0.24 }}>
                    <span className="c2 tnum">{i + 1}. </span>
                    {c}
                  </div>
                  {failedIdx.includes(i) && <div className="t-foot c-red semibold mt8">Lần trước không đạt</div>}
                </div>
              </button>
            ))}
          </Group>
        </Section>

        <Section title="Ghi chú" small>
          <Group>
            <textarea className="textarea" placeholder="Tồn tại cần báo quản lý (nếu có)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Group>
        </Section>
      </div>
      <div className="bottom-bar">
        <button className="btn block" disabled={!canSend} onClick={send}>
          {busy ? (
            <>
              <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Đang gửi {progress}%
            </>
          ) : shots.length < minPhotos ? (
            `Cần thêm ${minPhotos - shots.length} ảnh`
          ) : !geoOk ? (
            'Chưa xác nhận vị trí'
          ) : (
            'Gửi báo cáo'
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
