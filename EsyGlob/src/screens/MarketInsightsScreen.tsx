import React, { memo, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  fetchMarketInsightsDashboard,
  MarketInsightReport,
  MarketResearchEvent,
  streamMarketResearch,
} from '../api/ai';
import { readJson, writeJson } from '../storage/appStorage';

const REPORT_KEY = 'market-insights.saved';
const reportTypes = [
  {
    id: 'product' as const,
    label: 'Product Research',
    icon: 'package-variant-closed',
    detail: 'Trade flows & competition',
  },
  {
    id: 'country' as const,
    label: 'Country Research',
    icon: 'earth',
    detail: 'Economy & market access',
  },
  {
    id: 'opportunity' as const,
    label: 'Opportunity Finder',
    icon: 'target',
    detail: 'Demand, risk & potential',
  },
];
type ReportType = (typeof reportTypes)[number]['id'];
type DataRow = Record<string, any>;

function MarketInsightsScreen() {
  const navigation = useNavigation<any>();
  const [reportType, setReportType] = useState<ReportType>('product');
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [saved, setSaved] = useState<MarketInsightReport[]>(
    () => readJson<MarketInsightReport[]>(REPORT_KEY) ?? [],
  );
  const [report, setReport] = useState<MarketInsightReport | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchEvents, setResearchEvents] = useState<MarketResearchEvent[]>([]);
  const [researchError, setResearchError] = useState('');
  const dashboard = useQuery({
    queryKey: ['market-insights-dashboard'],
    queryFn: fetchMarketInsightsDashboard,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const startResearch = async () => {
    setResearching(true);
    setResearchError('');
    setResearchEvents([]);
    setReport({ title: `Researching ${product}`, sections: [], charts: [], tables: [] });
    try {
      await streamMarketResearch({ reportType, product, country, category, timeframe: '12m', query: [product, category, country].filter(Boolean).join(' ') }, event => {
        setResearchEvents(items => [...items.slice(-39), event]);
        if (event.type === 'section' && event.section) setReport(current => ({ ...(current || {}), sections: [...(current?.sections || []), event.section!] }));
        if (event.type === 'report' && event.report) setReport(event.report);
      });
    } catch (error) {
      const message = friendlyError(error);
      setResearchError(message);
      Alert.alert('Research unavailable', message);
    } finally {
      setResearching(false);
    }
  };
  const productMatches = useMemo(
    () =>
      product.trim().length < 2
        ? []
        : (dashboard.data?.products ?? [])
            .filter(item =>
              item.name.toLowerCase().includes(product.toLowerCase()),
            )
            .slice(0, 5),
    [dashboard.data?.products, product],
  );
  const countryMatches = useMemo(
    () =>
      country.trim().length < 1
        ? []
        : (dashboard.data?.countries ?? [])
            .filter(item =>
              item.name.toLowerCase().includes(country.toLowerCase()),
            )
            .slice(0, 5),
    [country, dashboard.data?.countries],
  );
  const sourceNames = useMemo(
    () =>
      normalizeSources(
        report?.sources ?? report?.sourceChips ?? report?.dataSources,
      ),
    [report],
  );
  const saveReport = () => {
    if (!report) return;
    const next = [
      { ...report, generatedAt: new Date().toISOString() },
      ...saved.filter(item => item.id !== report.id),
    ].slice(0, 12);
    setSaved(next);
    writeJson(REPORT_KEY, next);
    Alert.alert('Report saved', 'Available in Saved reports on this device.');
  };
  const shareReport = async () => {
    if (!report) return;
    await Share.share({ title: report.title, message: buildShareText(report) });
  };
  const canGenerate = product.trim().length > 1 && !researching;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.iconButton}>
          <Icon name="arrow-left" size={23} color="#0F172A" />
        </Pressable>
        <View style={s.headerBody}>
          <Text style={s.kicker}>ESYGLOB INTELLIGENCE</Text>
          <Text style={s.title}>Market Insights</Text>
        </View>
        <Pressable
          onPress={report ? saveReport : undefined}
          style={s.iconButton}
        >
          <Icon
            name="bookmark-outline"
            size={22}
            color={report ? '#4F46E5' : '#94A3B8'}
          />
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Icon name="chart-areaspline" size={27} color="#FFF" />
          </View>
          <View style={s.heroBody}>
            <Text style={s.heroTitle}>
              Trade intelligence, grounded in data
            </Text>
            <Text style={s.heroText}>
              Marketplace signals combined with connected economic and trade
              sources.
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.typeRow}
        >
          {reportTypes.map(item => (
            <Pressable
              key={item.id}
              onPress={() => setReportType(item.id)}
              style={[s.typeCard, reportType === item.id && s.typeActive]}
            >
              <Icon
                name={item.icon}
                size={21}
                color={reportType === item.id ? '#FFF' : '#4F46E5'}
              />
              <View>
                <Text
                  style={[
                    s.typeLabel,
                    reportType === item.id && s.typeLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
                <Text
                  style={[
                    s.typeDetail,
                    reportType === item.id && s.typeDetailActive,
                  ]}
                >
                  {item.detail}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.searchCard}>
          <View style={s.sectionHead}>
            <View style={s.sectionIcon}>
              <Icon name="magnify" size={19} color="#4F46E5" />
            </View>
            <View>
              <Text style={s.sectionTitle}>Build your intelligence report</Text>
              <Text style={s.sectionSub}>
                {dashboard.data?.dataFreshness ??
                  'Connected marketplace and economic sources'}
              </Text>
            </View>
          </View>
          <LabeledInput
            label="Product or trade keyword"
            icon="package-variant"
            value={product}
            setValue={setProduct}
            placeholder="e.g. solar panels, cotton shirts"
          />
          {productMatches.length ? (
            <SuggestionList
              items={productMatches.map(item => ({
                label: item.name,
                caption: [item.category, item.subcategory]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              onSelect={value => {
                setProduct(value);
                const match = dashboard.data?.products.find(
                  item => item.name === value,
                );
                if (match?.category) setCategory(match.category);
              }}
            />
          ) : null}
          <LabeledInput
            label="Category"
            icon="shape-outline"
            value={category}
            setValue={setCategory}
            placeholder="Optional category"
          />
          <LabeledInput
            label="Country / target market"
            icon="earth"
            value={country}
            setValue={setCountry}
            placeholder={
              reportType === 'country'
                ? 'Required for country research'
                : 'Optional target country'
            }
          />
          {countryMatches.length ? (
            <SuggestionList
              items={countryMatches.map(item => ({
                label: item.name,
                caption: `${item.flagEmoji ?? ''} ${item.region ?? ''}`.trim(),
              }))}
              onSelect={setCountry}
            />
          ) : null}
          <Pressable
            disabled={!canGenerate}
            onPress={startResearch}
            style={[s.generate, !canGenerate && s.disabled]}
          >
            {researching ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Icon name="creation" size={19} color="#FFF" />
            )}
            <Text style={s.generateText}>
              {researching ? 'AI researcher is working…' : 'Start AI Deep Research'}
            </Text>
          </Pressable>
        </View>
        {dashboard.isError ? (
          <InlineError
            message="Market discovery options are temporarily unavailable. You can still enter a product manually."
            retry={() => dashboard.refetch()}
          />
        ) : null}
        {researching || researchEvents.length ? <ResearchWorkspace events={researchEvents} active={researching} error={researchError} /> : null}
        {report ? (
          <ReportView
            report={report}
            sources={sourceNames}
            onShare={shareReport}
            onSave={saveReport}
          />
        ) : null}
        {saved.length ? (
          <View style={s.card}>
            <View style={s.sectionHead}>
              <View style={s.sectionIcon}>
                <Icon
                  name="bookmark-multiple-outline"
                  size={19}
                  color="#4F46E5"
                />
              </View>
              <Text style={s.sectionTitle}>Saved reports</Text>
            </View>
            {saved.map((item, index) => (
              <Pressable
                key={item.id ?? `${item.title}-${index}`}
                onPress={() => setReport(item)}
                style={s.savedRow}
              >
                <Icon name="file-chart-outline" size={20} color="#4F46E5" />
                <View style={s.savedBody}>
                  <Text numberOfLines={1} style={s.savedTitle}>
                    {item.title ?? 'Market report'}
                  </Text>
                  <Text style={s.savedMeta}>
                    {formatDate(item.generatedAt ?? item.createdAt)}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94A3B8" />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ResearchWorkspace({ events, active, error }: { events: MarketResearchEvent[]; active: boolean; error: string }) {
  const operational = events.filter(event => event.type === 'step');
  const latest = [...events].reverse().find(event => event.type === 'step' || event.type === 'research_started');
  const progress = Number(latest?.progress || (active ? 2 : events.length ? 100 : 0));
  const elapsed = Number(latest?.elapsedMs || 0);
  return (
    <View style={s.researchWorkspace}>
      <View style={s.researchTop}>
        <View style={s.researchOrb}>{active ? <ActivityIndicator color="#FFFFFF" /> : <Icon name={error ? 'alert' : 'check-bold'} size={19} color="#FFFFFF" />}</View>
        <View style={s.researchTopCopy}><Text style={s.researchKicker}>LIVE RESEARCH WORKSPACE</Text><Text style={s.researchTitle}>{String(latest?.operation || (active ? 'Starting research agents…' : error ? 'Research interrupted' : 'Research completed'))}</Text></View>
        <Text style={s.progressValue}>{Math.min(100, progress)}%</Text>
      </View>
      <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.min(100, progress)}%` }]} /></View>
      <View style={s.researchMetrics}>
        <ResearchMetric icon="timer-outline" label="Elapsed" value={`${Math.round(elapsed / 1000)}s`} />
        <ResearchMetric icon="link-variant" label="Sources" value={String(latest?.sourceCount || 0)} />
        <ResearchMetric icon="database-outline" label="Datasets" value={String(latest?.datasetsCollected || 0)} />
        <ResearchMetric icon="account-group-outline" label="Agents" value={String(new Set(operational.map(item => item.agent)).size)} />
      </View>
      {error ? <Text style={s.researchError}>{error}</Text> : null}
      <View style={s.agentTimeline}>
        {operational.map((event, index) => <View key={`${event.agent}-${index}`} style={s.agentRow}><View style={[s.agentDot, event.status === 'success' && s.agentDotDone]}>{event.status === 'success' ? <Icon name="check" size={10} color="#FFFFFF" /> : null}</View><View style={s.agentCopy}><Text style={s.agentName}>{event.agent}</Text><Text style={s.agentOperation}>{event.operation}</Text></View><Text style={[s.agentStatus, event.status === 'success' && s.agentStatusDone]}>{event.status === 'success' ? 'DONE' : 'WORKING'}</Text></View>)}
      </View>
    </View>
  );
}

function ResearchMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={s.researchMetric}><Icon name={icon} size={15} color="#6366F1" /><Text style={s.researchMetricValue}>{value}</Text><Text style={s.researchMetricLabel}>{label}</Text></View>;
}

const ReportView = memo(function ReportPanel({
  report,
  sources,
  onShare,
  onSave,
}: {
  report: MarketInsightReport;
  sources: string[];
  onShare: () => void;
  onSave: () => void;
}) {
  const distribution = report.demographics?.distribution ?? [];
  const regional = report.demographics?.regionalComparison ?? [];
  return (
    <View>
      <View style={s.reportHero}>
        <View style={s.reportBadge}>
          <Icon name="check-decagram" size={15} color="#A5B4FC" />
          <Text style={s.reportBadgeText}>
            GENERATED FROM CONNECTED SOURCES
          </Text>
        </View>
        <Text style={s.reportTitle}>{report.title}</Text>
        <Text style={s.reportSummary}>
          {report.executiveSummary ?? report.summary}
        </Text>
        <View style={s.freshness}>
          <Icon name="clock-check-outline" size={14} color="#94A3B8" />
          <Text style={s.freshnessText}>
            {report.dataFreshness ?? formatDate(report.createdAt)}
          </Text>
        </View>
        <View style={s.reportActions}>
          <Pressable onPress={onShare} style={s.reportAction}>
            <Icon name="share-variant-outline" size={18} color="#FFF" />
            <Text style={s.reportActionText}>Share</Text>
          </Pressable>
          <Pressable onPress={onSave} style={s.reportAction}>
            <Icon name="bookmark-outline" size={18} color="#FFF" />
            <Text style={s.reportActionText}>Save</Text>
          </Pressable>
        </View>
      </View>
      {report.kpis?.length ? <View style={s.kpiGrid}>{report.kpis.map((kpi, index) => <View key={`${kpi.label}-${index}`} style={s.kpiCard}><Icon name={kpi.trend === 'up' ? 'trending-up' : kpi.trend === 'down' ? 'trending-down' : 'minus'} size={18} color={kpi.trend === 'down' ? '#DC2626' : '#059669'} /><Text style={s.kpiValue}>{String(kpi.value ?? 'N/A')}</Text><Text style={s.kpiLabel}>{kpi.label}</Text>{kpi.note ? <Text style={s.kpiNote}>{kpi.note}</Text> : null}</View>)}</View> : null}
      {report.sections?.map((section, index) => <View key={`${section.title}-${index}`} style={s.card}><View style={s.generatedSectionHead}><View style={s.sectionIcon}><Icon name={sectionIcon(section.type)} size={19} color="#4F46E5" /></View><View style={s.generatedSectionCopy}><Text style={s.sectionTitle}>{section.title}</Text>{section.confidence != null ? <Text style={s.confidence}>{Math.round(Number(section.confidence))}% confidence</Text> : null}</View></View>{section.content || section.summary ? <Text style={s.longText}>{section.content || section.summary}</Text> : null}{(section.points || section.bullets || []).map((point, pointIndex) => <View key={`${point}-${pointIndex}`} style={s.generatedPoint}><Icon name="check-circle-outline" size={16} color="#059669" /><Text style={s.generatedPointText}>{point}</Text></View>)}</View>)}
      {report.charts?.map((chart, index) => <BarChart key={`${chart.title}-${index}`} title={chart.title || 'Research chart'} data={(chart.data || []).map(item => ({ label: item.label, value: Number(item.value || 0) }))} />)}
      {report.tables?.map((table, index) => <GenericResearchTable key={`${table.title}-${index}`} title={table.title || 'Research table'} rows={table.rows || []} columns={table.columns} />)}
      {report.recommendations?.length ? <View style={s.card}><Text style={s.sectionTitle}>Recommended action plan</Text>{report.recommendations.map((item, index) => <View key={`${item}-${index}`} style={s.actionRow}><Text style={s.actionNumber}>{index + 1}</Text><Text style={s.actionText}>{item}</Text></View>)}</View> : null}
      {report.risks?.length ? <View style={s.card}><Text style={s.sectionTitle}>Risk indicators</Text>{report.risks.map((risk, index) => <View key={`${risk.label}-${index}`} style={s.riskRow}><View style={[s.riskLevel, risk.level === 'high' ? s.riskHigh : risk.level === 'medium' ? s.riskMedium : s.riskLow]}><Text style={s.riskLevelText}>{risk.level || 'review'}</Text></View><View style={s.riskCopy}><Text style={s.riskTitle}>{risk.label}</Text><Text style={s.riskReason}>{risk.reason}</Text></View></View>)}</View> : null}
      {report.scoring ? <ScoreGrid data={report.scoring} /> : null}
      {report.countryAnalysis ? (
        <MetricGrid
          title="Country economic indicators"
          data={report.countryAnalysis}
        />
      ) : null}
      {report.marketplaceMetrics ? (
        <MetricGrid
          title="Marketplace signals"
          data={report.marketplaceMetrics}
        />
      ) : null}
      {distribution.length ? (
        <BarChart title="Market signal distribution" data={distribution} />
      ) : null}
      {regional.length ? (
        <BarChart title="Regional comparison" data={regional} />
      ) : null}
      {report.opportunityTable?.length ? (
        <TradeTable
          title="Market opportunity ranking"
          rows={report.opportunityTable}
          kind="opportunity"
        />
      ) : null}
      {report.exportAnalysis?.length ? (
        <TradeTable
          title="Top exporters / supply markets"
          rows={report.exportAnalysis}
          kind="trade"
        />
      ) : null}
      {report.importAnalysis?.length ? (
        <TradeTable
          title="Top importers / demand markets"
          rows={report.importAnalysis}
          kind="trade"
        />
      ) : null}
      {report.fastestGrowingMarkets?.length ? (
        <TradeTable
          title="Fastest growing markets"
          rows={report.fastestGrowingMarkets}
          kind="growth"
        />
      ) : null}
      {report.topProducts?.length ? (
        <TradeTable
          title="Top market signals"
          rows={report.topProducts}
          kind="product"
        />
      ) : null}
      {report.marketSummary ? (
        <InsightList
          title="Trade recommendations & requirements"
          data={report.marketSummary}
        />
      ) : null}
      {report.tariffInfo ? (
        <MetricGrid title="Tariff guidance" data={report.tariffInfo} />
      ) : null}
      {report.aiAnalysis ? (
        <TextInsight title="AI analyst commentary" text={report.aiAnalysis} />
      ) : null}
      {report.dataIntegrityNotes?.length ? (
        <View style={s.warningCard}>
          <View style={s.warningHead}>
            <Icon name="shield-alert-outline" size={19} color="#D97706" />
            <Text style={s.warningTitle}>Data integrity notes</Text>
          </View>
          {report.dataIntegrityNotes.map(note => (
            <Text key={note} style={s.warningText}>
              • {note}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={s.card}>
        <View style={s.sectionHead}>
          <View style={s.sectionIcon}>
            <Icon name="database-check-outline" size={19} color="#4F46E5" />
          </View>
          <Text style={s.sectionTitle}>Sources</Text>
        </View>
        <View style={s.sources}>
          {sources.map(source => (
            <View key={source} style={s.source}>
              <Icon name="link-variant" size={15} color="#4F46E5" />
              <Text style={s.sourceText}>{source}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});

function sectionIcon(type?: string) {
  const icons: Record<string, string> = { risks: 'shield-alert-outline', opportunities: 'target', strategy: 'chess-knight', suppliers: 'factory', buyers: 'account-tie-outline', trade: 'earth' };
  return icons[String(type || '')] || 'text-box-search-outline';
}

function GenericResearchTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns?: string[] }) {
  const keys = columns?.length ? columns : [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 6);
  return <View style={s.card}><Text style={s.sectionTitle}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><View>{<View style={[s.genericTableRow, s.tableHeader]}>{keys.map(key => <Text key={key} style={s.genericTableCellHead}>{humanize(key)}</Text>)}</View>}{rows.slice(0, 20).map((row, index) => <View key={index} style={s.genericTableRow}>{keys.map(key => <Text key={key} numberOfLines={3} style={s.genericTableCell}>{typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—')}</Text>)}</View>)}</View></ScrollView></View>;
}

function LabeledInput({
  label,
  icon,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  icon: string;
  value: string;
  setValue: (x: string) => void;
  placeholder: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputShell}>
        <Icon name={icon} size={18} color="#64748B" />
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          style={s.input}
        />
        {value ? (
          <Pressable onPress={() => setValue('')}>
            <Icon name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
function SuggestionList({
  items,
  onSelect,
}: {
  items: Array<{ label: string; caption?: string }>;
  onSelect: (x: string) => void;
}) {
  return (
    <View style={s.suggestions}>
      {items.map(item => (
        <Pressable
          key={item.label}
          onPress={() => onSelect(item.label)}
          style={s.suggestion}
        >
          <Icon name="magnify" size={15} color="#64748B" />
          <View style={s.suggestionBody}>
            <Text numberOfLines={1} style={s.suggestionLabel}>
              {item.label}
            </Text>
            {item.caption ? (
              <Text numberOfLines={1} style={s.suggestionCaption}>
                {item.caption}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
function ScoreGrid({ data }: { data: Record<string, any> }) {
  const items = Object.entries(data).filter(([, v]) => typeof v === 'number');
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Opportunity scoring</Text>
      <View style={s.metrics}>
        {items.map(([key, value]) => (
          <View key={key} style={s.score}>
            <Text style={s.scoreValue}>{Math.round(value as number)}</Text>
            <Text style={s.scoreUnit}>/100</Text>
            <Text style={s.scoreLabel}>{humanize(key)}</Text>
          </View>
        ))}
      </View>
      {Array.isArray(data.reasoning)
        ? data.reasoning.map((x: string) => (
            <Text key={x} style={s.bullet}>
              • {x}
            </Text>
          ))
        : null}
    </View>
  );
}
function MetricGrid({
  title,
  data,
}: {
  title: string;
  data: Record<string, any>;
}) {
  const items = Object.entries(data)
    .filter(([, v]) => !Array.isArray(v) && v != null && typeof v !== 'object')
    .slice(0, 12);
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.metrics}>
        {items.map(([key, value]) => (
          <View key={key} style={s.metric}>
            <Text numberOfLines={2} style={s.metricValue}>
              {String(value)}
            </Text>
            <Text style={s.metricLabel}>{humanize(key)}</Text>
          </View>
        ))}
      </View>
      {Object.entries(data)
        .filter(([, v]) => Array.isArray(v))
        .map(([key, value]) => (
          <View key={key} style={s.listBlock}>
            <Text style={s.listTitle}>{humanize(key)}</Text>
            {(value as any[]).slice(0, 6).map((x, i) => (
              <Text key={`${String(x)}-${i}`} style={s.bullet}>
                • {typeof x === 'object' ? JSON.stringify(x) : String(x)}
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}
function BarChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ label?: string; value?: number; unit?: string }>;
}) {
  const max = Math.max(...data.map(x => Number(x.value) || 0), 1);
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{title}</Text>
      {data.slice(0, 8).map((item, index) => (
        <View key={`${item.label}-${index}`} style={s.barRow}>
          <View style={s.barTop}>
            <Text numberOfLines={1} style={s.barLabel}>
              {item.label}
            </Text>
            <Text style={s.barNumber}>
              {Number(item.value ?? 0).toLocaleString()}
              {item.unit ?? ''}
            </Text>
          </View>
          <View style={s.barTrack}>
            <View
              style={[
                s.barFill,
                {
                  width: `${Math.max(
                    3,
                    ((Number(item.value) || 0) / max) * 100,
                  )}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
function TradeTable({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: DataRow[];
  kind: 'trade' | 'growth' | 'opportunity' | 'product';
}) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.table}>
          <View style={[s.tableRow, s.tableHeader]}>
            <Text style={[s.th, s.rankCol]}>#</Text>
            <Text style={[s.th, s.countryCol]}>Market</Text>
            <Text style={[s.th, s.valueCol]}>
              {kind === 'opportunity'
                ? 'Score'
                : kind === 'product'
                ? 'Signal'
                : 'Trade value'}
            </Text>
            <Text style={[s.th, s.trendCol]}>Trend</Text>
          </View>
          {rows.slice(0, 10).map((row, index) => (
            <View
              key={`${row.country ?? row.product}-${index}`}
              style={s.tableRow}
            >
              <Text style={[s.td, s.rankCol]}>{row.rank ?? index + 1}</Text>
              <Text numberOfLines={1} style={[s.td, s.countryCol]}>
                {row.flag ?? ''} {row.country ?? row.product ?? 'Market'}
              </Text>
              <Text style={[s.td, s.valueCol]}>
                {kind === 'opportunity'
                  ? `${row.score ?? row.opportunity ?? 0}/100`
                  : row.valueFmt ?? row.tradeValue ?? formatCompact(row.value)}
              </Text>
              <View style={s.trendCol}>
                <Text style={[s.trend, trendUp(row) && s.trendUp]}>
                  {trendUp(row) ? '↑' : '→'}{' '}
                  {row.trend?.change != null
                    ? `${row.trend.change}%`
                    : row.growth ?? row.trend?.label ?? 'Stable'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
function InsightList({
  title,
  data,
}: {
  title: string;
  data: Record<string, any>;
}) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{title}</Text>
      {Object.entries(data).map(([key, value]) => (
        <View key={key} style={s.insight}>
          <View style={s.insightIcon}>
            <Icon name="check" size={14} color="#059669" />
          </View>
          <View style={s.insightBody}>
            <Text style={s.insightLabel}>{humanize(key)}</Text>
            {Array.isArray(value) ? (
              value.map((x, i) => (
                <Text key={`${x}-${i}`} style={s.insightText}>
                  • {String(x)}
                </Text>
              ))
            ) : (
              <Text style={s.insightText}>{String(value)}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
function TextInsight({ title, text }: { title: string; text: string }) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.longText}>{text}</Text>
    </View>
  );
}
function InlineError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <View style={s.error}>
      <Icon name="wifi-alert" size={19} color="#DC2626" />
      <Text style={s.errorText}>{message}</Text>
      <Pressable onPress={retry}>
        <Text style={s.retry}>Retry</Text>
      </Pressable>
    </View>
  );
}

function normalizeSources(value: unknown): string[] {
  if (!Array.isArray(value))
    return ['Marketplace DB', 'World Bank', 'Exchange-rate data'];
  return value
    .map(item =>
      typeof item === 'string'
        ? item
        : String(
            item?.label ?? item?.name ?? item?.url ?? 'Connected data source',
          ),
    )
    .filter(Boolean);
}
function friendlyError(error: unknown) {
  const text =
    error instanceof Error
      ? error.message
      : 'Unable to generate market insight.';
  return /401|sign in/i.test(text)
    ? 'Your session expired. Please sign in and retry.'
    : /429/.test(text)
    ? 'Report limit reached. Please wait a moment and retry.'
    : /timeout|network|reach/i.test(text)
    ? 'The intelligence service is taking too long. Check your connection and retry.'
    : text;
}
function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, x => x.toUpperCase());
}
function trendUp(row: DataRow) {
  return (
    row.trend?.direction === 'up' ||
    Number(row.yoyChange ?? row.trend?.change) > 0 ||
    String(row.growth).toLowerCase() === 'growing'
  );
}
function formatCompact(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n)
    : String(value ?? '—');
}
function formatDate(value?: string) {
  if (!value) return 'Just generated';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently generated'
    : date.toLocaleString();
}
function buildShareText(report: MarketInsightReport) {
  return [
    report.title,
    report.executiveSummary ?? report.summary,
    report.dataFreshness,
    `Sources: ${normalizeSources(
      report.sources ?? report.sourceChips ?? report.dataSources,
    ).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FB' },
  header: {
    paddingTop: 50,
    paddingHorizontal: 14,
    paddingBottom: 11,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, marginHorizontal: 11 },
  kicker: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#4F46E5',
  },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 1 },
  content: { padding: 14, paddingBottom: 80 },
  hero: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  heroText: { fontSize: 10, lineHeight: 15, color: '#CBD5E1', marginTop: 4 },
  typeRow: { gap: 8, paddingVertical: 12 },
  typeCard: {
    width: 190,
    minHeight: 62,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  typeLabel: { fontSize: 12, fontWeight: '900', color: '#0F172A' },
  typeLabelActive: { color: '#FFF' },
  typeDetail: { fontSize: 9, color: '#64748B', marginTop: 2 },
  typeDetailActive: { color: '#C7D2FE' },
  searchCard: {
    backgroundColor: '#FFF',
    borderRadius: 19,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    marginBottom: 12,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  sectionSub: { fontSize: 9, color: '#64748B', marginTop: 2 },
  field: { marginBottom: 10 },
  label: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  inputShell: {
    height: 46,
    borderWidth: 1,
    borderColor: '#DDE5F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 9,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginTop: -5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  suggestionBody: { flex: 1, marginLeft: 8 },
  suggestionLabel: { fontSize: 11, fontWeight: '800', color: '#0F172A' },
  suggestionCaption: { fontSize: 9, color: '#64748B', marginTop: 2 },
  generate: {
    height: 48,
    borderRadius: 13,
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 3,
  },
  generateText: { fontSize: 12, fontWeight: '900', color: '#FFF' },
  disabled: { opacity: 0.45 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    marginBottom: 12,
  },
  reportHero: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  reportBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reportBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#A5B4FC',
  },
  reportTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#FFF',
    marginTop: 9,
  },
  reportSummary: {
    fontSize: 12,
    lineHeight: 19,
    color: '#CBD5E1',
    marginTop: 9,
  },
  freshness: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 11,
    gap: 5,
  },
  freshnessText: { fontSize: 9, color: '#94A3B8' },
  reportActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  reportAction: {
    height: 35,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportActionText: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    width: '48%',
    minHeight: 70,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    justifyContent: 'center',
  },
  metricValue: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  metricLabel: { fontSize: 9, color: '#64748B', marginTop: 4 },
  score: {
    width: '30%',
    minHeight: 88,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: { fontSize: 25, fontWeight: '900', color: '#4F46E5' },
  scoreUnit: { fontSize: 8, fontWeight: '800', color: '#818CF8' },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    color: '#475569',
    marginTop: 4,
  },
  listBlock: { marginTop: 12 },
  listTitle: { fontSize: 11, fontWeight: '900', color: '#334155' },
  bullet: { fontSize: 10, lineHeight: 16, color: '#64748B', marginTop: 4 },
  barRow: { marginBottom: 12 },
  barTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  barLabel: { flex: 1, fontSize: 10, fontWeight: '800', color: '#475569' },
  barNumber: { fontSize: 10, fontWeight: '900', color: '#0F172A' },
  barTrack: {
    height: 8,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 6, backgroundColor: '#4F46E5' },
  table: { minWidth: 570 },
  tableRow: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  tableHeader: { height: 36, backgroundColor: '#F8FAFC', borderRadius: 9 },
  th: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  td: { fontSize: 10, fontWeight: '700', color: '#334155' },
  rankCol: { width: 35, paddingLeft: 8 },
  countryCol: { width: 205 },
  valueCol: { width: 150 },
  trendCol: { width: 160 },
  trend: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  trendUp: { color: '#059669' },
  insight: { flexDirection: 'row', marginBottom: 13 },
  insightIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  insightBody: { flex: 1 },
  insightLabel: { fontSize: 10, fontWeight: '900', color: '#334155' },
  insightText: { fontSize: 10, lineHeight: 16, color: '#64748B', marginTop: 3 },
  longText: { fontSize: 12, lineHeight: 19, color: '#475569' },
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  warningHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 7,
  },
  warningTitle: { fontSize: 13, fontWeight: '900', color: '#92400E' },
  warningText: { fontSize: 10, lineHeight: 16, color: '#92400E', marginTop: 3 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  sourceText: { fontSize: 9, fontWeight: '800', color: '#4338CA' },
  loadingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 15,
  },
  loadingTitle: { fontSize: 13, fontWeight: '900', color: '#334155' },
  skeleton: {
    height: 14,
    borderRadius: 8,
    backgroundColor: '#E8EDF5',
    marginBottom: 10,
  },
  researchWorkspace: { backgroundColor: '#111827', borderRadius: 20, marginBottom: 14, overflow: 'hidden', padding: 16 },
  researchTop: { alignItems: 'center', flexDirection: 'row' },
  researchOrb: { alignItems: 'center', backgroundColor: '#4F46E5', borderRadius: 15, height: 42, justifyContent: 'center', width: 42 },
  researchTopCopy: { flex: 1, marginLeft: 10 },
  researchKicker: { color: '#A5B4FC', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  researchTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 3 },
  progressValue: { color: '#C7D2FE', fontSize: 16, fontWeight: '900' },
  progressTrack: { backgroundColor: '#374151', borderRadius: 4, height: 7, marginTop: 13, overflow: 'hidden' },
  progressFill: { backgroundColor: '#818CF8', borderRadius: 4, height: '100%' },
  researchMetrics: { flexDirection: 'row', gap: 6, marginTop: 12 },
  researchMetric: { alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 10, flex: 1, padding: 8 },
  researchMetricValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', marginTop: 3 },
  researchMetricLabel: { color: '#9CA3AF', fontSize: 7, marginTop: 1 },
  researchError: { color: '#FCA5A5', fontSize: 10, lineHeight: 15, marginTop: 10 },
  agentTimeline: { borderTopColor: '#374151', borderTopWidth: 1, marginTop: 13, paddingTop: 5 },
  agentRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 8 },
  agentDot: { alignItems: 'center', borderColor: '#818CF8', borderRadius: 9, borderWidth: 2, height: 18, justifyContent: 'center', width: 18 },
  agentDotDone: { backgroundColor: '#059669', borderColor: '#059669' },
  agentCopy: { flex: 1, marginLeft: 9 },
  agentName: { color: '#E5E7EB', fontSize: 9, fontWeight: '900' },
  agentOperation: { color: '#9CA3AF', fontSize: 8, marginTop: 2 },
  agentStatus: { color: '#A5B4FC', fontSize: 7, fontWeight: '900' },
  agentStatusDone: { color: '#6EE7B7' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpiCard: { backgroundColor: '#FFFFFF', borderRadius: 15, padding: 12, width: '48%' },
  kpiValue: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 5 },
  kpiLabel: { color: '#475569', fontSize: 9, fontWeight: '800', marginTop: 2 },
  kpiNote: { color: '#94A3B8', fontSize: 8, lineHeight: 12, marginTop: 4 },
  generatedSectionHead: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
  generatedSectionCopy: { flex: 1, marginLeft: 8 },
  confidence: { color: '#059669', fontSize: 8, fontWeight: '800', marginTop: 2 },
  generatedPoint: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 8 },
  generatedPointText: { color: '#475569', flex: 1, fontSize: 10, lineHeight: 16 },
  actionRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 10 },
  actionNumber: { backgroundColor: '#4F46E5', borderRadius: 10, color: '#FFFFFF', fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  actionText: { color: '#334155', flex: 1, fontSize: 10, lineHeight: 16, marginLeft: 8 },
  riskRow: { alignItems: 'flex-start', borderTopColor: '#E2E8F0', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingVertical: 10 },
  riskLevel: { borderRadius: 8, minWidth: 56, paddingHorizontal: 7, paddingVertical: 5 },
  riskHigh: { backgroundColor: '#FEE2E2' },
  riskMedium: { backgroundColor: '#FEF3C7' },
  riskLow: { backgroundColor: '#D1FAE5' },
  riskLevelText: { color: '#7F1D1D', fontSize: 7, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  riskCopy: { flex: 1, marginLeft: 9 },
  riskTitle: { color: '#1E293B', fontSize: 10, fontWeight: '900' },
  riskReason: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 2 },
  genericTableRow: { borderBottomColor: '#E2E8F0', borderBottomWidth: 1, flexDirection: 'row' },
  genericTableCellHead: { color: '#475569', fontSize: 9, fontWeight: '900', padding: 9, width: 120 },
  genericTableCell: { color: '#334155', fontSize: 9, lineHeight: 13, padding: 9, width: 120 },
  error: {
    backgroundColor: '#FEF2F2',
    borderRadius: 13,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: '#991B1B',
    marginHorizontal: 8,
  },
  retry: { fontSize: 10, fontWeight: '900', color: '#DC2626' },
  savedRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  savedBody: { flex: 1, marginLeft: 9 },
  savedTitle: { fontSize: 11, fontWeight: '800', color: '#0F172A' },
  savedMeta: { fontSize: 9, color: '#94A3B8', marginTop: 2 },
});

export default MarketInsightsScreen;
