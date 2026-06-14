import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Helper to determine the default base API URL
// In Android emulator, 10.0.2.2 points to host machine. In iOS simulator, localhost points to host machine.
const getDefaultBaseUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

let API_BASE_URL = getDefaultBaseUrl();

export const setApiBaseUrl = (url: string) => {
  API_BASE_URL = url;
};

export const getApiBaseUrl = () => {
  return API_BASE_URL;
};

// Authentication Token Helpers
export async function setAuthUser(user: any) {
  if (Platform.OS === 'web') {
    localStorage.setItem('auth_user', JSON.stringify(user));
    return;
  }
  await SecureStore.setItemAsync('auth_user', JSON.stringify(user));
}

export async function getAuthUser() {
  if (Platform.OS === 'web') {
    const user = localStorage.getItem('auth_user');
    return user ? JSON.parse(user) : null;
  }
  const user = await SecureStore.getItemAsync('auth_user');
  return user ? JSON.parse(user) : null;
}

export async function clearAuthUser() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('auth_user');
    return;
  }
  await SecureStore.deleteItemAsync('auth_user');
}

// Request Helper
async function request(method: string, path: string, body?: any) {
  const url = `${API_BASE_URL}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, config);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`API Error on ${method} ${path}:`, error.message);
    throw error;
  }
}

// API client endpoints
export const api = {
  // Auth
  async login(credentials: { email: string; password?: string }) {
    const data = await request('POST', '/api/login', credentials);
    await setAuthUser(data);
    return data;
  },

  async signupSendOtp(email: string, firstName?: string) {
    return await request('POST', '/api/signup/send-otp', { email, firstName });
  },

  async signup(data: any) {
    const result = await request('POST', '/api/signup', data);
    return result;
  },

  async forgotPassword(email: string) {
    return await request('POST', '/api/forgot-password', { email });
  },

  async resetPassword(payload: any) {
    return await request('POST', '/api/reset-password', payload);
  },

  // User Profile
  async updateProfile(payload: any) {
    const result = await request('POST', '/api/user/update', payload);
    // Refresh local stored auth user if update is successful
    const currentUser = await getAuthUser();
    if (currentUser && currentUser.id === payload.id) {
      const updatedUser = {
        ...currentUser,
        name: `${payload.firstName} ${payload.lastName}`,
        location: payload.location,
        area: payload.area,
        crop: payload.crop,
        phone: payload.phone,
      };
      await setAuthUser(updatedUser);
    }
    return result;
  },

  async updateSustainabilityScore(userId: string, score: number) {
    const result = await request('POST', '/api/user/update-sustainability', { userId, score });
    const currentUser = await getAuthUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.sustainability_score = score;
      await setAuthUser(currentUser);
    }
    return result;
  },

  // Farm Data
  async getFarmData(userId: string) {
    return await request('GET', `/api/farm-data/${userId}`);
  },

  async upsertFarmData(payload: { userId: string; moisture: number; rainProbability: number; lastIrrigated: string }) {
    return await request('POST', '/api/farm-data', payload);
  },

  // Products / Marketplace
  async getProducts() {
    return await request('GET', '/api/products');
  },

  // Orders
  async createOrder(payload: { userId: string; userName: string; items: string; total: number }) {
    return await request('POST', '/api/orders', payload);
  },

  async getOrders() {
    return await request('GET', '/api/orders');
  },

  // Activity Log
  async logActivity(payload: { userId: string; userName: string; action: string; details: string }) {
    return await request('POST', '/api/activity', payload);
  },

  // Feedback
  async submitFeedback(payload: { userId: string; name: string; email: string; rating: number; message: string }) {
    return await request('POST', '/api/feedback', payload);
  },

  // Public Weather API
  async getWeather(lat: number, lon: number) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch weather data');
      return await response.json();
    } catch (error) {
      console.error('Weather Fetch Error:', error);
      throw error;
    }
  },
};
