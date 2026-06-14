const mongoose = require('mongoose');

const farmDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    moisture: { type: Number, default: 0 },
    rainProbability: { type: Number, default: 0 },
    lastIrrigated: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('FarmData', farmDataSchema);
