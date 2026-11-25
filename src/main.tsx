import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './App';

// Luôn mở app trên cùng tên miền với trang đăng nhập Google (authDomain).
// iPhone chặn cookie giữa hai tên miền khác nhau, nên mở bằng *.web.app sẽ tự chuyển sang *.firebaseapp.com.
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
if (import.meta.env.PROD && authDomain && location.hostname.endsWith('.web.app') && location.hostname !== authDomain) {
  location.replace(`https://${authDomain}${location.pathname}${location.search}${location.hash}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('sw', e));
  });
}
