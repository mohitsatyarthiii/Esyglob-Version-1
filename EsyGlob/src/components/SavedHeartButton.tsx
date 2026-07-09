import React, { useMemo } from 'react';
import { Alert, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSavedItems, toggleSavedItem } from '../api/account';
import { Product, SavedItem, SavedItemType, SellerSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { colors, radii } from '../theme';
import { getStableKey } from '../utils/format';

type Target = Product | SellerSummary;

type Props = {
  type: SavedItemType;
  itemId: string;
  target?: Target;
  size?: number;
  style?: StyleProp<ViewStyle>;
  iconColor?: string;
  savedColor?: string;
};

const savedItemsKey = ['saved-items'];

function SavedHeartButton({
  type,
  itemId,
  target,
  size = 18,
  style,
  iconColor = colors.muted,
  savedColor = colors.rose,
}: Props) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const savedItems = useQuery({
    queryKey: savedItemsKey,
    queryFn: () => fetchSavedItems(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
  const inlineSaved = Boolean((target as { isSaved?: boolean; isFavorited?: boolean } | undefined)?.isSaved || (target as { isSaved?: boolean; isFavorited?: boolean } | undefined)?.isFavorited);
  const isSaved = useMemo(
    () => inlineSaved || (savedItems.data ?? []).some(item => normalizeSavedItemType(item) === type && normalizeSavedItemId(item) === itemId),
    [inlineSaved, itemId, savedItems.data, type],
  );
  const mutation = useMutation({
    mutationFn: () => toggleSavedItem({ type, itemId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: savedItemsKey });
      const previous = queryClient.getQueryData<SavedItem[]>(savedItemsKey) ?? [];
      queryClient.setQueryData<SavedItem[]>(savedItemsKey, toggleSavedItemsCache(previous, type, itemId, target, !isSaved));
      return { previous };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(savedItemsKey, context?.previous ?? []);
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to update saved items.');
    },
    onSuccess: result => {
      queryClient.setQueryData<SavedItem[]>(savedItemsKey, current => reconcileSavedItems(current ?? [], type, itemId, target, Boolean(result.saved), result.item));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: savedItemsKey });
    },
  });

  const onPress = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();

    if (status !== 'authenticated') {
      navigation.navigate('Auth', { initialMode: 'login' });
      return;
    }

    if (!itemId || mutation.isPending) {
      return;
    }

    mutation.mutate();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isSaved ? 'Remove from saved items' : 'Save item'}
      disabled={mutation.isPending || !itemId}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed, mutation.isPending && styles.disabled]}>
      <Icon name={isSaved ? 'heart' : 'heart-outline'} size={size} color={isSaved ? savedColor : iconColor} />
    </Pressable>
  );
}

function normalizeSavedItemType(item: SavedItem) {
  return item.type;
}

function normalizeSavedItemId(item: SavedItem) {
  const target = item.target ?? item.item ?? item.product ?? item.seller;
  return item.itemId ?? (target ? getStableKey(target) : undefined);
}

function toggleSavedItemsCache(items: SavedItem[], type: SavedItemType, itemId: string, target: Target | undefined, nextSaved: boolean) {
  return reconcileSavedItems(items, type, itemId, target, nextSaved);
}

function reconcileSavedItems(
  items: SavedItem[],
  type: SavedItemType,
  itemId: string,
  target: Target | undefined,
  nextSaved: boolean,
  serverItem?: SavedItem,
) {
  const withoutItem = items.filter(item => !(normalizeSavedItemType(item) === type && normalizeSavedItemId(item) === itemId));

  if (!nextSaved) {
    return withoutItem;
  }

  return [
    serverItem ?? {
      id: `optimistic-${type}-${itemId}`,
      type,
      itemId,
      target,
      product: type === 'product' ? target as Product : undefined,
      seller: type === 'seller' ? target as SellerSummary : undefined,
      createdAt: new Date().toISOString(),
    },
    ...withoutItem,
  ];
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: colors.faint,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.92 }],
  },
});

export default React.memo(SavedHeartButton);
