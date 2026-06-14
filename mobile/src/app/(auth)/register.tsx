import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { useAuth } from '../_layout';
import { Lock, Mail, User, Phone, MapPin, AreaChart, Leaf, ChevronRight, ChevronLeft } from 'lucide-react-native';

export default function RegisterScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];
  const router = useRouter();
  const { login } = useAuth();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); 

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [area, setArea] = useState('');
  const [crop, setCrop] = useState('');
  const [password, setPassword] = useState('');

  const [otp, setOtp] = useState('');
  const [demoOtpHint, setDemoOtpHint] = useState('');

  const handleSendOtp = async () => {
    if (!firstName || !email || !password || !location || !area || !crop) {
      Alert.alert('Error', 'Please fill in all required fields (marked *)');
      return;
    }
    setLoading(true);
    try {
      const res = await api.signupSendOtp(email.trim().toLowerCase(), firstName);
      Alert.alert('OTP Sent', 'A 6-digit verification code was sent to your email.');
      if (res.otp) {
        setDemoOtpHint(`(Demo Mode OTP: ${res.otp})`);
      }
      setStep(2);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!otp) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }
    setLoading(true);
    try {
      const signupPayload = {
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone,
        location,
        area,
        crop,
        password,
        otp,
      };
      
      await api.signup(signupPayload);
      Alert.alert('Success', 'Account registered successfully!');
      await login({ email: email.trim().toLowerCase(), password });
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerBox}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Account</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {step === 1 ? 'Step 1 of 2: Farm & Personal Details' : 'Step 2 of 2: OTP Email Verification'}
        </Text>
      </View>

      {step === 1 ? (
        <View style={styles.formBox}>
          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <User size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="First Name *"
              placeholderTextColor={colors.textSecondary}
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <User size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Last Name"
              placeholderTextColor={colors.textSecondary}
              value={lastName}
              onChangeText={setLastName}
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Mail size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Email Address *"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Phone size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Phone Number"
              placeholderTextColor={colors.textSecondary}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <MapPin size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Location (e.g. Bangalore) *"
              placeholderTextColor={colors.textSecondary}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <AreaChart size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Land Area (in Acres) *"
              placeholderTextColor={colors.textSecondary}
              value={area}
              onChangeText={setArea}
              keyboardType="numeric"
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Leaf size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Primary Crop (e.g. Rice, Wheat) *"
              placeholderTextColor={colors.textSecondary}
              value={crop}
              onChangeText={setCrop}
            />
          </View>

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Lock size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Password *"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050a05" />
            ) : (
              <View style={styles.btnRow}>
                <Text style={styles.primaryBtnText}>Continue to Verify </Text>
                <ChevronRight size={18} color="#050a05" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.formBox}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            We have sent a 6-digit verification code to <Text style={{ fontWeight: 'bold', color: colors.text }}>{email}</Text>. Please enter it below.
          </Text>

          {demoOtpHint ? (
            <Text style={[styles.demoHint, { color: colors.primary }]}>{demoOtpHint}</Text>
          ) : null}

          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <Lock size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text, letterSpacing: 4, fontWeight: 'bold' }]}
              placeholder="6-Digit OTP Code"
              placeholderTextColor={colors.textSecondary}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#050a05" /> : <Text style={styles.primaryBtnText}>Verify & Register</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.primary, backgroundColor: colors.glow }]}
            onPress={() => setStep(1)}
            disabled={loading}
          >
            <View style={styles.btnRow}>
              <ChevronLeft size={18} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Go Back</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footerPrompt}>
        <Text style={[styles.promptText, { color: colors.textSecondary }]}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
          <Text style={[styles.promptLink, { color: colors.primary }]}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerBox: {
    marginBottom: 32,
    marginTop: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 6,
  },
  formBox: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  primaryBtn: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
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
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  demoHint: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  footerPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  promptText: {
    fontSize: 14,
  },
  promptLink: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
