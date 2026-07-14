import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAggregatedServiceActivity,
  getServiceByKey,
  getServicesForRole,
} from '../api/services';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { RootStackParamList } from '../../App';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function ServiceDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceDetails'>>();
  const { activeRole } = useAuth();

  const service = getServiceByKey(route.params.serviceKey);
  const related = getServicesForRole(activeRole)
    .filter(item => item.key !== service?.key && item.category === service?.category)
    .slice(0, 3);

  const activity = useQuery({
    queryKey: ['service-activity', activeRole],
    queryFn: () => fetchAggregatedServiceActivity(activeRole),
    staleTime: 30_000,
  });

  const serviceActivity = (activity.data ?? []).filter(item =>
    [item.serviceKey, item.originalServiceKey].includes(service?.key)
  );

  if (!service) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.simpleHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
            <Icon name="arrow-left" size={22} color="#1a1a1a" />
          </Pressable>
          <Text style={styles.headerTitle}>Service Details</Text>
          <View style={styles.headerBackBtn} />
        </View>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color="#94a3b8" />
          <Text style={styles.errorText}>Service not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Image */}
        <View style={styles.heroSection}>
          <RemoteImage
            uri={service.image}
            width={SCREEN_WIDTH}
            height={260}
            style={styles.heroImage}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent']}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.heroOverlay}
          />

          {/* Back Button */}
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>

          {/* Status Badge */}
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{service.status}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          {/* Title & Price Row */}
          <View style={styles.titleRow}>
            <View style={styles.titleSection}>
              <Text style={styles.serviceTitle}>{service.title}</Text>
              <View style={styles.categoryRow}>
                <Icon name="folder-outline" size={14} color="#64748b" />
                <Text style={styles.categoryText}>{service.category}</Text>
              </View>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Starting at</Text>
              <Text style={styles.priceValue}>{service.startingPrice}</Text>
            </View>
          </View>

          {/* Quick Info Chips */}
          <View style={styles.infoChips}>
            <View style={styles.chip}>
              <Icon name="clock-outline" size={14} color="#6366f1" />
              <Text style={styles.chipText}>{service.duration}</Text>
            </View>
            <View style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: getAvailabilityColor(service.availability) }]} />
              <Text style={styles.chipText}>{service.availability}</Text>
            </View>
            <View style={styles.chip}>
              <Icon name="account-group-outline" size={14} color="#6366f1" />
              <Text style={styles.chipText}>{service.role === 'both' ? 'Buyer & Seller' : service.role}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{service.description}</Text>
          </View>

          {/* Key Highlights */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Why Choose This</Text>
            <View style={styles.benefitsList}>
              {service.benefits.map(benefit => (
                <View key={benefit} style={styles.benefitItem}>
                  <Icon name="check-circle" size={18} color="#10b981" />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Features */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>What's Included</Text>
            <View style={styles.featuresWrap}>
              {service.features.map(feature => (
                <View key={feature} style={styles.featureTag}>
                  <Text style={styles.featureTagText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Active Orders */}
          {serviceActivity.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Your Orders</Text>
                <Pressable onPress={() => navigation.navigate('BookedServiceDetails', { mode: 'list' })}>
                  <Text style={styles.viewAllLink}>View all →</Text>
                </Pressable>
              </View>
              {serviceActivity.slice(0, 3).map((request, index) => (
                <Pressable
                  key={String(request._id ?? request.id ?? request.requestNumber)}
                  onPress={() => navigation.navigate('BookedServiceDetails', { request })}
                  style={[styles.orderItem, index > 0 && styles.orderItemBorder]}
                >
                  <View style={styles.orderLeft}>
                    <Text numberOfLines={1} style={styles.orderTitle}>
                      {request.serviceTitle ?? service.title}
                    </Text>
                    <Text style={styles.orderId}>
                      #{String(request.requestNumber ?? request._id ?? '').slice(0, 8)}
                    </Text>
                  </View>
                  <View style={styles.orderStatus}>
                    <Text style={styles.orderStatusText}>
                      {String(request.status ?? 'pending').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color="#94a3b8" />
                </Pressable>
              ))}
            </View>
          )}

          {/* Documents Required */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Documents Needed</Text>
            {service.documents.map((doc, index) => (
              <View key={doc} style={[styles.docRow, index > 0 && styles.docRowBorder]}>
                <Icon name="file-text-outline" size={18} color="#6366f1" />
                <Text style={styles.docText}>{doc}</Text>
              </View>
            ))}
          </View>

          {/* Process */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            {(service.workflowSteps?.length
              ? service.workflowSteps
              : ['Submit request', 'Review & processing', 'Get results']
            ).map((step, index) => (
              <View key={step} style={styles.processStep}>
                <View style={styles.processNumber}>
                  <Text style={styles.processNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.processContent}>
                  <Text style={styles.processTitle}>Step {index + 1}</Text>
                  <Text style={styles.processDesc}>{step}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* FAQ */}
          {service.faqs.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>FAQ</Text>
              {service.faqs.map((faq, index) => (
                <View key={faq.question} style={[styles.faqBlock, index > 0 && styles.faqBlockBorder]}>
                  <Text style={styles.faqQ}>Q: {faq.question}</Text>
                  <Text style={styles.faqA}>A: {faq.answer}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Related Services */}
          {related.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Related Services</Text>
              {related.map(item => (
                <Pressable
                  key={item.key}
                  onPress={() => navigation.replace('ServiceDetails', { serviceKey: item.key })}
                  style={styles.relatedItem}
                >
                  <View style={styles.relatedIconBox}>
                    <Icon name={item.icon} size={22} color="#6366f1" />
                  </View>
                  <View style={styles.relatedInfo}>
                    <Text style={styles.relatedName}>{item.title}</Text>
                    <Text style={styles.relatedDesc} numberOfLines={2}>{item.shortDescription}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color="#94a3b8" />
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPrice}>
          <Text style={styles.bottomPriceLabel}>Price</Text>
          <Text style={styles.bottomPriceValue}>{service.startingPrice}</Text>
        </View>
        <Pressable
          disabled={service.bookable === false}
          onPress={() => navigation.navigate('ServiceBooking', { serviceKey: service.key })}
          style={({ pressed }) => [
            styles.bookBtn,
            service.bookable === false && styles.bookBtnDisabled,
            pressed && styles.bookBtnPressed,
          ]}
        >
          <Text style={styles.bookBtnText}>
            {service.bookable === false ? 'Unavailable' : 'Book Now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Helpers
const getAvailabilityColor = (availability: string): string => {
  const map: Record<string, string> = {
    Available: '#10b981',
    Limited: '#f59e0b',
    'Invite only': '#ef4444',
  };
  return map[availability] || '#94a3b8';
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Hero
  heroSection: {
    height: 260,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  backBtn: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 20,
  },

  // Content
  contentContainer: {
    paddingHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },

  // Title Row
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  titleSection: {
    flex: 1,
    marginRight: 12,
  },
  serviceTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
    lineHeight: 26,
    marginBottom: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366f1',
  },

  // Info Chips
  infoChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  viewAllLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 12,
  },

  // Description
  descriptionText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 21,
  },

  // Benefits
  benefitsList: {
    gap: 10,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 20,
  },

  // Features
  featuresWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  featureTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },

  // Orders
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  orderItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  orderLeft: {
    flex: 1,
  },
  orderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  orderId: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
  },
  orderStatus: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366f1',
    textTransform: 'capitalize',
  },

  // Documents
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  docRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  docText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },

  // Process
  processStep: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  processNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  processNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  processContent: {
    flex: 1,
  },
  processTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  processDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 19,
  },

  // FAQ
  faqBlock: {
    paddingVertical: 12,
  },
  faqBlockBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  faqQ: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    lineHeight: 19,
  },
  faqA: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 19,
  },

  // Related
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  relatedIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedInfo: {
    flex: 1,
  },
  relatedName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  relatedDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 17,
  },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 30,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
  },
  bottomPrice: {
    flex: 1,
  },
  bottomPriceLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  bottomPriceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  bookBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bookBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  bookBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
  },
  bookBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Simple Header (for error state)
  simpleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#94a3b8',
  },
});

export default ServiceDetailsScreen;
