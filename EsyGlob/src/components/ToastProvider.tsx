import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';
type ToastItem = { id: string; type: ToastType; message: string; title?: string; persistent?: boolean };
type ToastApi = {
  show: (type: ToastType, message: string, options?: Partial<ToastItem>) => string;
  update: (id: string, changes: Partial<ToastItem>) => void;
  dismiss: (id: string) => void;
  success: (message: string) => string;
  error: (message: string) => string;
  warning: (message: string) => string;
  info: (message: string) => string;
  loading: (message: string) => string;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems(current => current.filter(item => item.id !== id));
  }, []);

  const schedule = useCallback((item: ToastItem) => {
    const timer = timers.current.get(item.id);
    if (timer) clearTimeout(timer);
    if (!item.persistent && item.type !== 'loading') {
      timers.current.set(item.id, setTimeout(() => dismiss(item.id), item.type === 'error' ? 6000 : 4000));
    }
  }, [dismiss]);

  const show = useCallback((type: ToastType, message: string, options: Partial<ToastItem> = {}) => {
    const item = { ...options, id: options.id || `toast-${Date.now()}-${sequence.current += 1}`, type, message } as ToastItem;
    setItems(current => [...current.filter(existing => existing.id !== item.id), item].slice(-4));
    schedule(item);
    return item.id;
  }, [schedule]);

  const update = useCallback((id: string, changes: Partial<ToastItem>) => {
    setItems(current => current.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...changes };
      schedule(next);
      return next;
    }));
  }, [schedule]);

  const value = useMemo<ToastApi>(() => ({
    show, update, dismiss,
    success: message => show('success', message),
    error: message => show('error', message),
    warning: message => show('warning', message),
    info: message => show('info', message),
    loading: message => show('loading', message, { persistent: true }),
  }), [dismiss, show, update]);

  return <ToastContext.Provider value={value}>{children}<View pointerEvents="box-none" style={styles.stack}>{items.map(item => <Toast key={item.id} item={item} dismiss={dismiss} />)}</View></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

function Toast({ item, dismiss }: { item: ToastItem; dismiss: (id: string) => void }) {
  const offset = useRef(new Animated.Value(-20)).current;
  React.useEffect(() => { Animated.spring(offset, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start(); }, [offset]);
  const icon = item.type === 'success' ? 'check-circle' : item.type === 'error' ? 'alert-circle' : item.type === 'warning' ? 'alert' : item.type === 'loading' ? 'loading' : 'information';
  return <Animated.View style={[styles.toast, styles[item.type], { transform: [{ translateY: offset }] }]}><Icon name={icon} size={21} color={colors[item.type]} /><View style={styles.copy}><Text style={styles.title}>{item.title || titles[item.type]}</Text><Text style={styles.message}>{item.message}</Text></View><Pressable accessibilityLabel="Dismiss notification" onPress={() => dismiss(item.id)}><Icon name="close" size={19} color="#64748B" /></Pressable></Animated.View>;
}

const titles: Record<ToastType, string> = { success: 'Success', error: 'Something went wrong', warning: 'Action required', info: 'Information', loading: 'Please wait' };
const colors: Record<ToastType, string> = { success: '#067647', error: '#B42318', warning: '#B54708', info: '#175CD3', loading: '#175CD3' };
const styles = StyleSheet.create({
  stack: { gap: 8, left: 14, position: 'absolute', right: 14, top: 52, zIndex: 9999 },
  toast: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#E4E7EC', borderLeftWidth: 4, borderRadius: 13, borderWidth: 1, elevation: 10, flexDirection: 'row', gap: 10, padding: 12, shadowColor: '#101828', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14 },
  success: { borderLeftColor: '#079455' }, error: { borderLeftColor: '#D92D20' }, warning: { borderLeftColor: '#DC6803' }, info: { borderLeftColor: '#2E90FA' }, loading: { borderLeftColor: '#2E90FA' },
  copy: { flex: 1 }, title: { color: '#101828', fontSize: 13, fontWeight: '800' }, message: { color: '#475467', fontSize: 12, lineHeight: 17, marginTop: 2 },
});
