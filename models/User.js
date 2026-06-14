const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    area: { type: String, default: '' },
    crop: { type: String, default: '' },
    password: { type: String, default: '' },
    google_id: { type: String, default: '' },
    avatar: { type: String, default: '' },
    sustainability_score: { type: Number, default: 70 }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
