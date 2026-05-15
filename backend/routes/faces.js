const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const encryption = require('../utils/encryption');

router.post('/scan', async (req, res) => {
  try {
    const { faceEmbedding } = req.body;
    const hash = encryption.hashFaceEmbedding(faceEmbedding);
    
    const patients = await Patient.find({ faceRegistered: true });
    let bestMatch = null, bestScore = 0;
    
    for (const p of patients) {
      if (p.faceEmbedding) {
        const score = calculateSimilarity(hash, p.faceEmbedding);
        if (score > bestScore) { bestScore = score; bestMatch = p; }
      }
    }
    
    if (bestMatch && bestScore > 0.7) {
      res.json({ found: true, patient: bestMatch });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { patientId, faceEmbedding } = req.body;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    
    patient.faceEmbedding = encryption.hashFaceEmbedding(faceEmbedding);
    patient.faceRegistered = true;
    await patient.save();
    res.json({ message: 'Face registered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateSimilarity(a, b) {
  if (!a || !b) return 0;
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) diff += Math.abs(parseInt(a[i],16) - parseInt(b[i],16));
  return Math.max(0, 1 - (diff / (15 * len)));
}

module.exports = router;
