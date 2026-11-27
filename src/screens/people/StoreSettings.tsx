import { useState } from 'react';
import { useSession } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Cell, Group, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { CHAIN_LABEL } from '../../lib/criteria';
import { getPosition, geoErrorText } from '../../lib/geo';
import { updateStore } from '../../lib/actions';
import { capitalizeCode, collapse } from '../../lib/text';
import type { Chain, Store } from '../../lib/types';

export function StoreSettingsScreen() {
  const s = useSession();
  const ui = useUI();
  const st = s.store!;
  const [locating, setLocating] = useState(false);
  const save = (p: Partial<Store>) => updateStore(st.code, p);

  const pickNum = async (title: string, values: number[], unit: string, current: number, field: keyof Store) => {
    const v = await ui.actions(values.map((n) => ({ label: `${n} ${unit}`, value: String(n), icon: n === current ? 'check' : undefined })), title);
    if (v) save({ [field]: Number(v) } as Partial<Store>);
  };

  const editList = async (field: 'departments' | 'brands', label: string) => {
    const list = st[field];
    const v = await ui.actions(
      [{ label: `Thêm ${label.toLowerCase()}`, value: '__add', icon: 'plus' }, ...list.map((x) => ({ label: `Xoá “${x}”`, value: x, destructive: true }))],
      label,
    );
    if (!v) return;
    if (v === '__add') {
      const name = await ui.prompt(`Thêm ${label.toLowerCase()}`, undefined, label, 'Thêm');
      if (name?.trim()) save({ [field]: [...list, field === 'brands' ? capitalizeCode(name) : name.trim()] } as Partial<Store>);
    } else if (await ui.confirm(`Xoá “${v}”?`, undefined, 'Xoá', true)) save({ [field]: list.filter((x) => x !== v) } as Partial<Store>);
  };

  const setLocation = async () => {
    if (!(await ui.confirm('Đặt vị trí siêu thị?', 'Hãy đứng bên trong siêu thị. Vị trí hiện tại của bạn sẽ là tâm để kiểm tra khi nhân viên chụp báo cáo.', 'Dùng vị trí hiện tại'))) return;
    setLocating(true);
    try {
      const p = await getPosition(20000);
      await save({ location: { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) } });
      ui.toast({ text: `Đã lưu vị trí (±${p.accuracy} m)`, icon: 'location', color: 'green' });
    } catch (e) {
      ui.alert({ title: 'Không lấy được vị trí', message: geoErrorText((e as Error).message) });
    } finally {
      setLocating(false);
    }
  };

  const reminders = [...st.reminderTimes].sort();

  return (
    <Page title="Cài đặt siêu thị" large={false}>
      <Section>
        <Group>
          <Cell title="Mã kho" detail={st.code} />
          <Cell
            title="Tên siêu thị"
            detail={st.name}
            chevron
            onClick={async () => {
              const v = await ui.prompt('Tên siêu thị', undefined, 'Tên', 'Lưu', st.name);
              if (v?.trim()) save({ name: collapse(v) }); // giữ nguyên chữ hoa/thường như người dùng gõ (mã viết tắt)
            }}
          />
          <Cell
            title="Chuỗi"
            detail={CHAIN_LABEL[st.chain]}
            chevron
            onClick={async () => {
              const v = await ui.actions((Object.keys(CHAIN_LABEL) as Chain[]).map((c) => ({ label: CHAIN_LABEL[c], value: c, icon: c === st.chain ? 'check' : undefined })), 'Chuỗi — quyết định bộ tiêu chí 8NTTT');
              if (v) save({ chain: v as Chain });
            }}
          />
          <Cell
            title="Địa chỉ"
            detail={st.address || 'Chưa có'}
            chevron
            onClick={async () => {
              const v = await ui.prompt('Địa chỉ', undefined, 'Địa chỉ siêu thị', 'Lưu', st.address || '');
              if (v !== null) save({ address: v.trim() });
            }}
          />
        </Group>
      </Section>

      <Section title="Vị trí kiểm tra GPS" small footer="Nhân viên chỉ gửi được báo cáo 8NTTT khi đang ở trong bán kính này.">
        <Group>
          <Cell
            icon="location"
            iconColor={st.location ? 'green' : 'red'}
            title={st.location ? 'Đã cài vị trí' : 'Chưa cài vị trí'}
            sub={st.location ? `${st.location.lat}, ${st.location.lng}` : 'Đứng trong siêu thị và chạm để đặt'}
            trailing={locating ? <span className="spinner" /> : <Icon name="chevronRight" size={17} stroke={2.4} className="chev" />}
            onClick={setLocation}
          />
          <Cell title="Bán kính cho phép" detail={`${st.radius} m`} chevron onClick={() => pickNum('Bán kính', [100, 150, 200, 300, 500], 'm', st.radius, 'radius')} />
        </Group>
      </Section>

      <Section title="Báo cáo 8NTTT" small footer={`Mỗi ngày 1 lần. Nộp sau ${st.deadline} tính trễ; hết ngày chưa nộp tính không báo cáo.`}>
        <Group>
          <div className="field">
            <label>Hạn nộp</label>
            <input type="time" value={st.deadline} onChange={(e) => e.target.value && save({ deadline: e.target.value })} />
          </div>
          <Cell title="Số ảnh tối thiểu" detail={`${st.minPhotos} ảnh`} chevron onClick={() => pickNum('Số ảnh tối thiểu', [1, 2, 3, 4, 5], 'ảnh', st.minPhotos, 'minPhotos')} />
          <Cell
            title="Nhắc người chưa nộp"
            detail={reminders.join(', ') || 'Không'}
            chevron
            onClick={async () => {
              const v = await ui.actions(
                [{ label: 'Thêm giờ nhắc', value: '__add', icon: 'plus' }, ...reminders.map((t) => ({ label: `Bỏ nhắc lúc ${t}`, value: t, destructive: true }))],
                'Giờ nhắc báo cáo',
              );
              if (v === '__add') {
                const t = await ui.prompt('Giờ nhắc', 'Nhập theo dạng 24 giờ, ví dụ 17:00', 'HH:mm', 'Thêm');
                if (t && /^\d{1,2}:\d{2}$/.test(t.trim())) save({ reminderTimes: [...new Set([...reminders, t.trim().padStart(5, '0')])] });
              } else if (v) save({ reminderTimes: reminders.filter((x) => x !== v) });
            }}
          />
          <Cell title="Lưu ảnh" sub="Tự xoá cuốn chiếu lúc 0h05 mỗi ngày" detail={`${st.retentionDays} ngày`} chevron onClick={() => pickNum('Tự xoá ảnh sau', [7, 10, 15, 30, 45], 'ngày', st.retentionDays, 'retentionDays')} />
        </Group>
      </Section>

      <Section title="Thông báo" small footer="Trong giờ yên lặng, app không gửi thông báo đẩy trừ việc khẩn; nội dung vẫn có trong mục Thông báo.">
        <Group>
          <div className="field">
            <label>Tóm tắt đầu ngày</label>
            <input type="time" value={st.digestTime} onChange={(e) => e.target.value && save({ digestTime: e.target.value })} />
          </div>
          <div className="field">
            <label>Yên lặng từ</label>
            <input type="time" value={st.quietStart} onChange={(e) => e.target.value && save({ quietStart: e.target.value })} />
          </div>
          <div className="field">
            <label>Đến</label>
            <input type="time" value={st.quietEnd} onChange={(e) => e.target.value && save({ quietEnd: e.target.value })} />
          </div>
          <Cell title="Báo quản lý khi quá hạn" detail={`Sau ${st.escalateMinutes} phút`} chevron onClick={() => pickNum('Báo quản lý khi việc quá hạn', [15, 30, 60, 120], 'phút', st.escalateMinutes, 'escalateMinutes')} />
        </Group>
      </Section>

      <Section title="Danh mục" small>
        <Group>
          <Cell title="Bộ phận" sub={st.departments.join(', ')} chevron onClick={() => editList('departments', 'Bộ phận')} />
          <Cell title="Hãng" sub={st.brands.join(', ')} chevron onClick={() => editList('brands', 'Hãng')} />
        </Group>
      </Section>
    </Page>
  );
}
