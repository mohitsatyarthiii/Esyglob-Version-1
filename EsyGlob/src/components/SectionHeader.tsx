import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, type } from '../theme';

type Props = {
  title: string;
  action?: string;
  onAction?: () => void;
};

function SectionHeader({ title, action, onAction }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Pressable disabled={!onAction} onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{action}</Text>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '800',
  },
  action: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  actionText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default React.memo(SectionHeader);
