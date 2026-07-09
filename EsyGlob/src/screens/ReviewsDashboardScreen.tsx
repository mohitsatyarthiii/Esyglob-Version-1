import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReviewsPanel from '../components/ReviewsPanel';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

function ReviewsDashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { activeRole } = useAuth();
  const isSeller = activeRole === 'seller';

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconButton}>
          <Icon name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isSeller ? 'Seller Reviews' : 'My Reviews'}</Text>
          <Text style={styles.subtitle}>{isSeller ? 'Respond to supplier feedback' : 'Manage your product and supplier reviews'}</Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ReviewsPanel mine={!isSeller} sellerDashboard={isSeller} title={isSeller ? 'Supplier Feedback' : 'My Reviews'} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  iconButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: 999, height: 40, justifyContent: 'center', width: 40 },
  headerText: { flex: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

export default ReviewsDashboardScreen;
