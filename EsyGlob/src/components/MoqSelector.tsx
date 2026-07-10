import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type MoqTier = {
  minQty: number;
  maxQty?: number | null;
  price: number;
  currency?: string;
  unit?: string;
};

type Props = {
  tiers: MoqTier[];
  selectedQty: number;
  onSelect: (qty: number) => void;
  currency?: string;
};

export default function MoqSelector({
  tiers,
  selectedQty,
  onSelect,
  currency = '₹',
}: Props) {
  if (!tiers.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>SELECT QUANTITY</Text>
      <View style={styles.grid}>
        {tiers.map((tier, i) => {
          const isActive = selectedQty === tier.minQty;
          const label = tier.maxQty
            ? `${tier.minQty}-${tier.maxQty} ${tier.unit || 'pcs'}`
            : `${tier.minQty}+ ${tier.unit || 'pcs'}`;

          return (
            <Pressable
              key={i}
              onPress={() => onSelect(tier.minQty)}
              style={[styles.tier, isActive && styles.tierActive]}>
              <View style={styles.tierLeft}>
                <Text style={[styles.tierQty, isActive && styles.tierQtyActive]}>
                  {label}
                </Text>
                <Text style={[styles.tierPrice, isActive && styles.tierPriceActive]}>
                  {currency}
                  {tier.price.toLocaleString('en-IN')}
                  <Text style={styles.perUnit}> /unit</Text>
                </Text>
              </View>
              {isActive && (
                <Icon name="check-circle" size={20} color="#FF6A00" />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: {
    gap: 8,
  },
  tier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tierActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FF6A00',
  },
  tierLeft: {
    gap: 2,
  },
  tierQty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tierQtyActive: {
    color: '#FF6A00',
    fontWeight: '700',
  },
  tierPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  tierPriceActive: {
    color: '#FF6A00',
  },
  perUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
  },
});