import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchChats, fetchNotifications, fetchRFQs } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { LoadingState } from '../components/StateViews';
import { radii, shadow, spacing, type as typography } from '../theme';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────
type AuthMode = 'login' | 'signup';
type Role = 'buyer' | 'seller';

interface DashboardItem {
  icon: string;
  label: string;
  color: string;
  badge?: string | number;
}

interface DashboardSection {
  title: string;
  items: DashboardItem[];
}

// ──────────────────────────────────────
// Navigation map
// ──────────────────────────────────────
const NAVIGATION_MAP: Record<string, string> = {
  'All Orders': 'Orders',
  Pending: 'Orders',
  Shipped: 'Orders',
  Completed: 'Orders',
  Messages: 'Messages',
  Profile: 'ProfileSettings',
  Settings: 'ProfileSettings',
  Security: 'Security',
  Wallet: 'Wallet',
  Addresses: 'Addresses',
  Orders: 'Orders',
  Services: 'Services',
  'Find Suppliers': 'Sellers',
  Suppliers: 'Sellers',
  'AI Assistant': 'AIChat',
  'AI Sourcing': 'AIChat',
  'Market Insights': 'MarketInsights',
  Analytics: 'MarketInsights',
  'Saved Items': 'SavedItems',
  'Shipping & Logistics': 'ShippingLogistics',
  'My Reviews': 'ReviewsDashboard',
  Reviews: 'ReviewsDashboard',
  'My RFQs': 'RFQ',
  RFQs: 'RFQ',
  Quotations: 'RFQ',
  Dashboard: 'SellerOnboarding',
  Verification: 'SellerOnboarding',
  'Factory Profile': 'SellerFactory',
  Factory: 'SellerFactory',
  Products: 'SellerProducts',
  Wishlist: 'ProductListing',
  'Recently Viewed': 'ProductListing',
  Notifications: 'Notifications',
  'Trade Assurance': 'Services',
  'Payment Methods': 'Wallet',
  'Add Card': 'Wallet',
};

// ──────────────────────────────────────
// Alibaba-inspired color palette
// ──────────────────────────────────────
const PALETTE = {
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  amber: '#FF9500',
  emerald: '#00B578',
  sky: '#3B9CFF',
  violet: '#7B61FF',
  rose: '#FF3B6E',
  teal: '#00A8A8',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  surface: '#FFFFFF',
  background: '#F5F5F5',
  successBg: '#E8F8EE',
  successBorder: '#B7EBCE',
  successText: '#006C3D',
  red: '#FF3B30',
  logoutBorder: '#FFCCCC',
} as const;

// ──────────────────────────────────────
// Section templates
// ──────────────────────────────────────
const BUYER_SECTIONS_TEMPLATE: {
  title: string;
  items: Omit<DashboardItem, 'badge'>[];
}[] = [
  {
    title: 'My Orders',
    items: [
      { icon: 'clipboard-list-outline', label: 'All Orders', color: PALETTE.violet },
      { icon: 'clock-outline', label: 'Pending', color: PALETTE.amber },
      { icon: 'truck-fast-outline', label: 'Shipped', color: PALETTE.sky },
      { icon: 'check-circle-outline', label: 'Completed', color: PALETTE.emerald },
    ],
  },
  {
    title: 'Buying Services',
    items: [
      { icon: 'bullseye-arrow', label: 'My RFQs', color: PALETTE.amber },
      { icon: 'robot-outline', label: 'AI Sourcing', color: PALETTE.violet },
      { icon: 'account-search-outline', label: 'Find Suppliers', color: PALETTE.emerald },
      { icon: 'shield-check-outline', label: 'Trade Assurance', color: PALETTE.sky },
    ],
  },
  {
    title: 'Tools & Insights',
    items: [
      { icon: 'chart-line', label: 'Market Insights', color: PALETTE.violet },
      { icon: 'heart-outline', label: 'Saved Items', color: PALETTE.rose },
      { icon: 'wallet-outline', label: 'Wallet', color: PALETTE.emerald },
      { icon: 'star-outline', label: 'My Reviews', color: PALETTE.amber },
    ],
  },
];

