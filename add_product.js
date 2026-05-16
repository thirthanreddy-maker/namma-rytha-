const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

const productsToAdd = [
    ['Nano-DAP Fertilizer', 'Fertilizer', 650, 'High-efficiency liquid DAP for better nutrient absorption.', '🧪', 'wheat', 'all'],
    ['Precision Soil Tester', 'Tools', 3500, 'Handheld IoT device for real-time soil NPK testing.', '🌡️', 'all', 'all']
];

db.serialize(() => {
    const stmt = db.prepare(`INSERT OR IGNORE INTO products (name, category, price, description, image, suitable_crop, suitable_soil) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    productsToAdd.forEach(p => {
        stmt.run(p, (err) => {
            if (err) console.error('Error adding product:', err);
            else console.log(`Successfully added ${p[0]} to products table.`);
        });
    });
    stmt.finalize();
});

db.close();
