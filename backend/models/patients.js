const mongoose = require('mongoose');
const encryption = require('../utils/encryption');

const patientSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    set: function(value) {
      // Encrypt name for privacy
      this._nameEncrypted = true;
      return encryption.encryptField(value);
    }
  },
  age: {
    type: Number,
    required: true,
    min: 0,
    max: 150
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
    default: 'Unknown'
  },
  disease: {
    type: String,
    required: true,
    set: function(value) {
      this._diseaseEncrypted = true;
      return encryption.encryptField(value);
    }
  },
  symptoms: {
    type: String,
    required: true,
    set: function(value) {
      this._symptomsEncrypted = true;
      return encryption.encryptField(value);
    }
  },
  history: {
    type: String,
    default: 'None',
    set: function(value) {
      this._historyEncrypted = true;
      return encryption.encryptField(value);
    }
  },
  medications: {
    type: String,
    default: 'None',
    set: function(value) {
      this._medicationsEncrypted = true;
      return encryption.encryptField(value);
    }
  },
  faceEmbedding: {
    type: String,
    default: null,
    index: true
  },
  faceRegistered: {
    type: Boolean,
    default: false
  },
  consentGiven: {
    type: Boolean,
    default: false
  },
  consentDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'critical', 'stable', 'discharged'],
    default: 'active'
  },
  addedDate: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: null
  },
  accessLog: [{
    timestamp: { type: Date, default: Date.now },
    method: String, // 'face_scan' or 'doctor_code'
    doctorId: String
  }]
}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      // Decrypt fields for authorized access
      if (ret.name) ret.name = encryption.decryptField(ret.name);
      if (ret.disease) ret.disease = encryption.decryptField(ret.disease);
      if (ret.symptoms) ret.symptoms = encryption.decryptField(ret.symptoms);
      if (ret.history) ret.history = encryption.decryptField(ret.history);
      if (ret.medications) ret.medications = encryption.decryptField(ret.medications);
      
      // Remove sensitive fields
      delete ret.faceEmbedding;
      delete ret.__v;
      return ret;
    }
  }
});

// Index for face matching queries
patientSchema.index({ faceRegistered: 1, status: 1 });

// Method to log access
patientSchema.methods.logAccess = function(method, doctorId = null) {
  this.accessLog.push({
    timestamp: new Date(),
    method,
    doctorId
  });
  this.lastAccessed = new Date();
  return this.save();
};

// Static method for face matching
patientSchema.statics.findByFaceEmbedding = async function(embeddingHash, threshold = 0.7) {
  // In production, use MongoDB Atlas Search or pgvector for similarity search
  const patients = await this.find({ 
    faceRegistered: true,
    faceEmbedding: { $ne: null }
  });
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const patient of patients) {
    const score = calculateSimilarity(embeddingHash, patient.faceEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = patient;
    }
  }
  
  return bestScore >= threshold ? bestMatch : null;
};

function calculateSimilarity(hash1, hash2) {
  if (!hash1 || !hash2) return 0;
  if (hash1 === hash2) return 1.0;
  
  const len = Math.min(hash1.length, hash2.length);
  let totalDiff = 0;
  
  for (let i = 0; i < len; i++) {
    totalDiff += Math.abs(
      parseInt(hash1[i], 16) - parseInt(hash2[i], 16)
    );
  }
  
  return Math.max(0, 1 - (totalDiff / (15 * len)));
}

module.exports = mongoose.model('Patient', patientSchema);