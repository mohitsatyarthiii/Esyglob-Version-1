import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const P = {
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryDark: '#E05500',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  cardMuted: '#F8F9FB',
  danger: '#DC2626',
};

type Attachment = {
  uri: string;
  name: string;
  type: string;
};

type Props = {
  visible: boolean;
  productName: string;
  defaultQuantity: string;
  defaultUnit: string;
  pending: boolean;
  quantity: string;
  targetPrice: string;
  destinationCountry: string;
  additionalNotes: string;
  customSpecifications: string;
  packagingRequirements: string;
  deliveryRequirements: string;
  attachments: Attachment[];
  onQuantityChange: (v: string) => void;
  onTargetPriceChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSpecificationsChange: (v: string) => void;
  onPackagingChange: (v: string) => void;
  onDeliveryChange: (v: string) => void;
  onAttachmentsChange: (files: Attachment[]) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function EnquiryModal({
  visible,
  productName,
  defaultQuantity,
  defaultUnit,
  pending,
  quantity,
  targetPrice,
  destinationCountry,
  additionalNotes,
  customSpecifications,
  packagingRequirements,
  deliveryRequirements,
  attachments,
  onQuantityChange,
  onTargetPriceChange,
  onDestinationChange,
  onNotesChange,
  onSpecificationsChange,
  onPackagingChange,
  onDeliveryChange,
  onAttachmentsChange,
  onClose,
  onSubmit,
}: Props) {
  const pickFiles = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: Math.max(1, 5 - attachments.length),
        quality: 0.8,
      });

      const files: Attachment[] = (result.assets ?? [])
        .filter(a => a.uri)
        .map(a => ({
          uri: a.uri ?? '',
          name: a.fileName ?? `file-${Date.now()}`,
          type: a.type ?? 'image/jpeg',
        }));

      if (files.length > 0) {
        onAttachmentsChange([...attachments, ...files]);
      }
    } catch {
      Alert.alert('Error', 'Unable to pick files.');
    }
  };

  const removeFile = (index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  const canSubmit = destinationCountry.trim().length > 0 && !pending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Send Enquiry</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={P.ink} />
            </Pressable>
          </View>

          <Text style={styles.productName} numberOfLines={1}>
            {productName}
          </Text>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Quantity & Unit */}
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Quantity *</Text>
                <TextInput
                  value={quantity || defaultQuantity}
                  onChangeText={onQuantityChange}
                  keyboardType="numeric"
                  placeholder={defaultQuantity}
                  placeholderTextColor={P.muted}
                  style={styles.input}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Unit</Text>
                <TextInput
                  value={defaultUnit}
                  editable={false}
                  style={[styles.input, styles.inputDisabled]}
                />
              </View>
            </View>

            {/* Target Price */}
            <Text style={styles.label}>Target Price (optional)</Text>
            <TextInput
              value={targetPrice}
              onChangeText={onTargetPriceChange}
              keyboardType="numeric"
              placeholder="Enter target price per unit"
              placeholderTextColor={P.muted}
              style={styles.input}
            />

            {/* Destination */}
            <Text style={styles.label}>Destination Country *</Text>
            <TextInput
              value={destinationCountry}
              onChangeText={onDestinationChange}
              placeholder="e.g. India"
              placeholderTextColor={P.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Product Specifications</Text>
            <TextInput value={customSpecifications} onChangeText={onSpecificationsChange} multiline
              placeholder="Material, size, color, standards, customization..." placeholderTextColor={P.muted}
              style={[styles.input, styles.textarea]} />

            <Text style={styles.label}>Packaging Requirements</Text>
            <TextInput value={packagingRequirements} onChangeText={onPackagingChange} multiline
              placeholder="Packaging type, labeling, carton requirements..." placeholderTextColor={P.muted}
              style={[styles.input, styles.textarea]} />

            <Text style={styles.label}>Delivery Requirements</Text>
            <TextInput value={deliveryRequirements} onChangeText={onDeliveryChange} multiline
              placeholder="Required date, port, shipping terms..." placeholderTextColor={P.muted}
              style={[styles.input, styles.textarea]} />

            {/* Notes */}
            <Text style={styles.label}>Additional Notes</Text>
            <TextInput
              value={additionalNotes}
              onChangeText={onNotesChange}
              multiline
              placeholder="Any special requirements, timeline, quality standards..."
              placeholderTextColor={P.muted}
              style={[styles.input, styles.textarea]}
            />

            {/* Attachments */}
            <Text style={styles.label}>
              Attachments ({attachments.length}/5)
            </Text>

            {attachments.length > 0 && (
              <View style={styles.attachmentList}>
                {attachments.map((file, i) => (
                  <View key={i} style={styles.attachmentItem}>
                    {file.type?.startsWith('image') ? (
                      <Image source={{ uri: file.uri }} style={styles.thumb} />
                    ) : (
                      <View style={styles.fileIcon}>
                        <Icon name="file-document" size={24} color={P.primary} />
                      </View>
                    )}
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Pressable onPress={() => removeFile(i)} style={styles.removeBtn}>
                      <Icon name="close-circle" size={18} color={P.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable onPress={pickFiles} style={styles.addFileBtn}>
              <Icon name="paperclip" size={16} color={P.primary} />
              <Text style={styles.addFileText}>
                {attachments.length > 0 ? 'Add More Files' : 'Attach Files (Optional)'}
              </Text>
            </Pressable>

            {/* Submit */}
            <Pressable
              disabled={!canSubmit}
              onPress={onSubmit}
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}>
              {pending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Icon name="send" size={18} color="#FFF" />
                  <Text style={styles.submitBtnText}>Submit Enquiry</Text>
                </>
              )}
            </Pressable>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: P.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: P.faint, alignSelf: 'center', marginTop: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: P.ink },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: P.cardMuted, alignItems: 'center', justifyContent: 'center',
  },
  productName: {
    fontSize: 13, color: P.muted, paddingHorizontal: 16, marginBottom: 12,
  },
  scroll: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  label: {
    fontSize: 11, fontWeight: '700', color: P.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 10,
  },
  input: {
    backgroundColor: P.cardMuted, borderRadius: 10, paddingHorizontal: 14,
    height: 44, fontSize: 14, fontWeight: '600', color: P.ink,
    borderWidth: 1, borderColor: P.faint,
  },
  inputDisabled: { opacity: 0.6 },
  textarea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  bottomSpacer: { height: 30 },

  // Attachments
  attachmentList: { gap: 8, marginBottom: 8 },
  attachmentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: P.cardMuted, borderRadius: 8, padding: 8,
  },
  thumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: P.faint },
  fileIcon: {
    width: 40, height: 40, borderRadius: 6,
    backgroundColor: '#FFF3E8', alignItems: 'center', justifyContent: 'center',
  },
  fileName: { flex: 1, fontSize: 12, fontWeight: '500', color: P.text },
  removeBtn: { padding: 4 },
  addFileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 12, borderRadius: 10,
    backgroundColor: '#FFF3E8', borderWidth: 1, borderColor: P.primary + '30',
    borderStyle: 'dashed', marginTop: 8,
  },
  addFileText: { fontSize: 12, fontWeight: '600', color: P.primary },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: P.primary, borderRadius: 12, height: 48, marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
