import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchFactoryProfile, saveFactoryProfile, uploadFiles } from '../api/marketplace';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { Header, Card, Field, Chip } from './SellerOnboardingScreen';

function SellerFactoryScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const factory = useQuery({ queryKey: ['seller-factory'], queryFn: fetchFactoryProfile });
  const [form, setForm] = useState({
    factoryName: '',
    factorySize: '',
    employeeCount: '',
    productionCapacity: '',
    automationLevel: '',
    qualityControl: '',
    certifications: '',
    street: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    capabilities: [] as string[],
    images: [] as string[],
  });
  const save = useMutation({
    mutationFn: () => saveFactoryProfile({
      factoryName: form.factoryName,
      factorySize: form.factorySize,
      employeeCount: form.employeeCount,
      manufacturingInformation: { automationLevel: form.automationLevel },
      productionCapacity: form.productionCapacity,
      qualityControl: form.qualityControl,
      certifications: form.certifications.split(',').map(item => item.trim()).filter(Boolean),
      address: { street: form.street, city: form.city, state: form.state, country: form.country, pincode: form.pincode },
      capabilities: form.capabilities,
      images: form.images,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-factory'] });
      Alert.alert('Factory saved', 'Factory profile was submitted for verification.');
      navigation.goBack();
    },
    onError: error => Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save factory profile.'),
  });

  useEffect(() => {
    const profile = factory.data?.factoryProfile as Record<string, any> | null | undefined;
    if (!profile) return;
    setForm(value => ({
      ...value,
      factoryName: profile.factoryName ?? '',
      factorySize: profile.factorySize ?? '',
      employeeCount: String(profile.employeeCount ?? ''),
      productionCapacity: profile.productionCapacity ?? '',
      automationLevel: profile.manufacturingInformation?.automationLevel ?? profile.automationLevel ?? '',
      qualityControl: profile.qualityControl ?? '',
      certifications: Array.isArray(profile.certifications) ? profile.certifications.join(', ') : profile.certifications ?? '',
      street: profile.address?.street ?? '',
      city: profile.address?.city ?? '',
      state: profile.address?.state ?? '',
      country: profile.address?.country ?? 'India',
      pincode: profile.address?.pincode ?? '',
      capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : [],
      images: Array.isArray(profile.images) ? profile.images : [],
    }));
  }, [factory.data?.factoryProfile]);

  if (factory.isLoading) return <LoadingState label="Loading factory profile" />;
  if (factory.isError) return <ErrorState message={(factory.error as Error).message} onRetry={() => factory.refetch()} />;

  const addImages = async () => {
    const response = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: Math.max(1, 8 - form.images.length) });
    const files = (response.assets ?? []).filter(asset => asset.uri).map(asset => ({ uri: asset.uri as string, name: asset.fileName ?? `factory-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' }));
    if (!files.length) return;
    const uploaded = await uploadFiles('factory', files);
    setForm({ ...form, images: [...form.images, ...((uploaded.uploads ?? []).map(item => item.url).filter(Boolean) as string[])] });
  };

  const toggleCapability = (capability: string) => {
    setForm({
      ...form,
      capabilities: form.capabilities.includes(capability)
        ? form.capabilities.filter(item => item !== capability)
        : [...form.capabilities, capability],
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Factory Profile" onBack={() => navigation.goBack()} />
      <Card title="Factory Details">
        <Field label="Factory Name" value={form.factoryName} onChangeText={factoryName => setForm({ ...form, factoryName })} />
        <Field label="Factory Size" value={form.factorySize} onChangeText={factorySize => setForm({ ...form, factorySize })} />
        <Field label="Employee Count" value={form.employeeCount} onChangeText={employeeCount => setForm({ ...form, employeeCount })} keyboardType="numeric" />
      </Card>
      <Card title="Manufacturing Information">
        <Field label="Production Capacity" value={form.productionCapacity} onChangeText={productionCapacity => setForm({ ...form, productionCapacity })} />
        <Field label="Automation Level" value={form.automationLevel} onChangeText={automationLevel => setForm({ ...form, automationLevel })} />
        <Field label="Quality Control" value={form.qualityControl} onChangeText={qualityControl => setForm({ ...form, qualityControl })} multiline />
        <Field label="Certifications" value={form.certifications} onChangeText={certifications => setForm({ ...form, certifications })} placeholder="ISO 9001, CE" />
      </Card>
      <Card title="Capabilities">
        <View style={styles.chips}>{['OEM', 'ODM', 'Custom Packaging', 'Private Label', 'Export Ready', 'Quality Testing'].map(item => <Chip key={item} label={item} active={form.capabilities.includes(item)} onPress={() => toggleCapability(item)} />)}</View>
      </Card>
      <Card title="Factory Address">
        <Field label="Street" value={form.street} onChangeText={street => setForm({ ...form, street })} />
        <Field label="City" value={form.city} onChangeText={city => setForm({ ...form, city })} />
        <Field label="State" value={form.state} onChangeText={state => setForm({ ...form, state })} />
        <Field label="Country" value={form.country} onChangeText={country => setForm({ ...form, country })} />
        <Field label="Pincode" value={form.pincode} onChangeText={pincode => setForm({ ...form, pincode })} />
      </Card>
      <Card title="Factory Images">
        <View style={styles.images}>
          {form.images.map(uri => <RemoteImage key={uri} uri={uri} width={180} height={180} style={styles.image} />)}
          <Pressable onPress={addImages} style={styles.addImage}><Icon name="image-plus" size={24} color={colors.primary} /><Text style={styles.addImageText}>Add images</Text></Pressable>
        </View>
      </Card>
      <Pressable onPress={() => save.mutate()} style={styles.primary}><Text style={styles.primaryText}>Save Factory Profile</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  image: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 86, width: 86 },
  addImage: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 86, justifyContent: 'center', width: 86 },
  addImageText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900', marginTop: spacing.xs },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, padding: spacing.md },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});

export default SellerFactoryScreen;
