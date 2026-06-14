import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, useColorScheme, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors } from '../constants/theme';
import { GlassCard } from '../components/GlassCard';
import * as SecureStore from 'expo-secure-store';
import { Send, Bot, User, Settings, Sparkles } from 'lucide-react-native';

interface Message {
  sender: 'user' | 'bot';
  text: string;
}

export default function ChatScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];

  const [messages, setMessages] = useState<Message[]>([
    { sender: 'bot', text: 'Namaste! I am AgroSmart AI, your Namma Rytha farming assistant. How can I help you today?' },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempKey, setTempKey] = useState('');

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const key = localStorage.getItem('gemini_api_key') || '';
      setApiKey(key);
      setTempKey(key);
      return;
    }
    SecureStore.getItemAsync('gemini_api_key').then((key) => {
      if (key) {
        setApiKey(key);
        setTempKey(key);
      }
    });
  }, []);

  const saveApiKey = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('gemini_api_key', tempKey.trim());
        setApiKey(tempKey.trim());
        setShowConfig(false);
        Alert.alert('Saved', 'Gemini API Key saved successfully.');
        return;
      }
      await SecureStore.setItemAsync('gemini_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setShowConfig(false);
      Alert.alert('Saved', 'Gemini API Key saved successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save API Key.');
    }
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    if (!apiKey) {
      setTimeout(() => {
        const botReply = getDemoResponse(textToSend);
        setMessages((prev) => [...prev, { sender: 'bot', text: botReply }]);
        setLoading(false);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }, 1000);
      return;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `You are AgroSmart AI, a professional agricultural scientist and field advisor for Namma Rytha. Keep responses highly practical, tailored for Indian farming conditions, and relatively concise. Question: ${textToSend}` }],
              },
            ],
          }),
        }
      );

      const data = await response.json();
      const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I am unable to generate a response. Please check your network connection or API Key.';

      setMessages((prev) => [...prev, { sender: 'bot', text: botText }]);
    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'bot', text: 'Error: Failed to connect to Gemini AI services. Please verify your internet connection and API Key.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const getDemoResponse = (query: string): string => {
    const q = query.toLowerCase();
    let reply = '🌾 [DEMO MODE] ';
    if (q.includes('water') || q.includes('irrigation') || q.includes('watered')) {
      reply += 'Smart Irrigation Tip:\nMoisture meters are key. If soil moisture is below 40%, irrigate immediately. Check rain probabilities beforehand to conserve water.';
    } else if (q.includes('npk') || q.includes('fertilizer') || q.includes('urea')) {
      reply += 'NPK Nutrient Advice:\nFor leafy growth, Nitrogen is vital (Urea). For root strength, add Phosphorus (DAP). Check soil pH: optimal is between 6.0 and 7.5.';
    } else if (q.includes('disease') || q.includes('spot') || q.includes('leaf')) {
      reply += 'Disease Diagnostic Advice:\nSpots on leaves often represent fungal blight. Apply organic Neem oil spray or copper oxychloride fungicide and remove infected leaves.';
    } else {
      reply += "Indian Farming Advice:\nRotate crops seasonally (Kharif/Rabi) to maintain soil health. To get real-time AI answers, tap the settings icon at the top right and add a Google Gemini API Key!";
    }
    return reply;
  };

  const suggestionChips = [
    '💧 Best time to irrigate crop?',
    '🧪 NPK ratio for Rice?',
    '🐛 Natural pest control?',
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={[styles.headerActions, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.configToggle} onPress={() => setShowConfig(!showConfig)}>
          <Settings size={18} color={colors.primary} />
          <Text style={[styles.configToggleText, { color: colors.primary }]}>
            {apiKey ? 'API Key Set' : 'Configure API Key'}
          </Text>
        </TouchableOpacity>
      </View>

      {showConfig && (
        <View style={[styles.configBox, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Text style={[styles.configTitle, { color: colors.text }]}>Enter Gemini API Key</Text>
          <Text style={[styles.configDesc, { color: colors.textSecondary }]}>
            Add a Google Gemini key to enable smart AI advising:
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={tempKey}
            onChangeText={setTempKey}
            placeholder="AIzaSy..."
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
          />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveApiKey}>
            <Text style={styles.saveText}>Save Key</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.messagesScroll}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg, idx) => (
          <View
            key={idx}
            style={[
              styles.msgWrapper,
              msg.sender === 'user' ? styles.userWrapper : styles.botWrapper,
            ]}
          >
            <View
              style={[
                styles.msgBubble,
                msg.sender === 'user'
                  ? { backgroundColor: colors.primary, borderBottomRightRadius: 2 }
                  : { backgroundColor: colors.backgroundElement, borderBottomLeftRadius: 2, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <View style={styles.bubbleHeader}>
                {msg.sender === 'user' ? (
                  <User size={12} color="#050a05" />
                ) : (
                  <Bot size={12} color={colors.primary} />
                )}
                <Text
                  style={[
                    styles.bubbleSender,
                    { color: msg.sender === 'user' ? '#050a05' : colors.textSecondary },
                  ]}
                >
                  {msg.sender === 'user' ? 'You' : 'AgroSmart AI'}
                </Text>
              </View>
              <Text
                style={[
                  styles.msgText,
                  { color: msg.sender === 'user' ? '#050a05' : colors.text },
                ]}
              >
                {msg.text}
              </Text>
            </View>
          </View>
        ))}

        {loading && (
          <View style={styles.loaderBubble}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>

      <View style={styles.chipsRow}>
        {suggestionChips.map((chip, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.chip, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
            onPress={() => handleSend(chip.substring(2))}
          >
            <Sparkles size={12} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.chipText, { color: colors.text }]}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.inputBar, { backgroundColor: colors.backgroundElement, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder="Ask AgroSmart AI something..."
          placeholderTextColor={colors.textSecondary}
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          onPress={() => handleSend(inputText)}
        >
          <Send size={18} color="#050a05" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  configToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configToggleText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  configBox: {
    margin: 16,
    padding: 16,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  configTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  configDesc: {
    fontSize: 12,
    marginBottom: 10,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  saveBtn: {
    height: 38,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 13,
  },
  messagesScroll: {
    padding: 16,
    paddingBottom: 24,
  },
  msgWrapper: {
    marginVertical: 6,
    flexDirection: 'row',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  botWrapper: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '85%',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bubbleSender: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  loaderBubble: {
    alignSelf: 'flex-start',
    padding: 12,
    marginLeft: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
});
