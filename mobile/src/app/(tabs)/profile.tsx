import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, useColorScheme, ActivityIndicator } from 'react-native';
import { useAuth } from '../_layout';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { GlassCard } from '../../components/GlassCard';
import { MapPin, AreaChart, Leaf, Phone, Award, LogOut, Star } from 'lucide-react-native';

export default function ProfileScreen() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = Colors[scheme];
  const { user, logout, refreshUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const nameParts = user?.name ? user.name.split(' ') : ['', ''];
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts[1] || '');
  const [location, setLocation] = useState(user?.location || '');
  const [area, setArea] = useState(user?.area || '');
  const [crop, setCrop] = useState(user?.crop || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [rating, setRating] = useState(5);

  const handleUpdate = async () => {
    if (!firstName || !location || !area || !crop) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      await api.updateProfile({
        id: user.id,
        firstName,
        lastName,
        location,
        area,
        crop,
        phone,
      });
      await refreshUser();
      setEditMode(false);
      Alert.alert('Success', 'Profile updated successfully!');
      
      await api.logActivity({
        userId: user.id,
        userName: `${firstName} ${lastName}`,
        action: 'profile_update',
        details: 'Updated personal/farm profile information',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedbackMsg) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }
    setLoading(true);
    try {
      await api.submitFeedback({
        userId: user.id,
        name: user.name || 'Farmer',
        email: user.email,
        rating,
        message: feedbackMsg,
      });
      setFeedbackMsg('');
      Alert.alert('Thank You', 'We appreciate your feedback! It helps improve Namma Rytha.');
    } catch (e) {
      Alert.alert('Error', 'Failed to submit feedback.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.profileHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.glow, borderColor: colors.primary }]}>
          <Text style={styles.avatarEmoji}>👨‍🌾</Text>
        </View>
        <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'Farmer'}</Text>
        <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
      </View>

      <GlassCard style={styles.card}>
        <View style={styles.sustainabilityTitleRow}>
          <Award size={20} color={colors.primary} />
          <Text style={[styles.cardHeader, { color: colors.text, marginLeft: 8 }]}>Eco-Sustainability Score</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreNumber, { color: colors.primary }]}>
            {user?.sustainability_score || 70}
          </Text>
          <Text style={[styles.scoreTotal, { color: colors.textSecondary }]}>/ 100</Text>
        </View>
        <View style={[styles.progressBg, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${user?.sustainability_score || 70}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
        <Text style={[styles.helperText, { color: colors.textSecondary, marginTop: 10 }]}>
          Keep saving water and chemical fertilizers to increase your score and unlock farm badges!
        </Text>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.detailsHeader}>
          <Text style={[styles.cardHeader, { color: colors.text }]}>Farm & Contact Details</Text>
          <TouchableOpacity onPress={() => setEditMode(!editMode)}>
            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{editMode ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {!editMode ? (
          <View style={styles.viewBox}>
            <View style={styles.detailItem}>
              <MapPin size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Location: </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user?.location || 'Not set'}</Text>
            </View>

            <View style={styles.detailItem}>
              <AreaChart size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Land Area: </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user?.area || '0'} Acres</Text>
            </View>

            <View style={styles.detailItem}>
              <Leaf size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Primary Crop: </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user?.crop || 'Not set'}</Text>
            </View>

            <View style={styles.detailItem}>
              <Phone size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Phone: </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{user?.phone || 'Not set'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.editForm}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>First Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={firstName}
              onChangeText={setFirstName}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Last Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={lastName}
              onChangeText={setLastName}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Location</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={location}
              onChangeText={setLocation}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Land Area (Acres)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={area}
              onChangeText={setArea}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Primary Crop</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={crop}
              onChangeText={setCrop}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Phone Number</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleUpdate}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#050a05" /> : <Text style={styles.saveText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={[styles.cardHeader, { color: colors.text }]}>Send Application Feedback</Text>
        
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Star
                size={30}
                color={star <= rating ? '#facc15' : colors.textSecondary}
                fill={star <= rating ? '#facc15' : 'transparent'}
                style={{ marginRight: 6 }}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="How is your experience with the app? Tell us..."
          placeholderTextColor={colors.textSecondary}
          value={feedbackMsg}
          onChangeText={setFeedbackMsg}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity
          style={[styles.feedbackBtn, { backgroundColor: colors.primary }]}
          onPress={submitFeedback}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#050a05" /> : <Text style={styles.feedbackBtnText}>Submit Feedback</Text>}
        </TouchableOpacity>
      </GlassCard>

      <TouchableOpacity style={[styles.logoutBtn, { borderColor: '#f87171' }]} onPress={logout}>
        <LogOut size={20} color="#f87171" style={{ marginRight: 10 }} />
        <Text style={styles.logoutText}>Sign Out / Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginVertical: 24,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarEmoji: {
    fontSize: 44,
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    padding: 18,
    marginBottom: 16,
  },
  sustainabilityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 10,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreTotal: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewBox: {
    marginTop: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  editForm: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  saveBtn: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  saveText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 14,
  },
  starsRow: {
    flexDirection: 'row',
    marginVertical: 12,
  },
  textArea: {
    height: 90,
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  feedbackBtn: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackBtnText: {
    color: '#050a05',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    marginVertical: 16,
  },
  logoutText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
