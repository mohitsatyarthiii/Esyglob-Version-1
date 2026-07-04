import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { getServiceByKey, getServicesForRole } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { colors, radii, shadow, spacing, type } from '../theme';
import { RootStackParamList } from '../../App';

function ServiceDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceDetails'>>();
  const { activeRole } = useAuth();
  const service = getServiceByKey(route.params.serviceKey);
  const related = getServicesForRole(activeRole).filter(item => item.key !== service?.key && item.category === service?.category).slice(0, 3);

  if (!service) {
    return (
      <View style={styles.screen}>
        <Header title="Service not found" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <RemoteImage uri={service.image} width={900} height={460} style={styles.heroImage} />
          <View style={styles.heroShade} />
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={colors.ink} />
          </Pressable>
          <View style={styles.heroBody}>
            <View style={styles.heroBadge}><Icon name={service.icon} size={16} color={colors.primaryDark} /><Text style={styles.heroBadgeText}>{service.category}</Text></View>
            <Text style={styles.title}>{service.title}</Text>
            <Text style={styles.subtitle}>{service.shortDescription}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Metric label="Price" value={service.startingPrice} />
          <Metric label="Duration" value={service.duration} />
          <Metric label="Status" value={service.availability} />
        </View>
        <Section title="Description"><Text style={styles.bodyText}>{service.description}</Text></Section>
        <Section title="Benefits"><BulletList items={service.benefits} /></Section>
        <Section title="Features"><BulletList items={service.features} /></Section>
        <Section title="Eligibility"><BulletList items={getEligibility(service.role)} /></Section>
        <Section title="Required documents"><BulletList items={service.documents} /></Section>
        <Section title="Process timeline">
          <View style={styles.timelineList}>
            {(service.workflowSteps?.length ? service.workflowSteps : ['Submit request', 'Operations review', 'Status update']).map((item, index) => (
              <View key={item} style={styles.timelineRow}>
                <View style={styles.timelineIndex}><Text style={styles.timelineIndexText}>{index + 1}</Text></View>
                <Text style={styles.timelineText}>{item}</Text>
              </View>
            ))}
          </View>
        </Section>
        <Section title="FAQs">
          {service.faqs.map(item => (
            <View key={item.question} style={styles.faqItem}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </Section>
        <Section title="Terms"><BulletList items={service.terms} /></Section>
        {related.length ? (
          <Section title="Related services">
            {related.map(item => (
              <Pressable key={item.key} onPress={() => navigation.replace('ServiceDetails', { serviceKey: item.key })} style={styles.relatedCard}>
                <Icon name={item.icon} size={22} color={colors.primary} />
                <View style={styles.relatedBody}>
                  <Text style={styles.relatedTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={styles.relatedText}>{item.shortDescription}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </Section>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          disabled={service.bookable === false}
          onPress={() => navigation.navigate('ServiceBooking', { serviceKey: service.key })}
          style={[styles.bookButton, service.bookable === false && styles.bookButtonDisabled]}>
          <Icon name={service.bookable === false ? 'information-outline' : 'calendar-check-outline'} size={20} color="#fff" />
          <Text style={styles.bookText}>{service.bookable === false ? 'No Protected Booking Flow' : 'Book Service'}</Text>
        </Pressable>
        {service.bookable === false ? <Text style={styles.unavailableText}>{service.unavailableReason}</Text> : null}
      </View>
    </View>
  );
}

function Header({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.simpleHeader}>
      <Pressable onPress={() => navigation.goBack()} style={styles.simpleBack}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable>
      <Text style={styles.simpleTitle}>{title}</Text>
      <View style={styles.simpleBack} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map(item => (
        <View key={item} style={styles.bulletRow}>
          <Icon name="check-circle" size={16} color={colors.green} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function getEligibility(role: string) {
  if (role === 'buyer') {
    return ['Available to buyer accounts', 'Requires an authenticated dashboard session'];
  }
  if (role === 'seller') {
    return ['Available to seller accounts', 'Requires seller dashboard access'];
  }
  return ['Available to buyer and seller accounts', 'Role-specific API permissions still apply'];
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: 112 },
  hero: { height: 330 },
  heroImage: { height: 330, width: '100%' },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.34)' },
  backButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radii.pill, height: 42, justifyContent: 'center', left: spacing.lg, position: 'absolute', top: spacing.xxl, width: 42 },
  heroBody: { bottom: spacing.xl, left: spacing.lg, position: 'absolute', right: spacing.lg },
  heroBadge: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  heroBadgeText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  title: { color: '#fff', fontSize: type.hero, fontWeight: '900', marginTop: spacing.md },
  subtitle: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 21, marginTop: spacing.xs },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: -spacing.xl },
  metric: { backgroundColor: colors.card, borderRadius: radii.md, flex: 1, minHeight: 76, padding: spacing.md, ...shadow },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: spacing.xs },
  section: { backgroundColor: colors.card, borderRadius: radii.md, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: spacing.md },
  bodyText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  bulletList: { gap: spacing.sm },
  bulletRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  bulletText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  timelineList: { gap: spacing.sm },
  timelineRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  timelineIndex: { alignItems: 'center', backgroundColor: '#fff2eb', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  timelineIndexText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  timelineText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800' },
  faqItem: { borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.md, marginBottom: spacing.md },
  faqQuestion: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  faqAnswer: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: spacing.xs },
  relatedCard: { alignItems: 'center', borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.md },
  relatedBody: { flex: 1 },
  relatedTitle: { color: colors.ink, fontWeight: '900' },
  relatedText: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  footer: { backgroundColor: colors.card, borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, left: 0, padding: spacing.lg, position: 'absolute', right: 0 },
  bookButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 52 },
  bookButtonDisabled: { backgroundColor: colors.muted },
  bookText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  unavailableText: { color: colors.muted, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: spacing.sm, textAlign: 'center' },
  simpleHeader: { alignItems: 'center', backgroundColor: colors.card, flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.xxl, paddingBottom: spacing.md },
  simpleBack: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  simpleTitle: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: '900', textAlign: 'center' },
});

export default ServiceDetailsScreen;
