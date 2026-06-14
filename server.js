const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');

// ── MONGOOSE MODELS ──
const User = require('./models/User');
const Admin = require('./models/Admin');
const Product = require('./models/Product');
const FarmData = require('./models/FarmData');
const Activity = require('./models/Activity');
const Order = require('./models/Order');
const Feedback = require('./models/Feedback');

// ── PASTE YOUR GOOGLE CLIENT ID HERE ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '12676963216-e3sg11s2rrpkjjs1qic2h0r3vb7n7h55.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
const PORT = process.env.PORT || 3000;

// ── MONGODB CONNECTION ──
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://thirthanreddy_db_user:admin123@cluster0.viha4yd.mongodb.net/nammarytha?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ── EMAIL / SMTP CONFIGURATION ──
const SMTP_EMAIL = process.env.SMTP_EMAIL || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_ENABLED = !!(SMTP_EMAIL && SMTP_PASSWORD);

let smtpTransporter = null;
if (SMTP_ENABLED) {
    smtpTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: SMTP_EMAIL,
            pass: SMTP_PASSWORD
        }
    });
    console.log(`✅ SMTP configured with ${SMTP_EMAIL}`);
} else {
    console.log('⚠️  SMTP not configured — emails will run in DEMO mode (OTP shown on screen).');
    console.log('   Set SMTP_EMAIL and SMTP_PASSWORD environment variables to enable real emails.');
}

// ── EMAIL HTML TEMPLATES ──
function buildOtpEmailHtml(firstName, otp) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#166534,#16a34a);padding:36px 32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:26px;">🌾 Namma Rytha</h1>
          <p style="color:#bbf7d0;margin:8px 0 0;font-size:14px;">Smart Farming, Smarter Future</p>
        </div>
        <div style="padding:36px 32px;">
          <h2 style="color:#166534;margin:0 0 12px;font-size:20px;">Verify Your Email</h2>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">Hello <strong>${firstName}</strong>,<br>Thank you for joining Namma Rytha! Please use the verification code below to complete your registration:</p>
          <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px dashed #4ade80;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
            <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#166534;">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">⏰ This code expires in <strong>10 minutes</strong>.</p>
          <p style="color:#94a3b8;font-size:13px;margin:0;">If you did not request this, please ignore this email.</p>
        </div>
        <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} Namma Rytha · AI-Powered Smart Farming</p>
        </div>
      </div>
    </body>
    </html>`;
}

function buildWelcomeEmailHtml(firstName) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#166534,#16a34a);padding:40px 32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;">🌾 Welcome to Namma Rytha!</h1>
          <p style="color:#bbf7d0;margin:10px 0 0;font-size:15px;">Your smart farming journey begins now</p>
        </div>
        <div style="padding:36px 32px;">
          <h2 style="color:#166534;margin:0 0 16px;font-size:22px;">Namaste, ${firstName}! 🙏</h2>
          <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px;">Your account has been successfully created. You are now part of India's growing community of smart farmers!</p>
          <div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:0 0 24px;">
            <h3 style="color:#166534;margin:0 0 16px;font-size:16px;">🚀 What you can do now:</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#475569;font-size:14px;">🌡️</td><td style="padding:8px 12px;color:#475569;font-size:14px;">Real-time weather & soil monitoring</td></tr>
              <tr><td style="padding:8px 0;color:#475569;font-size:14px;">🤖</td><td style="padding:8px 12px;color:#475569;font-size:14px;">AI-powered crop recommendations</td></tr>
              <tr><td style="padding:8px 0;color:#475569;font-size:14px;">🛒</td><td style="padding:8px 12px;color:#475569;font-size:14px;">Shop farm equipment at best prices</td></tr>
              <tr><td style="padding:8px 0;color:#475569;font-size:14px;">📊</td><td style="padding:8px 12px;color:#475569;font-size:14px;">Track your sustainability score</td></tr>
              <tr><td style="padding:8px 0;color:#475569;font-size:14px;">💬</td><td style="padding:8px 12px;color:#475569;font-size:14px;">Connect with farming community</td></tr>
            </table>
          </div>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="#" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#4ade80);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;">🌾 Go to Dashboard</a>
          </div>
          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">Happy Farming! 🌱</p>
        </div>
        <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} Namma Rytha · AI-Powered Smart Farming</p>
        </div>
      </div>
    </body>
    </html>`;
}

