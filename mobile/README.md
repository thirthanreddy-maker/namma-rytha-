# Namma Rytha Mobile App (Native Expo)

This is a fully native mobile application for **Namma Rytha — AI Smart Farming**, built using React Native and Expo (managed workflow).

## 🚀 Getting Started

### 1. Install Dependencies
Navigate to the `mobile` directory and install the project dependencies:
```bash
cd mobile
npm install
```

### 2. Run Locally
Start the Expo Metro bundler:
```bash
npx expo start
```
- Press **`a`** to open in the Android emulator.
- Press **`i`** to open in the iOS simulator.
- Press **`w`** to run as a web app.
- Scan the QR code with the **Expo Go** app on your physical iOS/Android device to preview.

---

## ⚙️ Backend Connection Config
If you are running the backend server locally, you can tap the **Server Config** icon in the top-right corner of the Login page to configure your computer's local IP address (e.g. `http://192.168.1.5:3000`). By default, it connects to the production backend on Render.

---

## 📦 Building for Production (EAS Build)

Ensure you have the EAS CLI installed globally:
```bash
npm install -g eas-cli
```

Log in to your Expo account:
```bash
eas login
```

Configure your project with EAS (only needed once):
```bash
eas project:init
```

### 1. Build for Android
- **Build APK (For Local Device Installation / Testing):**
  ```bash
  eas build --platform android --profile preview
  ```
- **Build AAB (For Google Play Store Release):**
  ```bash
  eas build --platform android --profile production
  ```

### 2. Build for iOS
- **Build IPA (For App Store Release / Ad-hoc Testing):**
  ```bash
  eas build --platform ios --profile production
  ```
- **Build for iOS Simulator (For local simulator testing):**
  ```bash
  eas build --platform ios --profile preview
  ```
