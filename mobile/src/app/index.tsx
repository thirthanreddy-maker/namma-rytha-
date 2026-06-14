import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, useColorScheme, Platform, SafeAreaView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Colors } from '../constants/theme';
import { Server, RotateCw, ShieldCheck } from 'lucide-react-native';

export default function IndexScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];

  // Default server URLs
  const getDefaultUrl = () => {
    return 'https://namma-rytha-thirthan.netlify.app/login.html';
  };

  const [url, setUrl] = useState(getDefaultUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [webViewKey, setWebViewKey] = useState(0); // Used to trigger reload

  useEffect(() => {
    // Load saved URL from storage
    if (Platform.OS === 'web') {
      const saved = localStorage.getItem('web_app_url');
      if (saved) {
        setUrl(saved);
        setTempUrl(saved);
      } else {
        setTempUrl(url);
      }
    } else {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync('web_app_url').then((saved: string | null) => {
        if (saved) {
          setUrl(saved);
          setTempUrl(saved);
        } else {
          setTempUrl(url);
        }
      });
    }
  }, []);

  const saveUrlSetting = async () => {
    let targetUrl = tempUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'http://' + targetUrl;
    }

    try {
      setUrl(targetUrl);
      setTempUrl(targetUrl);
      setShowConfig(false);
      setWebViewKey(prev => prev + 1); // Force WebView refresh

      if (Platform.OS === 'web') {
        localStorage.setItem('web_app_url', targetUrl);
      } else {
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync('web_app_url', targetUrl);
      }
      Alert.alert('Address Applied', `Connecting to:\n${targetUrl}`);
    } catch {
      Alert.alert('Error', 'Failed to save URL.');
    }
  };

  const reloadWebView = () => {
    setWebViewKey(prev => prev + 1);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Floating Control Bar */}
      <View style={[styles.controlBar, { backgroundColor: colors.backgroundElement, borderBottomColor: colors.border }]}>
        <View style={styles.brandRow}>
          <ShieldCheck size={20} color={colors.primary} />
          <Text style={[styles.brandText, { color: colors.text }]}>Namma Rytha Mobile</Text>
        </View>

        <View style={styles.actionsRow}>
          {/* Reload Button */}
          <TouchableOpacity onPress={reloadWebView} style={styles.controlBtn}>
            <RotateCw size={18} color={colors.text} />
          </TouchableOpacity>

          {/* Settings / IP Button */}
          <TouchableOpacity onPress={() => setShowConfig(!showConfig)} style={styles.controlBtn}>
            <Server size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings Input overlay */}
      {showConfig && (
        <View style={[styles.configBox, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Text style={[styles.configTitle, { color: colors.text }]}>Server Configuration</Text>
          <Text style={[styles.configDesc, { color: colors.textSecondary }]}>
            Enter computer's local IP address or website domain:
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={tempUrl}
            onChangeText={setTempUrl}
            placeholder="e.g. http://192.168.1.15:3000/login.html"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveUrlSetting}>
            <Text style={styles.saveText}>Save and Connect</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Web Page Container */}
      <View style={styles.webContainer}>
        {Platform.OS === 'web' ? (
          // Web Preview: Center the app inside a premium mock mobile phone frame
          <View style={styles.webCenterWrapper}>
            <View style={[styles.phoneFrame, { borderColor: colors.border, shadowColor: colors.primary }]}>
              {/* Phone Notch */}
              <View style={[styles.phoneNotch, { backgroundColor: colors.background }]} />
              
              {/* Web Page Iframe */}
              <iframe
                key={webViewKey}
                src={url}
                style={styles.iframeStyle}
                title="Namma Rytha App"
              />
            </View>
          </View>
        ) : (
          // Native Platforms (iOS/Android): Render full screen
          <WebView
            key={webViewKey}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: '#050a05' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowFileAccess={true}
            originWhitelist={['*']}
            userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.93 Mobile Safari/537.36 NammaRythaMobile"
          />
        )}
      </View>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  controlBar: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'SpaceGrotesk-Bold',
    marginLeft: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBtn: {
    padding: 8,
    marginLeft: 12,
  },
  configBox: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    zIndex: 999,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  configTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  configDesc: {
    fontSize: 12,
    marginBottom: 12,
  },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  saveBtn: {
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 14,
  },
  webContainer: {
    flex: 1,
  },
  webCenterWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#020502',
  },
  phoneFrame: {
    width: 375,
    height: 760,
    borderWidth: 10,
    borderRadius: 40,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    backgroundColor: '#050a05',
    position: 'relative',
  },
  phoneNotch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -60,
    width: 120,
    height: 25,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    zIndex: 999,
  },
  iframeStyle: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
});
