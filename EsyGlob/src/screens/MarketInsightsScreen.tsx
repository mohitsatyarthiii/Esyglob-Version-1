import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { generateMarketInsight, MarketInsightReport } from '../api/ai';
import { readJson, writeJson } from '../storage/appStorage';
import { colors, radii, spacing } from '../theme';

const REPORT_KEY = 'market-insights.saved';
const reportTypes = [
  ['product', 'Product Report', 'package-variant-closed'],
  ['country', 'Country Report', 'earth'],
  ['opportunity', 'Opportunity Finder', 'target'],
] as const;

function MarketInsightsScreen() {
  const navigation = useNavigation<any>();
  const [reportType, setReportType] = useState<'product' | 'country' | 'opportunity'>('product');
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [saved, setSaved] = useState<MarketInsightReport[]>(() => readJson<MarketInsightReport[]>(REPORT_KEY) ?? []);
  const [report, setReport] = useState<MarketInsightReport | null>(null);
  const mutation = useMutation({
    mutationFn: () => generateMarketInsight({ reportType, product, country, category, timeframe: '12m' }),
    onSuccess: setReport,
    onError: error => Alert.alert('Report unavailable', error instanceof Error ? error.message : 'Unable to generate market insight.'),
  });
  const sourceChips = useMemo(() => report?.sources?.length ? report.sources : ['Marketplace DB', 'World Bank', 'Exchange rates'], [report]);

  const saveReport = () => {
    if (!report) return;
    const next = [{ ...report, generatedAt: new Date().toISOString() }, ...saved].slice(0, 12);
    setSaved(next);
    writeJson(REPORT_KEY, next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable>
        <Text style={styles.title}>Market Insights</Text>
        <Pressable onPress={() => report ? saveReport() : undefined} style={styles.iconButton}><Icon name="content-save-outline" size={22} color={report ? colors.primary : colors.muted} /></Pressable>
      </View>
      <View style={styles.typeRow}>
        {reportTypes.map(([id, label, icon]) => (
          <Pressable key={id} onPress={() => setReportType(id)} style={[styles.typeCard, reportType === id && styles.typeCardActive]}>
            <Icon name={icon} size={23} color={reportType === id ? '#fff' : colors.primary} />
            <Text style={[styles.typeText, reportType === id && styles.typeTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterCard}>
        <TextInput value={product} onChangeText={setProduct} placeholder="Product or HS/category keyword" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={country} onChangeText={setCountry} placeholder="Country or market" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={category} onChangeText={setCategory} placeholder="Category filter" placeholderTextColor={colors.muted} style={styles.input} />
        <Pressable onPress={() => mutation.mutate()} disabled={mutation.isPending} style={[styles.generate, mutation.isPending && styles.disabled]}>
          <Icon name="chart-line" size={19} color="#fff" />
          <Text style={styles.generateText}>{mutation.isPending ? 'Generating report...' : 'Generate Insight'}</Text>
        </Pressable>
      </View>
      {mutation.isPending ? <SkeletonReport /> : null}
      {report ? (
        <View>
          <View style={styles.reportHero}>
            <Text style={styles.reportTitle}>{report.title ?? `${reportType} market report`}</Text>
            <Text style={styles.summary}>{report.summary ?? 'Structured market report generated from the documented insights endpoint.'}</Text>
            <View style={styles.sourceRow}>{sourceChips.map(source => <Text key={source} style={styles.sourceChip}>{source}</Text>)}</View>
          </View>
          {report.charts?.map((chart, index) => <ChartCard key={`${chart.title}-${index}`} title={chart.title ?? 'Market chart'} data={chart.data ?? []} />)}
          {report.sections?.map((section, index) => (
            <View key={`${section.title}-${index}`} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title ?? 'Insight'}</Text>
              {section.content ? <Text style={styles.sectionText}>{section.content}</Text> : null}
              {section.bullets?.map(item => <Bullet key={item} text={item} />)}
            </View>
          ))}
          {report.tables?.map((table, index) => (
            <View key={`${table.title}-${index}`} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{table.title ?? 'Data table'}</Text>
              {(table.rows ?? []).slice(0, 6).map((row, rowIndex) => <Text key={rowIndex} style={styles.tableRow}>{Object.entries(row).map(([key, value]) => `${key}: ${String(value)}`).join('  |  ')}</Text>)}
            </View>
          ))}
          <View style={styles.actionRow}>
            <Action icon="share-variant-outline" label="Share" />
            <Action icon="printer-outline" label="Print" />
            <Action icon="file-pdf-box" label="Save PDF" />
          </View>
        </View>
      ) : null}
      {saved.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Saved reports</Text>
          {saved.map((item, index) => (
            <Pressable key={`${item.title}-${index}`} onPress={() => setReport(item)} style={styles.savedRow}>
              <Icon name="file-chart-outline" size={19} color={colors.primary} />
              <Text numberOfLines={1} style={styles.savedText}>{item.title ?? 'Saved market report'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SkeletonReport() {
  return <View style={styles.skeleton}>{[0, 1, 2].map(item => <View key={item} style={styles.skeletonLine} />)}</View>;
}

function ChartCard({ title, data }: { title: string; data: Array<{ label?: string; value?: string | number }> }) {
  const max = Math.max(...data.map(item => Number(item.value) || 0), 1);
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.slice(0, 6).map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.barRow}>
          <Text numberOfLines={1} style={styles.barLabel}>{item.label ?? `Item ${index + 1}`}</Text>
          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max((Number(item.value) || 0) / max * 100, 8)}%` }]} /></View>
          <Text style={styles.barValue}>{String(item.value ?? '-')}</Text>
        </View>
      ))}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Icon name="check-circle-outline" size={16} color={colors.green} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function Action({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.action}>
      <Icon name={icon} size={20} color={colors.primaryDark} />
      <Text style={styles.actionText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  header: { alignItems: 'center', flexDirection: 'row', paddingTop: spacing.xxl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  title: { color: colors.ink, flex: 1, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  typeCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flex: 1, minHeight: 84, justifyContent: 'center', padding: spacing.sm },
  typeCardActive: { backgroundColor: colors.primary },
  typeText: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: spacing.xs, textAlign: 'center' },
  typeTextActive: { color: '#fff' },
  filterCard: { backgroundColor: colors.card, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.lg, padding: spacing.lg },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontWeight: '800', minHeight: 46, paddingHorizontal: spacing.md },
  generate: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48 },
  disabled: { opacity: 0.6 },
  generateText: { color: '#fff', fontWeight: '900' },
  skeleton: { backgroundColor: colors.card, borderRadius: radii.md, gap: spacing.md, marginTop: spacing.lg, padding: spacing.lg },
  skeletonLine: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 18 },
  reportHero: { backgroundColor: colors.card, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.lg },
  reportTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  summary: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: spacing.sm },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  sourceChip: { backgroundColor: '#e9fbfb', borderRadius: radii.pill, color: colors.secondary, fontSize: 11, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  sectionCard: { backgroundColor: colors.card, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  sectionText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  bulletRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  bulletText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  barLabel: { color: colors.text, fontSize: 12, fontWeight: '800', width: 86 },
  barTrack: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, flex: 1, height: 9, overflow: 'hidden' },
  barFill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 9 },
  barValue: { color: colors.muted, fontSize: 11, fontWeight: '900', width: 48 },
  tableRow: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  action: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.md, flex: 1, padding: spacing.md },
  actionText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', marginTop: spacing.xs },
  savedRow: { alignItems: 'center', borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  savedText: { color: colors.ink, flex: 1, fontWeight: '800' },
});

export default MarketInsightsScreen;
