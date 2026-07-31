import crypto from 'node:crypto';
import { getAIKnowledgeDatabaseState } from '../config/knowledge-database.js';
import { getTradeKnowledgeModel } from '../models/TradeKnowledge.js';
import GlobalTradeResearchService from './global-trade-research.service.js';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const asArray = value => Array.isArray(value) ? value : [];

function dataVersion(dataset) {
  const stable = JSON.stringify({
    hsCode: dataset?.hsCode || '',
    officialProductRows: asArray(dataset?.officialProductRows),
    historicalTrade: asArray(dataset?.historicalTrade),
    topImporters: asArray(dataset?.topImporters),
    topExporters: asArray(dataset?.topExporters),
    importPartners: asArray(dataset?.importPartners),
    exportPartners: asArray(dataset?.exportPartners),
    countryProfile: dataset?.countryProfile || null,
    macroImports: asArray(dataset?.macroImports),
    macroExports: asArray(dataset?.macroExports),
    sources: asArray(dataset?.sources).map(source => [source.name, source.status]),
  });
  return `trade-${crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16)}`;
}

function compactDataset(dataset = {}) {
  const compact = {
    ...dataset,
    macroImports: asArray(dataset.macroImports).slice(0, 20),
    macroExports: asArray(dataset.macroExports).slice(0, 20),
    officialProductRows: asArray(dataset.officialProductRows).sort((a, b) => Number(b.period) - Number(a.period) || Number(b.valueUsd) - Number(a.valueUsd)).slice(0, 50),
    historicalTrade: asArray(dataset.historicalTrade).sort((a, b) => Number(a.period) - Number(b.period) || String(a.flow).localeCompare(String(b.flow))).slice(-30),
    topImporters: asArray(dataset.topImporters).sort((a, b) => Number(b.period) - Number(a.period) || Number(b.valueUsd) - Number(a.valueUsd)).slice(0, 20),
    topExporters: asArray(dataset.topExporters).sort((a, b) => Number(b.period) - Number(a.period) || Number(b.valueUsd) - Number(a.valueUsd)).slice(0, 20),
    importPartners: asArray(dataset.importPartners).sort((a, b) => Number(b.period) - Number(a.period) || Number(b.valueUsd) - Number(a.valueUsd)).slice(0, 20),
    exportPartners: asArray(dataset.exportPartners).sort((a, b) => Number(b.period) - Number(a.period) || Number(b.valueUsd) - Number(a.valueUsd)).slice(0, 20),
    relatedHsCodes: asArray(dataset.relatedHsCodes).slice(0, 20),
    publicArticles: asArray(dataset.publicArticles).slice(0, 25),
    sources: asArray(dataset.sources).slice(0, 20),
    gaps: asArray(dataset.gaps).slice(0, 20),
  };
  delete compact.countries;
  return compact;
}

function mergeRows(existing, incoming, key) {
  return [...new Map([...asArray(existing), ...asArray(incoming)].map(row => [key(row), row])).values()];
}

function mergeSources(existing, incoming) {
  const merged = new Map(asArray(existing).map(source => [clean(source.name).toLowerCase(), source]));
  for (const source of asArray(incoming)) {
    const key = clean(source.name).toLowerCase();
    const previous = merged.get(key);
    const lowerQuality = previous?.status === 'connected' && ['unavailable', 'requires-api-key', 'requires-hs-code'].includes(source.status);
    merged.set(key, lowerQuality ? { ...previous, lastCheckedAt: source.retrievedAt, lastCheckStatus: source.status } : source);
  }
  return [...merged.values()];
}

function tradeConflicts(existing, incoming) {
  const prior = new Map(asArray(existing).map(row => [`${row.reporterCode}:${row.partnerCode}:${row.flow}:${row.period}:${row.hsCode}`, row]));
  return asArray(incoming).flatMap(row => {
    const key = `${row.reporterCode}:${row.partnerCode}:${row.flow}:${row.period}:${row.hsCode}`;
    const previous = prior.get(key);
    if (!previous || !Number.isFinite(Number(previous.valueUsd)) || !Number.isFinite(Number(row.valueUsd))) return [];
    const denominator = Math.max(Math.abs(Number(previous.valueUsd)), 1);
    const differencePercent = Math.abs(Number(row.valueUsd) - Number(previous.valueUsd)) / denominator * 100;
    if (differencePercent < 0.5) return [];
    return [{
      key,
      previousValueUsd: Number(previous.valueUsd),
      currentValueUsd: Number(row.valueUsd),
      differencePercent: Number(differencePercent.toFixed(2)),
      resolution: 'latest-source-observation-retained',
      detectedAt: new Date().toISOString(),
      source: row.source || previous.source,
    }];
  });
}

