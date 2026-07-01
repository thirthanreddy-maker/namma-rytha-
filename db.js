'use strict';

/**
 * db.js – Centralised MongoDB connection for Namma Rytha
 *
 * Usage:
 *   const { connectDB, isDbConnected } = require('./db');
 *   await connectDB();
 *
 * Environment variables (set in .env for local dev, or via your host's
 * secrets manager for production):
 *
 *   MONGO_URI  – full MongoDB connection string
 *                Local example : mongodb://127.0.0.1:27017/nammarytha
 *                Atlas example : mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/nammarytha?retryWrites=true&w=majority
 */

const mongoose = require('mongoose');

// ── Connection string ──────────────────────────────────────────────────────
const MONGO_URI =
    process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nammarytha';

// ── Mongoose global settings ───────────────────────────────────────────────
mongoose.set('bufferCommands', false); // Don't queue ops when disconnected

// ── Connection options ─────────────────────────────────────────────────────
const CONNECTION_OPTIONS = {
    serverSelectionTimeoutMS: 5000,  // Give up connecting after 5 s
    socketTimeoutMS: 45000,          // Close idle sockets after 45 s
    maxPoolSize: 10,                 // Max concurrent connections in the pool
    minPoolSize: 2,                  // Keep at least 2 connections warm
    retryWrites: true,
    w: 'majority',
};

// ── Retry settings ─────────────────────────────────────────────────────────
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // 3 seconds between retries

// ── Internal state ─────────────────────────────────────────────────────────
let _retryCount = 0;
let _isConnecting = false;

/**
 * Returns true when Mongoose has an active connection to MongoDB.
 */
function isDbConnected() {
    return mongoose.connection.readyState === 1;
}

/**
 * Attempt to connect to MongoDB.
 * Retries up to MAX_RETRIES times on failure before giving up.
 *
 * @returns {Promise<void>}
 */
async function connectDB() {
    if (_isConnecting) return;
    _isConnecting = true;

    while (_retryCount <= MAX_RETRIES) {
        try {
            await mongoose.connect(MONGO_URI, CONNECTION_OPTIONS);
            _retryCount = 0;
            _isConnecting = false;
            return;
        } catch (err) {
            _retryCount++;
            console.error(
                `❌ MongoDB connection failed (attempt ${_retryCount}/${MAX_RETRIES}): ${err.message}`
            );

            if (_retryCount > MAX_RETRIES) {
                console.warn(
                    '⚠️  All MongoDB connection attempts exhausted. ' +
                    'Server will start in offline/fallback mode.'
                );
                _isConnecting = false;
                return; // Don't crash – let the server serve what it can
            }

            console.log(`🔄  Retrying in ${RETRY_DELAY_MS / 1000}s…`);
            await _sleep(RETRY_DELAY_MS);
        }
    }
}

// ── Connection event listeners ─────────────────────────────────────────────
mongoose.connection.on('connected', () => {
    console.log(`✅  MongoDB connected → ${_sanitiseUri(MONGO_URI)}`);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔁  MongoDB reconnected.');
});

mongoose.connection.on('error', (err) => {
    console.error('❌  MongoDB error:', err.message);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function _gracefulClose(signal) {
    console.log(`\n🛑  ${signal} received – closing MongoDB connection…`);
    await mongoose.connection.close();
    console.log('✅  MongoDB connection closed. Exiting.');
    process.exit(0);
}

process.on('SIGINT',  () => _gracefulClose('SIGINT'));
process.on('SIGTERM', () => _gracefulClose('SIGTERM'));

// ── Helpers ────────────────────────────────────────────────────────────────

/** Redact passwords from the URI before logging it. */
function _sanitiseUri(uri) {
    try {
        const u = new URL(uri);
        if (u.password) u.password = '****';
        return u.toString();
    } catch {
        return uri.replace(/:([^@/]+)@/, ':****@');
    }
}

function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = { connectDB, isDbConnected };
