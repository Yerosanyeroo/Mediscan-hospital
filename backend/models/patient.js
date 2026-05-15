const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  age: { type: Number, required: true },
  bloodType: { type: String, default: 'Unknown' },
  disease: { type: String, required: true },
  symptoms: { type: String, required: true },
  history: { type: String, default: 'None' },
  medications: { type: String, default: 'None' },
  faceEmbedding: { type: String, default: null },
  faceRegistered: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
  addedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', patientSchema);
