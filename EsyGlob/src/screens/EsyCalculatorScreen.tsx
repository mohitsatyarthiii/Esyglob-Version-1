import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  CurrencyCalculator, FreightCalculator, GstCalculator, ImportDutyCalculator,
  LandedCostCalculator, MoqCalculator, PackagingCalculator, ProfitCalculator,
  TradeSummaryCalculator,
} from '../features/tradeCalculator/CalculatorModules';
import { CostSummary, emptyCostSummary } from '../features/tradeCalculator/calculations';

const TABS = [
  { key:'landed', label:'Landed Cost', icon:'package-variant-closed' },
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

export default function EsyCalculatorScreen() {
  const navigation=useNavigation<any>(); const [active,setActive]=useState<TabKey>('landed'); const [summary,setSummary]=useState<CostSummary>(emptyCostSummary); const opacity=useRef(new Animated.Value(1)).current;
  const selectTab=useCallback((key:TabKey)=>{if(key===active)return;Animated.timing(opacity,{toValue:0,duration:90,useNativeDriver:true}).start(()=>{setActive(key);Animated.timing(opacity,{toValue:1,duration:170,useNativeDriver:true}).start();});},[active,opacity]);
  const onSummaryChange=useCallback((next:CostSummary)=>setSummary(current=>JSON.stringify(current)===JSON.stringify(next)?current:next),[]);
  const module=useMemo(()=>{switch(active){case'gst':return <GstCalculator/>;case'duty':return <ImportDutyCalculator/>;case'freight':return <FreightCalculator/>;case'currency':return <CurrencyCalculator/>;case'profit':return <ProfitCalculator/>;case'moq':return <MoqCalculator/>;case'packaging':return <PackagingCalculator/>;case'summary':return <TradeSummaryCalculator summary={summary}/>;default:return <LandedCostCalculator onSummaryChange={onSummaryChange}/>;}},[active,onSummaryChange,summary]);
  return <View style={s.screen}><View style={s.header}><Pressable accessibilityLabel="Go back" onPress={()=>navigation.goBack()} style={s.back}><Icon name="arrow-left" size={23} color="#0F172A"/></Pressable><View style={s.headerBody}><Text style={s.title}>Esy Trade Calculator</Text><Text style={s.subtitle}>Enterprise sourcing & trade utilities</Text></View><View style={s.brand}><Icon name="calculator-variant-outline" size={22} color="#4F46E5"/></View></View><View style={s.tabsWrap}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{TABS.map(tab=><Pressable key={tab.key} onPress={()=>selectTab(tab.key)} style={[s.tab,active===tab.key&&s.tabActive]}><Icon name={tab.icon} size={16} color={active===tab.key?'#FFF':'#64748B'}/><Text style={[s.tabText,active===tab.key&&s.tabTextActive]}>{tab.label}</Text></Pressable>)}</ScrollView></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}><View style={s.hero}><View style={s.heroIcon}><Icon name={TABS.find(x=>x.key===active)?.icon??'calculator'} size={24} color="#FFF"/></View><View style={s.heroBody}><Text style={s.heroKicker}>TRADE INTELLIGENCE</Text><Text style={s.heroTitle}>{TABS.find(x=>x.key===active)?.label} Calculator</Text><Text style={s.heroText}>Instant planning estimates for confident international trade decisions.</Text></View></View><Animated.View style={{opacity}}>{module}</Animated.View><View style={s.disclaimer}><Icon name="shield-check-outline" size={17} color="#64748B"/><Text style={s.disclaimerText}>Planning estimates only. Confirm taxes, duty and freight with the appropriate authority or service provider before transacting.</Text></View></ScrollView></View>;
}

const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#F5F7FB'},header:{paddingTop:50,paddingHorizontal:15,paddingBottom:11,flexDirection:'row',alignItems:'center',backgroundColor:'#FFF'},back:{width:40,height:40,borderRadius:12,backgroundColor:'#F1F5F9',alignItems:'center',justifyContent:'center'},headerBody:{flex:1,marginHorizontal:11},title:{fontSize:18,fontWeight:'900',color:'#0F172A'},subtitle:{fontSize:9,color:'#64748B',marginTop:2,fontWeight:'700'},brand:{width:40,height:40,borderRadius:12,backgroundColor:'#EEF2FF',alignItems:'center',justifyContent:'center'},tabsWrap:{backgroundColor:'#FFF',borderBottomWidth:1,borderBottomColor:'#E7ECF4'},tabs:{paddingHorizontal:14,paddingVertical:10,gap:7},tab:{height:36,flexDirection:'row',alignItems:'center',paddingHorizontal:12,borderRadius:11,backgroundColor:'#F1F5F9'},tabActive:{backgroundColor:'#4F46E5',shadowColor:'#4F46E5',shadowOpacity:.22,shadowRadius:6,shadowOffset:{width:0,height:3},elevation:3},tabText:{fontSize:11,fontWeight:'800',color:'#64748B',marginLeft:5},tabTextActive:{color:'#FFF'},content:{padding:14,paddingBottom:50},hero:{flexDirection:'row',backgroundColor:'#111827',borderRadius:19,padding:16,marginBottom:12,overflow:'hidden'},heroIcon:{width:48,height:48,borderRadius:15,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center',marginRight:12},heroBody:{flex:1},heroKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:'#A5B4FC'},heroTitle:{fontSize:17,fontWeight:'900',color:'#FFF',marginTop:2},heroText:{fontSize:10,lineHeight:15,color:'#CBD5E1',marginTop:3},disclaimer:{flexDirection:'row',backgroundColor:'#EEF2F7',borderRadius:13,padding:12,marginTop:2},disclaimerText:{flex:1,fontSize:9,lineHeight:14,color:'#64748B',marginLeft:8}}
);
