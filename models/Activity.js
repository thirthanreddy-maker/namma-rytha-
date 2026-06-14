const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.Mixed },
    userName: { type: String, default: '' },
    action: { type: String, default: '' },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Activity', activitySchema);
