/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchChats, fetchNotifications, fetchRFQs } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { LoadingState } from '../components/StateViews';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';
import { CURRENCIES, CurrencyCode, useCurrency } from '../currency/CurrencyContext';

// ─── Types ─────────────────────────────────────────────
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

interface CurrencyData {
  code: string;
  symbol: string;
  name: string;
  country: string;
  flag: string;
}

// ─── Palette ───────────────────────────────────────────
const P = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#999999',
  faint: '#E8E8E8',
  border: '#F0F0F0',
  emerald: '#00B578',
  sky: '#3B9CFF',
  violet: '#7B61FF',
  rose: '#FF3B6E',
  amber: '#FF9500',
  red: '#FF3B30',
  inputBg: '#F8F8F8',
};

const STATUSBAR_H = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24);
const BOTTOM_TAB_HEIGHT = 80; // Bottom tab navigation height

// ─── Navigation Map ────────────────────────────────────
const NAV: Record<string, string> = {
  'All Orders': 'Orders', Pending: 'Orders', Shipped: 'Orders', Completed: 'Orders',
  Messages: 'Messages', Profile: 'ProfileSettings', Settings: 'ProfileSettings',
  Security: 'Security', Wallet: 'Wallet', Addresses: 'Addresses', Orders: 'Orders',
  Services: 'Services', 'Find Suppliers': 'Sellers', Suppliers: 'Sellers',
  'AI Assistant': 'AIChat', 'AI Sourcing': 'AIChat',
  'Market Insights': 'MarketInsights', Analytics: 'MarketInsights',
  'Saved Items': 'SavedItems', 'Shipping & Logistics': 'ShippingLogistics',
  'My Reviews': 'ReviewsDashboard', Reviews: 'ReviewsDashboard',
  'My RFQs': 'RFQ', RFQs: 'RFQ', Quotations: 'RFQ',
  Dashboard: 'SellerOnboarding', Verification: 'SellerOnboarding',
  'Factory Profile': 'SellerFactory', Factory: 'SellerFactory',
  Products: 'SellerProducts', Wishlist: 'ProductListing',
  'Recently Viewed': 'ProductListing', Notifications: 'Notifications',
  'Trade Assurance': 'Services', 'Payment Methods': 'Wallet', 'Add Card': 'Wallet',
  'Location': 'Location',
};

// ─── Currency Data ─────────────────────────────────────
function getCurrencyData(code: string): CurrencyData {
  const map: Record<string, CurrencyData> = {
    USD: { code:'USD', symbol:'$', name:'US Dollar', country:'United States', flag:'🇺🇸' },
    EUR: { code:'EUR', symbol:'€', name:'Euro', country:'European Union', flag:'🇪🇺' },
    GBP: { code:'GBP', symbol:'£', name:'British Pound', country:'United Kingdom', flag:'🇬🇧' },
    INR: { code:'INR', symbol:'₹', name:'Indian Rupee', country:'India', flag:'🇮🇳' },
    CNY: { code:'CNY', symbol:'¥', name:'Chinese Yuan', country:'China', flag:'🇨🇳' },
    JPY: { code:'JPY', symbol:'¥', name:'Japanese Yen', country:'Japan', flag:'🇯🇵' },
    KRW: { code:'KRW', symbol:'₩', name:'South Korean Won', country:'South Korea', flag:'🇰🇷' },
    AUD: { code:'AUD', symbol:'A$', name:'Australian Dollar', country:'Australia', flag:'🇦🇺' },
    CAD: { code:'CAD', symbol:'C$', name:'Canadian Dollar', country:'Canada', flag:'🇨🇦' },
    AED: { code:'AED', symbol:'د.إ', name:'UAE Dirham', country:'UAE', flag:'🇦🇪' },
    SAR: { code:'SAR', symbol:'﷼', name:'Saudi Riyal', country:'Saudi Arabia', flag:'🇸🇦' },
    MYR: { code:'MYR', symbol:'RM', name:'Malaysian Ringgit', country:'Malaysia', flag:'🇲🇾' },
    SGD: { code:'SGD', symbol:'S$', name:'Singapore Dollar', country:'Singapore', flag:'🇸🇬' },
    PKR: { code:'PKR', symbol:'₨', name:'Pakistani Rupee', country:'Pakistan', flag:'🇵🇰' },
    BDT: { code:'BDT', symbol:'৳', name:'Bangladeshi Taka', country:'Bangladesh', flag:'🇧🇩' },
  };
  return map[code] || { code, symbol: code, name: code, country: 'Unknown', flag: '🌐' };
}

