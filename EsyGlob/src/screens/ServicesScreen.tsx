import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchAggregatedServiceActivity } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { SERVICE_HUBS } from '../services/serviceHubs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Premium Design System ─────────────────────────────────────────────────

const D = {
  // Colors
  primary: '#0F172A',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  
  // Semantic
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  info: '#2563EB',
  infoLight: '#EFF6FF',
  
  // Shadows
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  shadowMd: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowLg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
};

// ─── Quick Actions Component ────────────────────────────────────────────────

function QuickActions({ totals, role }: { totals: any; role: string }) {
  const navigation = useNavigation<any>();
  
  const actions = [
    {
      icon: 'flash',
      label: 'Active',
      count: totals.active,
      color: '#2563EB',
      bg: '#EFF6FF',
      borderColor: '#BFDBFE',
    },
    {
      icon: 'clock-outline',
      label: 'Pending',
      count: totals.pending,
      color: '#D97706',
      bg: '#FFFBEB',
      borderColor: '#FDE68A',
    },
    {
      icon: 'check-circle-outline',
      label: 'Completed',
      count: totals.completed,
      color: '#059669',
      bg: '#ECFDF5',
      borderColor: '#A7F3D0',
    },
    {
      icon: 'trophy-outline',
      label: role === 'seller' ? 'Orders' : 'Requests',
      count: totals.active + totals.pending + totals.completed,
      color: '#7C3AED',
      bg: '#F5F3FF',
      borderColor: '#DDD6FE',
    },
  ];

  return (
    <View style={quickStyles.container}>
      <Text style={quickStyles.sectionTitle}>Overview</Text>
      <View style={quickStyles.grid}>
        {actions.map((action, index) => (
          <Pressable
            key={index}
            style={({ pressed }) => [
              quickStyles.card,
              { backgroundColor: action.bg, borderColor: action.borderColor },
              pressed && quickStyles.cardPressed,
            ]}
          >
            <View style={[quickStyles.iconCircle, { backgroundColor: action.color + '15' }]}>
              <Icon name={action.icon} size={18} color={action.color} />
            </View>
            <Text style={[quickStyles.count, { color: action.color }]}>
              {action.count}
            </Text>
            <Text style={quickStyles.label}>{action.label}</Text>
            
            {/* Mini progress bar */}
            {action.label === 'Active' && totals.active > 0 && (
              <View style={quickStyles.progressBar}>
                <View style={[quickStyles.progressFill, { 
                  width: `${Math.min(100, (totals.active / (totals.active + totals.completed || 1)) * 100)}%`,
                  backgroundColor: action.color 
                }]} />
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const quickStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: D.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: (SCREEN_WIDTH - 50) / 2,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  count: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: D.textSecondary,
    marginBottom: 6,
  },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});

// ─── Stats Bar Component ────────────────────────────────────────────────────

function StatsBar({ activity }: { activity: any[] }) {
  const stats = useMemo(() => {
    const total = activity.length;
    const withQuotes = activity.filter(a => a.hasQuotes).length;
    const urgentCount = activity.filter(a => 
      a.priority === 'urgent' || a.urgency === 'high'
    ).length;
    const avgResponse = total > 0 
      ? Math.round(activity.reduce((sum, a) => sum + (a.responseTime || 0), 0) / total)
      : 0;
    
    return [
      { icon: 'file-document-outline', value: total, label: 'Total Services', color: '#2563EB' },
      { icon: 'cash-multiple', value: withQuotes, label: 'With Quotes', color: '#7C3AED' },
      { icon: 'alert-circle-outline', value: urgentCount, label: 'Urgent', color: '#DC2626' },
      { icon: 'timer-outline', value: `${avgResponse}h`, label: 'Avg Response', color: '#059669' },
    ];
  }, [activity]);

  if (activity.length === 0) return null;

  return (
    <View style={statsBarStyles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={statsBarStyles.scroll}
      >
        {stats.map((stat, index) => (
          <View key={index} style={statsBarStyles.item}>
            <View style={[statsBarStyles.iconBox, { backgroundColor: stat.color + '12' }]}>
              <Icon name={stat.icon} size={16} color={stat.color} />
            </View>
            <View>
              <Text style={statsBarStyles.value}>{stat.value}</Text>
              <Text style={statsBarStyles.label}>{stat.label}</Text>
            </View>
            {index < stats.length - 1 && <View style={statsBarStyles.divider} />}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const statsBarStyles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: D.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: D.border,
    paddingVertical: 14,
    ...D.shadowSm,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: D.textPrimary,
  },
  label: {
    fontSize: 10,
    color: D.textTertiary,
    fontWeight: '600',
    marginTop: 1,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: D.borderLight,
  },
});

// ─── Featured Hub Banner Component ──────────────────────────────────────────

function FeaturedHubBanner({ 
  hubs, 
  getHubActivity 
}: { 
  hubs: typeof SERVICE_HUBS; 
  getHubActivity: (key: string) => { active: number; pending: number };
}) {
  const navigation = useNavigation<any>();
  
  // Pick hub with most activity or first one
  const featured = useMemo(() => {
    if (hubs.length === 0) return null;
    return hubs.reduce((prev, curr) => {
      const prevCount = getHubActivity(prev.key);
      const currCount = getHubActivity(curr.key);
      return (currCount.active + currCount.pending) > (prevCount.active + prevCount.pending) ? curr : prev;
    }, hubs[0]);
  }, [hubs]);

  if (!featured) return null;

  const counts = getHubActivity(featured.key);
  const totalActive = counts.active + counts.pending;

  return (
    <Pressable
      onPress={() => navigation.navigate('ServiceHub', { hubKey: featured.key })}
      style={({ pressed }) => [
        featuredStyles.container,
        pressed && featuredStyles.pressed,
      ]}
    >
      <View style={[featuredStyles.gradient, { backgroundColor: featured.tint }]}>
        <View style={featuredStyles.content}>
          <View style={featuredStyles.leftSection}>
            <View style={[featuredStyles.iconCircle, { backgroundColor: featured.color + '20' }]}>
              <Icon name={featured.icon} size={28} color={featured.color} />
            </View>
            <View style={featuredStyles.textSection}>
              <View style={featuredStyles.badgeRow}>
                <View style={[featuredStyles.badge, { backgroundColor: featured.color + '15' }]}>
                  <Icon name="star" size={10} color={featured.color} />
                  <Text style={[featuredStyles.badgeText, { color: featured.color }]}>
                    Most Active
                  </Text>
                </View>
              </View>
              <Text style={featuredStyles.title}>{featured.title}</Text>
              <Text style={featuredStyles.subtitle} numberOfLines={2}>
                {featured.description}
              </Text>
            </View>
          </View>
          
          <View style={featuredStyles.rightSection}>
            {totalActive > 0 && (
              <View style={featuredStyles.countBadge}>
                <Text style={featuredStyles.countValue}>{totalActive}</Text>
                <Text style={featuredStyles.countLabel}>active</Text>
              </View>
            )}
            <View style={[featuredStyles.arrowCircle, { backgroundColor: featured.color }]}>
              <Icon name="arrow-right" size={16} color="#FFF" />
            </View>
          </View>
        </View>
        
        {/* Bottom mini stats */}
        <View style={featuredStyles.miniStats}>
          <View style={featuredStyles.miniStat}>
            <Icon name="briefcase-outline" size={12} color={featured.color} />
            <Text style={[featuredStyles.miniStatText, { color: featured.color }]}>
              {featured.items.length} services
            </Text>
          </View>
          {counts.pending > 0 && (
            <View style={featuredStyles.miniStat}>
              <Icon name="clock-outline" size={12} color="#D97706" />
              <Text style={[featuredStyles.miniStatText, { color: '#D97706' }]}>
                {counts.pending} pending
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const featuredStyles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    ...D.shadowLg,
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  gradient: {
    padding: 18,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    marginRight: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSection: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: D.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: D.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  countBadge: {
    backgroundColor: D.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    ...D.shadowSm,
  },
  countValue: {
    fontSize: 20,
    fontWeight: '800',
    color: D.textPrimary,
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 9,
    color: D.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

// ─── Service Hub Card Component ─────────────────────────────────────────────

function ServiceHubCard({ 
  hub, 
  index, 
  totalHubs, 
  getHubActivity 
}: { 
  hub: (typeof SERVICE_HUBS)[0]; 
  index: number;
  totalHubs: number;
  getHubActivity: (key: string) => { active: number; pending: number };
}) {
  const navigation = useNavigation<any>();
  const counts = getHubActivity(hub.key);
  const totalActive = counts.active + counts.pending;
  const isLast = index === totalHubs - 1;
  const isEven = index % 2 === 0;

  return (
    <Pressable
      onPress={() => navigation.navigate('ServiceHub', { hubKey: hub.key })}
      style={({ pressed }) => [
        hubCardStyles.card,
        isLast && hubCardStyles.cardLast,
        pressed && hubCardStyles.cardPressed,
      ]}
    >
      {/* Color accent bar */}
      <View style={[hubCardStyles.accentBar, { backgroundColor: hub.color }]} />
      
      <View style={hubCardStyles.cardContent}>
        {/* Top Row: Icon + Title + Badge */}
        <View style={hubCardStyles.topRow}>
          <View style={[hubCardStyles.iconContainer, { backgroundColor: hub.tint }]}>
            <Icon name={hub.icon} size={22} color={hub.color} />
          </View>
          
          <View style={hubCardStyles.titleSection}>
            <Text style={hubCardStyles.title} numberOfLines={1}>
              {hub.title}
            </Text>
            <Text style={hubCardStyles.serviceCount}>
              {hub.items.length} service{hub.items.length > 1 ? 's' : ''} available
            </Text>
          </View>
          
          {totalActive > 0 && (
            <View style={[hubCardStyles.activeBadge, { 
              backgroundColor: counts.pending > 0 ? D.warningLight : D.successLight,
              borderColor: counts.pending > 0 ? '#FDE68A' : '#A7F3D0',
            }]}>
              <View style={[hubCardStyles.activeDot, { 
                backgroundColor: counts.pending > 0 ? D.warning : D.success 
              }]} />
              <Text style={[hubCardStyles.activeText, { 
                color: counts.pending > 0 ? D.warning : D.success 
              }]}>
                {totalActive}
              </Text>
            </View>
          )}
        </View>
        
        {/* Description */}
        <Text style={hubCardStyles.description} numberOfLines={2}>
          {hub.description}
        </Text>
        
        {/* Tags / Key services preview */}
        <View style={hubCardStyles.tagsContainer}>
          {hub.items.slice(0, 3).map((item, i) => (
            <View key={i} style={hubCardStyles.tag}>
              <Icon name="circle-small" size={8} color={hub.color} />
              <Text style={hubCardStyles.tagText} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ))}
          {hub.items.length > 3 && (
            <View style={[hubCardStyles.tag, hubCardStyles.tagMore]}>
              <Text style={hubCardStyles.tagMoreText}>
                +{hub.items.length - 3} more
              </Text>
            </View>
          )}
        </View>
        
        {/* Footer */}
        <View style={hubCardStyles.footer}>
          {counts.pending > 0 ? (
            <View style={[hubCardStyles.footerBadge, { backgroundColor: D.warningLight }]}>
              <Icon name="clock-outline" size={12} color={D.warning} />
              <Text style={[hubCardStyles.footerBadgeText, { color: D.warning }]}>
                {counts.pending} pending action{counts.pending > 1 ? 's' : ''}
              </Text>
            </View>
          ) : (
            <View style={[hubCardStyles.footerBadge, { backgroundColor: D.successLight }]}>
              <Icon name="check-circle-outline" size={12} color={D.success} />
              <Text style={[hubCardStyles.footerBadgeText, { color: D.success }]}>
                Up to date
              </Text>
            </View>
          )}
          
          <View style={hubCardStyles.exploreBtn}>
            <Text style={[hubCardStyles.exploreText, { color: hub.color }]}>
              Explore
            </Text>
            <Icon name="chevron-right" size={14} color={hub.color} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const hubCardStyles = StyleSheet.create({
  card: {
    backgroundColor: D.surface,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: D.border,
    ...D.shadowMd,
  },
  cardLast: {
    marginBottom: 120,
  },
  cardPressed: {
    backgroundColor: '#FAFBFC',
    borderColor: '#CBD5E1',
    transform: [{ scale: 0.99 }],
  },
  accentBar: {
    height: 3,
  },
  cardContent: {
    padding: 16,
  },
  
  // Top Row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: D.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  serviceCount: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '500',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  
  // Description
  description: {
    fontSize: 13,
    color: D.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  
  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 2,
    maxWidth: '48%',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: D.textSecondary,
    flexShrink: 1,
  },
  tagMore: {
    backgroundColor: '#F1F5F9',
  },
  tagMoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: D.textTertiary,
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: D.borderLight,
  },
  footerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  footerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  exploreText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

// ─── Main ServicesScreen Component ──────────────────────────────────────────

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

  // ── Header Component ────────────────────────────────────────────────────
  
  const ListHeader = () => (
    <View>
      {/* Premium Hero Section */}
      <View style={styles.hero}>
        {/* Subtle background pattern */}
        <View style={styles.heroBgPattern}>
          <View style={[styles.heroBgCircle, { top: -20, right: -20, width: 120, height: 120 }]} />
          <View style={[styles.heroBgCircle, { bottom: -40, left: -30, width: 80, height: 80 }]} />
        </View>
        
        <View style={styles.heroContent}>
          {/* Top greeting with role badge */}
          <View style={styles.greetingRow}>
            <View>
              <Text style={styles.greeting}>
                {user?.name ? `Welcome back, ${user.name.split(' ')[0]} 👋` : 'Welcome'}
              </Text>
            </View>
            <View style={styles.roleBadge}>
              <Icon 
                name={role === 'seller' ? 'store' : 'account'} 
                size={12} 
                color={D.info} 
              />
              <Text style={styles.roleBadgeText}>
                {role === 'seller' ? 'Supplier' : 'Buyer'}
              </Text>
            </View>
          </View>
          
          {/* Main heading */}
          <Text style={styles.heroTitle}>
            Global Trade & Services Hub
          </Text>
          <Text style={styles.heroSubtitle}>
            End-to-end B2B trade solutions for international commerce
          </Text>
          
          {/* Mini insight */}
          {totals.active > 0 && (
            <View style={styles.insightBanner}>
              <View style={styles.insightDot} />
              <Text style={styles.insightText}>
                {totals.pending > 0 
                  ? `${totals.pending} service${totals.pending > 1 ? 's' : ''} need${totals.pending === 1 ? 's' : ''} your attention`
                  : `All ${totals.active} active services running smoothly`
                }
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Quick Actions Grid */}
      <QuickActions totals={totals} role={role} />

      {/* Activity Stats Bar */}
      <StatsBar activity={activity.data ?? []} />

      {/* Featured Hub Banner */}
      <FeaturedHubBanner hubs={SERVICE_HUBS} getHubActivity={getHubActivity} />

      {/* Section Divider for Service Hubs */}
      <View style={styles.sectionDivider}>
        <View style={styles.sectionDividerLine} />
        <Text style={styles.sectionDividerText}>All Service Categories</Text>
        <View style={styles.sectionDividerLine} />
      </View>
    </View>
  );

  // ── Render Item ──────────────────────────────────────────────────────────

  const renderItem = ({
    item: hub,
    index,
  }: {
    item: (typeof SERVICE_HUBS)[0];
    index: number;
  }) => (
    <ServiceHubCard 
      hub={hub}
      index={index}
      totalHubs={SERVICE_HUBS.length}
      getHubActivity={getHubActivity}
    />
  );

  const ListFooter = () => (
    <View style={styles.footerSpace}>
      <Text style={styles.footerText}>
        {SERVICE_HUBS.length} service categories available
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={D.surface} />
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
            tintColor={D.textPrimary}
            colors={[D.info]}
            progressBackgroundColor={D.surface}
          />
        }
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: D.background,
  },
  list: {
    paddingBottom: 20,
  },

  // ─── HERO SECTION ───────────────────────────────────────────────────────
  hero: {
    backgroundColor: D.surface,
    paddingTop: 60,
    paddingBottom: 6,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...D.shadowMd,
  },
  heroBgPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBgCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    opacity: 0.5,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    color: D.textSecondary,
    fontWeight: '500',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: D.info,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: D.textPrimary,
    letterSpacing: -1,
    lineHeight: 22,
    marginBottom: 5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: D.textTertiary,
    fontWeight: '400',
    lineHeight: 22,
    marginBottom: 16,
  },
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.background,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: D.info,
  },
  insightText: {
    fontSize: 13,
    fontWeight: '600',
    color: D.textSecondary,
    flex: 1,
  },

  // ─── SECTION DIVIDER ────────────────────────────────────────────────────
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 16,
    gap: 12,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: D.border,
  },
  sectionDividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: D.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ─── FOOTER ─────────────────────────────────────────────────────────────
  footerSpace: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '500',
  },
});