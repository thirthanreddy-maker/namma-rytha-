const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: '' },
    price: { type: Number, default: 0 },
    description: { type: String, default: '' },
    image: { type: String, default: '📦' },
    brand: { type: String, default: 'Generic' },
    rating: { type: Number, default: 4.5 },
    suitable_crop: { type: String, default: 'all' },
    suitable_soil: { type: String, default: 'all' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
