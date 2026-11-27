// Quản lý chỉnh danh mục mặt hàng báo cáo khai thác cho cả kho: thêm, đổi tên, ẩn, sắp xếp.
import { useEffect, useState } from 'react';
import { useSession } from '../../state/session';
import { Page } from '../../ui/Page';
import { useUI } from '../../ui/Overlay';
import { Cell, Group, Pill, Section } from '../../ui/controls';
import type { IconName } from '../../ui/Icon';
import { api } from '../../lib/backend';
import { catalogOf, DEFAULT_CATALOG, GROUP_META, slugKey } from '../../lib/sales';
import { saveErrorText } from '../../lib/actions';
import type { SalesGroup } from '../../lib/types';

export function SalesCatalogScreen() {
  const s = useSession();
  const ui = useUI();
  const [cat, setCat] = useState<SalesGroup[]>(() => catalogOf(s.store?.salesCatalog));
  useEffect(() => setCat(catalogOf(s.store?.salesCatalog)), [s.store?.salesCatalog]);

  const save = async (next: SalesGroup[], msg = 'Đã lưu danh mục') => {
    setCat(next);
    try {
      await api().update('stores', s.storeCode!, { salesCatalog: next });
      ui.toast({ text: msg, icon: 'check', color: 'green' });
    } catch (e) {
      ui.alert({ title: 'Chưa lưu được', message: saveErrorText(e) });
    }
  };

  const editItem = async (gi: number, ii: number) => {
    const g = cat[gi];
    const x = g.items[ii];
    const v = await ui.actions(
      [
        { label: 'Đổi tên', value: 'rename', icon: 'pencil' },
        { label: x.hidden ? 'Hiện lại' : 'Ẩn khỏi màn nhập', value: 'hide', icon: 'eye' },
        ...(ii > 0 ? [{ label: 'Chuyển lên trên', value: 'up', icon: 'chevronUp' as IconName }] : []),
        ...(ii < g.items.length - 1 ? [{ label: 'Chuyển xuống dưới', value: 'down', icon: 'chevronDown' as IconName }] : []),
        { label: 'Xoá mặt hàng', value: 'del', icon: 'trash', destructive: true },
      ],
      x.name,
    );
    if (!v) return;
    const items = [...g.items];
    if (v === 'rename') {
      const name = (await ui.prompt('Đổi tên', undefined, x.name, 'Lưu', x.name))?.trim();
      if (!name) return;
      items[ii] = { ...x, name };
    } else if (v === 'hide') items[ii] = { ...x, hidden: !x.hidden };
    else if (v === 'up') [items[ii - 1], items[ii]] = [items[ii], items[ii - 1]];
    else if (v === 'down') [items[ii + 1], items[ii]] = [items[ii], items[ii + 1]];
    else if (v === 'del') {
      if (!(await ui.confirm(`Xoá "${x.name}"?`, 'Báo cáo đã gửi vẫn giữ nguyên tên và số lượng mặt hàng này.', 'Xoá', true))) return;
      items.splice(ii, 1);
    }
    await save(cat.map((gg, j) => (j === gi ? { ...gg, items } : gg)));
  };

  const addItem = async (gi: number) => {
    const g = cat[gi];
    const name = (await ui.prompt(`Thêm vào ${g.name}`, undefined, 'Tên mặt hàng', 'Tiếp'))?.trim();
    if (!name) return;
    const kind = await ui.actions(
      [
        { label: 'Nhập số lượng (−/+)', value: 'qty', icon: 'plus' },
        { label: 'Nhập số tiền (Tr), ví dụ bảo hiểm', value: 'money', icon: 'banknote' },
      ],
      name,
    );
    if (!kind) return;
    const used = new Set(cat.flatMap((gg) => gg.items.map((x) => x.key)));
    let key = slugKey(name);
    for (let n = 2; used.has(key); n++) key = `${slugKey(name)}_${n}`;
    const item = kind === 'money' ? { key, name, money: true } : { key, name };
    await save(cat.map((gg, j) => (j === gi ? { ...gg, items: [...gg.items, item] } : gg)), `Đã thêm ${name}`);
  };

  return (
    <Page title="Danh mục khai thác" large={false}>
      <div style={{ padding: '4px 20px 0' }} className="t-sub c2">
        Mặt hàng hiện trên màn nhập báo cáo của cả kho. Chạm để đổi tên, ẩn, sắp xếp. Báo cáo đã gửi không bị ảnh hưởng.
      </div>
      {cat.map((g, gi) => (
        <Section key={g.key} title={g.name} small>
          <Group>
            {g.items.map((x, ii) => (
              <Cell
                key={x.key}
                icon={GROUP_META[g.key].icon as IconName}
                iconColor={x.hidden ? 'gray' : GROUP_META[g.key].color}
                title={<span className={x.hidden ? 'c3' : ''}>{x.name}</span>}
                trailing={
                  <span className="row gap6">
                    {x.money && <Pill sm color="blue">Tr</Pill>}
                    {x.hidden && <Pill sm>Đang ẩn</Pill>}
                  </span>
                }
                chevron
                onClick={() => editItem(gi, ii)}
              />
            ))}
            <Cell icon="plus" iconColor="green" title="Thêm mặt hàng" onClick={() => addItem(gi)} />
          </Group>
        </Section>
      ))}
      <Section>
        <Group>
          <Cell
            centered
            destructive
            title="Khôi phục danh mục mặc định"
            onClick={async () => {
              if (await ui.confirm('Khôi phục mặc định?', 'Các mặt hàng đã thêm, đổi tên hoặc ẩn sẽ trở về như ban đầu.', 'Khôi phục', true)) await save(DEFAULT_CATALOG, 'Đã khôi phục mặc định');
            }}
          />
        </Group>
      </Section>
      <div style={{ height: 24 }} />
    </Page>
  );
}
