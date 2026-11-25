import { Icon } from '../../ui/Icon';
import { Img, Pill } from '../../ui/controls';
import { duration, now, vnAt, vnDate } from '../../lib/time';
import { STATUS_META, type AreaToday } from '../../lib/reports';
import { useCapture } from './Capture';
import type { Store } from '../../lib/types';

export function AreaCard({ item, store, onOpenReport }: { item: AreaToday; store: Store; onOpenReport: (id: string) => void }) {
  const { open, element } = useCapture();
  const { area, status, report } = item;
  const meta = STATUS_META[status];
  const deadlineMs = vnAt(vnDate(), store.deadline);
  const left = deadlineMs - now();
  const failed = report?.review?.result === 'fail';
  const color = failed ? 'red' : meta.color;
  return (
    <div className="card">
      <div className="row gap12">
        <span className={`bg-${color === 'blue' ? 'blue' : color}`} style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#fff', flex: 'none' }}>
          <Icon name={report ? (failed ? 'retake' : 'check') : 'camera'} size={22} stroke={2.1} />
        </span>
        <div className="grow">
          <div className="t-headline">{area.name}</div>
          <div className="t-sub c2">
            {report
              ? failed
                ? 'Quản lý yêu cầu chụp lại'
                : `${report.photos.length} ảnh · ${report.review?.result === 'pass' ? 'Đã chấm Đạt' : 'Chờ quản lý chấm'}`
              : status === 'pending'
                ? `Hạn ${store.deadline} · còn ${duration(left)}`
                : `Quá giờ ${duration(-left)} · vẫn nộp được, tính trễ`}
          </div>
        </div>
        <Pill sm color={color}>
          {failed ? 'Không đạt' : meta.label}
        </Pill>
      </div>
      {report && !failed && (
        <button className="row gap6 mt12" style={{ width: '100%' }} onClick={() => onOpenReport(report.id)} aria-label="Xem báo cáo">
          {report.photos.slice(0, 4).map((p, i) => (
            <div key={i} className="thumb" style={{ width: 64, height: 64 }}>
              <Img src={p.thumbUrl} />
            </div>
          ))}
          <div className="grow" />
          <Icon name="chevronRight" size={17} stroke={2.4} className="c3" />
        </button>
      )}
      {(!report || failed) && (
        <button className="btn block mt16" onClick={() => open(area, report)}>
          <Icon name="camera" size={21} stroke={2} />
          {failed ? 'Chụp lại báo cáo' : 'Chụp báo cáo'}
        </button>
      )}
      {failed && report?.review?.note && <div className="t-sub c-red mt12">Quản lý: “{report.review.note}”</div>}
      {element}
    </div>
  );
}
