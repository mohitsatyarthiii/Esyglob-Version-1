import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const FEATURES = [
  { icon: 'shield-check', text: 'Quality\nAssurance', color: '#059669' },
  { icon: 'credit-card-refund', text: 'Secure\nPayments', color: '#2563EB' },
  { icon: 'truck-delivery', text: 'On-Time\nDelivery', color: '#7C3AED' },
  { icon: 'headset', text: '24/7\nSupport', color: '#D97706' },
];

export default function TradeAssurance() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="shield-check" size={18} color="#059669" />
        <Text style={styles.title}>Trade Assurance</Text>
      </View>
      <Text style={styles.subtitle}>Protected from payment to delivery</Text>
      <View style={styles.grid}>
        {FEATURES.map((item, i) => (
          <View key={i} style={styles.item}>
            <View style={[styles.iconWrap, { backgroundColor: item.color + '15' }]}>
              <Icon name={item.icon} size={16} color={item.color} />
            </View>
            <Text style={styles.itemText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  subtitle: {
    fontSize: 10,
    color: '#047857',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  item: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#065F46',
    textAlign: 'center',
    lineHeight: 11,
  },
});