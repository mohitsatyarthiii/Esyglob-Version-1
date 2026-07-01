import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchChats, fetchNotifications, fetchRFQs } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { LoadingState } from '../components/StateViews';
import { colors, radii, spacing, type } from '../theme';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';

type AuthMode = 'login' | 'signup';

const buyerItems = [
  ['account-outline', 'Profile'],
  ['clipboard-list-outline', 'Orders'],
  ['heart-outline', 'Wishlist'],
  ['bullseye-arrow', 'RFQs'],
  ['wallet-outline', 'Wallet'],
  ['bell-outline', 'Notifications'],
  ['cog-outline', 'Settings'],
  ['lifebuoy', 'Support'],
];

const sellerItems = [
  ['view-dashboard-outline', 'Seller Dashboard'],
  ['package-variant-closed', 'Products'],
  ['clipboard-list-outline', 'Orders'],
  ['bullseye-arrow', 'RFQs'],
  ['file-document-edit-outline', 'Quotations'],
  ['chart-line', 'Analytics'],
  ['factory', 'Factory Profile'],
  ['check-decagram-outline', 'Verification'],
  ['wallet-outline', 'Wallet'],
  ['message-text-outline', 'Messages'],
  ['bell-outline', 'Notifications'],
  ['cog-outline', 'Settings'],
];

