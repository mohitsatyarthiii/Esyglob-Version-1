import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ITEMS = [
  { icon: 'truck-fast', label: 'Free Shipping', sub: 'Bulk orders', color: '#3B82F6' },
  { icon: 'clock-fast', label: 'Quick Response', sub: 'Within 24h', color: '#F59E0B' },
  { icon: 'shield-check', label: 'Verified', sub: 'Quality assured', color: '#10B981' },
  { icon: 'earth', label: 'Global', sub: 'Worldwide ship', color: '#8B5CF6' },
];

export default function QuickInfo() {
  return (
    <View style={styles.card}>
      <View style={styles.grid}>
        {ITEMS.map((item, i) => (
          <View key={i} style={styles.infoItem}>
            <View style={[styles.iconWrap, { backgroundColor: item.color + '15' }]}>
              <Icon name={item.icon} size={14} color={item.color} />
            </View>
            <View>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.sub}>{item.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    width: '50%',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  sub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
  },
});