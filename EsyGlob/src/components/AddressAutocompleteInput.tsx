import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AddressSuggestion, resolveAddressSuggestion, searchAddressSuggestions, StandardizedLocation } from '../api/account';
import { detectCurrentAddress } from '../services/currentAddress';

function newToken() {
  return `esyglob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AddressAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  countryCodes,
  placeholder,
  inputRef,
  error,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSelect?: (location: StandardizedLocation) => void;
  countryCodes?: string;
  placeholder?: string;
  inputRef?: (input: TextInput | null) => void;
  error?: boolean;
}) {
  const token = useRef(newToken());
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 3) { setItems([]); return undefined; }
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await searchAddressSuggestions(query, token.current, countryCodes);
        if (current) setItems(suggestions);
      } catch {
        if (current) setItems([]);
      }
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [countryCodes, focused, value]);

  async function select(item: AddressSuggestion) {
    setBusy(true);
    setItems([]);
    try {
      const location = await resolveAddressSuggestion(item.placeId, token.current);
      if (location) {
        onChangeText(location.formattedAddress || item.label);
        onSelect?.(location);
      }
      token.current = newToken();
    } finally { setBusy(false); }
  }

  async function useCurrentLocation() {
    setNotice('');
    setBusy(true);
    try {
      const location = await detectCurrentAddress();
      onChangeText(location.formattedAddress || '');
      onSelect?.(location);
    } catch (nextError) {
      setNotice(nextError instanceof Error ? nextError.message : 'Unable to find your current address.');
    } finally { setBusy(false); }
  }

  return <View style={styles.wrap}>
    <View style={[styles.inputWrap, error && styles.inputError]}>
      <Icon name="map-marker-outline" size={19} color="#64748B" />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 180)}
        placeholder={placeholder || 'Start typing an address'}
        placeholderTextColor="#94A3B8"
        autoCorrect={false}
        style={styles.input}
      />
      {busy ? <ActivityIndicator size="small" color="#2563EB" /> : <Pressable accessibilityLabel="Use current location" hitSlop={8} onPress={useCurrentLocation} style={styles.locate}><Icon name="crosshairs-gps" size={18} color="#2563EB" /></Pressable>}
    </View>
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {focused && items.length ? <View style={styles.menu}>
      {items.map(item => <Pressable key={item.placeId} onPress={() => select(item)} style={styles.option}>
        <Icon name="map-marker" size={17} color="#2563EB" />
        <View style={styles.copy}><Text style={styles.primary}>{item.primaryText}</Text><Text style={styles.secondary}>{item.secondaryText}</Text></View>
      </Pressable>)}
      <Text style={styles.credit}>Address data © OpenStreetMap contributors</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 20 },
  inputWrap: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#D0D5DD', borderRadius: 10, borderWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 12 },
  inputError: { borderColor: '#EF4444', borderWidth: 1.5 },
  input: { color: '#0F172A', flex: 1, fontSize: 14, paddingHorizontal: 8, paddingVertical: 10 },
  locate: { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  notice: { color: '#B54708', fontSize: 10, marginTop: 4 },
  menu: { backgroundColor: '#fff', borderColor: '#E2E8F0', borderRadius: 11, borderWidth: 1, elevation: 10, left: 0, marginTop: 4, position: 'absolute', right: 0, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, top: 48, zIndex: 50 },
  option: { alignItems: 'flex-start', borderBottomColor: '#F1F5F9', borderBottomWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  copy: { flex: 1 }, primary: { color: '#0F172A', fontSize: 12, fontWeight: '700' }, secondary: { color: '#64748B', fontSize: 10, marginTop: 2 },
  credit: { color: '#64748B', fontSize: 9, padding: 7, textAlign: 'right' },
});
