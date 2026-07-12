import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { formatDistanceToNow } from '../utils/date';

// ─── Palette ────────────────────────────────────────────────────────────

const P = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  text: '#1A1A1A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  red: '#DC2626',
  redLight: '#FEF2F2',
  amber: '#D97706',
  amberLight: '#FFFBEB',
};

// ─── Component ──────────────────────────────────────────────────────────

function LocationScreen() {
  const navigation = useNavigation<any>();
  const {
    currentLocation,
    isTracking,
    startTracking,
    stopTracking,
    getCurrentPositionOnce,
    refetchLocation,
  } = useLocationTracking();

  const [refreshing, setRefreshing] = useState(false);
  const [detectingOnce, setDetectingOnce] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchLocation();
    setRefreshing(false);
  }, [refetchLocation]);

  const handleDetectOnce = useCallback(async () => {
    setDetectingOnce(true);
    const position = await getCurrentPositionOnce();
    setDetectingOnce(false);

    if (position) {
      Alert.alert('✓ Location Detected', `Lat: ${position.latitude.toFixed(4)}, Lng: ${position.longitude.toFixed(4)}`);
    } else {
      Alert.alert('Error', 'Unable to detect location. Please check permissions.');
    }
  }, [getCurrentPositionOnce]);

  const handleToggleTracking = useCallback(() => {
    if (isTracking) {
      Alert.alert(
        'Stop Location Tracking',
        'Are you sure? Some features like nearby suppliers and shipping estimates may not work properly.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: stopTracking },
        ]
      );
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const location = currentLocation?.location;
  const address = location?.address;
  const lastUpdated = location?.lastUpdated ? formatDistanceToNow(new Date(location.lastUpdated)) : 'Never';
  const coordinates = location?.current?.coordinates;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Location</Text>
        <Pressable onPress={handleRefresh} style={styles.refreshBtn}>
          <Icon name="refresh" size={20} color={refreshing ? P.primary : P.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Map Placeholder ── */}
        <View style={styles.mapCard}>
          <View style={styles.mapPlaceholder}>
            {coordinates ? (
              <>
                <Icon name="map-marker" size={48} color={P.primary} />
                <Text style={styles.mapCoordinates}>
                  {coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}
                </Text>
              </>
            ) : (
              <>
                <Icon name="map-marker-off-outline" size={48} color={P.muted} />
                <Text style={styles.mapPlaceholderText}>No location data</Text>
              </>
            )}
          </View>
          <View style={styles.mapOverlay}>
            <View style={[styles.statusDot, { backgroundColor: isTracking ? P.emerald : P.red }]} />
            <Text style={styles.statusText}>
              {isTracking ? 'Live Tracking Active' : 'Tracking Inactive'}
            </Text>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handleToggleTracking}
            style={[styles.actionCard, isTracking ? styles.actionCardStop : styles.actionCardStart]}>
            <Icon
              name={isTracking ? 'stop-circle-outline' : 'play-circle-outline'}
              size={24}
              color={isTracking ? P.red : P.emerald}
            />
            <Text style={[styles.actionText, { color: isTracking ? P.red : P.emerald }]}>
              {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDetectOnce}
            disabled={detectingOnce}
            style={styles.actionCard}>
            {detectingOnce ? (
              <ActivityIndicator size="small" color={P.accent} />
            ) : (
              <Icon name="crosshairs-gps" size={24} color={P.accent} />
            )}
            <Text style={styles.actionText}>Detect Now</Text>
          </Pressable>
        </View>

        {/* ── Current Location Info ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="map-marker-outline" size={20} color={P.primary} />
            <Text style={styles.cardTitle}>Current Location</Text>
          </View>

          {address ? (
            <View style={styles.addressBlock}>
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>Address</Text>
                <Text style={styles.addressValue}>{address.formatted || 'N/A'}</Text>
              </View>
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>Street</Text>
                <Text style={styles.addressValue}>{address.street || 'N/A'}</Text>
              </View>
              <View style={styles.addressGrid}>
                <View style={styles.addressGridItem}>
                  <Text style={styles.addressLabel}>City</Text>
                  <Text style={styles.addressValue}>{address.city || 'N/A'}</Text>
                </View>
                <View style={styles.addressGridItem}>
                  <Text style={styles.addressLabel}>State</Text>
                  <Text style={styles.addressValue}>{address.state || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.addressGrid}>
                <View style={styles.addressGridItem}>
                  <Text style={styles.addressLabel}>Country</Text>
                  <Text style={styles.addressValue}>{address.country || 'N/A'}</Text>
                </View>
                <View style={styles.addressGridItem}>
                  <Text style={styles.addressLabel}>PIN</Text>
                  <Text style={styles.addressValue}>{address.postalCode || 'N/A'}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.noDataBox}>
              <Icon name="map-marker-question-outline" size={32} color={P.muted} />
              <Text style={styles.noDataText}>No location detected yet</Text>
              <Text style={styles.noDataSubtext}>
                Enable tracking or tap "Detect Now"
              </Text>
            </View>
          )}
        </View>

        {/* ── Location Stats ── */}
        {location && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="information-outline" size={20} color={P.accent} />
              <Text style={styles.cardTitle}>Location Details</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Icon name="map-marker-distance" size={18} color={P.primary} />
                <Text style={styles.statValue}>
                  {location.accuracy ? `${Math.round(location.accuracy)}m` : 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Accuracy</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="elevation-rise" size={18} color={P.accent} />
                <Text style={styles.statValue}>
                  {location.altitude ? `${Math.round(location.altitude)}m` : 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Altitude</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="speedometer" size={18} color={P.emerald} />
                <Text style={styles.statValue}>
                  {location.speed ? `${Math.round(location.speed)} m/s` : 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Speed</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="compass-outline" size={18} color={P.amber} />
                <Text style={styles.statValue}>
                  {location.heading ? `${Math.round(location.heading)}°` : 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Heading</Text>
              </View>
            </View>

            <View style={styles.lastUpdated}>
              <Icon name="clock-outline" size={14} color={P.muted} />
              <Text style={styles.lastUpdatedText}>Last updated: {lastUpdated}</Text>
            </View>
          </View>
        )}

        {/* ── Info Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Icon name="shield-check-outline" size={18} color={P.emerald} />
            <Text style={styles.infoTitle}>Your Privacy</Text>
          </View>
          <Text style={styles.infoText}>
            Your location is only used to improve your experience - showing nearby suppliers, 
            calculating accurate shipping costs, and providing delivery estimates. 
            Location data is encrypted and never shared with third parties.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: P.text },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 14, paddingBottom: 40 },

  // Map Card
  mapCard: {
    backgroundColor: P.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#E8ECF2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mapPlaceholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.muted,
  },
  mapCoordinates: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
    fontFamily: 'monospace',
  },
  mapOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: P.surface,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  actionCardStart: {
    borderColor: P.emerald,
    backgroundColor: P.emeraldLight,
  },
  actionCardStop: {
    borderColor: P.red,
    backgroundColor: P.redLight,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: P.text,
  },

  // Cards
  card: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: P.text,
  },

  // Address Block
  addressBlock: {
    gap: 12,
  },
  addressRow: {
    gap: 4,
  },
  addressGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  addressGridItem: {
    flex: 1,
    gap: 4,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressValue: {
    fontSize: 13,
    fontWeight: '600',
    color: P.text,
    lineHeight: 18,
  },

  // No Data
  noDataBox: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  noDataText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.textSecondary,
  },
  noDataSubtext: {
    fontSize: 12,
    color: P.muted,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    backgroundColor: P.inputBg,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
  },

  // Last Updated
  lastUpdated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  lastUpdatedText: {
    fontSize: 11,
    color: P.muted,
    fontWeight: '500',
  },

  // Info Card
  infoCard: {
    backgroundColor: P.emeraldLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: P.emerald,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
    color: P.textSecondary,
  },
});

export default LocationScreen;
