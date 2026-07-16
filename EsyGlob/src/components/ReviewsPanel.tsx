import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createReview, fetchReviews, respondToReview, updateReview, uploadFiles } from '../api/marketplace';
import { CurrentUser, Product, ReviewItem, SellerSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, shadow, spacing } from '../theme';
import { getId } from '../utils/format';
import RemoteImage from './RemoteImage';

type Props = {
  productId?: string;
  sellerId?: string;
  orderId?: string;
  mine?: boolean;
  sellerDashboard?: boolean;
  showForm?: boolean;
  title?: string;
  onEditRequested?: () => void;
};

type ReviewForm = {
  reviewId?: string;
  overall: number;
  quality: number;
  communication: number;
  shipping: number;
  value: number;
  title: string;
  comment: string;
  images: string[];
};

const blankForm: ReviewForm = {
  overall: 5,
  quality: 5,
  communication: 5,
  shipping: 5,
  value: 5,
  title: '',
  comment: '',
  images: [],
};

function ReviewsPanel({ productId, sellerId, orderId, mine, sellerDashboard, showForm, title = 'Ratings & Reviews', onEditRequested }: Props) {
  const { activeRole, status } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReviewForm>(blankForm);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});

  const queryKey = useMemo(
    () => ['reviews', { productId, sellerId, mine: Boolean(mine), sellerDashboard: Boolean(sellerDashboard) }],
    [mine, productId, sellerDashboard, sellerId],
  );

  const reviews = useQuery({
    queryKey,
    queryFn: () => fetchReviews({ productId, sellerId, mine, sellerDashboard, limit: sellerDashboard || mine ? 80 : 20 }),
    enabled: Boolean(productId || sellerId || mine || sellerDashboard),
  });

  const canWriteReview = status === 'authenticated' && activeRole === 'buyer' && (showForm || mine) && !sellerDashboard;
  const canRespond = status === 'authenticated' && activeRole === 'seller' && Boolean(sellerDashboard);

  const saveReview = useMutation({
    mutationFn: () => {
      const payload = {
        reviewId: form.reviewId,
        productId,
        sellerId,
        orderId,
        rating: form.overall,
        quality: form.quality,
        communication: form.communication,
        shipping: form.shipping,
        value: form.value,
        title: form.title.trim(),
        comment: form.comment.trim(),
        images: form.images,
      };
      return form.reviewId ? updateReview(payload) : createReview(payload);
    },
    onSuccess: async () => {
      setForm(blankForm);
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      await queryClient.invalidateQueries({ queryKey: ['product-details'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-details'] });
      Alert.alert('Review saved', 'Thanks for sharing your experience.');
    },
    onError: error => Alert.alert('Review unavailable', error instanceof Error ? error.message : 'Unable to save this review.'),
  });

  const reply = useMutation({
    mutationFn: ({ reviewId, comment }: { reviewId: string; comment: string }) => respondToReview(reviewId, { comment }),
    onSuccess: async (_, variables) => {
      setResponseDrafts(current => ({ ...current, [variables.reviewId]: '' }));
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: error => Alert.alert('Response unavailable', error instanceof Error ? error.message : 'Unable to reply to this review.'),
  });

  const pickImages = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: Math.max(1, 5 - form.images.length),
      quality: 0.8,
    });

    if (result.didCancel || !result.assets?.length) {
      return;
    }

    const validAssets = result.assets.filter(isValidImageAsset);
    if (validAssets.length !== result.assets.length) {
      Alert.alert('Some images were skipped', 'Review images must be JPG, PNG, or WebP and under 5MB.');
    }

    if (!validAssets.length) {
      return;
    }

    try {
      const files = validAssets.map(asset => ({
        uri: asset.uri as string,
        name: asset.fileName ?? `review-${Date.now()}.jpg`,
        type: asset.type ?? 'image/jpeg',
      }));
      const uploaded = await uploadFiles('review-images', files);
      const urls = uploaded.uploads?.map(item => item.url).filter(Boolean) as string[] | undefined;
      setForm(current => ({ ...current, images: [...current.images, ...(urls ?? [])].slice(0, 5) }));
    } catch (error) {
      Alert.alert('Image upload failed', error instanceof Error ? error.message : 'Unable to upload review images.');
    }
  };

  const editReview = (review: ReviewItem) => {
    setForm({
      reviewId: getId(review),
      overall: numberRating(review.rating?.overall, 5),
      quality: numberRating(review.rating?.quality, 5),
      communication: numberRating(review.rating?.communication, 5),
      shipping: numberRating(review.rating?.shipping, 5),
      value: numberRating(review.rating?.value, 5),
      title: review.title ?? '',
      comment: review.comment ?? '',
      images: review.images ?? [],
    });
    onEditRequested?.();
  };

  const data = reviews.data;
  const maxBreakdown = Math.max(1, ...(Object.values(data?.breakdown ?? {}) as number[]));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{data?.reviewCount ? `${data.reviewCount} verified marketplace reviews` : 'Buyer feedback and supplier responses'}</Text>
        </View>
        {reviews.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <View style={styles.summary}>
        <View style={styles.scoreBox}>
          <Text style={styles.score}>{data?.averageRating ? data.averageRating.toFixed(1) : '0.0'}</Text>
          <StarRow rating={data?.averageRating ?? 0} size={15} />
          <Text style={styles.scoreCaption}>{data?.reviewCount ?? 0} reviews</Text>
        </View>
        <View style={styles.breakdown}>
          {(['5', '4', '3', '2', '1'] as const).map(key => (
            <View key={key} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{key}</Text>
              <View style={styles.breakdownTrack}>
                <View style={[styles.breakdownFill, { width: `${((data?.breakdown?.[key] ?? 0) / maxBreakdown) * 100}%` }]} />
              </View>
              <Text style={styles.breakdownCount}>{data?.breakdown?.[key] ?? 0}</Text>
            </View>
          ))}
        </View>
      </View>

      {canWriteReview ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{form.reviewId ? 'Edit your review' : 'Write a review'}</Text>
          <RatingInput label="Overall" value={form.overall} onChange={overall => setForm(current => ({ ...current, overall }))} />
          <View style={styles.metricGrid}>
            <MetricInput label="Quality" value={form.quality} onChange={quality => setForm(current => ({ ...current, quality }))} />
            <MetricInput label="Communication" value={form.communication} onChange={communication => setForm(current => ({ ...current, communication }))} />
            <MetricInput label="Shipping" value={form.shipping} onChange={shipping => setForm(current => ({ ...current, shipping }))} />
            <MetricInput label="Value" value={form.value} onChange={value => setForm(current => ({ ...current, value }))} />
          </View>
          <TextInput
            value={form.title}
            onChangeText={nextTitle => setForm(current => ({ ...current, title: nextTitle }))}
            placeholder="Review title"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <TextInput
            value={form.comment}
            onChangeText={comment => setForm(current => ({ ...current, comment }))}
            placeholder="Share product quality, supplier communication, delivery, or service experience"
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.input, styles.textArea]}
          />
          <View style={styles.imageRow}>
            {form.images.map(uri => (
              <View key={uri} style={styles.formImageWrap}>
                <RemoteImage uri={uri} style={styles.formImage} />
                <Pressable onPress={() => setForm(current => ({ ...current, images: current.images.filter(image => image !== uri) }))} style={styles.removeImage}>
                  <Icon name="close" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
            {form.images.length < 5 ? (
              <Pressable onPress={pickImages} style={({ pressed }) => [styles.addImage, pressed && styles.pressed]}>
                <Icon name="image-plus-outline" size={20} color={colors.primaryDark} />
                <Text style={styles.addImageText}>Add</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.formActions}>
            {form.reviewId ? (
              <Pressable onPress={() => setForm(blankForm)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={saveReview.isPending || form.comment.trim().length < 3}
              onPress={() => saveReview.mutate()}
              style={({ pressed }) => [styles.submitButton, (saveReview.isPending || form.comment.trim().length < 3) && styles.disabledButton, pressed && styles.pressed]}>
              <Text style={styles.submitText}>{saveReview.isPending ? 'Saving...' : form.reviewId ? 'Update Review' : 'Submit Review'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {reviews.isLoading ? <ReviewSkeleton /> : null}
      {!reviews.isLoading && !data?.reviews?.length ? <Text style={styles.empty}>No reviews yet.</Text> : null}

      {data?.reviews?.map(review => {
        const reviewId = getId(review);
        const replyDraft = responseDrafts[reviewId] ?? '';
        return (
          <View key={reviewId} style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{reviewerName(review).slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.reviewIdentity}>
                <Text style={styles.reviewer}>{reviewerName(review)}</Text>
                <View style={styles.metaRow}>
                  <StarRow rating={review.rating?.overall ?? 0} size={13} />
                  {review.verifiedPurchase ? <Text style={styles.verified}>Verified</Text> : null}
                </View>
              </View>
              {mine && activeRole === 'buyer' ? (
                <Pressable onPress={() => editReview(review)} hitSlop={10}>
                  <Icon name="pencil-outline" size={18} color={colors.primaryDark} />
                </Pressable>
              ) : null}
            </View>
            {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
            {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
            <View style={styles.metricRow}>
              <SmallMetric label="Quality" value={review.rating?.quality} />
              <SmallMetric label="Comm." value={review.rating?.communication} />
              <SmallMetric label="Shipping" value={review.rating?.shipping} />
              <SmallMetric label="Value" value={review.rating?.value} />
            </View>
            {review.images?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewImages}>
                {review.images.map(uri => <RemoteImage key={uri} uri={uri} style={styles.reviewImage} />)}
              </ScrollView>
            ) : null}
            <ReviewTarget review={review} />
            {review.sellerResponse?.comment ? (
              <View style={styles.sellerReply}>
                <Text style={styles.replyLabel}>Supplier response</Text>
                <Text style={styles.replyText}>{review.sellerResponse.comment}</Text>
              </View>
            ) : null}
            {canRespond ? (
              <View style={styles.replyForm}>
                <TextInput
                  value={replyDraft}
                  onChangeText={comment => setResponseDrafts(current => ({ ...current, [reviewId]: comment }))}
                  placeholder="Write a professional supplier response"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={[styles.input, styles.replyInput]}
                />
                <Pressable
                  disabled={reply.isPending || replyDraft.trim().length < 2}
                  onPress={() => reply.mutate({ reviewId, comment: replyDraft.trim() })}
                  style={({ pressed }) => [styles.replyButton, (reply.isPending || replyDraft.trim().length < 2) && styles.disabledButton, pressed && styles.pressed]}>
                  <Text style={styles.replyButtonText}>Reply</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function StarRow({ rating, size }: { rating: number; size: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map(index => (
        <Icon key={index} name={rating >= index ? 'star' : rating >= index - 0.5 ? 'star-half-full' : 'star-outline'} size={size} color={colors.amber} />
      ))}
    </View>
  );
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.ratingInput}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.starInput}>
        {[1, 2, 3, 4, 5].map(next => (
          <Pressable key={next} onPress={() => onChange(next)} hitSlop={8}>
            <Icon name={value >= next ? 'star' : 'star-outline'} size={28} color={colors.amber} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MetricInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.metricInput}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricChips}>
        {[3, 4, 5].map(next => (
          <Pressable key={next} onPress={() => onChange(next)} style={[styles.metricChip, value === next && styles.metricChipActive]}>
            <Text style={[styles.metricChipText, value === next && styles.metricChipTextActive]}>{next}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SmallMetric({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.smallMetric}>
      <Text style={styles.smallMetricLabel}>{label}</Text>
      <Text style={styles.smallMetricValue}>{numberRating(value, 0).toFixed(1)}</Text>
    </View>
  );
}

function ReviewTarget({ review }: { review: ReviewItem }) {
  const product = typeof review.productId === 'object' ? review.productId as Product : null;
  const seller = typeof review.sellerId === 'object' ? review.sellerId as SellerSummary : null;
  const target = product?.name ?? product?.title ?? seller?.companyName ?? seller?.businessName ?? seller?.displayName;

  if (!target) {
    return null;
  }

  return (
    <View style={styles.targetPill}>
      <Icon name={product ? 'package-variant-closed' : 'storefront-outline'} size={13} color={colors.primaryDark} />
      <Text numberOfLines={1} style={styles.targetText}>{target}</Text>
    </View>
  );
}

function ReviewSkeleton() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

function reviewerName(review: ReviewItem) {
  const user = typeof review.userId === 'object' ? review.userId as CurrentUser : null;
  return user?.name ?? user?.fullName ?? user?.email ?? 'EsyGlob buyer';
}

function numberRating(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.min(5, Math.max(0, next)) : fallback;
}

function isValidImageAsset(asset: Asset) {
  const type = asset.type ?? '';
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return Boolean(asset.uri) && allowed.includes(type) && Number(asset.fileSize ?? 0) <= 5 * 1024 * 1024;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, marginTop: spacing.md, padding: spacing.lg, ...shadow },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  summary: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  scoreBox: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.md, justifyContent: 'center', padding: spacing.md, width: 104 },
  score: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  scoreCaption: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: spacing.xs },
  breakdown: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  breakdownRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  breakdownLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', width: 10 },
  breakdownTrack: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, flex: 1, height: 7, overflow: 'hidden' },
  breakdownFill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: '100%' },
  breakdownCount: { color: colors.muted, fontSize: 11, fontWeight: '900', textAlign: 'right', width: 18 },
  form: { backgroundColor: colors.cardMuted, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.md },
  formTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginBottom: spacing.sm },
  ratingInput: { gap: spacing.sm, marginBottom: spacing.md },
  ratingLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  starInput: { flexDirection: 'row', gap: spacing.xs },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricInput: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.sm, width: '48%' },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  metricChips: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  metricChip: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 26, justifyContent: 'center', width: 26 },
  metricChipActive: { backgroundColor: colors.primary },
  metricChipText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  metricChipTextActive: { color: '#fff' },
  input: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: spacing.md, padding: spacing.md },
  textArea: { minHeight: 104, textAlignVertical: 'top' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  formImageWrap: { height: 62, width: 62 },
  formImage: { borderRadius: radii.md, height: 62, width: 62 },
  removeImage: { alignItems: 'center', backgroundColor: colors.rose, borderRadius: radii.pill, height: 20, justifyContent: 'center', position: 'absolute', right: -6, top: -6, width: 20 },
  addImage: { alignItems: 'center', backgroundColor: '#fff8f3', borderColor: '#fed7aa', borderRadius: radii.md, borderWidth: 1, height: 62, justifyContent: 'center', width: 62 },
  addImageText: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' },
  formActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md },
  cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  submitButton: { backgroundColor: colors.primary, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: spacing.lg },
  reviewCard: { borderTopColor: colors.faint, borderTopWidth: 1, marginTop: spacing.lg, paddingTop: spacing.lg },
  reviewTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: { alignItems: 'center', backgroundColor: '#eaf7f7', borderRadius: radii.pill, height: 38, justifyContent: 'center', width: 38 },
  avatarText: { color: colors.secondary, fontSize: 14, fontWeight: '900' },
  reviewIdentity: { flex: 1 },
  reviewer: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  stars: { alignItems: 'center', flexDirection: 'row' },
  verified: { backgroundColor: '#ecfdf5', borderRadius: radii.pill, color: colors.green, fontSize: 10, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  reviewTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: spacing.md },
  comment: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: spacing.xs },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  smallMetric: { backgroundColor: colors.cardMuted, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  smallMetricLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  smallMetricValue: { color: colors.ink, fontSize: 12, fontWeight: '900', marginTop: 1 },
  reviewImages: { gap: spacing.sm, paddingTop: spacing.md },
  reviewImage: { borderRadius: radii.md, height: 78, width: 78 },
  targetPill: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#fff8f3', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, maxWidth: '100%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  targetText: { color: colors.primaryDark, flexShrink: 1, fontSize: 11, fontWeight: '900' },
  sellerReply: { backgroundColor: '#f8fafc', borderLeftColor: colors.primary, borderLeftWidth: 3, borderRadius: radii.md, marginTop: spacing.md, padding: spacing.md },
  replyLabel: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  replyText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: spacing.xs },
  replyForm: { marginTop: spacing.md },
  replyInput: { minHeight: 78, textAlignVertical: 'top' },
  replyButton: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderRadius: radii.pill, marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  replyButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  skeleton: { backgroundColor: colors.cardMuted, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md },
  skeletonLineWide: { backgroundColor: colors.faint, borderRadius: radii.pill, height: 12, width: '82%' },
  skeletonLine: { backgroundColor: colors.faint, borderRadius: radii.pill, height: 12, width: '64%' },
  skeletonLineShort: { backgroundColor: colors.faint, borderRadius: radii.pill, height: 12, width: '40%' },
});

export default React.memo(ReviewsPanel);
