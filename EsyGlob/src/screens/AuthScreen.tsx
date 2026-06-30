import React, { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { forgotPassword } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, type } from '../theme';

type Mode = 'login' | 'signup' | 'forgot';
type MobileRole = 'buyer' | 'seller';

type Props = {
  initialMode?: Mode;
  onClose?: () => void;
  onSuccess?: () => void;
};

function AuthScreen({ initialMode = 'login', onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { signIn, signUp, error } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
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
        setFormMessage('If this account exists, reset instructions have been prepared.');
      } else if (mode === 'login') {
        await signIn({ email: email.trim(), password });
        onSuccess?.();
      } else {
        await signUp({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          companyName: companyName.trim() || undefined,
        });
        onSuccess?.();
      }
    } catch (nextError) {
      setMessageType('error');
      setFormMessage(nextError instanceof Error ? nextError.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }

    navigation.navigate('Home');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboard}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>EsyGlob</Text>
          <Pressable onPress={close} hitSlop={10} style={styles.closeButton}>
            <Icon name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.title}>
          {mode === 'login' ? 'Sign in to trade' : mode === 'signup' ? 'Create mobile account' : 'Recover password'}
        </Text>

        <View style={styles.segment}>
          {(['login', 'signup'] as Mode[]).map(item => (
            <Pressable
              key={item}
              onPress={() => setMode(item)}
              style={[styles.segmentButton, mode === item && styles.segmentButtonActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>
                {item === 'login' ? 'Login' : 'Sign up'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'signup' ? (
          <>
            <View style={styles.roleRow}>
              {(['buyer', 'seller'] as MobileRole[]).map(item => (
                <Pressable
                  key={item}
                  onPress={() => setRole(item)}
                  style={[styles.roleButton, role === item && styles.roleButtonActive]}>
                  <Text style={[styles.roleText, role === item && styles.roleTextActive]}>
                    {item === 'buyer' ? 'Buyer' : 'Seller'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Company name"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </>
        ) : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        {mode !== 'forgot' ? (
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        ) : null}

        {mode === 'login' ? (
          <Pressable onPress={() => setMode('forgot')} style={styles.forgotButton}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        ) : mode === 'forgot' ? (
          <Pressable onPress={() => setMode('login')} style={styles.forgotButton}>
            <Text style={styles.forgotText}>Back to login</Text>
          </Pressable>
        ) : null}

        {formMessage || error ? (
          <Text style={[styles.message, messageType === 'success' ? styles.success : styles.error]}>
            {formMessage ?? error}
          </Text>
        ) : null}

        <Pressable disabled={submitting} onPress={submit} style={styles.submit}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    padding: spacing.lg,
  },
  brand: {
    color: colors.primaryDark,
    fontSize: type.title,
    fontWeight: '900',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  title: {
    color: colors.ink,
    fontSize: type.hero,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  segment: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    marginVertical: spacing.xl,
    padding: spacing.xs,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.md,
  },
  segmentButtonActive: {
    backgroundColor: colors.card,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: colors.ink,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  roleButton: {
    alignItems: 'center',
    borderColor: colors.faint,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.md,
  },
  roleButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#fff8f3',
  },
  roleText: {
    color: colors.muted,
    fontWeight: '900',
  },
  roleTextActive: {
    color: colors.primaryDark,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.faint,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  message: {
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  error: {
    color: colors.rose,
  },
  success: {
    color: colors.green,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
  },
  forgotText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  submit: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 52,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
});

export default AuthScreen;
