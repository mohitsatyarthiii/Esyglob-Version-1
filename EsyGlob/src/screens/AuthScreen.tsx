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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { forgotPassword } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'signup' | 'forgot';
type MobileRole = 'buyer' | 'seller';

type Props = {
  initialMode?: Mode;
  onClose?: () => void;
  onSuccess?: () => void;
};

// Premium Brand Colors (Unique Blue tone)
const D = {
  primary: '#3B4BFA', // The original premium Blob Blue
  primaryDark: '#2A38D6',
  accentGlow: '#EFF2FF',
  surface: '#FFFFFF',
  background: '#1C6B85', // Deep teal background
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  error: '#EF4444',
  errorLight: '#FEF2F2',
  success: '#10B981',
  successLight: '#ECFDF5',
};

// Password Strength
function getPasswordStrength(password: string) {
  const checks = [
    { id: 'length', label: '8+ characters', test: (p: string) => p.length >= 8 },
    { id: 'uppercase', label: 'Uppercase (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
    { id: 'lowercase', label: 'Lowercase (a-z)', test: (p: string) => /[a-z]/.test(p) },
    { id: 'number', label: 'Number (0-9)', test: (p: string) => /[0-9]/.test(p) },
    { id: 'special', label: 'Special (!@#)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
    { id: 'length12', label: '12+ characters', test: (p: string) => p.length >= 12 },
  ];

  const results = checks.map(check => ({
    ...check,
    passed: check.test(password),
  }));

  const passedCount = results.filter(r => r.passed).length;
  
  let strength = 'Weak';
  let color = '#EF4444';
  
  if (passedCount >= 6) { strength = 'Excellent'; color = '#10B981'; }
  else if (passedCount >= 5) { strength = 'Strong'; color = '#22C55E'; }
  else if (passedCount >= 4) { strength = 'Good'; color = '#3B82F6'; }
  else if (passedCount >= 2) { strength = 'Fair'; color = '#F59E0B'; }

  return { results, strength, color, passedCount };
}

// Compact & Premium Field Component
function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  children,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  children?: React.ReactNode;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View style={S.fieldContainer}>
      <Text style={S.fieldLabel}>{label}</Text>
      <View style={[S.fieldInputBox, isFocused && S.fieldInputBoxFocused]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={D.textTertiary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={S.fieldInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {children && <View style={S.fieldInputIcon}>{children}</View>}
      </View>
    </View>
  );
}

// Compact Password Input
function PasswordInput({
  value,
  onChangeText,
  placeholder,
  label,
  showStrength = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const strength = useMemo(() => getPasswordStrength(value), [value]);

  return (
    <View>
      <FieldInput 
        label={label} 
        value={value} 
        onChangeText={onChangeText} 
        placeholder={placeholder}
        secureTextEntry={!visible}
      >
        <Pressable onPress={() => setVisible(!visible)} hitSlop={8}>
            <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={15} color={D.textTertiary} />
        </Pressable>
      </FieldInput>

      {showStrength && value.length > 0 && (
        <View style={S.strengthPanel}>
          <View style={S.strengthHeader}>
            <View style={S.strengthBarBg}>
              <View style={[S.strengthBarFill, { backgroundColor: strength.color, width: `${(strength.passedCount / 6) * 100}%` }]} />
            </View>
            <Text style={[S.strengthText, { color: strength.color }]}>{strength.strength}</Text>
          </View>
          <View style={S.checksGrid}>
            {strength.results.map((item) => (
              <View key={item.id} style={S.checkRow}>
                <Icon 
                  name={item.passed ? 'check-circle' : 'circle-outline'} 
                  size={10} 
                  color={item.passed ? D.success : D.textTertiary} 
                />
                <Text style={[S.checkLabel, item.passed && S.checkLabelDone]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// Main Component
function AuthScreen({ initialMode = 'signup', onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { signIn, signUp } = useAuth();
  
  const [mode, setMode] = useState<Mode>(route.params?.initialMode ?? 'signup');
  const [role, setRole] = useState<MobileRole>('buyer');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const validateForm = () => {
    if (!email.trim()) { setFormMessage({ type: 'error', text: 'Email is required' }); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setFormMessage({ type: 'error', text: 'Invalid email address' }); return false; }
    if (mode !== 'forgot' && !password) { setFormMessage({ type: 'error', text: 'Password is required' }); return false; }
    if (mode === 'signup' && password.length < 8) { setFormMessage({ type: 'error', text: 'Minimum 8 characters' }); return false; }
    if (mode === 'signup' && !name.trim()) { setFormMessage({ type: 'error', text: 'Name is required' }); return false; }
    return true;
  };

  const submit = async () => {
    setFormMessage(null);
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        await forgotPassword({ email: email.trim() });
        setFormMessage({ type: 'success', text: 'Reset link sent to your email' });
      } else if (mode === 'login') {
        await signIn({ email: email.trim(), password });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      } else {
        await signUp({ name: name.trim(), email: email.trim(), password, role, companyName: companyName.trim() || undefined });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      }
    } catch (nextError) {
      setFormMessage({ type: 'error', text: nextError instanceof Error ? nextError.message : 'Something went wrong' });
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (onClose) { onClose(); return; }
    navigation.navigate('MainTabs');
  };

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  const switchMode = (newMode: Mode) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(newMode);
    setFormMessage(null);
  };

  return (
    <View style={S.root}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={S.keyboard}>
        <ScrollView 
          keyboardShouldPersistTaps="handled" 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[S.scrollContainer, { paddingTop: insets.top + 30, paddingBottom: 30 }]}
        >
          
          <View style={S.card}>
            
            {/* Premium Brand Blob Header */}
            <View style={S.blobContainer}>
                <View style={S.blobShape} />
                
                <View style={S.brandPill}>
                  <Text style={S.brandText}>EsyGlob</Text>
                </View>

                <Text style={S.blobTitle}>
                    {isLogin ? "Welcome Back!" : isSignup ? "Join us today" : "Reset Password"}
                </Text>
                <Text style={S.blobSubtitle}>
                    {isLogin ? "Access your global trade" : isSignup ? "Start your trade journey" : "Recover your account"}
                </Text>

                {isLogin && (
                    <Pressable onPress={close} style={S.closeBtnCard}>
                        <Icon name="close" size={18} color="#FFF" />
                    </Pressable>
                )}
            </View>

            {/* Modern Compact Body */}
            <Animated.View style={[S.bodyContainer, { opacity: fadeAnim }]}>
                
                {/* Clean Role Toggle */}
                {isSignup && (
                    <View style={S.roleArea}>
                        <View style={S.roleRow}>
                            <Pressable onPress={() => setRole('buyer')} style={[S.roleCard, role === 'buyer' && S.roleCardActive]}>
                                <Icon name="shopping-outline" size={14} color={role === 'buyer' ? '#FFFFFF' : D.textSecondary} />
                                <Text style={[S.roleName, role === 'buyer' && S.roleNameActive]}>Buyer</Text>
                            </Pressable>
                            <Pressable onPress={() => setRole('seller')} style={[S.roleCard, role === 'seller' && S.roleCardActive]}>
                                <Icon name="storefront-outline" size={14} color={role === 'seller' ? '#FFFFFF' : D.textSecondary} />
                                <Text style={[S.roleName, role === 'seller' && S.roleNameActive]}>Seller</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                {/* Compact Form Fields */}
                {isSignup && (
                    <>
                        <FieldInput 
                            label="NAME" 
                            value={name} 
                            onChangeText={setName} 
                            placeholder="Jacob josef"
                            autoCapitalize="words"
                        />
                        <FieldInput 
                            label="COMPANY" 
                            value={companyName} 
                            onChangeText={setCompanyName} 
                            placeholder="Your Business (Optional)"
                            autoCapitalize="words"
                        />
                    </>
                )}

                <FieldInput 
                    label="EMAIL" 
                    value={email} 
                    onChangeText={setEmail} 
                    placeholder="jacob@gmail.com"
                    keyboardType="email-address"
                />

                {!isForgot && (
                    <PasswordInput 
                        label="PASSWORD" 
                        value={password} 
                        onChangeText={setPassword} 
                        placeholder={isLogin ? "Esyglob password" : "Create Esyglob password"}
                        showStrength={isSignup}
                    />
                )}

                {/* Footer Options */}
                <View style={S.linkRow}>
                    {isLogin && (
                        <View style={S.rememberRow}>
                            <Pressable style={S.checkbox}>
                                <Icon name="checkbox-blank-outline" size={16} color={D.textTertiary} />
                            </Pressable>
                            <Text style={S.rememberText}>Remember</Text>
                            <View style={S.spacer} />
                            <Pressable onPress={() => switchMode('forgot')}>
                                <Text style={S.linkText}>Forgot?</Text>
                            </Pressable>
                        </View>
                    )}
                    {isForgot && (
                        <Pressable onPress={() => switchMode('login')}>
                            <Text style={S.linkText}>← Back</Text>
                        </Pressable>
                    )}
                    {isSignup && (
                        <View style={S.rememberRow}>
                            <Pressable style={S.checkbox}>
                                <Icon name="checkbox-blank-outline" size={16} color={D.textTertiary} />
                            </Pressable>
                            <Text style={S.rememberText}>I accept Terms</Text>
                        </View>
                    )}
                </View>

                {/* Alert */}
                {formMessage && (
                    <View style={[S.alertBox, formMessage.type === 'success' ? S.alertSuccess : S.alertError]}>
                        <Icon name={formMessage.type === 'success' ? 'check-circle' : 'alert-circle'} size={14} color={formMessage.type === 'success' ? D.success : D.error} />
                        <Text style={[S.alertText, {color: formMessage.type === 'success' ? '#065F46' : '#991B1B'}]}>{formMessage.text}</Text>
                    </View>
                )}

                {/* Primary CTA */}
                <Pressable 
                    disabled={submitting} 
                    onPress={submit} 
                    style={({pressed}) => [
                        S.ctaBtn, 
                        pressed && S.ctaBtnPressed,
                        submitting && {opacity: 0.7}
                    ]}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" size="small" />
                    ) : (
                        <Text style={S.ctaText}>
                            {isLogin ? 'Log In' : isSignup ? 'Create Account' : 'Send Link'}
                        </Text>
                    )}
                </Pressable>

                {/* Switch Link */}
                {isLogin ? (
                    <Pressable style={S.switchRow} onPress={() => switchMode('signup')}>
                        <Text style={S.switchText}>New here? <Text style={S.switchTextBold}>Join Us</Text></Text>
                    </Pressable>
                ) : isSignup ? (
                    <Pressable style={S.switchRow} onPress={() => switchMode('login')}>
                        <Text style={S.switchText}>Member? <Text style={S.switchTextBold}>Login</Text></Text>
                    </Pressable>
                ) : null}

                {/* Social Connect */}
                {!isForgot && (
                    <View style={S.socialDivider}>
                        <View style={S.divLine} />
                        <Text style={S.divText}>or</Text>
                        <View style={S.divLine} />
                    </View>
                )}
                {!isForgot && (
                    <View style={S.socialRow}>
                        <Pressable style={S.socialBtn}><Icon name="google" color="#DB4437" size={22} /></Pressable>
                        <Pressable style={S.socialBtn}><Icon name="twitter" color="#1DA1F2" size={22} /></Pressable>
                        <Pressable style={S.socialBtn}><Icon name="linkedin" color="#0077B5" size={22} /></Pressable>
                    </View>
                )}
            </Animated.View>
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Unique Premium Styles
const S = StyleSheet.create({
  root: { 
    flex: 1, 
    backgroundColor: '#2B5D8C', // Deep bg
  },
  keyboard: { flex: 1 },
  scrollContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },

  // Unique Card
  card: {
    width: '90%',
    maxWidth: 390,
    backgroundColor: D.surface,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative'
  },

  // Premium Blob with Branding
  blobContainer: {
    position: 'relative',
    marginBottom: 8,
    marginLeft: -12,
    marginRight: -12,
    height: 150,
    justifyContent: 'center',
  },
  blobShape: {
    position: 'absolute',
    top: -100,
    left: -80,
    width: 380,
    height: 340,
    backgroundColor: D.primary,
    borderRadius: 220,
    transform: [{ rotate: '-20deg' }],
  },
  brandPill: {
    position: 'absolute',
    top: 30,
    left: 32,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  brandText: {
    color: D.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  blobTitle: {
    position: 'absolute',
    top: 52,
    left: 32,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  blobSubtitle: {
    position: 'absolute',
    top: 88,
    left: 32,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
    letterSpacing: -0.2,
  },
  closeBtnCard: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },

  // Modern Body Layout
  bodyContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Clean Role (No Orange, Pure Blue)
  roleArea: { marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleCard: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 6, 
    backgroundColor: D.surface, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: D.border, 
    paddingVertical: 8,
  },
  roleCardActive: { backgroundColor: D.primary, borderColor: D.primary },
  roleName: { fontSize: 13, fontWeight: '600', color: D.textSecondary },
  roleNameActive: { color: '#FFFFFF' },

  // Premium Small Fields
  fieldContainer: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: D.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 10,
    height: 42, // Smaller clean box
  },
  fieldInputBoxFocused: { borderColor: D.primary, borderWidth: 1.5 },
  fieldInput: { 
    flex: 1, 
    fontSize: 13, // Smaller crisp font
    color: D.text, 
    paddingHorizontal: 12, 
    fontWeight: '500' 
  },
  fieldInputIcon: { paddingHorizontal: 10 },

  // Tiny Strength Panel
  strengthPanel: {
    marginTop: -4,
    marginBottom: 8,
    backgroundColor: D.accentGlow,
    padding: 10,
    borderWidth: 1,
    borderColor: D.borderLight,
    borderRadius: 10,
  },
  strengthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  strengthBarBg: { 
    flex: 1, 
    height: 3, 
    backgroundColor: '#E2E8F0', 
    borderRadius: 2, 
    overflow: 'hidden',
    marginRight: 8,
  },
  strengthBarFill: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' },
  checkLabel: { fontSize: 10, fontWeight: '500', color: D.textTertiary },
  checkLabelDone: { color: D.text, fontWeight: '600' },

  // Utility Rows
  linkRow: { marginVertical: 8 },
  rememberRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  checkbox: { marginRight: 4 },
  rememberText: { fontSize: 12, color: D.textSecondary, fontWeight: '500' },
  linkText: { fontSize: 12, fontWeight: '700', color: D.primary },

  // Alert
  alertBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    padding: 10, 
    borderRadius: 10, 
    marginBottom: 12 
  },
  alertSuccess: { backgroundColor: D.successLight },
  alertError: { backgroundColor: D.errorLight },
  alertText: { fontSize: 12, fontWeight: '500', flex: 1 },

  // Premium CTA
  ctaBtn: {
    backgroundColor: D.primary,
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 4,
  },
  ctaBtnPressed: { backgroundColor: D.primaryDark, transform: [{ scale: 0.98 }] },
  ctaText: { fontSize: 14, fontWeight: '700', color: 'white', letterSpacing: 0.5 },

  // Switch Row
  switchRow: { alignItems: 'center', marginTop: 8 },
  switchText: { fontSize: 12, color: D.textSecondary },
  switchTextBold: { fontWeight: '700', color: D.primary },

  // Social Divider
  socialDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 12 },
  divLine: { flex: 1, height: 1, backgroundColor: D.border },
  divText: { marginHorizontal: 10, fontSize: 11, color: D.textTertiary, fontWeight: '500' },

  // Social Icons
  socialRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 16,
  },
  socialBtn: {
    padding: 8,
    backgroundColor: D.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: D.border,
  },
});

export default AuthScreen;