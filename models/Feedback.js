const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.Mixed },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    message: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Feedback', feedbackSchema);
