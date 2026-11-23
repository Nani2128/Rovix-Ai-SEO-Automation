import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent Chromium's benign ResizeObserver loop notification during dynamic
// graph/panel layout (e.g. React Flow) from surfacing as an uncaught error.
if (typeof window !== 'undefined') {
  const OriginalResizeObserver = window.ResizeObserver;
  if (typeof OriginalResizeObserver === 'function') {
    window.ResizeObserver = class SafeResizeObserver extends OriginalResizeObserver {
      private pendingRaf: number | null = null;
      private isDisconnected = false;

      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (this.pendingRaf !== null) {
            window.cancelAnimationFrame(this.pendingRaf);
          }
          this.pendingRaf = window.requestAnimationFrame(() => {
            this.pendingRaf = null;
            if (!this.isDisconnected) {
              callback(entries, observer);
            }
          });
        });
      }

      override observe(target: Element, options?: ResizeObserverOptions): void {
        this.isDisconnected = false;
        super.observe(target, options);
      }

      override disconnect(): void {
        this.isDisconnected = true;
        if (this.pendingRaf !== null) {
          window.cancelAnimationFrame(this.pendingRaf);
          this.pendingRaf = null;
        }
        super.disconnect();
      }
    };
  }

  window.addEventListener(
    'error',
    (event) => {
      const msg = event.message || '';
      if (
        msg.includes('ResizeObserver loop completed with undelivered notifications') ||
        msg.includes('ResizeObserver loop limit exceeded')
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );
}

createRoot(document.getElementById('root')!).render(<App />);
