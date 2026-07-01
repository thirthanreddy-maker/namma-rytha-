const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    userName: { type: String, required: true },
    recipientEmail: { type: String, default: '' },
    crop: { type: String, default: '' },
    channels: [{ type: String }], // 'email', 'sms', 'push'
    message: { type: String, required: true },
    type: { type: String, enum: ['manual', 'automated'], default: 'manual' },
    status: { type: String, default: 'Sent' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Notification', notificationSchema);
