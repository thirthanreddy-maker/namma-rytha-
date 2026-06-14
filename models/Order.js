const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.Mixed },
    userName: { type: String, default: '' },
    items: { type: String, default: '' },
    total: { type: Number, default: 0 },
    status: { type: String, default: 'pending' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Order', orderSchema);