async function sendEmail(to, subject, html) {
    if (!SMTP_ENABLED || !smtpTransporter) {
        console.log(`[EMAIL DEMO MODE] Would send to ${to}: "${subject}"`);
        return { demo: true };
    }
    try {
        const info = await smtpTransporter.sendMail({
            from: `"Namma Rytha 🌾" <${SMTP_EMAIL}>`,
            to,
            subject,
            html
        });
        console.log(`[EMAIL SENT] To: ${to}, Subject: "${subject}", ID: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`[EMAIL ERROR] Failed to send to ${to}:`, err.message);
        return { error: err.message };
    }
}

// In-memory OTP stores
const signupOtpStore = {};
const otpStore = {};
const adminOtpStore = {};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// ── HELPER: Convert MongoDB doc to frontend-compatible object ──
function toJSON(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    if (obj._id) {
        obj.id = obj._id.toString();
        delete obj._id;
    }
    delete obj.__v;
    return obj;
}

// ══════════════════════════════════════════════════════════
// ── SEED DATA (runs once on startup if collections empty) ──
// ══════════════════════════════════════════════════════════

async function seedDatabase() {
    try {
        // Seed default admin
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            await Admin.create({
                firstName: 'System',
                lastName: 'Admin',
                email: 'admin@nammarytha.in',
                phone: '9876543210',
                password: 'admin123'
            });
            console.log('🌱 Default admin seeded.');
        }

        // Seed sample products
        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            const products = [
                // Tractors & Power Equipment
                { name: 'Mini Power Tiller', category: 'Tractors & Equipment', price: 45000, description: '5.5 HP diesel engine mini tiller, ideal for small farms 1-3 acres. Easy maneuverability.', image: '🚜', brand: 'Mahindra', rating: 4.5, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Walk-Behind Tractor', category: 'Tractors & Equipment', price: 85000, description: '12 HP walk-behind tractor with rotavator attachment. Multi-purpose farm use.', image: '🚜', brand: 'Kirloskar', rating: 4.3, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Diesel Water Pump 5HP', category: 'Tractors & Equipment', price: 12500, description: 'Heavy-duty 5HP diesel water pump for irrigation. Max head 30m, flow rate 36000 L/hr.', image: '⚙️', brand: 'Honda', rating: 4.6, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Solar Water Pump 2HP', category: 'Tractors & Equipment', price: 28000, description: 'Solar-powered submersible pump with MPPT controller. Zero electricity cost.', image: '☀️', brand: 'CRI', rating: 4.4, suitable_crop: 'all', suitable_soil: 'all' },

                // Irrigation & Water
                { name: 'Drip Irrigation Kit 1 Acre', category: 'Irrigation & Water', price: 4500, description: 'Complete drip system for 1 acre. Includes mainline, sub-mainline, drippers and filters.', image: '💧', brand: 'Netafim', rating: 4.7, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Micro-Sprinkler Set 50pc', category: 'Irrigation & Water', price: 2800, description: 'Set of 50 micro-sprinklers covering 200 sqm. Ideal for vegetables and nurseries.', image: '🌊', brand: 'Jain', rating: 4.5, suitable_crop: 'vegetable', suitable_soil: 'all' },
                { name: 'Raingun Sprinkler 2" Heavy', category: 'Irrigation & Water', price: 6500, description: 'Heavy-duty rain gun with 30-60m radius. Covers 0.5 acres per position.', image: '🌧️', brand: 'Captain', rating: 4.2, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Digital Flow Meter', category: 'Irrigation & Water', price: 1800, description: 'Digital water flow meter with LCD display. Measures cumulative and flow rate.', image: '📊', brand: 'Ayvaz', rating: 4.0, suitable_crop: 'all', suitable_soil: 'all' },

                // Hand Tools
                { name: 'Premium Khurpi Set (4pc)', category: 'Hand Tools', price: 480, description: 'Forged steel khurpi set in 4 sizes. Ergonomic rubber handle for less fatigue.', image: '🪚', brand: 'Taparia', rating: 4.6, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Stainless Sickle / Dahya', category: 'Hand Tools', price: 350, description: 'Premium stainless steel sickle for harvesting wheat, paddy, and grass.', image: '🌾', brand: 'Bulldog', rating: 4.4, suitable_crop: 'wheat', suitable_soil: 'all' },
                { name: 'Heavy-Duty Spade', category: 'Hand Tools', price: 680, description: 'Forged carbon steel blade spade with D-shaped grip. 5-year warranty.', image: '⛏️', brand: 'Chillington', rating: 4.5, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Weeder Cultivator 5-tine', category: 'Hand Tools', price: 520, description: '5-tine steel cultivator for soil aeration and weeding between rows.', image: '🔧', brand: 'Falcon', rating: 4.3, suitable_crop: 'vegetable', suitable_soil: 'all' },
                { name: 'Pruning Secateur Premium', category: 'Hand Tools', price: 750, description: 'Bypass pruning shears with Teflon-coated blade. Cuts branches up to 2cm.', image: '✂️', brand: 'Felco', rating: 4.8, suitable_crop: 'fruit', suitable_soil: 'all' },

                // Sprayers & Plant Protection
                { name: 'Knapsack Manual Sprayer 16L', category: 'Sprayers', price: 850, description: '16L capacity knapsack sprayer with adjustable brass nozzle. Lightweight design.', image: '🧴', brand: 'Neptune', rating: 4.3, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Battery-Powered Sprayer 16L', category: 'Sprayers', price: 2200, description: '16L electric battery sprayer. 12V 8Ah battery for 8-10 hours continuous spraying.', image: '🔋', brand: 'Aspee', rating: 4.5, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Engine Power Sprayer 35L', category: 'Sprayers', price: 8500, description: '35L capacity petrol engine sprayer. 25m vertical reach. For large farms.', image: '⚡', brand: 'Shaktiman', rating: 4.2, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Drone Sprayer Service Kit', category: 'Sprayers', price: 350, description: 'Drone spraying service booking kit for 1 acre. GPS-guided precision application.', image: '🚁', brand: 'Garuda', rating: 4.6, suitable_crop: 'all', suitable_soil: 'all' },

                // Harvesting Equipment
                { name: 'Paddy Reaper Harvester', category: 'Harvesting', price: 65000, description: '4-wheel self-propelled paddy reaper. Cuts 1 acre/hour. Adjustable cutting height.', image: '🌾', brand: 'VST', rating: 4.4, suitable_crop: 'rice', suitable_soil: 'all' },
                { name: 'Maize Sheller Electric', category: 'Harvesting', price: 12500, description: 'Electric maize sheller, capacity 600kg/hr. Three-phase motor with speed control.', image: '🌽', brand: 'Agri Star', rating: 4.3, suitable_crop: 'maize', suitable_soil: 'all' },
                { name: 'Manual Groundnut Thresher', category: 'Harvesting', price: 3500, description: 'Manual groundnut pod stripper/thresher. Capacity 100-120 kg/hr. Easy to use.', image: '🥜', brand: 'Rasayan', rating: 4.1, suitable_crop: 'groundnut', suitable_soil: 'all' },

                // Soil Testing & Smart Tech
                { name: 'Digital Soil pH & Moisture Meter', category: 'Smart Accessories', price: 650, description: '3-in-1 soil tester: pH, moisture, and sunlight. No battery needed. Instant reading.', image: '📱', brand: 'Dr. Meter', rating: 4.2, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'NPK Soil Test Kit 50 Tests', category: 'Smart Accessories', price: 1200, description: 'Laboratory-grade NPK soil test kit. 50 tests included. Easy color-comparison method.', image: '🧪', brand: 'Hanna', rating: 4.5, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Smart Drip Timer Controller', category: 'Smart Accessories', price: 2400, description: 'Programmable drip timer with 6-zone control. App-controlled via Bluetooth.', image: '⏱️', brand: 'Hunter', rating: 4.6, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Weather Station Mini Farm', category: 'Smart Accessories', price: 4500, description: 'Wireless farm weather station. Measures rainfall, temp, humidity, wind. App synced.', image: '🌡️', brand: 'Davis', rating: 4.7, suitable_crop: 'all', suitable_soil: 'all' },

                // Safety & PPE
                { name: 'Chemical Resistant Gloves L', category: 'Safety & PPE', price: 180, description: 'Nitrile chemical-resistant gloves for pesticide spraying. 12" long, reusable.', image: '🧤', brand: 'Showa', rating: 4.4, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Face Shield Full-Face Visor', category: 'Safety & PPE', price: 320, description: 'Full-face polycarbonate visor for pesticide protection. Anti-fog coating.', image: '😷', brand: 'MSA', rating: 4.5, suitable_crop: 'all', suitable_soil: 'all' },
                { name: 'Farm First Aid Kit', category: 'Safety & PPE', price: 550, description: '50-piece farm first aid kit with snake bite bandage, antiseptic, and eye wash.', image: '⛑️', brand: 'St John', rating: 4.6, suitable_crop: 'all', suitable_soil: 'all' },
            ];
            await Product.insertMany(products);
            console.log(`🌱 ${products.length} sample products seeded.`);
        }
    } catch (err) {
        console.error('Seed error:', err.message);
    }
}

// Run seed after connection
mongoose.connection.once('open', seedDatabase);

// ══════════════════════════════════════════════════════
// ── API ROUTES ──
// ══════════════════════════════════════════════════════

// ── Products ──
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().lean();
        res.json(products.map(p => ({ ...p, id: p._id, _id: undefined, __v: undefined })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, category, price, description, image, suitable_crop, suitable_soil } = req.body;
        const product = await Product.create({
            name, category, price, description,
            image: image || '📦',
            suitable_crop: suitable_crop || 'all',
            suitable_soil: suitable_soil || 'all'
        });
        res.json({ id: product._id, name, category, price, description });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, category, price, description, image, brand, rating } = req.body;
        const result = await Product.findByIdAndUpdate(req.params.id, {
            name, category, price, description,
            image: image || '📦',
            brand: brand || 'Generic',
            rating: rating || 4.5
        }, { new: true });
        res.json({ success: true, changes: result ? 1 : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const result = await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true, changes: result ? 1 : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Signup OTP: Send verification code to email ──
app.post('/api/signup/send-otp', async (req, res) => {
    try {
        const { email, firstName } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'This email is already registered. Please log in instead.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        signupOtpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

        console.log(`[SIGNUP OTP] Code for ${email}: ${otp}`);

        const otpHtml = buildOtpEmailHtml(firstName || 'Farmer', otp);
        sendEmail(email, '🔐 Your Namma Rytha Verification Code', otpHtml);

        const response = {
            success: true,
            message: SMTP_ENABLED
                ? 'A 6-digit verification code has been sent to your email.'
                : 'A 6-digit verification code has been generated (demo mode).'
        };
        if (!SMTP_ENABLED) response.otp = otp;

        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Signup: Create account (requires OTP verification) ──
app.post('/api/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, location, area, crop, password, otp } = req.body;

        if (!otp) return res.status(400).json({ error: 'Verification code is required.' });

        const record = signupOtpStore[email];
        if (!record) return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
        if (Date.now() > record.expires) {
            delete signupOtpStore[email];
            return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        }
        if (record.otp !== otp) return res.status(400).json({ error: 'Invalid verification code. Please try again.' });

        const user = await User.create({ firstName, lastName, email, phone, location, area, crop, password });

        delete signupOtpStore[email];

        const welcomeHtml = buildWelcomeEmailHtml(firstName || 'Farmer');
        sendEmail(email, '🌾 Welcome to Namma Rytha — Your Account is Ready!', welcomeHtml);

        console.log(`[SIGNUP SUCCESS] ${firstName} ${lastName} (${email}) — Account created & welcome email sent.`);

        res.json({ id: user._id, firstName, lastName, email, location, area, crop });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ── Farm Data ──
app.get('/api/farm-data/:userId', async (req, res) => {
    try {
        const data = await FarmData.findOne({ userId: req.params.userId }).lean();
        res.json(data || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/farm-data', async (req, res) => {
    try {
        const { userId, moisture, rainProbability, lastIrrigated } = req.body;
        await FarmData.findOneAndUpdate(
            { userId },
            { userId, moisture, rainProbability, lastIrrigated },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Login ──
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

        res.json({
            id: user._id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            location: user.location,
            area: user.area,
            crop: user.crop,
            phone: user.phone
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Forgot Password ──
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'No account found with this email address.' });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

        console.log(`[RESET PASSWORD] OTP for ${email} is ${otp}`);

        res.json({
            success: true,
            message: 'A 4-digit verification code has been generated.',
            otp: otp
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Reset Password ──
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
        }

        const record = otpStore[email];
        if (!record) return res.status(400).json({ error: 'No active password reset request found.' });
        if (Date.now() > record.expires) {
            delete otpStore[email];
            return res.status(400).json({ error: 'Verification code has expired.' });
        }
        if (record.otp !== otp) return res.status(400).json({ error: 'Invalid verification code.' });

        await User.findOneAndUpdate({ email }, { password: newPassword });
        delete otpStore[email];
        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Google Sign-In ──
app.post('/api/google-auth', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided.' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar, name } = payload;

        let user = await User.findOne({ email });

        if (user) {
            user.google_id = googleId;
            user.avatar = avatar;
            await user.save();
            res.json({
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                location: user.location || 'India',
                area: user.area || '1.0',
                crop: user.crop || 'wheat',
                phone: user.phone || '',
                avatar: avatar,
                loginMethod: 'google'
            });
        } else {
            user = await User.create({
                firstName: firstName || name,
                lastName: lastName || '',
                email,
                google_id: googleId,
                avatar,
                location: 'India',
                area: '1.0',
                crop: 'wheat',
                phone: ''
            });
            res.json({
                id: user._id,
                name: `${firstName || name} ${lastName || ''}`.trim(),
                email,
                location: 'India',
                area: '1.0',
                crop: 'wheat',
                phone: '',
                avatar: avatar,
                loginMethod: 'google'
            });
        }
    } catch (err) {
        console.error('Google token verification failed:', err.message);
        res.status(401).json({ error: 'Invalid Google token. Ensure your Client ID is correct.' });
    }
});

// ── User Profile Update ──
app.post('/api/user/update', async (req, res) => {
    try {
        const { id, firstName, lastName, location, area, crop, phone } = req.body;
        if (!id) return res.status(400).json({ error: 'User ID is required' });

        await User.findByIdAndUpdate(id, { firstName, lastName, location, area, crop, phone });
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Update Sustainability Score ──
app.post('/api/user/update-sustainability', async (req, res) => {
    try {
        const { userId, score } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });

        await User.findByIdAndUpdate(userId, { sustainability_score: score });
        res.json({ success: true, message: 'Sustainability score updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Feedback ──
app.post('/api/feedback', async (req, res) => {
    try {
        const { userId, name, email, rating, message } = req.body;
        const feedback = await Feedback.create({ userId, name, email, rating, message });
        res.json({ success: true, id: feedback._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Farmers Management ──
app.get('/api/farmers', async (req, res) => {
    try {
        const users = await User.find({}, 'firstName lastName email phone location area crop sustainability_score').lean();
        res.json(users.map(u => ({ ...u, id: u._id, _id: undefined, __v: undefined })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/farmers/:id', async (req, res) => {
    try {
        const result = await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, changes: result ? 1 : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin Auth ──
app.post('/api/admin/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, inviteCode } = req.body;

        if (inviteCode !== 'admin123') {
            return res.status(400).json({ error: 'Invalid admin invite code.' });
        }

        const admin = await Admin.create({ firstName, lastName, email, phone, password });
        res.json({ id: admin._id, firstName, lastName, email, phone });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Allow 'admin' shorthand for default admin
        let admin;
        if (email === 'admin') {
            admin = await Admin.findOne({ email: 'admin@nammarytha.in', password });
        } else {
            admin = await Admin.findOne({ email, password });
        }

        if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

        res.json({
            id: admin._id,
            name: `${admin.firstName} ${admin.lastName}`,
            email: admin.email,
            phone: admin.phone
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/google-auth', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided.' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, picture: avatar } = payload;

        const existing = await Admin.findOne({ email });

        if (existing) {
            existing.google_id = googleId;
            existing.avatar = avatar;
            await existing.save();
            res.json({
                id: existing._id,
                name: `${existing.firstName} ${existing.lastName}`,
                email: existing.email,
                phone: existing.phone || '',
                avatar: avatar,
                loginMethod: 'google'
            });
        } else {
            res.status(403).json({ error: 'This Google account is not registered as an administrator. Please sign up using your email and the invite code first.' });
        }
    } catch (err) {
        console.error('Admin Google verification failed:', err.message);
        res.status(401).json({ error: 'Invalid Google token.' });
    }
});

app.post('/api/admin/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(404).json({ error: 'No admin account found with this email address.' });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        adminOtpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

        console.log(`[ADMIN RESET PASSWORD] OTP for ${email} is ${otp}`);

        res.json({
            success: true,
            message: 'A 4-digit verification code has been generated.',
            otp: otp
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
        }

        const record = adminOtpStore[email];
        if (!record) return res.status(400).json({ error: 'No active password reset request found.' });
        if (Date.now() > record.expires) {
            delete adminOtpStore[email];
            return res.status(400).json({ error: 'Verification code has expired.' });
        }
        if (record.otp !== otp) return res.status(400).json({ error: 'Invalid verification code.' });

        await Admin.findOneAndUpdate({ email }, { password: newPassword });
        delete adminOtpStore[email];
        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Activity Tracking ──
app.post('/api/activity', async (req, res) => {
    try {
        const { userId, userName, action, details } = req.body;
        const activity = await Activity.create({ userId, userName, action, details });
        res.json({ success: true, id: activity._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/activities', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const activities = await Activity.find().sort({ timestamp: -1 }).limit(limit).lean();
        res.json(activities.map(a => ({ ...a, id: a._id, _id: undefined, __v: undefined })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Orders ──
app.post('/api/orders', async (req, res) => {
    try {
        const { userId, userName, items, total } = req.body;
        const order = await Order.create({ userId, userName, items, total });
        res.json({ success: true, id: order._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const orders = await Order.find().sort({ timestamp: -1 }).limit(limit).lean();
        res.json(orders.map(o => ({ ...o, id: o._id, _id: undefined, __v: undefined })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Start server ──
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
