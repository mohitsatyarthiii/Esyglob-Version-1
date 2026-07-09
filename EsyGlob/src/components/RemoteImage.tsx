import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { normalizeImageUrl } from '../utils/images';
import { logPerf, perfNow } from '../utils/performance';

type Props = {
  uri?: string | null;
  width?: number;
  height?: number;
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ImageStyle>;
  fallback?: ReactNode;
};

function RemoteImage({ uri, width, height, resizeMode = 'cover', style, fallback }: Props) {
  const normalized = useMemo(
    () => normalizeImageUrl(uri, { width, height, fit: resizeMode }),
    [height, resizeMode, uri, width],
  );
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [loadStart, setLoadStart] = useState(() => perfNow());

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setShowLoader(false);
    setLoadStart(perfNow());

    if (!normalized) {
      return undefined;
    }

    Image.prefetch(normalized).catch(() => undefined);
    const loaderTimer = setTimeout(() => setShowLoader(true), 140);

    return () => clearTimeout(loaderTimer);
  }, [normalized]);

  if (!normalized || failed) {
    return <View style={[styles.fallback, style]}>{fallback}</View>;
  }

  return (
    <View style={[styles.shell, style]}>
      {!loaded && showLoader ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      <Image
        source={{ uri: normalized, cache: 'force-cache' }}
        fadeDuration={120}
        progressiveRenderingEnabled
        onLoadEnd={() => {
          setLoaded(true);
          logPerf('image:loaded', {
            url: normalized,
            width: width ?? null,
            height: height ?? null,
            ms: Math.round(perfNow() - loadStart),
          });
        }}
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