function mergeDataset(existing = {}, incoming = {}) {
  const conflicts = tradeConflicts(existing.officialProductRows, incoming.officialProductRows);
  return compactDataset({
    ...existing,
    ...incoming,
    officialProductRows: mergeRows(existing.officialProductRows, incoming.officialProductRows, row => `${row.reporterCode}:${row.partnerCode}:${row.flow}:${row.period}:${row.hsCode}`),
    historicalTrade: mergeRows(existing.historicalTrade, incoming.historicalTrade, row => `${row.flow}:${row.period}`),
    topImporters: mergeRows(existing.topImporters, incoming.topImporters, row => `${row.country}:${row.period}`),
    topExporters: mergeRows(existing.topExporters, incoming.topExporters, row => `${row.country}:${row.period}`),
    importPartners: mergeRows(existing.importPartners, incoming.importPartners, row => `${row.country}:${row.period}`),
    exportPartners: mergeRows(existing.exportPartners, incoming.exportPartners, row => `${row.country}:${row.period}`),
    relatedHsCodes: mergeRows(existing.relatedHsCodes, incoming.relatedHsCodes, row => row.code),
    publicArticles: mergeRows(existing.publicArticles, incoming.publicArticles, row => row.url),
    sources: mergeSources(existing.sources, incoming.sources),
    gaps: [...new Set(asArray(incoming.gaps))],
    validationConflicts: mergeRows(existing.validationConflicts, conflicts, row => `${row.key}:${row.currentValueUsd}`).slice(-50),
  });
}

export default class TradeKnowledgeService {
  static ttlMs() {
    return Math.max(60 * 60 * 1000, Number(process.env.TRADE_KNOWLEDGE_TTL_MS || 7 * 24 * 60 * 60 * 1000));
  }

  static async findFresh(intent) {
    if (getAIKnowledgeDatabaseState() !== 1) return null;
    const TradeKnowledge = getTradeKnowledgeModel();
    return TradeKnowledge.findOne({
      queryKey: intent.queryKey,
      status: 'active',
      expiresAt: { $gt: new Date() },
    }).lean();
  }

  static async store(intent, dataset) {
    if (getAIKnowledgeDatabaseState() !== 1) return null;
    const TradeKnowledge = getTradeKnowledgeModel();
    const collectedAt = new Date();
    const existing = await TradeKnowledge.findOne({ queryKey: intent.queryKey }).lean();
    const normalizedDataset = mergeDataset(existing?.dataset, dataset);
    const sources = asArray(normalizedDataset.sources);
    const observationCount = ['officialProductRows', 'historicalTrade', 'topImporters', 'topExporters', 'importPartners', 'exportPartners']
      .reduce((total, key) => total + asArray(normalizedDataset[key]).length, 0);
    const officialSourceCount = sources.filter(source => source.status === 'connected' && /official/i.test(source.type || '')).length;
    const completenessChecks = [normalizedDataset.hsCode, observationCount, officialSourceCount, normalizedDataset.countryProfile, asArray(normalizedDataset.historicalTrade).length, asArray(normalizedDataset.topImporters).length || asArray(normalizedDataset.topExporters).length];
    const completeness = completenessChecks.filter(Boolean).length / completenessChecks.length;
    const periods = [
      ...asArray(normalizedDataset.officialProductRows).map(row => Number(row.period)),
      ...asArray(normalizedDataset.historicalTrade).map(row => Number(row.period)),
      ...asArray(normalizedDataset.topImporters).map(row => Number(row.period)),
      ...asArray(normalizedDataset.topExporters).map(row => Number(row.period)),
    ].filter(Number.isFinite);
    const version = dataVersion(normalizedDataset);
    return TradeKnowledge.findOneAndUpdate(
      { queryKey: intent.queryKey },
      {
        $set: {
          canonicalQuery: intent.canonicalQuery,
          product: clean(intent.product).toLowerCase(),
          category: clean(intent.category).toLowerCase(),
          countries: intent.countries,
          hsCodes: [dataset?.hsCode].filter(Boolean),
          intents: intent.intents,
          structuredIntent: intent,
          dataset: normalizedDataset,
          sources,
          dataVersion: version,
          collectedAt,
          expiresAt: new Date(collectedAt.getTime() + this.ttlMs()),
          quality: {
            officialSourceCount,
            observationCount,
            completeness,
            sourceQualityScore: Math.min(100, Math.round(officialSourceCount * 20 + Math.min(40, observationCount) + completeness * 20)),
            latestPeriod: periods.length ? Math.max(...periods) : undefined,
          },
          status: 'active',
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).lean();
  }

  static learnRelated(intent, dataset) {
    if (getAIKnowledgeDatabaseState() !== 1) return;
    setImmediate(async () => {
      try {
        const TradeKnowledge = getTradeKnowledgeModel();
        const relatedProducts = [
          ...asArray(dataset?.hsResolution?.candidates).map(candidate => candidate.officialDescription || candidate.description || candidate.name),
          ...asArray(dataset?.publicArticles).flatMap(article => clean(article.title).toLowerCase().split(/[,;|]/)),
        ].map(clean).filter(value => value.length > 2 && value.length < 120).slice(0, 24);
        const backgroundArticles = await GlobalTradeResearchService.collectRelated({
          productName: intent.product,
          country: intent.destinationCountries?.[0] || intent.countries?.[0] || '',
          candidates: relatedProducts,
        });
        await TradeKnowledge.updateOne(
          { queryKey: intent.queryKey },
          {
            ...(relatedProducts.length ? { $addToSet: { relatedProducts: { $each: relatedProducts } } } : {}),
            $set: {
              'dataset.backgroundArticles': backgroundArticles,
              backgroundEnrichedAt: new Date(),
            },
          },
        );
      } catch (error) {
        console.warn('[Trade Intelligence] Background knowledge enrichment failed:', error.message);
      }
    });
  }
}
