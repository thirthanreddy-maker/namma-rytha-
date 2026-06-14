import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { Colors } from '../../constants/theme';
import { getApiBaseUrl, setApiBaseUrl, api } from '../../services/api';
import { Lock, Mail, Server, Eye, EyeOff, Tractor } from 'lucide-react-native';

export default function LoginScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [tempBaseUrl, setTempBaseUrl] = useState(getApiBaseUrl());

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); 
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      await login({ email: 'farmer@nammarytha.in', password: 'password123' });
    } catch (error: any) {
      try {
        await login({ email: 'admin@nammarytha.in', password: 'admin123' });
      } catch {
        Alert.alert('Demo Error', 'Unable to connect to backend server. Make sure server.js is running!');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email first');
      return;
    }
    setLoading(true);
    try {
      const res = await api.forgotPassword(email.trim().toLowerCase());
      Alert.alert('Success', `OTP sent! (Demo OTP: ${res.otp || 'shown on server'})`);
      setForgotStep(2);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetOtp || !newPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({
        email: email.trim().toLowerCase(),
        otp: resetOtp,
        newPassword,
      });
      Alert.alert('Success', 'Password reset successful! Please login now.');
      setForgotMode(false);
      setForgotStep(1);
      setPassword('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const saveApiBaseUrl = () => {
    setApiBaseUrl(tempBaseUrl);
    setShowSettings(false);
    Alert.alert('Success', `Backend URL set to:\n${tempBaseUrl}`);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.settingsHeader}>
        <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.settingsBtn}>
          <Server size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showSettings && (
        <View style={[styles.apiBox, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Text style={[styles.apiTitle, { color: colors.text }]}>Developer Settings</Text>
          <Text style={[styles.apiDesc, { color: colors.textSecondary }]}>Configure backend API server address:</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={tempBaseUrl}
            onChangeText={setTempBaseUrl}
            placeholder="http://192.168.1.100:3000"
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity style={[styles.apiSaveBtn, { backgroundColor: colors.primary }]} onPress={saveApiBaseUrl}>
            <Text style={styles.apiSaveText}>Apply Address</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.brandBox}>
        <View style={[styles.logoCircle, { backgroundColor: colors.glow, borderColor: colors.primary }]}>
          <Tractor size={40} color={colors.primary} />
        </View>
        <Text style={[styles.brandTitle, { color: colors.text }]}>Namma Rytha</Text>
        <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>Smart AI Farming for India</Text>
      </View>

      {!forgotMode ? (
        <View style={styles.formBox}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Sign In</Text>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Mail size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Email Address"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Lock size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              {showPassword ? (
                <EyeOff size={18} color={colors.textSecondary} />
              ) : (
                <Eye size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotBtn} onPress={() => setForgotMode(true)}>
            <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050a05" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.primary, backgroundColor: colors.glow }]}
            onPress={handleDemoLogin}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Try Demo Mode</Text>
          </TouchableOpacity>

          <View style={styles.signupPrompt}>
            <Text style={[styles.promptText, { color: colors.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={[styles.promptLink, { color: colors.primary }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.formBox}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Reset Password</Text>

          {forgotStep === 1 ? (
            <>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Enter your email address and we'll send you a password reset OTP code.
              </Text>
              <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
                <Mail size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Email Address"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleForgotPasswordRequest}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#050a05" /> : <Text style={styles.primaryBtnText}>Send OTP</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Enter the OTP sent to your email and choose a new password.
              </Text>

              <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
                <Lock size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Enter OTP Code"
                  placeholderTextColor={colors.textSecondary}
                  value={resetOtp}
                  onChangeText={setResetOtp}
                  keyboardType="number-pad"
                />
              </View>

              <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
                <Lock size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="New Password"
                  placeholderTextColor={colors.textSecondary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handlePasswordReset}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#050a05" /> : <Text style={styles.primaryBtnText}>Reset Password</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backBtn} onPress={() => { setForgotMode(false); setForgotStep(1); }}>
            <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  settingsHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  settingsBtn: {
    padding: 10,
    borderRadius: 50,
  },
  apiBox: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginTop: 80,
    marginBottom: 16,
  },
  apiTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  apiDesc: {
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  apiSaveBtn: {
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apiSaveText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 14,
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  brandSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  formBox: {
    width: '100%',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  eyeBtn: {
    padding: 8,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#050a05',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryBtn: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  signupPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptText: {
    fontSize: 14,
  },
  promptLink: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 16,
    padding: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
