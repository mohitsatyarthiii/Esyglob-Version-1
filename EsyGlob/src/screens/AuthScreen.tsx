import React, { useState, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  LayoutAnimation,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { forgotPassword } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const { width } = Dimensions.get('window');

type Mode = 'login' | 'signup' | 'forgot';
type MobileRole = 'buyer' | 'seller';

type Props = {
  initialMode?: Mode;
  onClose?: () => void;
  onSuccess?: () => void;
};

// Refined Professional Color Palette
const C = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  success: '#10B981',
  successBg: '#ECFDF5',
  google: '#EA4335',
  twitter: '#1DA1F2',
  linkedin: '#0A66C2',
};

function getPasswordStrength(password: string) {
  const checks = [
    { id: 'len', label: '8+ chars', test: (p: string) => p.length >= 8 },
    { id: 'up', label: 'A-Z', test: (p: string) => /[A-Z]/.test(p) },
    { id: 'low', label: 'a-z', test: (p: string) => /[a-z]/.test(p) },
    { id: 'num', label: '0-9', test: (p: string) => /[0-9]/.test(p) },
    { id: 'sp', label: '!@#', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ];

  const results = checks.map(c => ({ ...c, passed: c.test(password) }));
  const score = results.filter(r => r.passed).length;
  
  let label = 'Weak', color = '#EF4444', width = '20%';
  if (score >= 5) { label = 'Strong'; color = '#10B981'; width = '100%'; }
  else if (score >= 4) { label = 'Good'; color = '#3B82F6'; width = '80%'; }
  else if (score >= 3) { label = 'Fair'; color = '#F59E0B'; width = '60%'; }
  else if (score >= 2) { label = 'Weak'; color = '#EF4444'; width = '40%'; }

  return { results, label, color, width, score };
}

function Field({ label, value, onChangeText, placeholder, secure, keyboard, autoCap = 'none', suffix }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
  secure?: boolean; keyboard?: any; autoCap?: any; suffix?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={S.field}>
      <Text style={S.label}>{label}</Text>
      <View style={[S.inputBox, focused && S.inputBoxFocused]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={secure}
          keyboardType={keyboard}
          autoCapitalize={autoCap}
          autoCorrect={false}
          style={S.input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {suffix}
      </View>
    </View>
  );
}

function AuthScreen({ initialMode = 'signup', onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>(route.params?.initialMode ?? initialMode);
  const [role, setRole] = useState<MobileRole>('buyer');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const validate = () => {
    if (!email.trim()) { setMsg({ type: 'error', text: 'Email required' }); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setMsg({ type: 'error', text: 'Invalid email' }); return false; }
    if (mode !== 'forgot' && !password) { setMsg({ type: 'error', text: 'Password required' }); return false; }
    if (mode === 'signup' && password.length < 8) { setMsg({ type: 'error', text: 'Min 8 characters' }); return false; }
    if (mode === 'signup' && !name.trim()) { setMsg({ type: 'error', text: 'Name required' }); return false; }
    return true;
  };

  const submit = async () => {
    setMsg(null);
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === 'forgot') {
        await forgotPassword({ email: email.trim() });
        setMsg({ type: 'success', text: 'Reset link sent' });
      } else if (mode === 'login') {
        await signIn({ email: email.trim(), password });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      } else {
        await signUp({ name: name.trim(), email: email.trim(), password, role, companyName: company.trim() || undefined });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      }
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(m);
    setMsg(null);
  };

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';

  return (
    <View style={S.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[S.scroll, { paddingTop: insets.top + 16, paddingBottom: 24 }]}
        >
          {/* Header */}
          <View style={S.header}>
            <Pressable onPress={() => onClose ? onClose() : navigation.navigate('MainTabs')} style={S.closeBtn}>
              <Icon name="close" size={20} color={C.textSecondary} />
            </Pressable>
            
            <Image 
              source={require('../../esyglob-logo.jpeg')} 
              resizeMode="contain" 
              style={S.logo} 
            />
            
            <Text style={S.title}>
              {isLogin ? 'Welcome back' : isSignup ? 'Create account' : 'Reset password'}
            </Text>
            <Text style={S.subtitle}>
              {isLogin ? 'Sign in to continue' : isSignup ? 'Join EsyGlob today' : 'We\'ll send you a reset link'}
            </Text>
          </View>

          {/* Card */}
          <View style={S.card}>
            <Animated.View style={{ opacity: fade }}>
              {/* Role Selector */}
              {isSignup && (
                <View style={S.roleRow}>
                  <Pressable onPress={() => setRole('buyer')} style={[S.roleBtn, role === 'buyer' && S.roleBtnActive]}>
                    <Icon name="shopping-outline" size={16} color={role === 'buyer' ? '#fff' : C.textSecondary} />
                    <Text style={[S.roleText, role === 'buyer' && S.roleTextActive]}>Buyer</Text>
                  </Pressable>
                  <Pressable onPress={() => setRole('seller')} style={[S.roleBtn, role === 'seller' && S.roleBtnActive]}>
                    <Icon name="storefront-outline" size={16} color={role === 'seller' ? '#fff' : C.textSecondary} />
                    <Text style={[S.roleText, role === 'seller' && S.roleTextActive]}>Seller</Text>
                  </Pressable>
                </View>
              )}

              {/* Fields */}
              {isSignup && (
                <>
                  <Field label="Full name" value={name} onChangeText={setName} placeholder="John Doe" autoCap="words" />
                  <Field label="Company (optional)" value={company} onChangeText={setCompany} placeholder="Your business" autoCap="words" />
                </>
              )}

              <Field label="Email" value={email} onChangeText={setEmail} placeholder="john@example.com" keyboard="email-address" />

              {mode !== 'forgot' && (
                <View>
                  <Field
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder={isLogin ? 'Your password' : 'Create password'}
                    secure={secure}
                    suffix={
                      <Pressable onPress={() => setSecure(!secure)} style={S.eyeBtn}>
                        <Icon name={secure ? 'eye-off-outline' : 'eye-outline'} size={16} color={C.textMuted} />
                      </Pressable>
                    }
                  />
                  {isSignup && password.length > 0 && (
                    <View style={S.strengthWrap}>
                      <View style={S.strengthBar}>
                        <View style={[S.strengthFill, { backgroundColor: strength.color, width: strength.width }]} />
                      </View>
                      <Text style={[S.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                      <View style={S.checksRow}>
                        {strength.results.map(c => (
                          <View key={c.id} style={S.check}>
                            <Icon name={c.passed ? 'check' : 'minus'} size={8} color={c.passed ? C.success : C.textMuted} />
                            <Text style={[S.checkText, c.passed && S.checkTextDone]}>{c.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Links */}
              <View style={S.links}>
                {isLogin && (
                  <Pressable onPress={() => switchMode('forgot')}>
                    <Text style={S.link}>Forgot password?</Text>
                  </Pressable>
                )}
                {mode === 'forgot' && (
                  <Pressable onPress={() => switchMode('login')}>
                    <Text style={S.link}>Back to sign in</Text>
                  </Pressable>
                )}
              </View>

              {/* Message */}
              {msg && (
                <View style={[S.msg, msg.type === 'success' ? S.msgSuccess : S.msgError]}>
                  <Icon name={msg.type === 'success' ? 'check-circle' : 'alert-circle'} size={14} color={msg.type === 'success' ? C.success : C.error} />
                  <Text style={[S.msgText, { color: msg.type === 'success' ? '#065F46' : '#991B1B' }]}>{msg.text}</Text>
                </View>
              )}

              {/* Submit */}
              <Pressable onPress={submit} disabled={loading} style={[S.btn, loading && S.btnDisabled]}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={S.btnText}>
                    {isLogin ? 'Sign in' : isSignup ? 'Create account' : 'Send reset link'}
                  </Text>
                )}
              </Pressable>

              {/* Switch */}
              {mode !== 'forgot' && (
                <Pressable style={S.switchRow} onPress={() => switchMode(isLogin ? 'signup' : 'login')}>
                  <Text style={S.switchText}>
                    {isLogin ? "Don't have an account? " : 'Already a member? '}
                    <Text style={S.switchLink}>{isLogin ? 'Sign up' : 'Sign in'}</Text>
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          </View>

          {/* Social */}
          {mode !== 'forgot' && (
            <View style={S.socialSection}>
              <View style={S.divider}>
                <View style={S.divLine} />
                <Text style={S.divText}>or continue with</Text>
                <View style={S.divLine} />
              </View>
              <View style={S.socialRow}>
                <Pressable style={S.socialBtn}>
                  <Icon name="google" size={20} color={C.google} />
                </Pressable>
                <Pressable style={S.socialBtn}>
                  <Icon name="twitter" size={20} color={C.twitter} />
                </Pressable>
                <Pressable style={S.socialBtn}>
                  <Icon name="linkedin" size={20} color={C.linkedin} />
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },

  // Header
  header: { alignItems: 'center', marginBottom: 24, marginTop: 16 },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  logo: { 
    width: 130, 
    height: 44, 
    marginBottom: 20,
     borderRadius: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: C.textSecondary,
    letterSpacing: -0.2,
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },

  // Role
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  roleBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  roleText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  roleTextActive: { color: '#fff' },

  // Fields
  field: { marginBottom: 14 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
    marginLeft: 2,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  inputBoxFocused: { borderColor: C.primary, backgroundColor: C.surface },
  input: { flex: 1, fontSize: 13, color: C.text, fontWeight: '500', padding: 0 },
  eyeBtn: { padding: 4 },

  // Strength
  strengthWrap: {
    marginTop: -6,
    marginBottom: 8,
    backgroundColor: C.primaryLight,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  strengthBar: { height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 6 },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  checksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  checkText: { fontSize: 9, fontWeight: '500', color: C.textMuted },
  checkTextDone: { color: C.text, fontWeight: '600' },

  // Links
  links: { alignItems: 'flex-end', marginBottom: 12 },
  link: { fontSize: 12, fontWeight: '600', color: C.primary },

  // Message
  msg: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginBottom: 12 },
  msgSuccess: { backgroundColor: C.successBg },
  msgError: { backgroundColor: C.errorBg },
  msgText: { fontSize: 11, fontWeight: '500', flex: 1 },

  // Button
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  // Switch
  switchRow: { alignItems: 'center', marginTop: 14 },
  switchText: { fontSize: 12, color: C.textSecondary },
  switchLink: { fontWeight: '700', color: C.primary },

  // Social
  socialSection: { marginTop: 24, alignItems: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, width: '100%' },
  divLine: { flex: 1, height: 1, backgroundColor: C.border },
  divText: { marginHorizontal: 12, fontSize: 11, color: C.textMuted, fontWeight: '500' },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
});

export default AuthScreen;