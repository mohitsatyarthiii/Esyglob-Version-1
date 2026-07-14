import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { searchMarketplaceByImage } from '../api/ai';
import { uploadFiles } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';

type LocalImage = { uri: string; name: string; type: string };

export default function ImageSearchScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const launched = useRef(false);
  const [label, setLabel] = useState('Opening camera…');

  const requestCamera = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission, {
      title: 'Camera access',
      message: 'EsyGlob uses the camera to find visually similar marketplace products.',
      buttonPositive: 'Open camera',
      buttonNegative: 'Cancel',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const runSearch = useCallback(async (file: LocalImage) => {
    setLabel('Uploading image securely…');
    const uploaded = await uploadFiles('image-search', [file]);
    const cloud = uploaded.uploads?.[0] ?? uploaded.files?.[0];
    const imageUrl = cloud?.secure_url ?? cloud?.url ?? cloud?.location;
    if (!imageUrl) throw new Error('The image upload did not return a Cloudinary URL.');
    setLabel('Finding similar products…');
    const result = await searchMarketplaceByImage(imageUrl, activeRole);
    queryClient.setQueryData(['image-search-result', imageUrl, activeRole], result);
    navigation.replace('ImageSearchResults', { imageUrl });
  }, [activeRole, navigation, queryClient]);

  const openCamera = useCallback(async () => {
    try {
      setLabel('Opening camera…');
      const allowed = await requestCamera();
      if (!allowed) {
        Alert.alert('Camera permission required', 'Enable camera access in device settings to use visual search.', [
          { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const response = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false, saveToPhotos: false });
      if (response.didCancel) { navigation.goBack(); return; }
      if (response.errorCode) throw new Error(response.errorMessage ?? 'The camera could not capture an image.');
      const asset = response.assets?.[0];
      if (!asset?.uri) throw new Error('The captured image was not returned by the camera.');
      await runSearch({ uri: asset.uri, name: asset.fileName ?? `visual-search-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' });
    } catch (error) {
      Alert.alert('Visual search failed', error instanceof Error ? error.message : 'Unable to process this image.', [
        { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
        { text: 'Retry', onPress: openCamera },
      ]);
    }
  }, [navigation, requestCamera, runSearch]);

  useEffect(() => { if (!launched.current) { launched.current = true; openCamera(); } }, [openCamera]);

  return <View style={styles.screen}><View style={styles.pulse}><Icon name="image-search-outline" size={38} color="#F26A21" /></View><ActivityIndicator size="large" color="#F26A21" /><Text style={styles.title}>Visual Search</Text><Text style={styles.label}>{label}</Text></View>;
}

const styles = StyleSheet.create({ screen:{flex:1,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center',padding:30},pulse:{width:86,height:86,borderRadius:43,backgroundColor:'#FFF3E8',alignItems:'center',justifyContent:'center',marginBottom:22},title:{fontSize:20,fontWeight:'900',color:'#111827',marginTop:18},label:{fontSize:12,fontWeight:'700',color:'#64748B',marginTop:6,textAlign:'center'} });
