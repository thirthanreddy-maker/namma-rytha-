/**
 * ═══════════════════════════════════════════════════════════════════
 *  NAMMA RYTHA — MongoDB Database Setup & Seed Script
 *  Run with:  node setup-db.js
 *  Requires:  Local MongoDB running on localhost:27017
 *             (Install from https://www.mongodb.com/try/download/community)
 * ═══════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

// ── LOCAL MONGO URI ──
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nammarytha';

// ══════════════════════
//  SCHEMA DEFINITIONS
// ══════════════════════

const userSchema = new mongoose.Schema({
    firstName:           { type: String, default: '' },
    lastName:            { type: String, default: '' },
    email:               { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:               { type: String, default: '' },
    location:            { type: String, default: '' },
    area:                { type: String, default: '' },
    crop:                { type: String, default: '' },
    password:            { type: String, default: '' },
    google_id:           { type: String, default: '' },
    avatar:              { type: String, default: '' },
    sustainability_score:{ type: Number, default: 70 }
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
    firstName: { type: String, default: '' },
    lastName:  { type: String, default: '' },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:     { type: String, default: '' },
    password:  { type: String, default: '' },
    google_id: { type: String, default: '' },
    avatar:    { type: String, default: '' }
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name:          { type: String, required: true },
    category:      { type: String, default: '' },
    price:         { type: Number, default: 0 },
    description:   { type: String, default: '' },
    image:         { type: String, default: '📦' },
    brand:         { type: String, default: 'Generic' },
    rating:        { type: Number, default: 4.5 },
    suitable_crop: { type: String, default: 'all' },
    suitable_soil: { type: String, default: 'all' }
}, { timestamps: true });

const farmDataSchema = new mongoose.Schema({
    userId:          { type: mongoose.Schema.Types.Mixed },
    temperature:     { type: Number, default: 0 },
    humidity:        { type: Number, default: 0 },
    soil_moisture:   { type: Number, default: 0 },
    rainfall:        { type: Number, default: 0 },
    wind_speed:      { type: Number, default: 0 },
    timestamp:       { type: Date, default: Date.now }
}, { timestamps: false });

const activitySchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.Mixed },
    userName:  { type: String, default: '' },
    action:    { type: String, default: '' },
    details:   { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

const orderSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.Mixed },
    userName:  { type: String, default: '' },
    items:     { type: String, default: '' },
    total:     { type: Number, default: 0 },
    status:    { type: String, default: 'pending' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

const feedbackSchema = new mongoose.Schema({
    userId:  { type: mongoose.Schema.Types.Mixed },
    name:    { type: String, default: '' },
    email:   { type: String, default: '' },
    rating:  { type: Number, default: 0 },
    message: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    replies: [{
        replyMessage: { type: String, required: true },
        adminUser:    { type: String, default: 'System Admin' },
        timestamp:    { type: Date, default: Date.now }
    }]
}, { timestamps: false });

const notificationSchema = new mongoose.Schema({
    eventType:      { type: String, required: true },
    userName:       { type: String, required: true },
    recipientEmail: { type: String, default: '' },
    crop:           { type: String, default: '' },
    channels:       [{ type: String }],
    message:        { type: String, required: true },
    type:           { type: String, enum: ['manual', 'automated'], default: 'manual' },
    status:         { type: String, default: 'Sent' },
    timestamp:      { type: Date, default: Date.now }
}, { timestamps: false });

// ── MODELS ──
const User         = mongoose.model('User',         userSchema);
const Admin        = mongoose.model('Admin',        adminSchema);
const Product      = mongoose.model('Product',      productSchema);
const FarmData     = mongoose.model('FarmData',     farmDataSchema);
const Activity     = mongoose.model('Activity',     activitySchema);
const Order        = mongoose.model('Order',        orderSchema);
const Feedback     = mongoose.model('Feedback',     feedbackSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ══════════════════════
//  SEED DATA
// ══════════════════════

async function seedAll() {
    console.log('\n Seeding Namma Rytha database...\n');

    // ── 1. Admin ──
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
        await Admin.create({
            firstName: 'System',
            lastName:  'Admin',
            email:     'admin@nammarytha.in',
            phone:     '9876543210',
            password:  'admin123'
        });
        console.log('Admin seeded        -> admin@nammarytha.in / admin123');
    } else {
        console.log('Admin skipped       -> ' + adminCount + ' admin(s) already exist');
    }

    // ── 2. Sample Farmers ──
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        const users = [
            { firstName: 'Sharanappa', lastName: 'Gowda',   email: 'demo@nammarytha.in',      phone: '+919448102938', location: 'Raichur, Karnataka',    area: '5',  crop: 'Paddy',     password: 'demo123', sustainability_score: 85 },
            { firstName: 'Ramesh',     lastName: 'Kumar',   email: 'ramesh@nammarytha.in',    phone: '+919880123456', location: 'Mandya, Karnataka',     area: '10', crop: 'Sugarcane', password: 'demo123', sustainability_score: 75 },
            { firstName: 'Suresh',     lastName: 'Patil',   email: 'suresh@nammarytha.in',    phone: '+919770123456', location: 'Hassan, Karnataka',     area: '4',  crop: 'Coffee',    password: 'demo123', sustainability_score: 62 },
            { firstName: 'Lakshmi',    lastName: 'Devi',    email: 'lakshmi@nammarytha.in',   phone: '+919660123456', location: 'Mysuru, Karnataka',     area: '3',  crop: 'Ragi',      password: 'demo123', sustainability_score: 90 },
            { firstName: 'Venkatesh',  lastName: 'Reddy',   email: 'venkatesh@nammarytha.in', phone: '+919550123456', location: 'Kalaburagi, Karnataka', area: '8',  crop: 'Cotton',    password: 'demo123', sustainability_score: 68 },
        ];
        await User.insertMany(users);
        console.log('Farmers seeded      -> ' + users.length + ' sample farmers added');
    } else {
        console.log('Farmers skipped     -> ' + userCount + ' farmer(s) already exist');
    }

    // ── 3. Products ──
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
        const products = [
            // Tractors & Power Equipment
            { name: 'Mini Power Tiller',           category: 'Tractors & Equipment', price: 45000, description: '5.5 HP diesel engine mini tiller, ideal for small farms 1-3 acres.',           image: '🚜', brand: 'Mahindra',   rating: 4.5, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Walk-Behind Tractor',          category: 'Tractors & Equipment', price: 85000, description: '12 HP walk-behind tractor with rotavator attachment.',                         image: '🚜', brand: 'Kirloskar',  rating: 4.3, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Diesel Water Pump 5HP',        category: 'Tractors & Equipment', price: 12500, description: 'Heavy-duty 5HP diesel water pump. Max head 30m, flow rate 36000 L/hr.',        image: '⚙️', brand: 'Honda',      rating: 4.6, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Solar Water Pump 2HP',         category: 'Tractors & Equipment', price: 28000, description: 'Solar-powered submersible pump with MPPT controller. Zero electricity cost.',   image: '☀️', brand: 'CRI',        rating: 4.4, suitable_crop: 'all',       suitable_soil: 'all' },
            // Irrigation
            { name: 'Drip Irrigation Kit 1 Acre',  category: 'Irrigation & Water',   price: 4500,  description: 'Complete drip system for 1 acre. Includes mainline, drippers and filters.',     image: '💧', brand: 'Netafim',    rating: 4.7, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Micro-Sprinkler Set 50pc',     category: 'Irrigation & Water',   price: 2800,  description: '50 micro-sprinklers covering 200 sqm. Ideal for vegetables and nurseries.',     image: '🌊', brand: 'Jain',       rating: 4.5, suitable_crop: 'vegetable', suitable_soil: 'all' },
            { name: 'Raingun Sprinkler 2 inch',     category: 'Irrigation & Water',   price: 6500,  description: 'Heavy-duty rain gun with 30-60m radius. Covers 0.5 acres per position.',        image: '🌧️', brand: 'Captain',   rating: 4.2, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Digital Flow Meter',           category: 'Irrigation & Water',   price: 1800,  description: 'Digital water flow meter with LCD display.',                                    image: '📊', brand: 'Ayvaz',      rating: 4.0, suitable_crop: 'all',       suitable_soil: 'all' },
            // Hand Tools
            { name: 'Premium Khurpi Set 4pc',      category: 'Hand Tools',           price: 480,   description: 'Forged steel khurpi set in 4 sizes. Ergonomic rubber handle.',                  image: '🪚', brand: 'Taparia',    rating: 4.6, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Stainless Sickle',             category: 'Hand Tools',           price: 350,   description: 'Premium stainless steel sickle for harvesting wheat, paddy, and grass.',        image: '🌾', brand: 'Bulldog',    rating: 4.4, suitable_crop: 'wheat',     suitable_soil: 'all' },
            { name: 'Heavy-Duty Spade',             category: 'Hand Tools',           price: 680,   description: 'Forged carbon steel blade spade with D-shaped grip. 5-year warranty.',          image: '⛏️', brand: 'Chillington',rating: 4.5, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Weeder Cultivator 5-tine',     category: 'Hand Tools',           price: 520,   description: '5-tine steel cultivator for soil aeration and weeding between rows.',            image: '🔧', brand: 'Falcon',     rating: 4.3, suitable_crop: 'vegetable', suitable_soil: 'all' },
            { name: 'Pruning Secateur Premium',     category: 'Hand Tools',           price: 750,   description: 'Bypass pruning shears with Teflon-coated blade. Cuts branches up to 2cm.',      image: '✂️', brand: 'Felco',      rating: 4.8, suitable_crop: 'fruit',     suitable_soil: 'all' },
            // Sprayers
            { name: 'Knapsack Manual Sprayer 16L',  category: 'Sprayers',             price: 850,   description: '16L knapsack sprayer with adjustable brass nozzle. Lightweight design.',         image: '🧴', brand: 'Neptune',    rating: 4.3, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Battery-Powered Sprayer 16L',  category: 'Sprayers',             price: 2200,  description: '16L electric battery sprayer. 12V 8Ah battery for 8-10 hours.',                 image: '🔋', brand: 'Aspee',      rating: 4.5, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Engine Power Sprayer 35L',     category: 'Sprayers',             price: 8500,  description: '35L petrol engine sprayer. 25m vertical reach. For large farms.',               image: '⚡', brand: 'Shaktiman',  rating: 4.2, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Drone Sprayer Service Kit',    category: 'Sprayers',             price: 350,   description: 'Drone spraying service booking kit for 1 acre. GPS-guided precision.',           image: '🚁', brand: 'Garuda',     rating: 4.6, suitable_crop: 'all',       suitable_soil: 'all' },
            // Harvesting
            { name: 'Paddy Reaper Harvester',       category: 'Harvesting',           price: 65000, description: '4-wheel self-propelled paddy reaper. Cuts 1 acre/hour.',                        image: '🌾', brand: 'VST',        rating: 4.4, suitable_crop: 'rice',      suitable_soil: 'all' },
            { name: 'Maize Sheller Electric',       category: 'Harvesting',           price: 12500, description: 'Electric maize sheller, capacity 600kg/hr.',                                    image: '🌽', brand: 'Agri Star',  rating: 4.3, suitable_crop: 'maize',     suitable_soil: 'all' },
            { name: 'Manual Groundnut Thresher',    category: 'Harvesting',           price: 3500,  description: 'Manual groundnut pod stripper. Capacity 100-120 kg/hr.',                        image: '🥜', brand: 'Rasayan',    rating: 4.1, suitable_crop: 'groundnut', suitable_soil: 'all' },
            // Smart Tech
            { name: 'Digital Soil pH and Moisture Meter', category: 'Smart Accessories', price: 650, description: '3-in-1 soil tester: pH, moisture, and sunlight.',                             image: '📱', brand: 'Dr. Meter',  rating: 4.2, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'NPK Soil Test Kit 50 Tests',   category: 'Smart Accessories',    price: 1200,  description: 'Laboratory-grade NPK soil test kit with 50 tests.',                             image: '🧪', brand: 'Hanna',      rating: 4.5, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Smart Drip Timer Controller',  category: 'Smart Accessories',    price: 2400,  description: 'Programmable drip timer with 6-zone control via Bluetooth app.',                image: '⏱️', brand: 'Hunter',    rating: 4.6, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Weather Station Mini Farm',    category: 'Smart Accessories',    price: 4500,  description: 'Wireless farm weather station with rainfall, temp, humidity, wind.',             image: '🌡️', brand: 'Davis',     rating: 4.7, suitable_crop: 'all',       suitable_soil: 'all' },
            // Safety & PPE
            { name: 'Chemical Resistant Gloves',    category: 'Safety & PPE',         price: 180,   description: 'Nitrile chemical-resistant gloves for pesticide spraying.',                     image: '🧤', brand: 'Showa',      rating: 4.4, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Face Shield Full Visor',       category: 'Safety & PPE',         price: 320,   description: 'Full-face polycarbonate visor for pesticide protection. Anti-fog.',             image: '😷', brand: 'MSA',        rating: 4.5, suitable_crop: 'all',       suitable_soil: 'all' },
            { name: 'Farm First Aid Kit',           category: 'Safety & PPE',         price: 550,   description: '50-piece kit with snake bite bandage, antiseptic, and eye wash.',               image: '⛑️', brand: 'St John',   rating: 4.6, suitable_crop: 'all',       suitable_soil: 'all' },
        ];
        await Product.insertMany(products);
        console.log('Products seeded     -> ' + products.length + ' products added');
    } else {
        console.log('Products skipped    -> ' + productCount + ' product(s) already exist');
    }

    // ── 4. Sample Feedback ──
    const feedbackCount = await Feedback.countDocuments();
    if (feedbackCount === 0) {
        await Feedback.insertMany([
            { name: 'Sharanappa Gowda', email: 'demo@nammarytha.in',   rating: 5, message: 'The weather forecasting tool is extremely helpful! It saved my crops from heavy rains last week.', timestamp: new Date(Date.now() - 3600000 * 2),  replies: [] },
            { name: 'Ramesh Kumar',     email: 'ramesh@nammarytha.in', rating: 4, message: 'Excellent marketplace. I ordered organic fertilizer and got it in 3 days. Keep it up!',            timestamp: new Date(Date.now() - 3600000 * 24), replies: [{ replyMessage: 'Thank you Ramesh! We strive to deliver as fast as possible to rural areas.', adminUser: 'System Admin', timestamp: new Date(Date.now() - 3600000 * 20) }] },
            { name: 'Lakshmi Devi',     email: 'lakshmi@nammarytha.in',rating: 5, message: 'The AI crop recommendation suggested intercropping ragi with horsegram — brilliant results!',      timestamp: new Date(Date.now() - 3600000 * 48), replies: [] },
        ]);
        console.log('Feedback seeded     -> 3 sample feedback entries added');
    } else {
        console.log('Feedback skipped    -> ' + feedbackCount + ' entry(ies) already exist');
    }

    // ── 5. Sample Notifications ──
    const notifCount = await Notification.countDocuments();
    if (notifCount === 0) {
        await Notification.insertMany([
            { eventType: 'Weather Alert', userName: 'All Registered Farmers', recipientEmail: '',                     channels: ['email', 'push'], message: 'Weather Alert: Expected heavy rainfall in your region. Please secure harvested crops.',         type: 'manual',    status: 'Sent', timestamp: new Date(Date.now() - 3600000 * 5)  },
            { eventType: 'Signup OTP',    userName: 'Sharanappa Gowda',       recipientEmail: 'demo@nammarytha.in',   channels: ['email'],         message: 'A 6-digit verification code 452910 was generated for registration.',                          type: 'automated', status: 'Sent', timestamp: new Date(Date.now() - 3600000 * 48) },
            { eventType: 'Welcome Alert', userName: 'Ramesh Kumar',            recipientEmail: 'ramesh@nammarytha.in',channels: ['email'],         message: 'Welcome to Namma Rytha! Account created successfully for Ramesh Kumar.',                        type: 'automated', status: 'Sent', timestamp: new Date(Date.now() - 3600000 * 72) },
        ]);
        console.log('Notifications seeded -> 3 notification logs added');
    } else {
        console.log('Notifications skipped -> ' + notifCount + ' notification(s) already exist');
    }

    // ── 6. Sample Orders ──
    const orderCount = await Order.countDocuments();
    if (orderCount === 0) {
        await Order.insertMany([
            { userName: 'Ramesh Kumar',     items: JSON.stringify([{ image: '💧', name: 'Drip Irrigation Kit 1 Acre' }]),                                                                     total: 4500, status: 'delivered', timestamp: new Date(Date.now() - 3600000 * 48) },
            { userName: 'Sharanappa Gowda', items: JSON.stringify([{ image: '🚜', name: 'Mini Power Tiller' }]),                                                                              total: 45000,status: 'shipped',   timestamp: new Date(Date.now() - 3600000 * 24) },
            { userName: 'Suresh Patil',     items: JSON.stringify([{ image: '🔋', name: 'Battery-Powered Sprayer 16L' }, { image: '🧤', name: 'Chemical Resistant Gloves' }]),               total: 2380, status: 'pending',   timestamp: new Date() },
        ]);
        console.log('Orders seeded       -> 3 sample orders added');
    } else {
        console.log('Orders skipped      -> ' + orderCount + ' order(s) already exist');
    }

    // ── 7. Sample Farm Sensor Data ──
    const farmDataCount = await FarmData.countDocuments();
    if (farmDataCount === 0) {
        const farmEntries = [];
        for (let i = 24; i >= 0; i--) {
            farmEntries.push({
                userId:        'demo-user',
                temperature:   Math.round(24 + Math.random() * 8),
                humidity:      Math.round(55 + Math.random() * 30),
                soil_moisture: Math.round(40 + Math.random() * 40),
                rainfall:      Math.round(Math.random() * 5),
                wind_speed:    Math.round(5 + Math.random() * 15),
                timestamp:     new Date(Date.now() - i * 3600000)
            });
        }
        await FarmData.insertMany(farmEntries);
        console.log('Farm data seeded    -> 25 hourly sensor readings added');
    } else {
        console.log('Farm data skipped   -> ' + farmDataCount + ' reading(s) already exist');
    }

    // ── 8. Activity Logs ──
    const activityCount = await Activity.countDocuments();
    if (activityCount === 0) {
        await Activity.insertMany([
            { userName: 'Sharanappa Gowda', action: 'view_page',   details: 'Opened soil moisture sensor dashboard',     timestamp: new Date(Date.now() - 300000)  },
            { userName: 'Ramesh Kumar',     action: 'add_to_cart', details: 'Added Solar Water Pump to cart',             timestamp: new Date(Date.now() - 600000)  },
            { userName: 'Suresh Patil',     action: 'login',       details: 'User logged in from Hassan',                 timestamp: new Date(Date.now() - 1200000) },
            { userName: 'Lakshmi Devi',     action: 'view_page',   details: 'Viewed AI crop recommendation report',       timestamp: new Date(Date.now() - 3600000) },
        ]);
        console.log('Activities seeded   -> 4 sample activity logs added');
    } else {
        console.log('Activities skipped  -> ' + activityCount + ' activity(ies) already exist');
    }

    console.log('\n========================================================');
    console.log('  Database setup complete!');
    console.log('  Database: nammarytha');
    console.log('  URI:      mongodb://127.0.0.1:27017/nammarytha');
    console.log('');
    console.log('  Collections: admins, users, products, feedbacks,');
    console.log('               notifications, orders, farmdatas, activities');
    console.log('');
    console.log('  Start server:  node server.js');
    console.log('  Admin login:   admin@nammarytha.in / admin123');
    console.log('  Demo farmer:   demo@nammarytha.in  / demo123');
    console.log('========================================================\n');
}

// ══════════════════════
//  MAIN
// ══════════════════════
async function main() {
    console.log('Connecting to MongoDB at', MONGO_URI, '...');
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
        console.log('Connected successfully!\n');
        await seedAll();
    } catch (err) {
        console.error('\nConnection failed:', err.message);
        console.log('\nTo fix: make sure MongoDB is running.');
        console.log('  1. Download: https://www.mongodb.com/try/download/community');
        console.log('  2. Install with "Run as a Service" option checked');
        console.log('  3. Or start manually: mongod --dbpath C:\\data\\db\n');
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

main();