const SELLER_SECTIONS_TEMPLATE: {
  title: string;
  items: Omit<DashboardItem, 'badge'>[];
}[] = [
  {
    title: 'Store Management',
    items: [
      { icon: 'view-dashboard-outline', label: 'Dashboard', color: PALETTE.violet },
      { icon: 'package-variant-closed', label: 'Products', color: PALETTE.violet },
      { icon: 'clipboard-list-outline', label: 'Orders', color: PALETTE.emerald },
      { icon: 'factory', label: 'Factory Profile', color: PALETTE.red },
    ],
  },
  {
    title: 'Sales Services',
    items: [
      { icon: 'file-document-edit-outline', label: 'Quotations', color: PALETTE.emerald },
      { icon: 'bullseye-arrow', label: 'RFQs', color: PALETTE.amber },
      { icon: 'robot-outline', label: 'AI Assistant', color: PALETTE.violet },
      { icon: 'check-decagram-outline', label: 'Verification', color: PALETTE.sky },
    ],
  },
  {
    title: 'Analytics & Tools',
    items: [
      { icon: 'chart-line', label: 'Analytics', color: PALETTE.violet },
      { icon: 'heart-outline', label: 'Saved Items', color: PALETTE.rose },
      { icon: 'wallet-outline', label: 'Wallet', color: PALETTE.emerald },
      { icon: 'message-text-outline', label: 'Messages', color: PALETTE.violet },
      { icon: 'star-check-outline', label: 'Reviews', color: PALETTE.amber },
    ],
  },
];

// ──────────────────────────────────────
// Query configuration
// ──────────────────────────────────────
const DASHBOARD_QUERY_OPTIONS = {
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: 2,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
} as const;

// ──────────────────────────────────────
// Badge map builder
// ──────────────────────────────────────
interface BadgeMap {
  'All Orders': string;
  Pending: string;
  Shipped: string;
  Completed: string;
  'My RFQs': string;
  RFQs: string;
  Messages: string;
  Wallet: string;
  Products: string;
  Orders: string;
}

function buildBadgeMap(rfqCount: number, chatCount: number): Partial<BadgeMap> {
  const map: Partial<BadgeMap> = {};
  if (rfqCount > 0) {
    map['My RFQs'] = String(rfqCount);
    map.RFQs = String(rfqCount);
  }
  if (chatCount > 0) {
    map.Messages = String(chatCount);
  }
  return map;
}

function applyBadges(
  sections: typeof BUYER_SECTIONS_TEMPLATE,
  badgeMap: Partial<BadgeMap>,
): DashboardSection[] {
  return sections.map(section => ({
    ...section,
    items: section.items.map(item => ({
      ...item,
      badge: badgeMap[item.label as keyof BadgeMap],
    })),
  }));
}

// ──────────────────────────────────────
// Sub-components
// ──────────────────────────────────────

function Benefit({ icon, title, subtitle, color }: { icon: string; title: string; subtitle: string; color: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={[styles.benefitIcon, { backgroundColor: `${color}15` }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <View style={styles.benefitInfo}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function LockedRow({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.lockedRow}>
      <View style={styles.lockedIcon}>
        <Icon name={icon} size={20} color={PALETTE.muted} />
      </View>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Icon name="lock-outline" size={14} color={PALETTE.faint} />
    </View>
  );
}

function StatCard({ icon, iconBgColor, iconColor, value, label, isLoading }: {
  icon: string; iconBgColor: string; iconColor: string; value: string | number; label: string; isLoading: boolean;
}) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBgColor }]}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={PALETTE.muted} style={styles.statLoader} />
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────

function AccountScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, setActiveRole, signOut, status, user } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [previousAuthMode, setPreviousAuthMode] = useState<AuthMode | null>(null);

  const mobileRoles = useMemo(
    () => user?.roles?.filter(r => r === 'buyer' || r === 'seller') ?? [],
    [user?.roles],
  );

  const role: Role = activeRole === 'seller' ? 'seller' : 'buyer';

  // ── Queries ──
  const notificationsQuery = useQuery({
    queryKey: ['account-notifications', role],
    queryFn: fetchNotifications,
    enabled: status === 'authenticated',
    ...DASHBOARD_QUERY_OPTIONS,
    select: (data: any) => ({
      unreadCount: Array.isArray(data) ? data.filter((item: any) => !item.isRead).length : 0,
    }),
  });

  const rfqsQuery = useQuery({
    queryKey: ['account-rfqs', role],
    queryFn: () => fetchRFQs({ scope: role, limit: 1 }),
    enabled: status === 'authenticated',
    ...DASHBOARD_QUERY_OPTIONS,
    select: (data: any) => ({
      count: data?.pagination?.total ?? data?.rfqs?.length ?? 0,
    }),
  });

  const chatsQuery = useQuery({
    queryKey: ['account-chats', role],
    queryFn: () => fetchChats(role),
    enabled: status === 'authenticated',
    ...DASHBOARD_QUERY_OPTIONS,
    select: (data: any) => ({
      count: Array.isArray(data) ? data.length : 0,
    }),
  });

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const rfqCount = rfqsQuery.data?.count ?? 0;
  const chatCount = chatsQuery.data?.count ?? 0;

  const badgeMap = useMemo(() => buildBadgeMap(rfqCount, chatCount), [rfqCount, chatCount]);
  const buyerSections = useMemo(() => applyBadges(BUYER_SECTIONS_TEMPLATE, badgeMap), [badgeMap]);
  const sellerSections = useMemo(() => applyBadges(SELLER_SECTIONS_TEMPLATE, badgeMap), [badgeMap]);

  useEffect(() => {
    if (status === 'authenticated' && previousAuthMode) {
      setAuthMode(null);
      setWelcomeVisible(true);
      setPreviousAuthMode(null);
    }
  }, [status, previousAuthMode]);

  const handleSetAuthMode = useCallback((mode: AuthMode | null) => {
    if (mode) setPreviousAuthMode(mode);
    setAuthMode(mode);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['account-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['account-rfqs'] });
    queryClient.invalidateQueries({ queryKey: ['account-chats'] });
  }, [queryClient]);

  const isRefreshing = notificationsQuery.isFetching || rfqsQuery.isFetching || chatsQuery.isFetching;

  const openDashboardItem = useCallback((label: string) => {
    const route = NAVIGATION_MAP[label];
    if (route) {
      navigation.navigate(route);
    } else {
      navigation.navigate('Home');
    }
  }, [navigation]);

  const hasQueryError = notificationsQuery.isError || rfqsQuery.isError || chatsQuery.isError;

  // ══════════════════════════════════════
  // RENDER: Auth mode
  // ══════════════════════════════════════
  if (authMode) {
    return (
      <AuthScreen
        initialMode={authMode}
        onClose={() => handleSetAuthMode(null)}
        onSuccess={() => {
          setAuthMode(null);
          setWelcomeVisible(true);
        }}
      />
    );
  }

  // ══════════════════════════════════════
  // RENDER: Session checking
  // ══════════════════════════════════════
  if (status === 'checking') {
    return <LoadingState label="Restoring session" />;
  }

  // ══════════════════════════════════════
  // RENDER: Guest
  // ══════════════════════════════════════
  if (status !== 'authenticated') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.guestTop}>
          <Pressable onPress={() => navigation.navigate('Home')} hitSlop={10} style={styles.closeButton}>
            <Icon name="close" size={20} color={PALETTE.muted} />
          </Pressable>
        </View>

        <View style={styles.guestHeader}>
          <View style={styles.guestAvatar}>
            <Icon name="account-outline" size={32} color={PALETTE.muted} />
          </View>
          <View style={styles.guestTextWrap}>
            <Text style={styles.guestTitle}>Welcome to EsyGlob</Text>
            <Text style={styles.guestText}>Sign in to manage orders, RFQs, wishlist, and supplier messages.</Text>
          </View>
        </View>

        <View style={styles.authActions}>
          <Pressable onPress={() => handleSetAuthMode('login')} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Login</Text>
          </Pressable>
          <Pressable onPress={() => handleSetAuthMode('signup')} style={styles.signupButton}>
            <Text style={styles.signupButtonText}>Sign up</Text>
          </Pressable>
        </View>

        <View style={styles.benefitsCard}>
          <Text style={styles.sectionTitle}>Member Benefits</Text>
          <Benefit icon="shield-check-outline" title="Verified trade identity" subtitle="Build trust with partners" color={PALETTE.emerald} />
          <Benefit icon="message-text-outline" title="Buyer-seller messaging" subtitle="Real-time communication" color={PALETTE.violet} />
          <Benefit icon="heart-outline" title="Wishlist & history" subtitle="Save and track products" color={PALETTE.rose} />
        </View>

        <Text style={styles.sectionTitle}>Locked Features</Text>
        <LockedRow icon="eye-outline" title="Recently viewed" />
        <LockedRow icon="heart-outline" title="Wishlist" />
        <LockedRow icon="clipboard-list-outline" title="Orders" />
      </ScrollView>
    );
  }

  // ══════════════════════════════════════
  // RENDER: Authenticated
  // ══════════════════════════════════════
  const displayName = user?.name ?? user?.fullName ?? user?.email ?? 'EsyGlob account';
  const profileImage = firstImage(user?.profileImage, user?.avatarUrl);
  const sections = role === 'seller' ? sellerSections : buyerSections;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={PALETTE.primary} colors={[PALETTE.primary]} />}>

      {/* ── Profile Header Card ── */}
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <RemoteImage
            uri={profileImage}
            width={72}
            height={72}
            style={styles.avatar}
            fallback={
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
            }
          />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{user?.email}</Text>
            <View style={styles.profileBadge}>
              <Icon name="check-decagram" size={12} color={PALETTE.emerald} />
              <Text style={styles.profileBadgeText}>Verified Account</Text>
            </View>
          </View>
          <Pressable onPress={() => navigation.navigate('ProfileSettings')} style={styles.editButton} hitSlop={8}>
            <Icon name="chevron-right" size={20} color={PALETTE.muted} />
          </Pressable>
        </View>
      </View>

      {/* ── Welcome Banner ── */}
      {welcomeVisible ? (
        <View style={styles.welcomeBanner}>
          <Icon name="check-circle-outline" size={18} color={PALETTE.emerald} />
          <Text style={styles.welcomeText}>Welcome back! Your {role} dashboard is ready.</Text>
          <Pressable onPress={() => setWelcomeVisible(false)} hitSlop={10}>
            <Icon name="close" size={16} color={PALETTE.muted} />
          </Pressable>
        </View>
      ) : null}

      {/* ── Role Switcher ── */}
      {mobileRoles.length > 1 ? (
        <View style={styles.roleRow}>
          {mobileRoles.map(item => (
            <Pressable key={item} onPress={() => setActiveRole(item)} style={[styles.roleButton, role === item && styles.roleButtonActive]}>
              <Icon name={item === 'buyer' ? 'account-outline' : 'store-outline'} size={16} color={role === item ? PALETTE.primary : PALETTE.muted} />
              <Text style={[styles.roleText, role === item && styles.roleTextActive]}>{item === 'buyer' ? 'Buyer' : 'Seller'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Error Banner ── */}
      {hasQueryError && !isRefreshing ? (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle-outline" size={16} color={PALETTE.red} />
          <Text style={styles.errorBannerText}>Some data couldn't load. Pull to refresh.</Text>
        </View>
      ) : null}

      {/* ── Quick Actions Row ── */}
      <View style={styles.quickActionsRow}>
        <Pressable onPress={() => navigation.navigate('Wallet')} style={styles.quickActionCard}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E8' }]}>
            <Icon name="credit-card-plus-outline" size={22} color={PALETTE.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Add Payment{'\n'}Card</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Addresses')} style={styles.quickActionCard}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#E8F8EE' }]}>
            <Icon name="map-marker-plus-outline" size={22} color={PALETTE.emerald} />
          </View>
          <Text style={styles.quickActionLabel}>Manage{'\n'}Addresses</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Orders')} style={styles.quickActionCard}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
            <Icon name="truck-fast-outline" size={22} color={PALETTE.sky} />
          </View>
          <Text style={styles.quickActionLabel}>Track{'\n'}Orders</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Notifications')} style={styles.quickActionCard}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FFF0F0' }]}>
            <Icon name="bell-badge-outline" size={22} color={PALETTE.rose} />
          </View>
          <Text style={styles.quickActionLabel}>View{'\n'}Alerts</Text>
        </Pressable>
      </View>

      {/* ── Stats Overview ── */}
      <View style={styles.statsCard}>
        <StatCard icon="file-document-outline" iconBgColor="#FFF3E8" iconColor={PALETTE.primary} value={rfqCount} label="Active RFQs" isLoading={rfqsQuery.isLoading} />
        <View style={styles.statDivider} />
        <StatCard icon="message-text-outline" iconBgColor="#E8F8EE" iconColor={PALETTE.emerald} value={chatCount} label="Messages" isLoading={chatsQuery.isLoading} />
        <View style={styles.statDivider} />
        <StatCard icon="bell-outline" iconBgColor="#FFF0F0" iconColor={PALETTE.red} value={unreadCount} label="Alerts" isLoading={notificationsQuery.isLoading} />
      </View>

      <View style={styles.sectionCard}>
  <View style={styles.addressHeader}>
    <View style={styles.sectionTitleRow}>
      <Icon name="map-marker-outline" size={18} color={PALETTE.primary} />
      <Text style={styles.sectionTitle}>My Location</Text>
    </View>
    <Pressable onPress={() => navigation.navigate('Location')} style={styles.viewAllBtn}>
      <Text style={styles.viewAllText}>Manage</Text>
      <Icon name="chevron-right" size={16} color={PALETTE.primary} />
    </Pressable>
  </View>
  
  <Pressable onPress={() => navigation.navigate('Location')} style={styles.locationCard}>
    <View style={styles.locationMapPreview}>
      <Icon name="map" size={32} color={PALETTE.primary} />
    </View>
    <View style={styles.locationInfo}>
      <Text style={styles.locationTitle}>Location Tracking</Text>
      <Text style={styles.locationDesc}>
        Enable GPS for nearby suppliers, accurate shipping & better delivery estimates
      </Text>
      <View style={styles.locationStatus}>
        <View style={[styles.locationDot, { backgroundColor: PALETTE.emerald }]} />
        <Text style={styles.locationStatusText}>Tap to manage</Text>
      </View>
    </View>
  </Pressable>
