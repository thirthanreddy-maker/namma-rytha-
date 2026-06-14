const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    password: { type: String, default: '' },
    google_id: { type: String, default: '' },
    avatar: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);
