import React, { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { normalizeImageUrl } from '../utils/images';

type Props = {
  uri?: string | null;
  width?: number;
  height?: number;
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ImageStyle>;
  fallback?: ReactNode;
};

function RemoteImage({ uri, width, height, resizeMode = 'cover', style, fallback }: Props) {
  const normalized = normalizeImageUrl(uri, { width, height, fit: resizeMode });
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [normalized]);

  if (!normalized || failed) {
    return <View style={[styles.fallback, style]}>{fallback}</View>;
  }

  return (
    <View style={[styles.shell, style]}>
      {!loaded ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      <Image
        source={{ uri: normalized }}
        onLoadEnd={() => setLoaded(true)}
        onError={() => setFailed(true)}
        resizeMode={resizeMode}
        style={[StyleSheet.absoluteFill, styles.image]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
});

export default React.memo(RemoteImage);
