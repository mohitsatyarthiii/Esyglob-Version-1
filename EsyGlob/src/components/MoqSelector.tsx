import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type MoqTier = {
  minQty: number;
  maxQty?: number | null;
  price: number;
  currency?: string;
  unit?: string;
  discount?: number;
  savings?: number;
  leadTime?: string;
  available?: boolean;
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
  if (!tiers || tiers.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>SELECT QUANTITY</Text>
      <View style={styles.grid}>
        {tiers.map((tier, i) => {
          const isActive = selectedQty === tier.minQty;
          const hasMax = tier.maxQty != null && tier.maxQty > 0;
          const label = hasMax
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
                  {currency}{tier.price.toLocaleString('en-IN')}
                  <Text style={styles.perUnit}> /unit</Text>
                </Text>
                {tier.discount ? <Text style={styles.savings}>{tier.discount.toFixed(0)}% off · Save {currency}{(tier.savings ?? 0).toLocaleString('en-IN')}/unit</Text> : null}
                <Text style={styles.meta}>{tier.available === false ? 'Unavailable' : 'Available'}{tier.leadTime ? ` · ${tier.leadTime}` : ''}</Text>
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
    marginHorizontal: 12,
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
    flexDirection: 'row',
    gap: 8,
  },
  tier: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tierQtyActive: {
    color: '#FF6A00',
    fontWeight: '700',
  },
  tierPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  tierPriceActive: {
    color: '#FF6A00',
  },
  perUnit: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94A3B8',
  },
  savings: { fontSize: 9, color: '#059669', fontWeight: '700', marginTop: 2 },
  meta: { fontSize: 9, color: '#64748B', marginTop: 2 },
});
