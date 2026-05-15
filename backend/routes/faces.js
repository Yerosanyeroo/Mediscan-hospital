const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const encryption = require('../utils/encryption');
const auth = require('../middleware/auth');

// Register face for patient
router.post('/register', auth.verifyFaceToken, async (req, res) => {
  try {
    const { patientId, faceEmbedding } = req.body;
    
    // Validate face embedding size
    if (!faceEmbedding || faceEmbedding.length < 20) {
      return res.status(400).json({ error: 'Invalid face data' });
    }
    
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Hash face embedding for storage
    const embeddingHash = encryption.hashFaceEmbedding(faceEmbedding);
    
    // Check for duplicate face
    const existingPatient = await Patient.findOne({ 
      faceEmbedding: embeddingHash,
      patientId: { $ne: patientId }
    });
    
    if (existingPatient) {
      return res.status(409).json({ 
        error: 'Face already registered to another patient',
        existingPatientId: existingPatient.patientId
      });
    }
    
    patient.faceEmbedding = embeddingHash;
    patient.faceRegistered = true;
    await patient.save();
    
    // Log the registration
    console.log(`✅ Face registered for patient ${patientId}`);
    
    res.json({ 
      message: 'Face registered successfully',
      patientId 
    });
  } catch (error) {
    console.error('Face registration error:', error);
    res.status(500).json({ error: 'Face registration failed' });
  }
});

// Scan and identify face
router.post('/scan', async (req, res) => {
  try {
    const { faceEmbedding } = req.body;
    
    if (!faceEmbedding) {
      return res.status(400).json({ error: 'No face data provided' });
    }
    
    // Hash the incoming face for comparison
    const embeddingHash = encryption.hashFaceEmbedding(faceEmbedding);
    
    // Find matching patient
    const patient = await Patient.findByFaceEmbedding(embeddingHash);
    
    if (patient) {
      // Generate access token
      const faceToken = encryption.generateFaceToken(patient.patientId);
      
      // Log access
      await patient.logAccess('face_scan');
      
      res.json({
        found: true,
        patient: patient.toJSON(),
        faceToken,
        message: `Welcome back, ${patient.toJSON().name}!`
      });
    } else {
      // Generate registration token for new face
      const regToken = encryption.generateFaceToken('new_patient');
      
      res.json({
        found: false,
        regToken,
        message: 'New face detected. Registration required.'
      });
    }
  } catch (error) {
    console.error('Face scan error:', error);
    res.status(500).json({ error: 'Face scan failed' });
  }
});

// Delete face data (GDPR compliance)
router.delete('/:patientId', auth.verifyDoctor, async (req, res) => {
  try {
    const patient = await Patient.findOne({ 
      patientId: req.params.patientId 
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    patient.faceEmbedding = null;
    patient.faceRegistered = false;
    patient.consentGiven = false;
    await patient.save();
    
    // Log deletion
    console.log(`🗑️ Face data deleted for patient ${req.params.patientId}`);
    
    res.json({ 
      message: 'Face data deleted successfully',
      patientId: req.params.patientId 
    });
  } catch (error) {
    res.status(500).json({ error: 'Face data deletion failed' });
  }
});

// Give consent for face data
router.post('/consent', auth.verifyFaceToken, async (req, res) => {
  try {
    const { patientId } = req.body;
    
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    patient.consentGiven = true;
    patient.consentDate = new Date();
    await patient.save();
    
    res.json({ 
      message: 'Consent recorded',
      consentDate: patient.consentDate 
    });
  } catch (error) {
    res.status(500).json({ error: 'Consent recording failed' });
  }
});

module.exports = router;