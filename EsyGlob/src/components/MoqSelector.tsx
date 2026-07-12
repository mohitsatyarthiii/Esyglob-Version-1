import React from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCurrency } from '../currency/CurrencyContext';

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
  const { formatPrice } = useCurrency();
  if (!tiers || tiers.length === 0) return null;

  // Find the selected tier based on the selected quantity
  const selectedTier = tiers.find(t => t.minQty === selectedQty) || tiers[0];
  const selectedPrice = selectedTier?.price || 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>SELECT QUANTITY</Text>
        <Text style={styles.priceSummary}>
          {formatPrice(selectedPrice, currency === '₹' ? 'INR' : currency)} / unit
        </Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tiers.map((tier, i) => {
          const isActive = selectedQty === tier.minQty;
          const hasMax = tier.maxQty != null && tier.maxQty > 0;
          const label = hasMax
            ? `${tier.minQty}-${tier.maxQty}`
            : `${tier.minQty}+`;
          const unitLabel = tier.unit || 'pcs';

          return (
            <Pressable
              key={i}
              onPress={() => onSelect(tier.minQty)}
              style={[styles.tier, isActive && styles.tierActive]}
            >
              <View style={styles.tierContent}>
                <Text style={[styles.tierQty, isActive && styles.tierQtyActive]}>
                  {label}
                </Text>
                <Text style={[styles.tierUnit, isActive && styles.tierUnitActive]}>
                  {unitLabel}
                </Text>
                <Text style={[styles.tierPrice, isActive && styles.tierPriceActive]}>
                  {formatPrice(tier.price, tier.currency ?? (currency === '₹' ? 'INR' : currency))}
                </Text>
                {tier.discount ? (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>
                      {tier.discount.toFixed(0)}% OFF
                    </Text>
                  </View>
                ) : null}
                {isActive && (
                  <View style={styles.activeIndicator}>
                    <Icon name="check-circle" size={16} color="#FF6A00" />
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedTier?.savings ? (
        <Text style={styles.savingsText}>
          Save {formatPrice(selectedTier.savings, selectedTier.currency ?? (currency === '₹' ? 'INR' : currency))}/unit with this tier
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Minimum order: {tiers[0].minQty} {tiers[0].unit || 'pcs'}
        </Text>
        {selectedTier?.leadTime ? (
          <Text style={styles.footerText}>Lead time: {selectedTier.leadTime}</Text>
        ) : null}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  priceSummary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6A00',
  },
  scrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  tier: {
    minWidth: 100,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  tierActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FF6A00',
    borderWidth: 2,
  },
  tierContent: {
    alignItems: 'center',
    gap: 2,
  },
  tierQty: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  tierQtyActive: {
    color: '#FF6A00',
  },
  tierUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'lowercase',
  },
  tierUnitActive: {
    color: '#FF6A00',
  },
  tierPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 4,
  },
  tierPriceActive: {
    color: '#FF6A00',
  },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  discountText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#059669',
  },
  activeIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  savingsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 10,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