</View>

      {/* ── Dashboard Sections ── */}
      {sections.map(section => (
        <View key={section.title} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionGrid}>
            {section.items.map(item => (
              <Pressable key={item.label} onPress={() => openDashboardItem(item.label)} style={styles.sectionItem}>
                <View style={[styles.sectionIconWrap, { backgroundColor: `${item.color}12` }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                  {item.badge ? (
                    <View style={[styles.itemBadge, { backgroundColor: item.color }]}>
                      <Text style={styles.itemBadgeText} numberOfLines={1}>{item.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sectionItemLabel} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* ── Address Section ── */}
      <View style={styles.sectionCard}>
        <View style={styles.addressHeader}>
          <Text style={styles.sectionTitle}>Saved Addresses</Text>
          <Pressable onPress={() => navigation.navigate('Addresses')} style={styles.addAddressBtn}>
            <Icon name="plus" size={16} color={PALETTE.primary} />
            <Text style={styles.addAddressText}>Add New</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => navigation.navigate('Addresses')} style={styles.addressCard}>
          <View style={styles.addressIconWrap}>
            <Icon name="map-marker-outline" size={20} color={PALETTE.primary} />
          </View>
          <View style={styles.addressInfo}>
            <Text style={styles.addressTitle}>Manage your delivery addresses</Text>
            <Text style={styles.addressDesc}>Add, edit, or remove shipping addresses for faster checkout</Text>
          </View>
          <Icon name="chevron-right" size={18} color={PALETTE.muted} />
        </Pressable>
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.quickActionsCard}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Pressable onPress={() => navigation.navigate('ProfileSettings')} style={styles.actionRow}>
          <View style={[styles.actionIcon, styles.orangeSoftBg]}>
            <Icon name="cog-outline" size={20} color={PALETTE.primary} />
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionLabel}>Settings</Text>
            <Text style={styles.actionDesc}>Account, preferences, notifications</Text>
          </View>
          <Icon name="chevron-right" size={20} color={PALETTE.faint} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Security')} style={styles.actionRow}>
          <View style={[styles.actionIcon, styles.greenSoftBg]}>
            <Icon name="shield-lock-outline" size={20} color={PALETTE.emerald} />
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionLabel}>Security & Privacy</Text>
            <Text style={styles.actionDesc}>Password, 2FA, privacy settings</Text>
          </View>
          <Icon name="chevron-right" size={20} color={PALETTE.faint} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Services')} style={[styles.actionRow, styles.actionRowLast]}>
          <View style={[styles.actionIcon, styles.redSoftBg]}>
            <Icon name="lifebuoy" size={20} color={PALETTE.red} />
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionLabel}>Help & Support</Text>
            <Text style={styles.actionDesc}>FAQ, contact us, report issue</Text>
          </View>
          <Icon name="chevron-right" size={20} color={PALETTE.faint} />
        </Pressable>
      </View>

      {/* ── Logout ── */}
      <Pressable onPress={signOut} style={styles.logoutButton}>
        <Icon name="logout" size={18} color={PALETTE.red} />
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

// ──────────────────────────────────────
// Styles
// ──────────────────────────────────────
const styles = StyleSheet.create({
  screen: { backgroundColor: PALETTE.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120, paddingTop: spacing.xxl, gap: spacing.lg },

  // ── Guest ──
  guestTop: { alignItems: 'flex-end' },
  closeButton: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: radii.pill, height: 36, justifyContent: 'center', width: 36, ...shadow },
  guestHeader: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: radii.lg, flexDirection: 'row', padding: spacing.lg, ...shadow },
  guestAvatar: { alignItems: 'center', backgroundColor: PALETTE.background, borderRadius: 40, height: 64, justifyContent: 'center', width: 64 },
  guestTextWrap: { flex: 1, marginLeft: spacing.md },
  guestTitle: { color: PALETTE.ink, fontSize: typography.body, fontWeight: '800', letterSpacing: -0.3 },
  guestText: { color: PALETTE.muted, fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 4 },
  authActions: { flexDirection: 'row', gap: spacing.md },
  loginButton: { alignItems: 'center', backgroundColor: PALETTE.primary, borderRadius: radii.md, flex: 1, paddingVertical: 14 },
  loginButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  signupButton: { alignItems: 'center', backgroundColor: PALETTE.surface, borderColor: PALETTE.primary, borderRadius: radii.md, borderWidth: 1.5, flex: 1, paddingVertical: 14 },
  signupButtonText: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  benefitsCard: { backgroundColor: PALETTE.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadow },
  benefitRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  benefitIcon: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  benefitInfo: { flex: 1 },
  benefitTitle: { color: PALETTE.ink, fontSize: 12, fontWeight: '700' },
  benefitSubtitle: { color: PALETTE.muted, fontSize: 10, fontWeight: '500', marginTop: 1 },
  lockedRow: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, padding: spacing.md, ...shadow },
  lockedIcon: { alignItems: 'center', backgroundColor: PALETTE.background, borderRadius: radii.sm, height: 36, justifyContent: 'center', width: 36 },
  lockedTitle: { color: PALETTE.muted, flex: 1, fontSize: 12, fontWeight: '600' },

  // ── Section Title ──
  sectionTitle: { color: PALETTE.ink, fontSize: 14, fontWeight: '800', marginBottom: spacing.md, letterSpacing: -0.2 },

  // ── Profile Card ──
  profileCard: { backgroundColor: PALETTE.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadow },
  profileTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: { borderRadius: 36, height: 72, width: 72, backgroundColor: PALETTE.background },
  avatarFallback: { alignItems: 'center', backgroundColor: PALETTE.primary, borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { color: PALETTE.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  profileEmail: { color: PALETTE.muted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  profileBadge: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 6 },
  profileBadgeText: { color: PALETTE.emerald, fontSize: 10, fontWeight: '700' },
  editButton: { padding: 4 },

  // ── Welcome Banner ──
  welcomeBanner: { alignItems: 'center', backgroundColor: PALETTE.successBg, borderColor: PALETTE.successBorder, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, padding: spacing.md },
  welcomeText: { color: PALETTE.successText, flex: 1, fontSize: 11, fontWeight: '600' },

  // ── Error Banner ──
  errorBanner: { alignItems: 'center', backgroundColor: '#FFF0F0', borderColor: '#FFCCCC', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, padding: spacing.md },
  errorBannerText: { color: PALETTE.red, flex: 1, fontSize: 11, fontWeight: '600' },

  // ── Role Switcher ──
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleButton: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: radii.md, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 10, ...shadow },
  roleButtonActive: { backgroundColor: PALETTE.primaryLight, borderColor: PALETTE.primary, borderWidth: 1.5 },
  roleText: { color: PALETTE.muted, fontSize: 12, fontWeight: '700' },
  roleTextActive: { color: PALETTE.primaryDark },

  // ── Quick Actions Row ──
  quickActionsRow: { flexDirection: 'row', gap: spacing.sm },
  quickActionCard: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: radii.md, flex: 1, padding: spacing.md, ...shadow },
  quickActionIcon: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', marginBottom: 8, width: 44 },
  quickActionLabel: { color: PALETTE.text, fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 14 },

  // ── Stats ──
  statsCard: { backgroundColor: PALETTE.surface, borderRadius: radii.lg, flexDirection: 'row', padding: spacing.lg, ...shadow },
  statItem: { alignItems: 'center', flex: 1 },
  statIconWrap: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', marginBottom: 8, width: 40 },
  statValue: { color: PALETTE.ink, fontSize: 18, fontWeight: '800' },
  statLabel: { color: PALETTE.muted, fontSize: 10, fontWeight: '600', marginTop: 2 },
  statDivider: { backgroundColor: PALETTE.faint, width: 1 },
  statLoader: { marginBottom: 2 },

  // ── Section Grid ──
  sectionCard: { backgroundColor: PALETTE.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadow },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionItem: { alignItems: 'center', width: '23%', paddingVertical: spacing.sm },
  sectionIconWrap: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', marginBottom: 6, position: 'relative', width: 44 },
  itemBadge: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minWidth: 16, paddingHorizontal: 4, paddingVertical: 1, position: 'absolute', right: -4, top: -4 },
  itemBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  sectionItemLabel: { color: PALETTE.text, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // ── Address Section ──
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  addAddressBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PALETTE.primaryLight, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6 },
  addAddressText: { color: PALETTE.primary, fontSize: 11, fontWeight: '700' },
  addressCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: PALETTE.background, borderRadius: radii.md, padding: spacing.md },
  addressIconWrap: { alignItems: 'center', backgroundColor: PALETTE.primaryLight, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  addressInfo: { flex: 1 },
  addressTitle: { color: PALETTE.ink, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  addressDesc: { color: PALETTE.muted, fontSize: 10, fontWeight: '500' },

  // ── Quick Actions ──
  quickActionsCard: { backgroundColor: PALETTE.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadow },
  actionRow: { alignItems: 'center', borderBottomColor: PALETTE.faint, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  actionRowLast: { borderBottomWidth: 0 },
  actionIcon: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  orangeSoftBg: { backgroundColor: '#FFF3E8' },
  greenSoftBg: { backgroundColor: '#E8F8EE' },
  redSoftBg: { backgroundColor: '#FFF0F0' },
  actionInfo: { flex: 1 },
  actionLabel: { color: PALETTE.ink, fontSize: 12, fontWeight: '700' },
  actionDesc: { color: PALETTE.muted, fontSize: 10, fontWeight: '500', marginTop: 1 },

  // Section Title Row
sectionTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

// View All Button
viewAllBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 2,
},
viewAllText: {
  fontSize: 12,
  fontWeight: '600',
  color: PALETTE.primary,
},

// Location Card
locationCard: {
  flexDirection: 'row',
  gap: 12,
  backgroundColor: PALETTE.background,
  borderRadius: radii.md,
  padding: 14,
  marginTop: 8,
},
locationMapPreview: {
  width: 64,
  height: 64,
  borderRadius: 12,
  backgroundColor: PALETTE.primaryLight,
  alignItems: 'center',
  justifyContent: 'center',
},
locationInfo: {
  flex: 1,
  gap: 4,
},
locationTitle: {
  fontSize: 13,
  fontWeight: '700',
  color: PALETTE.ink,
},
locationDesc: {
  fontSize: 11,
  color: PALETTE.muted,
  lineHeight: 16,
},
locationStatus: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  marginTop: 4,
},
locationDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
},
locationStatusText: {
  fontSize: 10,
  fontWeight: '600',
  color: PALETTE.emerald,
},

  // ── Logout ──
  logoutButton: { alignItems: 'center', backgroundColor: PALETTE.surface, borderColor: PALETTE.logoutBorder, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14 },
  logoutText: { color: PALETTE.red, fontSize: 13, fontWeight: '700' },
});

export default AccountScreen;