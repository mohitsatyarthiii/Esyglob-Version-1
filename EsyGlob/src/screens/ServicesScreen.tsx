import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchAggregatedServiceActivity } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { SERVICE_HUBS } from '../services/serviceHubs';

export default function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { activeRole, user } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';

  const activity = useQuery({
    queryKey: ['service-activity', role],
    queryFn: () => fetchAggregatedServiceActivity(role),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const totals = useMemo(
    () => ({
      active: (activity.data ?? []).filter(
        x =>
          !['completed', 'cancelled', 'rejected'].includes(
            String(x.status ?? '').toLowerCase()
          )
      ).length,
      pending: (activity.data ?? []).filter(
        x =>
          String(x.status ?? '').toLowerCase().includes('pending') ||
          String(x.status ?? '') === 'submitted'
      ).length,
      completed: (activity.data ?? []).filter(
        x => String(x.status ?? '').toLowerCase() === 'completed'
      ).length,
    }),
    [activity.data]
  );

  const getHubActivity = (hubKey: string) => {
    const hub = SERVICE_HUBS.find(h => h.key === hubKey);
    if (!hub) return { active: 0, pending: 0 };
    const matching = (activity.data ?? []).filter(a =>
      hub.items.some(
        i =>
          i.serviceKey &&
          [a.serviceKey, a.originalServiceKey].includes(i.serviceKey)
      )
    );
    return {
      active: matching.filter(
        x =>
          !['completed', 'cancelled'].includes(
            String(x.status ?? '').toLowerCase()
          )
      ).length,
      pending: matching.filter(x =>
        String(x.status ?? '').toLowerCase().includes('pending')
      ).length,
    };
  };

  const ListHeader = () => (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <Text style={styles.greeting}>
          {user?.name ? `Hello, ${user.name.split(' ')[0]} 👋` : 'Welcome'}
        </Text>
        <Text style={styles.heroTitle}>Global Trade{'\n'}Services</Text>
        <Text style={styles.heroSubtitle}>
          Everything you need for international B2B trade
        </Text>
      </View>

      <View style={styles.quickStats}>
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Icon name="briefcase-outline" size={18} color="#1a1a1a" />
          </View>
          <View>
            <Text style={styles.quickStatValue}>{totals.active}</Text>
            <Text style={styles.quickStatLabel}>Active</Text>
          </View>
        </View>
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Icon name="clock-outline" size={18} color="#1a1a1a" />
          </View>
          <View>
            <Text style={styles.quickStatValue}>{totals.pending}</Text>
            <Text style={styles.quickStatLabel}>Pending</Text>
          </View>
        </View>
        <View style={styles.quickStat}>
          <View style={styles.quickStatIcon}>
            <Icon name="check-circle-outline" size={18} color="#1a1a1a" />
          </View>
          <View>
            <Text style={styles.quickStatValue}>{totals.completed}</Text>
            <Text style={styles.quickStatLabel}>Done</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderItem = ({
    item: hub,
    index,
  }: {
    item: (typeof SERVICE_HUBS)[0];
    index: number;
  }) => {
    const counts = getHubActivity(hub.key);
    const isLast = index === SERVICE_HUBS.length - 1;

    return (
      <Pressable
        onPress={() => navigation.navigate('ServiceHub', { hubKey: hub.key })}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
          isLast && styles.cardLast,
        ]}
      >
        {/* Top accent line */}
        <View style={[styles.cardAccent, { backgroundColor: hub.color }]} />

        <View style={styles.cardBody}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconBox, { backgroundColor: hub.tint }]}>
              <Icon name={hub.icon} size={24} color={hub.color} />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {hub.title}
              </Text>
              <Text style={styles.cardServices}>
                {hub.items.length} service{hub.items.length > 1 ? 's' : ''}
              </Text>
            </View>
            {counts.active > 0 && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{counts.active}</Text>
              </View>
            )}
            <Icon name="chevron-right" size={20} color="#d4d4d4" />
          </View>

          {/* Description */}
          <Text style={styles.cardDesc} numberOfLines={2}>
            {hub.description}
          </Text>

          {/* Stats Row */}
          {hub.stats && hub.stats.length > 0 && (
            <View style={styles.cardStats}>
              {hub.stats.slice(0, 3).map((stat, i) => (
                <View key={i} style={styles.cardStat}>
                  <Icon name={stat.icon} size={12} color="#888" />
                  <Text style={styles.cardStatValue}>{stat.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Bottom */}
          <View style={styles.cardFooter}>
            {counts.pending > 0 ? (
              <View style={[styles.pendingBadge, { backgroundColor: hub.tint }]}>
                <Icon name="clock-outline" size={11} color={hub.color} />
                <Text style={[styles.pendingText, { color: hub.color }]}>
                  {counts.pending} pending
                </Text>
              </View>
            ) : (
              <View style={styles.emptyBadge}>
                <Icon name="check-outline" size={11} color="#aaa" />
                <Text style={styles.emptyText}>All clear</Text>
              </View>
            )}
            <Text style={styles.exploreText}>
              Explore {hub.items.length} services
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const ListFooter = () => <View style={styles.footerSpace} />;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <FlatList
        data={SERVICE_HUBS}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={activity.isRefetching}
            onRefresh={() => activity.refetch()}
            tintColor="#1a1a1a"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  list: {
    paddingBottom: 20,
  },

  // HERO
  hero: {
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
    marginBottom: 8,
  },
  heroTop: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
    letterSpacing: -0.5,
    lineHeight: 40,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
    lineHeight: 20,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 10,
  },
  quickStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  quickStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  quickStatValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginTop: 1,
  },

  // CARDS
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardLast: {
    marginBottom: 100, // Extra space for bottom nav
  },
  cardPressed: {
    backgroundColor: '#fcfcfc',
    borderColor: '#e0e0e0',
  },
  cardAccent: {
    height: 3,
  },
  cardBody: {
    padding: 16,
  },

  // Card Header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  cardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  cardServices: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: '500',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
    borderWidth: 1,
    borderColor: '#dcfce7',
    marginRight: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },

  // Description
  cardDesc: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
    marginBottom: 12,
  },

  // Stats
  cardStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  cardStatValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  pendingText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyText: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: '500',
  },
  exploreText: {
    fontSize: 11,
    color: '#bbb',
    fontWeight: '500',
  },

  // Footer space
  footerSpace: {
    height: 20,
  },
});