import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  CurrencyCalculator, FreightCalculator, GstCalculator, ImportDutyCalculator,
  LandedCostCalculator, MoqCalculator, PackagingCalculator, ProfitCalculator,
  TradeSummaryCalculator,
} from '../features/tradeCalculator/CalculatorModules';
import { CostSummary, emptyCostSummary } from '../features/tradeCalculator/calculations';

const TABS = [
  { key:'landed', label:'Landed Cost', icon:'package-variant-closed' },
  { key:'simple', label:'Calculator', icon:'calculator-variant' },
  { key:'gst', label:'GST', icon:'receipt-text-outline' },
  { key:'duty', label:'Import Duty', icon:'bank-outline' },
  { key:'freight', label:'Freight', icon:'truck-fast-outline' },
  { key:'currency', label:'Currency', icon:'currency-usd' },
  { key:'profit', label:'Profit', icon:'chart-line' },
  { key:'moq', label:'MOQ Pricing', icon:'format-list-numbered' },
  { key:'packaging', label:'Packaging', icon:'cube-outline' },
  { key:'summary', label:'Trade Summary', icon:'clipboard-text-outline' },
] as const;
type TabKey = typeof TABS[number]['key'];

// ─── Simple Calculator Component ────────────────────────────────────────────

function SimpleCalculator() {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [shouldResetDisplay, setShouldResetDisplay] = useState(false);
  const [lastOperator, setLastOperator] = useState('');
  const [storedValue, setStoredValue] = useState<number | null>(null);

  const handleNumber = (num: string) => {
    if (shouldResetDisplay) {
      setDisplay(num);
      setShouldResetDisplay(false);
    } else {
      setDisplay(prev => prev === '0' ? num : prev + num);
    }
  };

  const handleDecimal = () => {
    if (shouldResetDisplay) {
      setDisplay('0.');
      setShouldResetDisplay(false);
    } else if (!display.includes('.')) {
      setDisplay(prev => prev + '.');
    }
  };

  const handleOperator = (op: string) => {
    const currentValue = parseFloat(display);
    
    if (storedValue === null) {
      setStoredValue(currentValue);
      setEquation(`${display} ${op}`);
    } else {
      const result = calculate(storedValue, currentValue, lastOperator);
      setStoredValue(result);
      setDisplay(String(result));
      setEquation(`${result} ${op}`);
    }
    
    setLastOperator(op);
    setShouldResetDisplay(true);
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleEquals = () => {
    if (storedValue === null || !lastOperator) return;
    
    const currentValue = parseFloat(display);
    const result = calculate(storedValue, currentValue, lastOperator);
    const fullEquation = `${storedValue} ${lastOperator} ${currentValue} =`;
    
    setDisplay(formatResult(result));
    setEquation(fullEquation);
    setStoredValue(null);
    setLastOperator('');
    setShouldResetDisplay(true);
  };

  const formatResult = (num: number): string => {
    if (num === 0 && 1/num === -Infinity) return 'Error';
    if (Number.isInteger(num)) return String(num);
    return parseFloat(num.toFixed(8)).toString();
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setStoredValue(null);
    setLastOperator('');
    setShouldResetDisplay(false);
  };

  const handleBackspace = () => {
    if (shouldResetDisplay) return;
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  const handlePercentage = () => {
    const currentValue = parseFloat(display);
    const result = currentValue / 100;
    setDisplay(formatResult(result));
    setShouldResetDisplay(true);
  };

  const handleToggleSign = () => {
    const currentValue = parseFloat(display);
    setDisplay(String(-currentValue));
  };

  const getButtonStyle = (type: string) => {
    switch (type) {
      case 'number': return calcStyles.btnNumber;
      case 'operator': return calcStyles.btnOperator;
      case 'function': return calcStyles.btnFunction;
      case 'equals': return calcStyles.btnEquals;
      default: return calcStyles.btnNumber;
    }
  };

  const getButtonTextStyle = (type: string) => {
    switch (type) {
      case 'operator': return calcStyles.btnTextOperator;
      case 'equals': return calcStyles.btnTextEquals;
      default: return calcStyles.btnTextDefault;
    }
  };

  return (
    <View style={calcStyles.container}>
      {/* Display */}
      <View style={calcStyles.displayContainer}>
        <Text style={calcStyles.equation} numberOfLines={1}>
          {equation}
        </Text>
        <Text 
          style={[
            calcStyles.display,
            display.length > 12 && calcStyles.displaySmall,
            display.length > 15 && calcStyles.displayExtraSmall,
          ]} 
          numberOfLines={1} 
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </View>

      {/* Keypad */}
      <View style={calcStyles.keypad}>
        {/* Row 1 */}
        <View style={calcStyles.row}>
          <Pressable 
            onPress={handleClear} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnFunction, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextFunction}>AC</Text>
          </Pressable>
          <Pressable 
            onPress={handleToggleSign} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnFunction, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextFunction}>±</Text>
          </Pressable>
          <Pressable 
            onPress={handlePercentage} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnFunction, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextFunction}>%</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleOperator('÷')} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnOperator, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextOperator}>÷</Text>
          </Pressable>
        </View>

        {/* Row 2 */}
        <View style={calcStyles.row}>
          <Pressable 
            onPress={() => handleNumber('7')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>7</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('8')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>8</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('9')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>9</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleOperator('×')} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnOperator, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextOperator}>×</Text>
          </Pressable>
        </View>

        {/* Row 3 */}
        <View style={calcStyles.row}>
          <Pressable 
            onPress={() => handleNumber('4')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>4</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('5')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>5</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('6')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>6</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleOperator('-')} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnOperator, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextOperator}>−</Text>
          </Pressable>
        </View>

        {/* Row 4 */}
        <View style={calcStyles.row}>
          <Pressable 
            onPress={() => handleNumber('1')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>1</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('2')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>2</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('3')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>3</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleOperator('+')} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnOperator, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextOperator}>+</Text>
          </Pressable>
        </View>

        {/* Row 5 */}
        <View style={calcStyles.row}>
          <Pressable 
            onPress={handleBackspace} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnFunction, pressed && calcStyles.btnPressed]}
          >
            <Icon name="backspace-outline" size={20} color="#64748B" />
          </Pressable>
          <Pressable 
            onPress={() => handleNumber('0')} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>0</Text>
          </Pressable>
          <Pressable 
            onPress={handleDecimal} 
            style={({pressed}) => [calcStyles.btn, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextDefault}>.</Text>
          </Pressable>
          <Pressable 
            onPress={handleEquals} 
            style={({pressed}) => [calcStyles.btn, calcStyles.btnEquals, pressed && calcStyles.btnPressed]}
          >
            <Text style={calcStyles.btnTextEquals}>=</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const calcStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  displayContainer: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 24,
    minHeight: 120,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  equation: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 8,
    maxWidth: '100%',
  },
  display: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: '100%',
  },
  displaySmall: {
    fontSize: 32,
  },
  displayExtraSmall: {
    fontSize: 26,
  },
  keypad: {
    padding: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  btnNumber: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnOperator: {
    backgroundColor: '#EEF2FF',
  },
  btnFunction: {
    backgroundColor: '#F1F5F9',
  },
  btnEquals: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnTextDefault: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
  },
  btnTextOperator: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4F46E5',
  },
  btnTextFunction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  btnTextEquals: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function EsyCalculatorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [active, setActive] = useState<TabKey>(() =>
    TABS.some(tab => tab.key === route.params?.tab) ? route.params.tab : 'landed',
  );
  const [summary, setSummary] = useState<CostSummary>(emptyCostSummary);
  const opacity = useRef(new Animated.Value(1)).current;

  const selectTab = useCallback(
    (key: TabKey) => {
      if (key === active) return;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true,
      }).start(() => {
        setActive(key);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 170,
          useNativeDriver: true,
        }).start();
      });
    },
    [active, opacity]
  );

  const onSummaryChange = useCallback(
    (next: CostSummary) =>
      setSummary(current =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      ),
    []
  );

  const module = useMemo(() => {
    switch (active) {
      case 'gst':
        return <GstCalculator />;
      case 'duty':
        return <ImportDutyCalculator />;
      case 'freight':
        return <FreightCalculator />;
      case 'currency':
        return <CurrencyCalculator />;
      case 'profit':
        return <ProfitCalculator />;
      case 'moq':
        return <MoqCalculator />;
      case 'packaging':
        return <PackagingCalculator />;
      case 'summary':
        return <TradeSummaryCalculator summary={summary} />;
      case 'simple':
        return <SimpleCalculator />;
      default:
        return <LandedCostCalculator onSummaryChange={onSummaryChange} />;
    }
  }, [active, onSummaryChange, summary]);

  const activeTab = TABS.find(x => x.key === active);

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={s.back}
        >
          <Icon name="arrow-left" size={23} color="#0F172A" />
        </Pressable>
        <View style={s.headerBody}>
          <Text style={s.title}>Esy Trade Calculator</Text>
          <Text style={s.subtitle}>Enterprise sourcing & trade utilities</Text>
        </View>
        <View style={s.brand}>
          <Icon name="calculator-variant-outline" size={22} color="#4F46E5" />
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
        >
          {TABS.map(tab => (
            <Pressable
              key={tab.key}
              onPress={() => selectTab(tab.key)}
              style={[s.tab, active === tab.key && s.tabActive]}
            >
              <Icon
                name={tab.icon}
                size={16}
                color={active === tab.key ? '#FFF' : '#64748B'}
              />
              <Text
                style={[s.tabText, active === tab.key && s.tabTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Icon
              name={activeTab?.icon ?? 'calculator'}
              size={24}
              color="#FFF"
            />
          </View>
          <View style={s.heroBody}>
            <Text style={s.heroKicker}>TRADE INTELLIGENCE</Text>
            <Text style={s.heroTitle}>
              {activeTab?.label} Calculator
            </Text>
            <Text style={s.heroText}>
              {active === 'simple'
                ? 'Quick calculations for on-the-go trade math.'
                : 'Instant planning estimates for confident international trade decisions.'}
            </Text>
          </View>
        </View>

        <Animated.View style={{ opacity }}>{module}</Animated.View>

        {/* Disclaimer */}
        {active !== 'simple' && (
          <View style={s.disclaimer}>
            <Icon name="shield-check-outline" size={17} color="#64748B" />
            <Text style={s.disclaimerText}>
              Planning estimates only. Confirm taxes, duty and freight with the
              appropriate authority or service provider before transacting.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FB' },
  header: {
    paddingTop: 50,
    paddingHorizontal: 15,
    paddingBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, marginHorizontal: 11 },
  title: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 9, color: '#64748B', marginTop: 2, fontWeight: '700' },
  brand: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsWrap: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECF4',
  },
  tabs: { paddingHorizontal: 14, paddingVertical: 10, gap: 7 },
  tab: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
  },
  tabActive: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabText: { fontSize: 11, fontWeight: '800', color: '#64748B', marginLeft: 5 },
  tabTextActive: { color: '#FFF' },
  content: { padding: 14, paddingBottom: 50 },
  hero: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 19,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroBody: { flex: 1 },
  heroKicker: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#A5B4FC',
  },
  heroTitle: { fontSize: 17, fontWeight: '900', color: '#FFF', marginTop: 2 },
  heroText: {
    fontSize: 10,
    lineHeight: 15,
    color: '#CBD5E1',
    marginTop: 3,
  },
  disclaimer: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F7',
    borderRadius: 13,
    padding: 12,
    marginTop: 2,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 14,
    color: '#64748B',
    marginLeft: 8,
  },
});
