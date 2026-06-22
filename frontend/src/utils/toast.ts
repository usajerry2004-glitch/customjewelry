export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (opts: ToastOptions) => void;
const listeners = new Set<Listener>();

export const toast = {
  show(opts: ToastOptions) {
    listeners.forEach(fn => fn(opts));
  },
  success(description: string, title = 'Success') {
    this.show({ title, description, variant: 'success' });
  },
  error(description: string, title = 'Error') {
    this.show({ title, description, variant: 'error' });
  },
  warning(description: string, title = 'Warning') {
    this.show({ title, description, variant: 'warning' });
  },
  info(description: string, title = 'Info') {
    this.show({ title, description, variant: 'info' });
  },
  _subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