function AccountScreen() {
  const navigation = useNavigation<any>();
  const { activeRole, setActiveRole, signOut, status, user } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const mobileRoles = user?.roles?.filter(role => role === 'buyer' || role === 'seller') ?? [];
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const notifications = useQuery({
    queryKey: ['account-notifications', role],
    queryFn: fetchNotifications,
    enabled: status === 'authenticated',
  });
  const rfqs = useQuery({
    queryKey: ['account-rfqs', role],
    queryFn: fetchRFQs,
    enabled: status === 'authenticated',
  });
  const chats = useQuery({
    queryKey: ['account-chats', role],
    queryFn: () => fetchChats(role),
    enabled: status === 'authenticated',
  });

  useEffect(() => {
    if (status === 'authenticated' && authMode) {
      setAuthMode(null);
      setWelcomeVisible(true);
    }
  }, [authMode, status]);

  if (authMode) {
    return (
      <AuthScreen
        initialMode={authMode}
        onClose={() => setAuthMode(null)}
        onSuccess={() => {
          setAuthMode(null);
          setWelcomeVisible(true);
        }}
      />
    );
  }

  if (status === 'checking') {
    return <LoadingState label="Restoring session" />;
  }

  if (status !== 'authenticated') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.guestTop}>
          <Pressable onPress={() => navigation.navigate('Home')} hitSlop={10} style={styles.closeButton}>
            <Icon name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.guestHeader}>
          <View style={styles.guestAvatar}>
            <Icon name="account-outline" size={42} color={colors.muted} />
          </View>
          <View style={styles.guestTextWrap}>
            <Text style={styles.guestTitle}>Welcome to EsyGlob</Text>
            <Text style={styles.guestText}>Sign in to manage orders, RFQs, wishlist, and supplier messages.</Text>
          </View>
        </View>
        <View style={styles.authActions}>
          <Pressable onPress={() => setAuthMode('login')} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Login</Text>
          </Pressable>
          <Pressable onPress={() => setAuthMode('signup')} style={styles.signupButton}>
            <Text style={styles.signupButtonText}>Sign up</Text>
          </Pressable>
        </View>
        <View style={styles.benefits}>
          <Benefit icon="shield-check-outline" title="Verified trade identity" />
          <Benefit icon="message-text-outline" title="Buyer-seller messaging" />
          <Benefit icon="heart-outline" title="Wishlist and recently viewed" />
        </View>
        <LockedRow icon="eye-outline" title="Recently viewed" />
        <LockedRow icon="heart-outline" title="Wishlist" />
        <LockedRow icon="clipboard-list-outline" title="Orders" />
      </ScrollView>
    );
  }

  const dashboardItems = role === 'seller' ? sellerItems : buyerItems;
  const unread = notifications.data?.filter(item => !item.isRead).length ?? 0;
  const displayName = user?.name ?? user?.fullName ?? user?.email ?? 'EsyGlob account';
  const profileImage = firstImage(user?.profileImage, user?.avatar, user?.image);
  const openDashboardItem = (label: string) => {
    if (label === 'Messages') {
      navigation.navigate('Messages');
      return;
    }

    if (label === 'Orders') {
      navigation.navigate('Orders');
      return;
    }

    if (label === 'RFQs' || label === 'Quotations') {
      navigation.navigate('RFQ');
      return;
    }

    if (label === 'Seller Dashboard' || label === 'Verification') {
      navigation.navigate('SellerOnboarding');
      return;
    }

    if (label === 'Factory Profile') {
      navigation.navigate('SellerFactory');
      return;
    }

    if (label === 'Products') {
      navigation.navigate('SellerProducts');
      return;
    }

    if (label === 'Wishlist') {
      navigation.navigate('ProductListing');
      return;
    }

    if (label === 'Notifications') {
      navigation.navigate('Messages');
      return;
    }

    navigation.navigate('Home');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <RemoteImage
          uri={profileImage}
          width={124}
          height={124}
          style={styles.avatar}
          fallback={<Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>}
        />
        <View style={styles.identity}>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {welcomeVisible ? (
        <View style={styles.welcomeBanner}>
          <Icon name="check-circle-outline" size={22} color={colors.green} />
          <Text style={styles.welcomeText}>
            Welcome back{user?.name ? `, ${user.name}` : ''}. Your {role} dashboard is ready.
          </Text>
          <Pressable onPress={() => setWelcomeVisible(false)} hitSlop={10}>
            <Icon name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {mobileRoles.length > 1 ? (
        <View style={styles.roleRow}>
          {mobileRoles.map(item => (
            <Pressable
              key={item}
              onPress={() => setActiveRole(item)}
              style={[styles.roleButton, role === item && styles.roleButtonActive]}>
              <Text style={[styles.roleText, role === item && styles.roleTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.summaryRow}>
        <Metric label="RFQs" value={rfqs.data?.length ?? 0} />
        <Metric label="Messages" value={chats.data?.length ?? 0} />
        <Metric label="Alerts" value={unread} />
      </View>

      <Text style={styles.dashboardTitle}>{role === 'seller' ? 'Seller Dashboard' : 'Buyer Dashboard'}</Text>
      <View style={styles.grid}>
        {dashboardItems.map(([icon, label]) => (
          <Pressable key={label} onPress={() => openDashboardItem(label)} style={styles.gridItem}>
            <Icon name={icon} size={24} color={colors.primary} />
            <Text numberOfLines={2} style={styles.gridText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={signOut} style={styles.logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Benefit({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.benefit}>
      <Icon name={icon} size={22} color={colors.primary} />
      <Text style={styles.benefitText}>{title}</Text>
    </View>
  );
}

function LockedRow({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.lockedRow}>
      <Icon name={icon} size={23} color={colors.muted} />
      <Text style={styles.lockedTitle}>{title}</Text>
      <Icon name="lock-outline" size={18} color={colors.muted} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 116,
    paddingTop: spacing.xxl,
  },
  guestTop: {
    alignItems: 'flex-end',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  guestHeader: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  guestAvatar: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  guestTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  guestTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  guestText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  authActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.md,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  signupButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.md,
  },
  signupButtonText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  benefits: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  benefit: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  benefitText: {
    color: colors.ink,
    flex: 1,
    fontWeight: '800',
  },
  lockedRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  lockedTitle: {
    color: colors.text,
    flex: 1,
    fontWeight: '900',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  identity: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  email: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  welcomeBanner: {
    alignItems: 'center',
    backgroundColor: '#eefaf4',
    borderColor: '#c8efd9',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  welcomeText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  roleRow: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    marginTop: spacing.xl,
    padding: spacing.xs,
  },
  roleButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.md,
  },
  roleButtonActive: {
    backgroundColor: colors.card,
  },
  roleText: {
    color: colors.muted,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  roleTextActive: {
    color: colors.primaryDark,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  metric: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flex: 1,
    padding: spacing.md,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  dashboardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  gridItem: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    minHeight: 92,
    justifyContent: 'center',
    padding: spacing.sm,
    width: '30.8%',
  },
  gridText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  logout: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '900',
  },
});

export default AccountScreen;
