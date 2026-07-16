import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { pick, types } from '@react-native-documents/picker';
import {
  documentUrl,
  fetchDocuments,
  saveDocument,
  UserDocument,
} from '../api/documents';
import { uploadFiles } from '../api/marketplace';
import { ErrorState, LoadingState, EmptyState } from '../components/StateViews';

async function openDocumentUrl(url: string, preview = true) {
  try {
    const officeFile = /\.(docx?|xlsx?|pptx?)(\?|$)/i.test(url);
    const target = preview && officeFile
      ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`
      : url;
    if (!(await Linking.canOpenURL(target))) throw new Error('No compatible document viewer is installed.');
    await Linking.openURL(target);
  } catch (error) {
    Alert.alert('Unable to open document', error instanceof Error ? error.message : 'Please try again.');
  }
}
export default function DocumentationManagementScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<UserDocument | null>(null);
  const query = useQuery({ queryKey: ['documents'], queryFn: fetchDocuments });
  const upload = async (replace?: UserDocument) => {
    try {
      const [file] = await pick({
        type: [types.pdf, types.images, types.doc, types.docx],
        allowMultiSelection: false,
      });
      if (!file) return;
      setUploading(true);
      const result = await uploadFiles('user-documents', [
        {
          uri: file.uri,
          name: file.name || `document-${Date.now()}`,
          type: file.type || 'application/octet-stream',
        },
      ]);
      const item = result.uploads?.[0] ?? result.files?.[0];
      const url = item?.secure_url ?? item?.url ?? item?.location;
      if (!url) throw new Error('Upload URL was not returned.');
      await saveDocument(
        {
          name: file.name || 'Document',
          type: replace?.type || 'other',
          category: replace?.category || 'compliance',
          fileUrl: url,
          fileType: file.type || undefined,
          status: 'pending',
        },
        replace?._id,
      );
      await qc.invalidateQueries({ queryKey: ['documents'] });
    } catch (e) {
      if (e instanceof Error && !/cancel/i.test(e.message))
        Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  };
  if (query.isLoading) return <LoadingState label="Loading your documents" />;
  if (query.isError)
    return (
      <ErrorState
        message="Documents could not be loaded."
        onRetry={() => query.refetch()}
      />
    );
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} style={s.icon}>
          <Icon name="arrow-left" size={22} color="#111827" />
        </Pressable>
        <View style={s.headBody}>
          <Text style={s.title}>Documentation</Text>
          <Text style={s.subtitle}>Your private trade document library</Text>
        </View>
        <Pressable disabled={uploading} onPress={() => upload()} style={s.add}>
          <Icon name="plus" size={20} color="#fff" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {query.data?.length ? (
          query.data.map(doc => (
            <DocumentCard
              key={doc._id}
              doc={doc}
              onPreview={() => setPreview(doc)}
              onReplace={() => upload(doc)}
            />
          ))
        ) : (
          <EmptyState
            title="No documents uploaded"
            detail="Upload invoices, certificates and trade documents securely."
          />
        )}
      </ScrollView>
      <DocumentPreview document={preview} onClose={() => setPreview(null)} />
    </View>
  );
}
function DocumentCard({
  doc,
  onPreview,
  onReplace,
}: {
  doc: UserDocument;
  onPreview: () => void;
  onReplace: () => void;
}) {
  const url = documentUrl(doc.fileUrl);
  const color =
    doc.status === 'approved'
      ? '#16A34A'
      : doc.status === 'rejected'
      ? '#DC2626'
      : doc.status === 'expired'
      ? '#7C3AED'
      : '#D97706';
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.fileIcon}>
          <Icon name="file-document-outline" size={23} color="#2563EB" />
        </View>
        <View style={s.cardBody}>
          <Text style={s.name}>{doc.name || 'Trade document'}</Text>
          <Text style={s.meta}>
            {doc.type.replace(/_/g, ' ')} ·{' '}
            {doc.createdAt
              ? new Date(doc.createdAt).toLocaleDateString()
              : 'Recently uploaded'}
          </Text>
        </View>
        <View style={[s.status, { backgroundColor: `${color}18` }]}>
          <Text style={[s.statusText, { color }]}>{doc.status}</Text>
        </View>
      </View>
      <Text style={s.updated}>
        Last updated{' '}
        {doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : 'recently'}
      </Text>
      <View style={s.details}>
        <DocumentDetail label="Verification" value={doc.status} />
        <DocumentDetail
          label="Approval"
          value={doc.status === 'approved' ? 'Approved' : doc.status === 'rejected' ? 'Rejected' : 'Awaiting review'}
        />
        <DocumentDetail
          label="Expiry"
          value={doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'Not specified'}
        />
      </View>
      {doc.status === 'rejected' ? (
        <View style={s.rejection}>
          <Text style={s.rejectTitle}>Action required</Text>
          <Text style={s.rejectText}>
            {doc.rejectionReason || 'This document needs correction.'}
          </Text>
          {doc.reviewerNotes ? (
            <Text style={s.rejectText}>Reviewer: {doc.reviewerNotes}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={s.actions}>
        {url ? (
          <>
            <Pressable onPress={() => openDocumentUrl(url)} style={s.action}>
              <Icon name="eye-outline" size={16} color="#2563EB" />
              <Text style={s.actionText}>View</Text>
            </Pressable>
            <Pressable onPress={onPreview} style={s.action}>
              <Icon name="file-eye-outline" size={16} color="#2563EB" />
              <Text style={s.actionText}>Preview</Text>
            </Pressable>
            <Pressable onPress={() => openDocumentUrl(url, false)} style={s.action}>
              <Icon name="download-outline" size={16} color="#2563EB" />
              <Text style={s.actionText}>Download</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable onPress={onReplace} style={s.action}>
          <Icon name="file-replace-outline" size={16} color="#2563EB" />
          <Text style={s.actionText}>
            {doc.status === 'rejected' ? 'Re-upload' : 'Replace'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
function DocumentDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailItem}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value.replace(/_/g, ' ')}</Text>
    </View>
  );
}
function DocumentPreview({
  document,
  onClose,
}: {
  document: UserDocument | null;
  onClose: () => void;
}) {
  const url = documentUrl(document?.fileUrl);
  const isImage = Boolean(
    document?.fileType?.startsWith('image/') ||
      url?.match(/\.(png|jpe?g|webp|gif)(\?|$)/i),
  );
  return (
    <Modal visible={Boolean(document)} animationType="slide" onRequestClose={onClose}>
      <View style={s.previewScreen}>
        <View style={s.previewHeader}>
          <Pressable onPress={onClose} style={s.icon}>
            <Icon name="close" size={23} color="#111827" />
          </Pressable>
          <Text numberOfLines={1} style={s.previewTitle}>{document?.name || 'Document preview'}</Text>
          <View style={s.icon} />
        </View>
        <View style={s.previewBody}>
          {url && isImage ? (
            <Image source={{ uri: url }} resizeMode="contain" style={s.previewImage} />
          ) : (
            <View style={s.previewFallback}>
              <Icon name="file-document-outline" size={64} color="#2563EB" />
              <Text style={s.previewMessage}>Use your device document viewer to preview this file.</Text>
            </View>
          )}
          {url ? (
            <Pressable onPress={() => openDocumentUrl(url)} style={s.openButton}>
              <Icon name="open-in-new" size={18} color="#fff" />
              <Text style={s.openButtonText}>Open document</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 14,
    paddingTop: 48,
  },
  icon: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: { flex: 1 },
  title: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  subtitle: { color: '#64748B', fontSize: 10, marginTop: 2 },
  add: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 11,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { padding: 16, paddingBottom: 70 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },
  cardTop: { alignItems: 'center', flexDirection: 'row' },
  fileIcon: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 11,
    height: 43,
    justifyContent: 'center',
    width: 43,
  },
  cardBody: { flex: 1, marginLeft: 10 },
  name: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
  meta: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 3,
    textTransform: 'capitalize',
  },
  status: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  updated: { color: '#94A3B8', fontSize: 9, marginTop: 10 },
  details: { flexDirection: 'row', gap: 7, marginTop: 10 },
  detailItem: { backgroundColor: '#F8FAFC', borderRadius: 8, flex: 1, padding: 7 },
  detailLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  detailValue: { color: '#334155', fontSize: 9, fontWeight: '800', marginTop: 3, textTransform: 'capitalize' },
  rejection: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    marginTop: 10,
    padding: 10,
  },
  rejectTitle: { color: '#B91C1C', fontSize: 10, fontWeight: '900' },
  rejectText: { color: '#7F1D1D', fontSize: 10, lineHeight: 15, marginTop: 3 },
  actions: {
    borderTopColor: '#F1F5F9',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 11,
    paddingTop: 10,
  },
  action: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  actionText: { color: '#2563EB', fontSize: 10, fontWeight: '900' },
  previewScreen: { flex: 1, backgroundColor: '#F8FAFC' },
  previewHeader: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#E2E8F0', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 12, paddingTop: 48, paddingBottom: 10 },
  previewTitle: { color: '#0F172A', flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  previewBody: { flex: 1, justifyContent: 'center', padding: 20 },
  previewImage: { flex: 1, width: '100%' },
  previewFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  previewMessage: { color: '#64748B', fontSize: 13, marginTop: 14, textAlign: 'center' },
  openButton: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 12, flexDirection: 'row', gap: 7, justifyContent: 'center', padding: 14 },
  openButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
