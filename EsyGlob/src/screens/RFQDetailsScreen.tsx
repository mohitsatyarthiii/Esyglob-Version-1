import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchRFQDetails } from '../api/marketplace';
import { Quotation } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';
import { getId } from '../utils/format';

function RFQDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { activeRole } = useAuth();
  const { rfqId } = route.params as { rfqId: string };
  const rfq = useQuery({
    queryKey: ['rfq-details', rfqId],
    queryFn: () => fetchRFQDetails(rfqId),
    enabled: Boolean(rfqId),
  });

  if (rfq.isLoading) {
    return <LoadingState label="Loading RFQ" />;
  }

  if (rfq.isError || !rfq.data?.rfq) {
    return <ErrorState message={(rfq.error as Error)?.message ?? 'RFQ was not returned.'} onRetry={() => rfq.refetch()} />;
  }

  const item = rfq.data.rfq;
  const sellerView = activeRole === 'seller';
  const title = item.title ?? item.productName ?? 'RFQ';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{sellerView ? 'Seller RFQ' : 'Buyer RFQ'}</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.status}>{item.status ?? 'open'}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <View style={styles.factGrid}>
            <Fact label="Quantity" value={`${item.quantity ?? '-'} ${item.unit ?? ''}`} />
            <Fact label="Category" value={item.category} />
            <Fact label="Target price" value={item.targetPrice ? `${item.currency ?? ''} ${item.targetPrice}` : undefined} />
            <Fact label="Delivery" value={item.deliveryTimeline ?? item.deadline} />
            <Fact label="Destination" value={item.destinationCountry ?? item.deliveryCountry} />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate('Messages')} style={styles.primaryAction}>
            <Icon name="message-text-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionText}>Messages</Text>
          </Pressable>
        </View>

        <Section title={sellerView ? 'Buyer requirement' : 'RFQ information'} value={item} />

        {item.attachments?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            {item.attachments.map(uri => <Text key={uri} style={styles.linkText}>{uri}</Text>)}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{sellerView ? 'Related quotations' : 'Seller responses'}</Text>
          {rfq.data.quotations?.length ? (
            rfq.data.quotations.map(quotation => <QuotationRow key={getId(quotation)} quotation={quotation} />)
          ) : (
            <EmptyState title="No quotations yet" detail="Responses from suppliers will appear here when the backend returns them." />
          )}
        </View>

        {rfq.data.chats?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Messages</Text>
            {rfq.data.chats.map(chat => (
              <Pressable key={getId(chat)} onPress={() => navigation.navigate('ChatDetails', { chatId: getId(chat), title })} style={styles.chatRow}>
                <Text style={styles.description}>{chat.lastMessage ?? chat.chatType ?? 'Conversation'}</Text>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function QuotationRow({ quotation }: { quotation: Quotation }) {
  const navigation = useNavigation<any>();
  const seller = typeof quotation.sellerId === 'object' ? quotation.sellerId : undefined;
  const title = quotation.title ?? seller?.companyName ?? seller?.businessName ?? 'Quotation';

  return (
    <Pressable onPress={() => navigation.navigate('QuotationDetails', { quotationId: getId(quotation) })} style={styles.quotationRow}>
      <View style={styles.quotationBody}>
        <Text style={styles.quotationTitle}>{title}</Text>
        <Text style={styles.quotationMeta}>
          {[quotation.status, quotation.totalPrice ? `${quotation.currency ?? ''} ${quotation.totalPrice}` : undefined].filter(Boolean).join(' • ')}
        </Text>
      </View>
      <Icon name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

function Section({ title, value }: { title: string; value: unknown }) {
  const text = formatValue(value);

  if (!text) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.description}>{text}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value?: unknown }) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.factValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  status: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
  },
  description: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  fact: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    padding: spacing.md,
    width: '48%',
  },
  factLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  factValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '900',
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  linkText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  quotationRow: {
    alignItems: 'center',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  quotationBody: {
    flex: 1,
  },
  chatRow: {
    alignItems: 'center',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  quotationTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  quotationMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
});

export default RFQDetailsScreen;
