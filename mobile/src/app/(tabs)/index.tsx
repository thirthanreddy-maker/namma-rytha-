import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking, useColorScheme } from 'react-native';
import { useAuth } from '../_layout';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { GlassCard } from '../../components/GlassCard';
import { useRouter } from 'expo-router';
import { CloudRain, Droplet, Share2, PlusCircle, ArrowRight, Bot, Sun } from 'lucide-react-native';

export default function DashboardScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];
  const { user } = useAuth();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [moisture, setMoisture] = useState(48.2);
  const [rainProb, setRainProb] = useState(65);
  const [lastIrrigated, setLastIrrigated] = useState('Yesterday');
  const [weatherData, setWeatherData] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<string[]>([
    '🌱 Ensure NPK levels are checked before fertilizer application.',
    '💧 Soil moisture is optimal. No need to irrigate today.',
    '☁️ High rain probability expected tomorrow afternoon.',
  ]);

  const fetchDashboardData = async () => {
    if (!user) return;
    try {
      const data = await api.getFarmData(user.id);
      if (data && data.moisture !== undefined) {
        setMoisture(data.moisture);
        setRainProb(data.rainProbability);
        setLastIrrigated(data.lastIrrigated || 'Not recorded');
      }

      let lat = 12.9716, lon = 77.5946;
      if (user.location && user.location.toLowerCase().includes('delhi')) {
        lat = 28.6139; lon = 77.2090;
      } else if (user.location && user.location.toLowerCase().includes('mumbai')) {
        lat = 19.0760; lon = 72.8777;
      }
      
      const weather = await api.getWeather(lat, lon);
      if (weather && weather.current) {
        setWeatherData(weather.current);
      }
      
      updateRecommendations(moisture, rainProb);
    } catch (e) {
      console.log('Error fetching dashboard data:', e);
    }
  };

  const updateRecommendations = (m: number, r: number) => {
    const list = [];
    if (m < 40) {
      list.push('⚠️ Soil moisture is LOW. Recommend immediate irrigation.');
    } else if (m > 75) {
      list.push('🌿 Soil moisture is HIGH. Avoid watering to prevent waterlogging.');
    } else {
      list.push('💧 Soil moisture is optimal. Keep tracking.');
    }

    if (r > 60) {
      list.push('🌧️ Impending rain detected (over 60%). Suspend irrigation scheduler.');
    } else {
      list.push('☀️ Weather looks dry. Monitor soil regularly.');
    }
    
    list.push(`🌾 Primary crop (${user?.crop || 'Rice'}) enters active growth phase. Keep nutrients steady.`);
    setSuggestions(list);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const handleIrrigateNow = async () => {
    if (!user) return;
    try {
      setRefreshing(true);
      const todayStr = new Date().toISOString().split('T')[0];
      await api.upsertFarmData({
        userId: user.id,
        moisture: 75.0,
        rainProbability: rainProb,
        lastIrrigated: todayStr,
      });
      setMoisture(75.0);
      setLastIrrigated(todayStr);
      Alert.alert('Irrigated', 'Water pump activated! Soil moisture is now reset to optimal 75%.');
      
      await api.logActivity({
        userId: user.id,
        userName: user.name || 'Farmer',
        action: 'irrigate',
        details: `Irrigated farm land, soil moisture increased to 75%`,
      });
    } catch (e) {
      Alert.alert('Error', 'Unable to execute command.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleWhatsAppAlert = () => {
    const report = `Namma Rytha Farm Status:\nMoisture: ${moisture}%\nRain Probability: ${rainProb}%\nLast Irrigated: ${lastIrrigated}\nLocation: ${user?.location || 'Unknown'}\nCrop: ${user?.crop || 'N/A'}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(report)}`).catch(() => {
      Alert.alert('WhatsApp Error', 'Make sure WhatsApp is installed on your phone.');
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.welcomeBox}>
          <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>Welcome Back,</Text>
          <Text style={[styles.farmerName, { color: colors.text }]}>{user?.name || 'Farmer'}</Text>
          <Text style={[styles.farmMeta, { color: colors.primary }]}>
            🌾 {user?.crop || 'Wheat'} • 📍 {user?.location || 'India'} ({user?.area || '0'} Acres)
          </Text>
        </View>

        {weatherData && (
          <GlassCard style={styles.weatherCard}>
            <View style={styles.weatherHeader}>
              <Sun size={24} color="#facc15" />
              <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 8 }]}>Current Weather</Text>
            </View>
            <View style={styles.weatherBody}>
              <View>
                <Text style={[styles.tempText, { color: colors.text }]}>{weatherData.temperature_2m}°C</Text>
                <Text style={[styles.weatherLabel, { color: colors.textSecondary }]}>Feels like {weatherData.apparent_temperature}°C</Text>
              </View>
              <View style={styles.weatherStats}>
                <Text style={[styles.statLine, { color: colors.text }]}>💧 Humidity: {weatherData.relative_humidity_2m}%</Text>
                <Text style={[styles.statLine, { color: colors.text }]}>💨 Wind: {weatherData.wind_speed_10m} km/h</Text>
              </View>
            </View>
          </GlassCard>
        )}

        <View style={styles.statsRow}>
          <GlassCard style={[styles.halfCard, { marginRight: 8 }]}>
            <Droplet size={24} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{moisture}%</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Soil Moisture</Text>
          </GlassCard>

          <GlassCard style={[styles.halfCard, { marginLeft: 8 }]}>
            <CloudRain size={24} color="#38bdf8" />
            <Text style={[styles.statValue, { color: colors.text }]}>{rainProb}%</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rain Chance</Text>
          </GlassCard>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsSlider}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]} onPress={handleIrrigateNow}>
            <View style={[styles.actionIconBg, { backgroundColor: colors.glow }]}>
              <Droplet size={20} color={colors.primary} />
            </View>
            <Text style={[styles.actionText, { color: colors.text }]}>Irrigate Now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/advisors')}>
            <View style={[styles.actionIconBg, { backgroundColor: 'rgba(24acc15, 0.15)' }]}>
              <PlusCircle size={20} color="#eab308" />
            </View>
            <Text style={[styles.actionText, { color: colors.text }]}>Soil Nutrition</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]} onPress={handleWhatsAppAlert}>
            <View style={[styles.actionIconBg, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Share2 size={20} color="#38bdf8" />
            </View>
            <Text style={[styles.actionText, { color: colors.text }]}>Share Report</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.irrigationTag, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Text style={[styles.irrigationText, { color: colors.textSecondary }]}>
            Last Irrigation: <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{lastIrrigated}</Text>
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>AI Recommendations</Text>
        </View>

        <GlassCard>
          {suggestions.map((item, idx) => (
            <View key={idx} style={styles.suggestionItem}>
              <Text style={[styles.suggestionText, { color: colors.text }]}>{item}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.exploreAdvisorsLink} onPress={() => router.push('/(tabs)/advisors')}>
            <Text style={[styles.exploreText, { color: colors.primary }]}>Explore Advisors</Text>
            <ArrowRight size={16} color={colors.primary} />
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>

      <TouchableOpacity
        style={[styles.chatFab, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => router.push('/chat')}
      >
        <Bot size={28} color="#050a05" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 16,
    paddingBottom: 90,
  },
  welcomeBox: {
    marginBottom: 20,
    marginTop: 8,
  },
  welcomeText: {
    fontSize: 16,
  },
  farmerName: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'SpaceGrotesk-Bold',
    marginVertical: 4,
  },
  farmMeta: {
    fontSize: 14,
    fontWeight: '600',
  },
  weatherCard: {
    marginBottom: 16,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  weatherBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tempText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  weatherLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  weatherStats: {
    alignItems: 'flex-end',
  },
  statLine: {
    fontSize: 13,
    marginVertical: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  halfCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionHeader: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsSlider: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  actionBtn: {
    width: 110,
    height: 100,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 10,
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  irrigationTag: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  irrigationText: {
    fontSize: 14,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
    paddingRight: 8,
  },
  suggestionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  exploreAdvisorsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingVertical: 4,
  },
  exploreText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 6,
  },
  chatFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
