const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

// ── PASTE YOUR GOOGLE CLIENT ID HERE ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '166834385153-oqpgsnhkufrreqeskgor54q7j4tldtin.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Error opening database:', err);
    else console.log('Connected to SQLite database.');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT,
        lastName TEXT,
        email TEXT UNIQUE,
        phone TEXT,
        location TEXT,
        area TEXT,
        crop TEXT,
        password TEXT,
        google_id TEXT,
        avatar TEXT
    )`);
    // Add columns if upgrading an existing DB (safe to run multiple times)
    db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS farm_data (
        userId INTEGER,
        moisture REAL,
        rainProbability INTEGER,
        lastIrrigated TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        category TEXT,
        price REAL,
        description TEXT,
        image TEXT,
        suitable_crop TEXT,
        suitable_soil TEXT
    )`);

    // Insert sample products only if table is empty
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            const products = [
                ['Hybrid Tomato Seeds', 'Seeds', 250, 'High-yield hybrid tomato seeds resistant to blight.', '🍅', 'tomato', 'loamy'],
                ['Organic Urea fertilizer', 'Fertilizer', 450, 'Premium organic urea for nitrogen enhancement.', '🌿', 'wheat', 'all'],
                ['NPK 19-19-19', 'Fertilizer', 600, 'Balanced NPK for overall plant health.', '🧪', 'all', 'all'],
                ['Drip Irrigation Kit', 'Tools', 1200, 'Complete drip kit for 1-acre field.', '💧', 'all', 'all'],
                ['Neem Oil Pesticide', 'Pesticide', 150, 'Natural organic pest control.', '🛡️', 'all', 'all'],
                ['Black Cotton Soil Additive', 'Soil', 300, 'Specialized mix for improving black cotton soil drainage.', '🧱', 'cotton', 'black'],
                ['Rice Yield Booster', 'Fertilizer', 550, 'Micro-nutrient mix specifically for paddy.', '🍚', 'rice', 'clay'],
                ['Hand Tiller', 'Tools', 850, 'Ergonomic hand tiller for weeding.', '⛏️', 'all', 'all']
            ];
            const stmt = db.prepare(`INSERT INTO products (name, category, price, description, image, suitable_crop, suitable_soil) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            products.forEach(p => stmt.run(p));
            stmt.finalize();
        }
    });
});

// Products API
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Routes
app.post('/api/signup', (req, res) => {
    const { firstName, lastName, email, phone, location, area, crop, password } = req.body;
    const sql = `INSERT INTO users (firstName, lastName, email, phone, location, area, crop, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [firstName, lastName, email, phone, location, area, crop, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email already exists.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, firstName, lastName, email, location, area, crop });
    });
});

app.get('/api/farm-data/:userId', (req, res) => {
    const { userId } = req.params;
    db.get(`SELECT * FROM farm_data WHERE userId = ?`, [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post('/api/farm-data', (req, res) => {
    const { userId, moisture, rainProbability, lastIrrigated } = req.body;
    const sql = `INSERT INTO farm_data (userId, moisture, rainProbability, lastIrrigated) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(userId) DO UPDATE SET 
                 moisture=excluded.moisture, 
                 rainProbability=excluded.rainProbability, 
                 lastIrrigated=excluded.lastIrrigated`;
    
    // SQLite doesn't support ON CONFLICT without UNIQUE constraint. Let's fix schema first or use simple logic.
    // For simplicity, we'll try a DELETE then INSERT or a more robust INSERT/UPDATE logic.
    db.run(`DELETE FROM farm_data WHERE userId = ?`, [userId], () => {
        db.run(`INSERT INTO farm_data (userId, moisture, rainProbability, lastIrrigated) VALUES (?, ?, ?, ?)`,
            [userId, moisture, rainProbability, lastIrrigated], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
    
    db.get(sql, [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Invalid email or password.' });
        
        res.json({
            id: row.id,
            name: `${row.firstName} ${row.lastName}`,
            email: row.email,
            location: row.location,
            area: row.area,
            crop: row.crop,
            phone: row.phone
        });
    });
});

// ── GOOGLE SIGN-IN ──
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

        // Upsert: if email exists, update google_id & avatar; otherwise insert new user
        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });

            if (existing) {
                // Link Google account to existing user
                db.run(`UPDATE users SET google_id = ?, avatar = ? WHERE email = ?`,
                    [googleId, avatar, email], (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({
                            id: existing.id,
                            name: `${existing.firstName} ${existing.lastName}`,
                            email: existing.email,
                            location: existing.location || 'India',
                            area: existing.area || '1.0',
                            crop: existing.crop || 'wheat',
                            phone: existing.phone || '',
                            avatar: avatar,
                            loginMethod: 'google'
                        });
                    });
            } else {
                // Create new user from Google profile
                db.run(
                    `INSERT INTO users (firstName, lastName, email, google_id, avatar, location, area, crop, phone)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [firstName || name, lastName || '', email, googleId, avatar,
                     'India', '1.0', 'wheat', ''],
                    function(err2) {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({
                            id: this.lastID,
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
                );
            }
        });
    } catch (err) {
        console.error('Google token verification failed:', err.message);
        res.status(401).json({ error: 'Invalid Google token. Ensure your Client ID is correct.' });
    }
});

app.post('/api/products', (req, res) => {
    const { name, category, price, description, image, suitable_crop, suitable_soil } = req.body;
    const sql = `INSERT INTO products (name, category, price, description, image, suitable_crop, suitable_soil) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [name, category, price, description, image || '📦', suitable_crop || 'all', suitable_soil || 'all'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, category, price, description });
    });
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
