import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const DEFAULT_STEPS=['Analyzing your request...','Searching marketplace...','Checking products...','Preparing response...'];
export default function CompactAIStatus({steps=DEFAULT_STEPS}:{steps?:string[]}){const [index,setIndex]=useState(0);const opacity=useRef(new Animated.Value(1)).current;useEffect(()=>{const timer=setInterval(()=>{Animated.timing(opacity,{toValue:0,duration:180,useNativeDriver:true}).start(()=>{setIndex(x=>(x+1)%steps.length);Animated.timing(opacity,{toValue:1,duration:220,useNativeDriver:true}).start()})},1400);return()=>clearInterval(timer)},[opacity,steps.length]);return <View style={s.row}><Icon name="creation" size={15} color="#2563EB"/><Animated.View style={{opacity}}><Text style={s.text}>{steps[index]}</Text></Animated.View></View>}
const s=StyleSheet.create({row:{alignSelf:'flex-start',alignItems:'center',backgroundColor:'#EFF6FF',borderColor:'#DBEAFE',borderWidth:1,borderRadius:16,flexDirection:'row',gap:7,minHeight:34,paddingHorizontal:11,marginVertical:5},text:{color:'#334155',fontSize:10.5,fontWeight:'700'}});
