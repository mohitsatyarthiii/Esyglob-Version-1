/* eslint-disable @typescript-eslint/no-shadow */
import React, { memo, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export type Option = { label: string; value: string; caption?: string };

export const SectionCard = memo(function SectionCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return <View style={styles.card}>
    <View style={styles.cardTitleRow}>{icon ? <View style={styles.cardIcon}><Icon name={icon} size={17} color="#4F46E5" /></View> : null}<Text style={styles.cardTitle}>{title}</Text></View>
    {children}
  </View>;
});

export const FieldRow = ({ children }: { children: React.ReactNode }) => <View style={styles.fieldRow}>{children}</View>;

export const NumberField = memo(function NumberField({ label, value, onChange, suffix, placeholder = '0', hint }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string; hint?: string }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputShell}><TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor="#94A3B8" style={styles.input} />{suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}</View>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
});

export const TextField = memo(function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputShell}><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94A3B8" style={styles.input} /></View></View>;
});

export const SelectField = memo(function SelectField({ label, value, options, onChange, searchable = false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => options.filter(option => `${option.label} ${option.caption ?? ''}`.toLowerCase().includes(query.toLowerCase())), [options, query]);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.select}><Text numberOfLines={1} style={styles.selectText}>{selected?.label ?? 'Select'}</Text><Icon name="chevron-down" size={19} color="#64748B" /></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)}><Pressable style={styles.sheet} onPress={() => undefined}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Select {label}</Text><Pressable onPress={() => setOpen(false)}><Icon name="close" size={23} color="#334155" /></Pressable></View>
        {searchable ? <View style={styles.search}><Icon name="magnify" size={19} color="#64748B" /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search options" placeholderTextColor="#94A3B8" style={styles.searchInput} /></View> : null}
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.options}>{filtered.map(option => <Pressable key={option.value} onPress={() => { onChange(option.value); setOpen(false); setQuery(''); }} style={[styles.option, option.value === value && styles.optionActive]}><View style={styles.optionBody}><Text style={[styles.optionText, option.value === value && styles.optionTextActive]}>{option.label}</Text>{option.caption ? <Text style={styles.optionCaption}>{option.caption}</Text> : null}</View>{option.value === value ? <Icon name="check-circle" size={20} color="#4F46E5" /> : null}</Pressable>)}</ScrollView>
      </Pressable></Pressable>
    </Modal>
  </View>;
});

export type ResultRow = { label: string; value: string; tone?: 'normal' | 'positive' | 'warning' };
export const ResultCard = memo(function ResultCard({ title, value, rows, icon = 'chart-box-outline', tone = 'indigo', note }: { title: string; value?: string; rows: ResultRow[]; icon?: string; tone?: 'indigo' | 'green' | 'amber'; note?: string }) {
  const color = tone === 'green' ? '#059669' : tone === 'amber' ? '#D97706' : '#4F46E5';
  return <View style={[styles.result, { borderTopColor: color }]}><View style={styles.resultHead}><View style={[styles.resultIcon, { backgroundColor: `${color}16` }]}><Icon name={icon} size={21} color={color} /></View><View style={styles.resultHeadBody}><Text style={styles.resultTitle}>{title}</Text>{value ? <Text style={[styles.resultValue, { color }]}>{value}</Text> : null}</View></View>{rows.map((row, index) => <View key={`${row.label}-${index}`} style={styles.resultRow}><Text style={styles.resultLabel}>{row.label}</Text><Text style={[styles.resultRowValue, row.tone === 'positive' && styles.positive, row.tone === 'warning' && styles.warning]}>{row.value}</Text></View>)}{note ? <View style={styles.note}><Icon name="information-outline" size={15} color="#64748B" /><Text style={styles.noteText}>{note}</Text></View> : null}</View>;
});

export const styles = StyleSheet.create({
  card:{backgroundColor:'#FFF',borderRadius:18,padding:15,marginBottom:12,borderWidth:1,borderColor:'#E8EDF5',shadowColor:'#0F172A',shadowOpacity:.05,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:2},cardTitleRow:{flexDirection:'row',alignItems:'center',marginBottom:13},cardIcon:{width:30,height:30,borderRadius:9,backgroundColor:'#EEF2FF',alignItems:'center',justifyContent:'center',marginRight:9},cardTitle:{fontSize:14,fontWeight:'900',color:'#0F172A'},fieldRow:{flexDirection:'row',gap:10},field:{flex:1,minWidth:0,marginBottom:12},label:{fontSize:10,fontWeight:'800',letterSpacing:.35,color:'#64748B',textTransform:'uppercase',marginBottom:6},inputShell:{height:46,flexDirection:'row',alignItems:'center',borderRadius:12,borderWidth:1,borderColor:'#DDE5F0',backgroundColor:'#F8FAFC'},input:{flex:1,color:'#0F172A',fontSize:14,fontWeight:'700',paddingHorizontal:12,paddingVertical:0},suffix:{fontSize:11,fontWeight:'800',color:'#64748B',paddingRight:11},hint:{fontSize:9,color:'#94A3B8',marginTop:4},select:{height:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:12,borderWidth:1,borderColor:'#DDE5F0',backgroundColor:'#F8FAFC',paddingHorizontal:12},selectText:{flex:1,fontSize:13,fontWeight:'700',color:'#0F172A'},backdrop:{flex:1,backgroundColor:'rgba(15,23,42,.48)',justifyContent:'flex-end'},sheet:{maxHeight:'72%',backgroundColor:'#FFF',borderTopLeftRadius:24,borderTopRightRadius:24,padding:18},sheetHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},sheetTitle:{fontSize:17,fontWeight:'900',color:'#0F172A'},search:{height:44,flexDirection:'row',alignItems:'center',borderRadius:12,backgroundColor:'#F1F5F9',paddingHorizontal:11,marginBottom:8},searchInput:{flex:1,fontSize:14,color:'#0F172A',paddingHorizontal:8},options:{maxHeight:390},option:{minHeight:50,flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:12,marginVertical:2},optionActive:{backgroundColor:'#EEF2FF'},optionBody:{flex:1},optionText:{fontSize:14,fontWeight:'700',color:'#334155'},optionTextActive:{color:'#4338CA'},optionCaption:{fontSize:10,color:'#94A3B8',marginTop:2},result:{backgroundColor:'#FFF',borderRadius:18,borderWidth:1,borderColor:'#E8EDF5',borderTopWidth:3,padding:16,marginBottom:12},resultHead:{flexDirection:'row',alignItems:'center',marginBottom:12},resultIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',marginRight:11},resultHeadBody:{flex:1},resultTitle:{fontSize:11,fontWeight:'800',color:'#64748B',textTransform:'uppercase',letterSpacing:.5},resultValue:{fontSize:22,fontWeight:'900',marginTop:2},resultRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#E2E8F0'},resultLabel:{fontSize:12,color:'#64748B'},resultRowValue:{fontSize:12,fontWeight:'900',color:'#0F172A',maxWidth:'58%',textAlign:'right'},positive:{color:'#059669'},warning:{color:'#D97706'},note:{flexDirection:'row',alignItems:'flex-start',backgroundColor:'#F8FAFC',borderRadius:10,padding:9,marginTop:9},noteText:{flex:1,fontSize:10,lineHeight:15,color:'#64748B',marginLeft:6}
});
