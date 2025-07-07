import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  pricing: {
    type: Number,
    default: 0
  },
  starterPrice: {
    type: Number,
    default: 0
  },
  proPrice: {
    type: Number,
    default: 0
  },
  businessPrice: {
    type: Number,
    default: 0
  },
  conversionLimit: {
    type: Number,
    default: 10
  },
  // Add more settings fields as needed
}, { timestamps: true });

export const SettingsModel = mongoose.model('Settings', settingsSchema); 