import React, { useState, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { forgotPassword } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, type } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Mode = 'login' | 'signup' | 'forgot';
type MobileRole = 'buyer' | 'seller';

type Props = {
  initialMode?: Mode;
  onClose?: () => void;
  onSuccess?: () => void;
};

// ─── Premium Design System ─────────────────────────────────────────────────

const D = {
  primary: '#1A56DB',
  primaryDark: '#1E40AF',
  primaryLight: '#EFF6FF',
  accent: '#F97316',
  accentLight: '#FFF7ED',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  success: '#059669',
  error: '#DC2626',
  warning: '#F59E0B',
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

// ─── Password Strength Checker ──────────────────────────────────────────────

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  width: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: '#DC2626', width: '25%' };
  if (score === 2) return { score, label: 'Fair', color: '#F59E0B', width: '50%' };
  if (score === 3) return { score, label: 'Good', color: '#2563EB', width: '75%' };
  return { score, label: 'Strong', color: '#059669', width: '100%' };
}

// ─── Password Input Component ───────────────────────────────────────────────

function PasswordInput({
  value,
  onChangeText,
  placeholder,
  showStrength = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const strength = useMemo(() => getPasswordStrength(value), [value]);

  return (
    <View style={passwordStyles.wrapper}>
      <View style={[
        passwordStyles.inputContainer,
        isFocused && passwordStyles.inputFocused,
      ]}>
        <View style={passwordStyles.iconLeft}>
          <Icon name="lock-outline" size={18} color={isFocused ? D.primary : D.textTertiary} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={D.textTertiary}
          style={passwordStyles.input}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
        />
        <Pressable
          onPress={() => setVisible(!visible)}
          style={passwordStyles.eyeButton}
          hitSlop={8}
        >
          <Icon
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={D.textTertiary}
          />
        </Pressable>
      </View>

      {/* Password Strength Indicator */}
      {showStrength && value.length > 0 && (
        <View style={passwordStyles.strengthContainer}>
          <View style={passwordStyles.strengthBar}>
            <View
              style={[
                passwordStyles.strengthFill,
                {
                  width: strength.width,
                  backgroundColor: strength.color,
                },
              ]}
            />
          </View>
          <View style={passwordStyles.strengthInfo}>
            <View style={passwordStyles.strengthChecks}>
              <View style={[
                passwordStyles.checkItem,
                value.length >= 8 && passwordStyles.checkPassed,
              ]}>
                <Icon
                  name={value.length >= 8 ? 'check-circle' : 'circle-outline'}
                  size={10}
                  color={value.length >= 8 ? D.success : D.textTertiary}
                />
                <Text style={[
                  passwordStyles.checkText,
                  value.length >= 8 && passwordStyles.checkTextPassed,
                ]}>
                  8+ chars
                </Text>
              </View>
              <View style={[
                passwordStyles.checkItem,
                /[A-Z]/.test(value) && passwordStyles.checkPassed,
              ]}>
                <Icon
                  name={/[A-Z]/.test(value) ? 'check-circle' : 'circle-outline'}
                  size={10}
                  color={/[A-Z]/.test(value) ? D.success : D.textTertiary}
                />
                <Text style={[
                  passwordStyles.checkText,
                  /[A-Z]/.test(value) && passwordStyles.checkTextPassed,
                ]}>
                  Upper
                </Text>
              </View>
              <View style={[
                passwordStyles.checkItem,
                /[0-9]/.test(value) && passwordStyles.checkPassed,
              ]}>
                <Icon
                  name={/[0-9]/.test(value) ? 'check-circle' : 'circle-outline'}
                  size={10}
                  color={/[0-9]/.test(value) ? D.success : D.textTertiary}
                />
                <Text style={[
                  passwordStyles.checkText,
                  /[0-9]/.test(value) && passwordStyles.checkTextPassed,
                ]}>
                  Digit
                </Text>
              </View>
              <View style={[
                passwordStyles.checkItem,
                /[^A-Za-z0-9]/.test(value) && passwordStyles.checkPassed,
              ]}>
                <Icon
                  name={/[^A-Za-z0-9]/.test(value) ? 'check-circle' : 'circle-outline'}
                  size={10}
                  color={/[^A-Za-z0-9]/.test(value) ? D.success : D.textTertiary}
                />
                <Text style={[
                  passwordStyles.checkText,
                  /[^A-Za-z0-9]/.test(value) && passwordStyles.checkTextPassed,
                ]}>
                  Special
                </Text>
              </View>
            </View>
            <Text style={[passwordStyles.strengthLabel, { color: strength.color }]}>
              {strength.label}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const passwordStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: D.primary,
    backgroundColor: D.primaryLight,
  },
  iconLeft: {
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: D.text,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  strengthContainer: {
    marginTop: 10,
  },
  strengthBar: {
    height: 4,
    backgroundColor: D.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strengthChecks: {
    flexDirection: 'row',
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  checkPassed: {
    opacity: 1,
  },
  checkText: {
    fontSize: 10,
    fontWeight: '600',
    color: D.textTertiary,
  },
  checkTextPassed: {
    color: D.success,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ─── Main AuthScreen Component ──────────────────────────────────────────────

function AuthScreen({ initialMode = 'login', onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { signIn, signUp, error } = useAuth();
  const routedMode = route.params?.initialMode as Mode | undefined;
  const [mode, setMode] = useState<Mode>(routedMode ?? initialMode);
  const [role, setRole] = useState<MobileRole>('buyer');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');

  const submit = async () => {
    setFormMessage(null);
    setMessageType('error');
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        await forgotPassword({ email: email.trim() });
        setMessageType('success');
        setFormMessage('Reset instructions sent to your email.');
      } else if (mode === 'login') {
        await signIn({ email: email.trim(), password });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      } else {
        await signUp({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          companyName: companyName.trim() || undefined,
        });
        onSuccess?.();
        if (!onSuccess) navigation.goBack();
      }
    } catch (nextError) {
      setMessageType('error');
      setFormMessage(
        nextError instanceof Error ? nextError.message : 'Authentication failed'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    navigation.navigate('MainTabs');
  };

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboard}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16 },
        ]}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Icon name="earth" size={20} color={D.primary} />
            </View>
            <Text style={styles.brand}>EsyGlob</Text>
          </View>
          <Pressable
            onPress={close}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.closeBtnPressed,
            ]}
          >
            <Icon name="close" size={20} color={D.textSecondary} />
          </Pressable>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>
            {isLogin
              ? 'Welcome back'
              : isSignup
              ? 'Create account'
              : 'Reset password'}
          </Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? 'Sign in to your trade account'
              : isSignup
              ? 'Join global B2B marketplace'
              : 'We\'ll send you recovery instructions'}
          </Text>
        </View>

        {/* Segment Control */}
        <View style={styles.segmentWrapper}>
          <View style={styles.segment}>
            <Pressable
              onPress={() => { setMode('login'); setFormMessage(null); }}
              style={[
                styles.segmentBtn,
                isLogin && styles.segmentBtnActive,
              ]}
            >
              <Icon
                name="login"
                size={16}
                color={isLogin ? D.primary : D.textTertiary}
              />
              <Text style={[
                styles.segmentText,
                isLogin && styles.segmentTextActive,
              ]}>
                Login
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode('signup'); setFormMessage(null); }}
              style={[
                styles.segmentBtn,
                isSignup && styles.segmentBtnActive,
              ]}
            >
              <Icon
                name="account-plus-outline"
                size={16}
                color={isSignup ? D.primary : D.textTertiary}
              />
              <Text style={[
                styles.segmentText,
                isSignup && styles.segmentTextActive,
              ]}>
                Sign Up
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Role Selector (Signup only) */}
        {isSignup && (
          <View style={styles.roleSection}>
            <Text style={styles.sectionLabel}>I am a</Text>
            <View style={styles.roleRow}>
              <Pressable
                onPress={() => setRole('buyer')}
                style={({ pressed }) => [
                  styles.roleCard,
                  role === 'buyer' && styles.roleCardActive,
                  pressed && styles.roleCardPressed,
                ]}
              >
                <View style={[
                  styles.roleIconCircle,
                  role === 'buyer' && styles.roleIconCircleActive,
                ]}>
                  <Icon
                    name="shopping-outline"
                    size={22}
                    color={role === 'buyer' ? D.accent : D.textTertiary}
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'buyer' && styles.roleTitleActive,
                ]}>
                  Buyer
                </Text>
                <Text style={styles.roleDesc}>
                  Source products
                </Text>
                {role === 'buyer' && (
                  <View style={styles.roleCheck}>
                    <Icon name="check-circle" size={16} color={D.accent} />
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={() => setRole('seller')}
                style={({ pressed }) => [
                  styles.roleCard,
                  role === 'seller' && styles.roleCardSellerActive,
                  pressed && styles.roleCardPressed,
                ]}
              >
                <View style={[
                  styles.roleIconCircle,
                  role === 'seller' && styles.roleIconCircleSellerActive,
                ]}>
                  <Icon
                    name="storefront-outline"
                    size={22}
                    color={role === 'seller' ? D.primary : D.textTertiary}
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'seller' && styles.roleTitleSellerActive,
                ]}>
                  Seller
                </Text>
                <Text style={styles.roleDesc}>
                  Sell worldwide
                </Text>
                {role === 'seller' && (
                  <View style={[styles.roleCheck, styles.roleCheckSeller]}>
                    <Icon name="check-circle" size={16} color={D.primary} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Name & Company (Signup only) */}
          {isSignup && (
            <>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIcon}>
                  <Icon name="account-outline" size={18} color={D.textTertiary} />
                </View>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  placeholderTextColor={D.textTertiary}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrapper}>
                <View style={styles.inputIcon}>
                  <Icon name="office-building-outline" size={18} color={D.textTertiary} />
                </View>
                <TextInput
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Company name (optional)"
                  placeholderTextColor={D.textTertiary}
                  style={styles.input}
                />
              </View>

              <View style={styles.divider} />
            </>
          )}

          {/* Email */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Icon name="email-outline" size={18} color={D.textTertiary} />
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email address"
              placeholderTextColor={D.textTertiary}
              style={styles.input}
            />
          </View>

          {/* Password */}
          {!isForgot && (
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              showStrength={isSignup}
            />
          )}

          {/* Forgot / Back */}
          {isLogin && (
            <Pressable
              onPress={() => { setMode('forgot'); setFormMessage(null); }}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          )}
          {isForgot && (
            <Pressable
              onPress={() => { setMode('login'); setFormMessage(null); }}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>← Back to login</Text>
            </Pressable>
          )}

          {/* Messages */}
          {(formMessage || error) && (
            <View style={[
              styles.messageBanner,
              messageType === 'success' ? styles.messageSuccess : styles.messageError,
            ]}>
              <Icon
                name={messageType === 'success' ? 'check-circle' : 'alert-circle'}
                size={16}
                color={messageType === 'success' ? D.success : D.error}
              />
              <Text style={[
                styles.messageText,
                messageType === 'success' ? styles.messageTextSuccess : styles.messageTextError,
              ]}>
                {formMessage ?? error}
              </Text>
            </View>
          )}

          {/* Submit */}
          <Pressable
            disabled={submitting}
            onPress={submit}
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && styles.submitBtnPressed,
              submitting && styles.submitBtnDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.submitText}>
                  {isLogin
                    ? 'Sign In'
                    : isSignup
                    ? 'Create Account'
                    : 'Send Reset Link'}
                </Text>
                <Icon name="arrow-right" size={18} color="#FFF" />
              </>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            Secure B2B trade platform
          </Text>
          <View style={styles.footerIcons}>
            <Icon name="shield-check" size={12} color={D.success} />
            <Icon name="lock" size={12} color={D.success} />
            <Icon name="certificate" size={12} color={D.success} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: D.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: D.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: D.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: D.border,
  },
  closeBtnPressed: {
    backgroundColor: D.background,
  },

  // Title
  titleSection: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: D.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: D.textSecondary,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Segment
  segmentWrapper: {
    marginBottom: 24,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: D.borderLight,
    borderRadius: 14,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  segmentBtnActive: {
    backgroundColor: D.surface,
    ...D.shadow,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: D.textTertiary,
  },
  segmentTextActive: {
    color: D.primary,
  },

  // Role
  roleSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: D.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    backgroundColor: D.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: D.border,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
  },
  roleCardActive: {
    borderColor: D.accent,
    backgroundColor: D.accentLight,
  },
  roleCardSellerActive: {
    borderColor: D.primary,
    backgroundColor: D.primaryLight,
  },
  roleCardPressed: {
    transform: [{ scale: 0.97 }],
  },
  roleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: D.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  roleIconCircleActive: {
    backgroundColor: D.accentLight,
  },
  roleIconCircleSellerActive: {
    backgroundColor: D.primaryLight,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: D.text,
    marginBottom: 3,
  },
  roleTitleActive: {
    color: D.accent,
  },
  roleTitleSellerActive: {
    color: D.primary,
  },
  roleDesc: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '500',
  },
  roleCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  roleCheckSeller: {
    // same positioning
  },

  // Form
  formSection: {
    gap: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  inputIcon: {
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: D.text,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  divider: {
    height: 1,
    backgroundColor: D.borderLight,
    marginVertical: 6,
  },

  // Links
  linkButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: D.primary,
  },

  // Messages
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  messageSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  messageError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  messageTextSuccess: {
    color: D.success,
  },
  messageTextError: {
    color: D.error,
  },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: D.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
    ...D.shadow,
  },
  submitBtnPressed: {
    backgroundColor: D.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 40,
    gap: 10,
  },
  footerDivider: {
    width: 40,
    height: 3,
    backgroundColor: D.border,
    borderRadius: 2,
  },
  footerText: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '600',
  },
  footerIcons: {
    flexDirection: 'row',
    gap: 12,
  },
});

export default AuthScreen;