// ─── Section Templates ─────────────────────────────────
const BUYER_SECTIONS = [
  {
    title: 'My Orders',
    items: [
      { icon: 'clipboard-list-outline', label: 'All Orders', color: P.violet },
      { icon: 'clock-outline', label: 'Pending', color: P.amber },
      { icon: 'truck-fast-outline', label: 'Shipped', color: P.sky },
      { icon: 'check-circle-outline', label: 'Completed', color: P.emerald },
    ],
  },
  {
    title: 'Buying Services',
    items: [
      { icon: 'bullseye-arrow', label: 'My RFQs', color: P.amber },
      { icon: 'robot-outline', label: 'AI Sourcing', color: P.violet },
      { icon: 'account-search-outline', label: 'Find Suppliers', color: P.emerald },
      { icon: 'shield-check-outline', label: 'Trade Assurance', color: P.sky },
    ],
  },
  {
    title: 'Tools & Insights',
    items: [
      { icon: 'chart-line', label: 'Market Insights', color: P.violet },
      { icon: 'heart-outline', label: 'Saved Items', color: P.rose },
      { icon: 'wallet-outline', label: 'Wallet', color: P.emerald },
      { icon: 'star-outline', label: 'My Reviews', color: P.amber },
    ],
  },
];

const SELLER_SECTIONS = [
  {
    title: 'Store Management',
    items: [
      { icon: 'view-dashboard-outline', label: 'Dashboard', color: P.violet },
      { icon: 'package-variant-closed', label: 'Products', color: P.violet },
      { icon: 'clipboard-list-outline', label: 'Orders', color: P.emerald },
      { icon: 'factory', label: 'Factory', color: P.red },
    ],
  },
  {
    title: 'Sales Services',
    items: [
      { icon: 'file-document-edit-outline', label: 'Quotations', color: P.emerald },
      { icon: 'bullseye-arrow', label: 'RFQs', color: P.amber },
      { icon: 'robot-outline', label: 'AI Assistant', color: P.violet },
      { icon: 'check-decagram-outline', label: 'Verification', color: P.sky },
    ],
  },
  {
    title: 'Analytics & Tools',
    items: [
      { icon: 'chart-line', label: 'Analytics', color: P.violet },
      { icon: 'heart-outline', label: 'Saved Items', color: P.rose },
      { icon: 'wallet-outline', label: 'Wallet', color: P.emerald },
      { icon: 'message-text-outline', label: 'Messages', color: P.violet },
      { icon: 'star-check-outline', label: 'Reviews', color: P.amber },
    ],
  },
];

// ─── Query Options ─────────────────────────────────────
const QO = { staleTime: 60_000, gcTime: 300_000, refetchOnWindowFocus: false, retry: 2 } as const;

// ─── Badge Builder ─────────────────────────────────────
function buildBadges(rfq: number, chat: number): Record<string, string> {
  const m: Record<string, string> = {};
  if (rfq > 0) { m['My RFQs'] = String(rfq); m.RFQs = String(rfq); }
  if (chat > 0) m.Messages = String(chat);
  return m;
}

function applyBadges(sections: typeof BUYER_SECTIONS, badges: Record<string, string>): DashboardSection[] {
  return sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i, badge: badges[i.label] })) }));
}

