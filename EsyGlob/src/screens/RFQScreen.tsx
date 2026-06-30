import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchRFQs } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';
import AuthScreen from './AuthScreen';

function RFQScreen() {
  const navigation = useNavigation<any>();
  const { status } = useAuth();
  const rfqs = useQuery({
    queryKey: ['rfqs'],
    queryFn: fetchRFQs,
    enabled: status === 'authenticated',
  });

  if (status !== 'authenticated') {
    return <AuthScreen onClose={() => navigation.navigate('Home')} />;
  }

  if (rfqs.isLoading) {
    return <LoadingState label="Loading RFQs" />;
  }

  if (rfqs.isError) {
    return <ErrorState message={(rfqs.error as Error).message} onRetry={() => rfqs.refetch()} />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={rfqs.data ?? []}
      keyExtractor={item => getId(item)}
      ListEmptyComponent={<EmptyState title="No RFQs yet" detail="RFQs will appear here from /api/rfqs for the signed-in buyer or seller." />}
      ListHeaderComponent={<Text style={styles.screenTitle}>RFQs & Quotations</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('RFQDetails', { rfqId: getId(item) })} style={styles.card}>
          <View style={styles.topRow}>
            <Text numberOfLines={2} style={styles.title}>{item.title ?? item.productName ?? 'RFQ'}</Text>
            {item.status ? <Text style={styles.status}>{item.status}</Text> : null}
          </View>
          {item.description ? <Text numberOfLines={2} style={styles.description}>{item.description}</Text> : null}
          <Text style={styles.meta}>
            Quantity {item.quantity ?? '-'} {item.unit ?? ''}
          </Text>
          {item.destinationCountry ? <Text style={styles.meta}>Destination {item.destinationCountry}</Text> : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 116,
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  status: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  description: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: spacing.sm,
  },
});

export default RFQScreen;
