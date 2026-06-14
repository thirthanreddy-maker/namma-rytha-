import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';
import { GlassCard } from '../../components/GlassCard';
import { Droplet, Flame, Leaf, ShieldAlert, Check } from 'lucide-react-native';

export default function AdvisorsScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];

  const [activeAdvisor, setActiveAdvisor] = useState<'irrigation' | 'fertilizer' | 'crop' | 'disease'>('irrigation');

  const [moisture, setMoisture] = useState('45');
  const [soilPh, setSoilPh] = useState('6.5');
  const [npk, setNpk] = useState({ N: '40', P: '20', K: '30' });
  const [soilType, setSoilType] = useState('Loamy');
  const [season, setSeason] = useState('Kharif');
  
  const [symptoms, setSymptoms] = useState({
    spots: false,
    yellowing: false,
    wilting: false,
    mold: false,
    holes: false,
  });

  const [advisorResult, setAdvisorResult] = useState<string | null>(null);

  const runIrrigationAdvisor = () => {
    const mVal = parseFloat(moisture);
    if (isNaN(mVal)) {
      Alert.alert('Error', 'Please enter a valid soil moisture value');
      return;
    }
    let suggestion = '';
    if (mVal < 35) {
      suggestion = '🔴 CRITICAL IRRIGATION NEEDED:\nYour soil moisture is dangerously low. Water your crops immediately to prevent drying.';
    } else if (mVal >= 35 && mVal < 60) {
      suggestion = '🟡 MODERATE IRRIGATION ADVISED:\nSoil is dry. Recommend applying 10-15mm of water tonight or tomorrow morning.';
    } else {
      suggestion = '🟢 OPTIMAL MOISTURE:\nSoil moisture is healthy. No watering is required at this time.';
    }
    setAdvisorResult(suggestion);
  };

  const runFertilizerPrescription = () => {
    const n = parseFloat(npk.N);
    const p = parseFloat(npk.P);
    const k = parseFloat(npk.K);
    const ph = parseFloat(soilPh);

    if (isNaN(n) || isNaN(p) || isNaN(k) || isNaN(ph)) {
      Alert.alert('Error', 'Please enter valid numbers for pH and NPK values.');
      return;
    }

    let prescription = `🌾 NPK NUTRIENT DIAGNOSTIC:\n`;
    if (ph < 6.0) {
      prescription += `• pH is acidic (${ph}). Apply Agricultural Lime to raise pH.\n`;
    } else if (ph > 7.5) {
      prescription += `• pH is alkaline (${ph}). Apply Sulfur or Gypsum.\n`;
    } else {
      prescription += `• Soil pH is ideal (${ph}) for standard crop growth.\n`;
    }

    prescription += `\n🧪 Recommendations:\n`;
    if (n < 50) {
      prescription += `• Nitrogen (N) is deficient. Apply Urea (46-0-0) or Compost.\n`;
    }
    if (p < 30) {
      prescription += `• Phosphorus (P) is low. Apply Diammonium Phosphate (DAP).\n`;
    }
    if (k < 40) {
      prescription += `• Potassium (K) is low. Apply Muriate of Potash (MOP).\n`;
    }
    if (n >= 50 && p >= 30 && k >= 40) {
      prescription += `• All primary macro-nutrients are at optimal levels. Maintain organic mulching.`;
    }
    setAdvisorResult(prescription);
  };

  const runCropAdvisor = () => {
    let crops = '';
    if (soilType.toLowerCase() === 'clay') {
      crops = '🍚 Clay Soil Recommendation (Kharif/Rabi):\n• Rice / Paddy (ideal due to high water retention)\n• Wheat\n• Soybean';
    } else if (soilType.toLowerCase().includes('sand')) {
      crops = '🥜 Sandy Soil Recommendation:\n• Groundnut / Peanut\n• Pearl Millet (Bajra)\n• Watermelon';
    } else {
      crops = '🌱 Loamy Soil Recommendation (Highly Fertile):\n• Maize\n• Sugarcane\n• Cotton\n• Vegetables (Tomato, Chili)';
    }
    setAdvisorResult(crops);
  };

  const runDiseaseDiagnosis = () => {
    let diagnosis = '🔬 CROP DISEASE SCAN RESULT:\n';
    const activeSymptoms = Object.entries(symptoms).filter(([_, val]) => val).map(([name]) => name);

    if (activeSymptoms.length === 0) {
      diagnosis += '• No active symptoms selected. Plant appears healthy.';
    } else if (symptoms.spots && symptoms.yellowing) {
      diagnosis += '⚠️ Target Leaf Spot (Fungal infection):\n• Recommendation: Apply Chlorothalonil or Neem Oil spray. Ensure spacing to reduce humidity.';
    } else if (symptoms.wilting) {
      diagnosis += '⚠️ Bacterial Wilt:\n• Recommendation: Improve drainage, remove infected plants, rotate with non-susceptible crops.';
    } else if (symptoms.mold) {
      diagnosis += '⚠️ Powdery Mildew:\n• Recommendation: Apply sulfur fungicides or baking soda spray solution.';
    } else {
      diagnosis += '⚠️ General Nutrient Stress / Pest Damage:\n• Recommendation: Inspect crop underside for mites or aphids. Check irrigation consistency.';
    }
    setAdvisorResult(diagnosis);
  };

  const toggleSymptom = (name: keyof typeof symptoms) => {
    setSymptoms({
      ...symptoms,
      [name]: !symptoms[name],
    });
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.selectorRow}>
        <TouchableOpacity
          style={[styles.selectorTab, activeAdvisor === 'irrigation' && { borderBottomColor: colors.primary }]}
          onPress={() => { setActiveAdvisor('irrigation'); setAdvisorResult(null); }}
        >
          <Droplet size={20} color={activeAdvisor === 'irrigation' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.selectorLabel, { color: activeAdvisor === 'irrigation' ? colors.text : colors.textSecondary }]}>
            Irrigation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.selectorTab, activeAdvisor === 'fertilizer' && { borderBottomColor: colors.primary }]}
          onPress={() => { setActiveAdvisor('fertilizer'); setAdvisorResult(null); }}
        >
          <Flame size={20} color={activeAdvisor === 'fertilizer' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.selectorLabel, { color: activeAdvisor === 'fertilizer' ? colors.text : colors.textSecondary }]}>
            NPK Matcher
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.selectorTab, activeAdvisor === 'crop' && { borderBottomColor: colors.primary }]}
          onPress={() => { setActiveAdvisor('crop'); setAdvisorResult(null); }}
        >
          <Leaf size={20} color={activeAdvisor === 'crop' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.selectorLabel, { color: activeAdvisor === 'crop' ? colors.text : colors.textSecondary }]}>
            Crop Planner
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.selectorTab, activeAdvisor === 'disease' && { borderBottomColor: colors.primary }]}
          onPress={() => { setActiveAdvisor('disease'); setAdvisorResult(null); }}
        >
          <ShieldAlert size={20} color={activeAdvisor === 'disease' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.selectorLabel, { color: activeAdvisor === 'disease' ? colors.text : colors.textSecondary }]}>
            Disease Scan
          </Text>
        </TouchableOpacity>
      </View>

      <GlassCard style={styles.card}>
        {activeAdvisor === 'irrigation' && (
          <View>
            <Text style={[styles.cardHeader, { color: colors.text }]}>Smart Irrigation Calculator</Text>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Current Soil Moisture (%)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={moisture}
              onChangeText={setMoisture}
              keyboardType="numeric"
              placeholder="e.g. 45"
            />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={runIrrigationAdvisor}>
              <Text style={styles.submitText}>Analyze Soil Moisture</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeAdvisor === 'fertilizer' && (
          <View>
            <Text style={[styles.cardHeader, { color: colors.text }]}>NPK Nutrient & pH Prescription</Text>
            
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Soil pH Level</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={soilPh}
              onChangeText={setSoilPh}
              keyboardType="numeric"
              placeholder="e.g. 6.5"
            />

            <View style={styles.npkRow}>
              <View style={styles.npkCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nitrogen (N)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={npk.N}
                  onChangeText={(val) => setNpk({ ...npk, N: val })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.npkCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Phosphorus (P)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={npk.P}
                  onChangeText={(val) => setNpk({ ...npk, P: val })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.npkCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Potassium (K)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={npk.K}
                  onChangeText={(val) => setNpk({ ...npk, K: val })}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={runFertilizerPrescription}>
              <Text style={styles.submitText}>Calculate Nutrient Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeAdvisor === 'crop' && (
          <View>
            <Text style={[styles.cardHeader, { color: colors.text }]}>Crop Recommendation Engine</Text>
            
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Soil Type</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={soilType}
              onChangeText={setSoilType}
              placeholder="e.g. Clay, Sand, Loamy"
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Season</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={season}
              onChangeText={setSeason}
              placeholder="e.g. Kharif, Rabi"
            />

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={runCropAdvisor}>
              <Text style={styles.submitText}>Predict Best Crops</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeAdvisor === 'disease' && (
          <View>
            <Text style={[styles.cardHeader, { color: colors.text }]}>Crop Disease Symptom Checker</Text>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>Select all visible crop symptoms:</Text>

            {Object.keys(symptoms).map((symptom) => (
              <TouchableOpacity
                key={symptom}
                style={styles.checkboxRow}
                onPress={() => toggleSymptom(symptom as keyof typeof symptoms)}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: colors.border,
                      backgroundColor: symptoms[symptom as keyof typeof symptoms] ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {symptoms[symptom as keyof typeof symptoms] && <Check size={14} color="#050a05" />}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                  {symptom.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={runDiseaseDiagnosis}>
              <Text style={styles.submitText}>Diagnose Crop Issues</Text>
            </TouchableOpacity>
          </View>
        )}
      </GlassCard>

      {advisorResult && (
        <GlassCard style={[styles.resultCard, { borderColor: colors.primary, backgroundColor: colors.glow }]}>
          <Text style={[styles.resultText, { color: colors.text }]}>{advisorResult}</Text>
        </GlassCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  selectorTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  card: {
    padding: 20,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  npkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  npkCol: {
    flex: 1,
    marginHorizontal: 4,
  },
  submitBtn: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  submitText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 15,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 14,
    marginBottom: 12,
  },
  resultCard: {
    borderWidth: 1.5,
    marginTop: 20,
    padding: 18,
  },
  resultText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
});
