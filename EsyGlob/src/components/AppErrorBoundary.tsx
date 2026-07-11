import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type State = { error: Error | null };

export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { if (__DEV__) console.error('[AppErrorBoundary]', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <View style={styles.screen}><Text style={styles.title}>EsyGlob could not open this screen</Text><Text style={styles.detail}>Please retry. Your account and saved data are safe.</Text>{__DEV__ ? <Text style={styles.debug}>{this.state.error.message}</Text> : null}<Pressable onPress={() => this.setState({ error: null })} style={styles.button}><Text style={styles.buttonText}>Try Again</Text></Pressable></View>;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 28 },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  detail: { color: '#64748B', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  debug: { color: '#B91C1C', fontSize: 11, marginTop: 14, textAlign: 'center' },
  button: { marginTop: 22, backgroundColor: '#F26A21', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