// ─── Currency Dropdown ─────────────────────────────────
function CurrencyDropdown({ selected, onSelect, loading }: { selected: string; onSelect: (c: CurrencyCode) => void; loading: boolean }) {
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const all = useMemo(() => CURRENCIES.map(getCurrencyData), []);
  const curr = getCurrencyData(selected);
  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    const lq = q.toLowerCase();
    return all.filter(c => c.code.toLowerCase().includes(lq) || c.name.toLowerCase().includes(lq) || c.country.toLowerCase().includes(lq));
  }, [all, q]);

  return (
    <View>
      <Pressable onPress={() => { setShow(true); setQ(''); }} style={styles.curTrigger}>
        <Text style={styles.curFlag}>{curr.flag}</Text>
        <Text style={styles.curCode}>{curr.code}</Text>
        {loading ? <ActivityIndicator size="small" color={P.primary} /> : <Icon name="chevron-down" size={14} color={P.muted} />}
      </Pressable>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBack} onPress={() => setShow(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Select Currency</Text>
              <Pressable onPress={() => setShow(false)} style={styles.modalClose}><Icon name="close" size={20} color={P.ink} /></Pressable>
            </View>
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={16} color={P.muted} />
              <TextInput style={styles.searchInp} placeholder="Search currency..." placeholderTextColor={P.muted} value={q} onChangeText={setQ} />
              {q ? <Pressable onPress={() => setQ('')}><Icon name="close-circle" size={14} color={P.muted} /></Pressable> : null}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={i => i.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              renderItem={({ item }) => {
                const active = selected === item.code;
                return (
                  <Pressable style={[styles.curItem, active && styles.curItemActive]} onPress={() => { onSelect(item.code as CurrencyCode); setShow(false); }}>
                    <Text style={styles.curItemFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.curItemCode, active && { color: P.primary }]}>{item.code} <Text style={styles.curItemSym}>{item.symbol}</Text></Text>
                      <Text style={styles.curItemName}>{item.name} • {item.country}</Text>
                    </View>
                    {active && <Icon name="check-circle" size={20} color={P.primary} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub Components ────────────────────────────────────
function Benefit({ icon, title, sub, color }: { icon: string; title: string; sub: string; color: string }) {
  return (
    <View style={styles.benRow}>
      <View style={[styles.benIcon, { backgroundColor: `${color}15` }]}><Icon name={icon} size={16} color={color} /></View>
      <View><Text style={styles.benTitle}>{title}</Text><Text style={styles.benSub}>{sub}</Text></View>
    </View>
  );
}

function LockedRow({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.lockRow}>
      <Icon name={icon} size={16} color={P.muted} />
      <Text style={styles.lockText}>{title}</Text>
      <Icon name="lock-outline" size={12} color={P.faint} />
    </View>
  );
}

// ─── Main Component ────────────────────────────────────
function AccountScreen() {
  const { selectedCurrency, setCurrency, isLoading: curLoading } = useCurrency();
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { activeRole, setActiveRole, signOut, status, user } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [prevMode, setPrevMode] = useState<AuthMode | null>(null);

  const roles = useMemo(() => user?.roles?.filter(r => r === 'buyer' || r === 'seller') ?? [], [user]);
  const role: Role = activeRole === 'seller' ? 'seller' : 'buyer';

  const notifQ = useQuery({ queryKey: ['acc-notif', role], queryFn: fetchNotifications, enabled: status === 'authenticated', ...QO, select: (d: any) => ({ unread: Array.isArray(d) ? d.filter((i: any) => !i.isRead).length : 0 }) });
  const rfqQ = useQuery({ queryKey: ['acc-rfq', role], queryFn: () => fetchRFQs({ scope: role, limit: 1 }), enabled: status === 'authenticated', ...QO, select: (d: any) => ({ count: d?.pagination?.total ?? d?.rfqs?.length ?? 0 }) });
  const chatQ = useQuery({ queryKey: ['acc-chat', role], queryFn: () => fetchChats(role), enabled: status === 'authenticated', ...QO, select: (d: any) => ({ count: Array.isArray(d) ? d.length : 0 }) });

  const unread = notifQ.data?.unread ?? 0;
  const rfqs = rfqQ.data?.count ?? 0;
  const chats = chatQ.data?.count ?? 0;
  const badges = useMemo(() => buildBadges(rfqs, chats), [rfqs, chats]);
  const buyerSec = useMemo(() => applyBadges(BUYER_SECTIONS, badges), [badges]);
  const sellerSec = useMemo(() => applyBadges(SELLER_SECTIONS, badges), [badges]);

  useEffect(() => { if (status === 'authenticated' && prevMode) { setAuthMode(null); setWelcome(true); setPrevMode(null); } }, [status, prevMode]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['acc-notif'] }); qc.invalidateQueries({ queryKey: ['acc-rfq'] }); qc.invalidateQueries({ queryKey: ['acc-chat'] }); };
  const go = (label: string) => nav.navigate(NAV[label] || 'Home');

  if (authMode) return <AuthScreen initialMode={authMode} onClose={() => setAuthMode(null)} onSuccess={() => { setAuthMode(null); setWelcome(true); }} />;
  if (status === 'checking') return <LoadingState label="Restoring session" />;

  // ─── GUEST ───────────────────────────────────────────
  if (status !== 'authenticated') {
    return (
      <ScrollView 
        style={styles.screen} 
        contentContainerStyle={styles.guestContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.guestTop}>
          <Pressable onPress={() => nav.navigate('Home')} style={styles.closeBtn}><Icon name="close" size={18} color={P.muted} /></Pressable>
        </View>
        <View style={styles.guestCard}>
          <View style={styles.guestAvatar}><Icon name="account-outline" size={28} color={P.muted} /></View>
          <Text style={styles.guestTitle}>Welcome to EsyGlob</Text>
          <Text style={styles.guestSub}>Sign in to manage orders, RFQs, and supplier messages.</Text>
          <View style={styles.guestBtns}>
            <Pressable onPress={() => setAuthMode('login')} style={styles.guestBtnPri}><Text style={styles.guestBtnPriText}>Login</Text></Pressable>
            <Pressable onPress={() => setAuthMode('signup')} style={styles.guestBtnSec}><Text style={styles.guestBtnSecText}>Sign up</Text></Pressable>
          </View>
        </View>
        <View style={styles.guestCard}>
          <Text style={styles.secTitle}>Member Benefits</Text>
          <Benefit icon="shield-check-outline" title="Verified identity" sub="Build trust with partners" color={P.emerald} />
          <Benefit icon="message-text-outline" title="Buyer-seller messaging" sub="Real-time communication" color={P.violet} />
          <Benefit icon="heart-outline" title="Wishlist & history" sub="Save and track products" color={P.rose} />
        </View>
        <Text style={styles.secTitle}>Locked Features</Text>
        <LockedRow icon="eye-outline" title="Recently viewed" />
        <LockedRow icon="heart-outline" title="Wishlist" />
        <LockedRow icon="clipboard-list-outline" title="Orders" />
      </ScrollView>
    );
  }

  // ─── AUTHENTICATED ───────────────────────────────────
  const name = user?.name ?? user?.fullName ?? user?.email ?? 'Account';
  const img = firstImage(user?.profileImage, user?.avatarUrl);
  const sections = role === 'seller' ? sellerSec : buyerSec;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />
      
      {/* Fixed Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Account</Text>
        <Pressable onPress={() => nav.navigate('Notifications')} style={styles.headerBtn}>
          <Icon name="bell-outline" size={20} color={P.ink} />
          {unread > 0 && <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unread}</Text></View>}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.authContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={notifQ.isFetching || rfqQ.isFetching || chatQ.isFetching} onRefresh={refresh} tintColor={P.primary} />}
      >
        {/* Profile Mini */}
        <Pressable onPress={() => nav.navigate('ProfileSettings')} style={styles.profCard}>
          <RemoteImage uri={img} width={44} height={44} style={styles.profImg} fallback={<View style={styles.profFall}><Text style={styles.profFallText}>{name.slice(0,1).toUpperCase()}</Text></View>} />
          <View style={{ flex: 1 }}>
            <Text style={styles.profName} numberOfLines={1}>{name}</Text>
            <Text style={styles.profEmail} numberOfLines={1}>{user?.email}</Text>
          </View>
          <Icon name="chevron-right" size={16} color={P.muted} />
        </Pressable>

        {/* Welcome */}
        {welcome && (
          <View style={styles.welcome}>
            <Icon name="check-circle-outline" size={14} color={P.emerald} />
            <Text style={styles.welcomeText}>Welcome back! Your {role} dashboard is ready.</Text>
            <Pressable onPress={() => setWelcome(false)}><Icon name="close" size={12} color={P.muted} /></Pressable>
          </View>
        )}

        {/* Role Switcher */}
        {roles.length > 1 && (
          <View style={styles.roleRow}>
            {roles.map(r => (
              <Pressable key={r} onPress={() => setActiveRole(r)} style={[styles.roleBtn, role === r && styles.roleBtnActive]}>
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r === 'buyer' ? 'Buyer' : 'Seller'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon name="file-document-outline" size={18} color={P.primary} />
            {rfqQ.isLoading ? <ActivityIndicator size="small" color={P.muted} /> : <Text style={styles.statVal}>{rfqs}</Text>}
            <Text style={styles.statLbl}>Active RFQs</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="message-text-outline" size={18} color={P.emerald} />
            {chatQ.isLoading ? <ActivityIndicator size="small" color={P.muted} /> : <Text style={styles.statVal}>{chats}</Text>}
            <Text style={styles.statLbl}>Messages</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="bell-outline" size={18} color={P.red} />
            {notifQ.isLoading ? <ActivityIndicator size="small" color={P.muted} /> : <Text style={styles.statVal}>{unread}</Text>}
            <Text style={styles.statLbl}>Alerts</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickRow}>
          {[
            { icon: 'credit-card-plus-outline', label: 'Add Card', color: P.primary, bg: '#FFF3E8', route: 'Wallet' },
            { icon: 'map-marker-plus-outline', label: 'Address', color: P.emerald, bg: '#E8F8EE', route: 'Addresses' },
            { icon: 'truck-fast-outline', label: 'Orders', color: P.sky, bg: '#EFF6FF', route: 'Orders' },
            { icon: 'bell-badge-outline', label: 'Alerts', color: P.rose, bg: '#FFF0F0', route: 'Notifications' },
          ].map((a, i) => (
            <Pressable key={i} onPress={() => nav.navigate(a.route)} style={styles.quickCard}>
              <View style={[styles.quickIcon, { backgroundColor: a.bg }]}><Icon name={a.icon} size={18} color={a.color} /></View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Currency Section */}
        <View style={styles.curCard}>
          <View style={styles.curHead}>
            <Icon name="currency-usd" size={16} color={P.primary} />
            <Text style={styles.curTitle}>Preferred Currency</Text>
          </View>
          <Text style={styles.curDesc}>All prices will be displayed in your selected currency</Text>
          <CurrencyDropdown selected={selectedCurrency} onSelect={setCurrency} loading={curLoading} />
        </View>

        {/* Location Section */}
        <Pressable onPress={() => nav.navigate('Location')} style={styles.locCard}>
          <View style={styles.locIconWrap}>
            <Icon name="map-marker" size={20} color={P.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.locTitle}>My Location</Text>
            <Text style={styles.locDesc}>Set location for nearby suppliers & accurate shipping</Text>
          </View>
          <Icon name="chevron-right" size={16} color={P.muted} />
        </Pressable>

        {/* Dashboard Sections */}
        {sections.map(sec => (
          <View key={sec.title} style={styles.secCard}>
            <Text style={styles.secTitle}>{sec.title}</Text>
            <View style={styles.secGrid}>
              {sec.items.map(item => (
                <Pressable key={item.label} onPress={() => go(item.label)} style={styles.secItem}>
                  <View style={[styles.secIcon, { backgroundColor: `${item.color}15` }]}>
                    <Icon name={item.icon} size={16} color={item.color} />
                    {item.badge && <View style={[styles.secBadge, { backgroundColor: item.color }]}><Text style={styles.secBadgeText}>{item.badge}</Text></View>}
                  </View>
                  <Text style={styles.secLabel} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Saved Addresses */}
        <Pressable onPress={() => nav.navigate('Addresses')} style={styles.secCard}>
          <View style={styles.addrHead}>
            <Text style={styles.secTitle}>Saved Addresses</Text>
            <View style={styles.addrAdd}>
              <Icon name="plus" size={12} color={P.primary} />
              <Text style={styles.addrAddText}>Add New</Text>
            </View>
          </View>
          <View style={styles.addrRow}>
            <View style={styles.addrIcon}>
              <Icon name="map-marker-outline" size={16} color={P.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addrTitle}>Manage your delivery addresses</Text>
              <Text style={styles.addrDesc}>Add, edit, or remove shipping addresses</Text>
            </View>
            <Icon name="chevron-right" size={14} color={P.muted} />
          </View>
        </Pressable>

        {/* Bottom Actions */}
        <View style={styles.secCard}>
          <Pressable onPress={() => nav.navigate('ProfileSettings')} style={styles.actRow}><Icon name="cog-outline" size={16} color={P.primary} /><Text style={styles.actText}>Settings</Text><Icon name="chevron-right" size={14} color={P.faint} /></Pressable>
          <Pressable onPress={() => nav.navigate('Security')} style={styles.actRow}><Icon name="shield-lock-outline" size={16} color={P.emerald} /><Text style={styles.actText}>Security & Privacy</Text><Icon name="chevron-right" size={14} color={P.faint} /></Pressable>
          <Pressable onPress={() => nav.navigate('HelpSupport')} style={[styles.actRow, { borderBottomWidth: 0 }]}><Icon name="lifebuoy" size={16} color={P.red} /><Text style={styles.actText}>Help & Support</Text><Icon name="chevron-right" size={14} color={P.faint} /></Pressable>
        </View>

        {/* Logout */}
        <Pressable onPress={signOut} style={styles.logout}>
          <Icon name="logout" size={14} color={P.red} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>

        {/* Extra bottom spacer for tab bar */}
        <View style={{ height: BOTTOM_TAB_HEIGHT }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  scrollView: { flex: 1 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: STATUSBAR_H + 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border, zIndex: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.ink },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerBadge: { position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: P.red, alignItems: 'center', justifyContent: 'center' },
  headerBadgeText: { fontSize: 8, fontWeight: '800', color: '#FFF' },

  // Content
  authContent: { padding: 12, paddingBottom: 20, gap: 10 },
  guestContent: { padding: 16, paddingTop: STATUSBAR_H + 20, paddingBottom: 40, gap: 12 },

  // Guest
  guestTop: { alignItems: 'flex-end' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center' },
  guestCard: { backgroundColor: P.surface, borderRadius: 12, padding: 16 },
  guestAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: P.bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  guestTitle: { fontSize: 15, fontWeight: '700', color: P.ink, textAlign: 'center' },
  guestSub: { fontSize: 11, color: P.muted, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  guestBtns: { flexDirection: 'row', gap: 10 },
  guestBtnPri: { flex: 1, backgroundColor: P.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  guestBtnPriText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  guestBtnSec: { flex: 1, backgroundColor: P.surface, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: P.primary },
  guestBtnSecText: { color: P.primary, fontSize: 12, fontWeight: '700' },
  benRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  benIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  benTitle: { fontSize: 11, fontWeight: '700', color: P.ink },
  benSub: { fontSize: 10, color: P.muted },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.surface, borderRadius: 8, padding: 12 },
  lockText: { flex: 1, fontSize: 11, color: P.muted, fontWeight: '600' },

  // Profile
  profCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: P.surface, borderRadius: 12, padding: 12 },
  profImg: { width: 44, height: 44, borderRadius: 22 },
  profFall: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.primary, alignItems: 'center', justifyContent: 'center' },
  profFallText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  profName: { fontSize: 13, fontWeight: '700', color: P.ink },
  profEmail: { fontSize: 10, color: P.muted, marginTop: 1 },

  // Welcome
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F8EE', borderRadius: 8, padding: 10 },
  welcomeText: { flex: 1, fontSize: 10, color: '#006C3D', fontWeight: '600' },

  // Role
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: P.surface, borderWidth: 1, borderColor: P.border },
  roleBtnActive: { backgroundColor: P.primaryLight, borderColor: P.primary },
  roleText: { fontSize: 11, fontWeight: '700', color: P.muted },
  roleTextActive: { color: P.primary },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: P.surface, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 18, fontWeight: '800', color: P.ink },
  statLbl: { fontSize: 9, fontWeight: '600', color: P.muted, textTransform: 'uppercase' },

  // Quick Actions
  quickRow: { flexDirection: 'row', gap: 8 },
  quickCard: { flex: 1, backgroundColor: P.surface, borderRadius: 10, padding: 10, alignItems: 'center', gap: 6 },
  quickIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 9, fontWeight: '600', color: P.text },

  // Currency
  curCard: { backgroundColor: P.surface, borderRadius: 12, padding: 14 },
  curHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  curTitle: { fontSize: 12, fontWeight: '700', color: P.ink },
  curDesc: { fontSize: 10, color: P.muted, marginBottom: 10 },
  curTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.inputBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: P.faint },
  curFlag: { fontSize: 20 },
  curCode: { fontSize: 12, fontWeight: '700', color: P.ink, flex: 1 },

  // Location
  locCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: P.surface, borderRadius: 12, padding: 12 },
  locIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: P.primaryLight, alignItems: 'center', justifyContent: 'center' },
  locTitle: { fontSize: 12, fontWeight: '700', color: P.ink },
  locDesc: { fontSize: 10, color: P.muted, marginTop: 2 },

  // Section
  secCard: { backgroundColor: P.surface, borderRadius: 12, padding: 14 },
  secTitle: { fontSize: 12, fontWeight: '700', color: P.ink, marginBottom: 10 },
  secGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  secItem: { alignItems: 'center', width: '23%', paddingVertical: 6 },
  secIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4, position: 'relative' },
  secBadge: { position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  secBadgeText: { fontSize: 7, fontWeight: '800', color: '#FFF' },
  secLabel: { fontSize: 9, fontWeight: '600', color: P.text, textAlign: 'center' },

  // Address Section
  addrHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addrAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: P.primaryLight, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  addrAddText: { fontSize: 10, fontWeight: '700', color: P.primary },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: P.inputBg, borderRadius: 10, padding: 12 },
  addrIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: P.primaryLight, alignItems: 'center', justifyContent: 'center' },
  addrTitle: { fontSize: 11, fontWeight: '700', color: P.ink },
  addrDesc: { fontSize: 10, color: P.muted, marginTop: 2 },

  // Actions
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: P.border },
  actText: { flex: 1, fontSize: 12, fontWeight: '600', color: P.ink },

  // Logout
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: P.surface, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#FFCCCC' },
  logoutText: { fontSize: 12, fontWeight: '700', color: P.red },

  // Modal
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBack: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: P.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: P.faint, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: P.ink },
  modalClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: P.inputBg, borderRadius: 10, paddingHorizontal: 12, height: 40, gap: 8 },
  searchInp: { flex: 1, fontSize: 12, color: P.ink },
  curItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 4 },
  curItemActive: { backgroundColor: P.primaryLight },
  curItemFlag: { fontSize: 24 },
  curItemCode: { fontSize: 13, fontWeight: '700', color: P.ink },
  curItemSym: { fontSize: 11, color: P.muted },
  curItemName: { fontSize: 10, color: P.muted },
});

export default AccountScreen;
