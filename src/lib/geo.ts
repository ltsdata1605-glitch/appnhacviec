export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export function getPosition(timeout = 12000, maximumAge = 10000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: true, timeout, maximumAge },
    );
  });
}

/** 35 m, 1,2 km */
export function formatDistance(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function geoErrorText(code: string): string {
  switch (code) {
    case 'denied':
      return 'Chưa cho phép truy cập vị trí. Vào Cài đặt › Quyền riêng tư & Bảo mật › Dịch vụ định vị › Trang web Safari và chọn “Khi dùng ứng dụng”.';
    case 'timeout':
      return 'Không lấy được vị trí kịp thời. Hãy ra gần cửa kính hoặc bật Wi‑Fi rồi thử lại.';
    case 'unsupported':
      return 'Thiết bị không hỗ trợ định vị.';
    default:
      return 'Không xác định được vị trí. Kiểm tra Dịch vụ định vị rồi thử lại.';
  }
}
