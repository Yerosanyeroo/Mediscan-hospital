const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');

// Validation rules
const patientValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('age').isInt({ min: 0, max: 150 }).withMessage('Invalid age'),
  body('disease').trim().notEmpty().withMessage('Condition is required'),
  body('symptoms').trim().notEmpty().withMessage('Symptoms are required')
];

// GET all patients (Doctor only)
router.get('/', auth.verifyDoctor, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (search) {
      // Note: Searching encrypted fields requires application-level filtering
      // For production, use MongoDB Atlas Search or a separate search index
      query.$or = [
        { patientId: { $regex: search, $options: 'i' } },
        { bloodType: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    
    const patients = await Patient.find(query)
      .sort({ addedDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Patient.countDocuments(query);
    
    // Decrypt names for search filtering
    let results = patients.map(p => p.toJSON());
    if (search) {
      results = results.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.disease.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    res.json({
      patients: results,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single patient (Own record or Doctor)
router.get('/:id', auth.verifyPatientOrDoctor, async (req, res) => {
  try {
    const patient = await Patient.findOne({ patientId: req.params.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Log access
    await patient.logAccess(
      req.user.type === 'doctor' ? 'doctor_code' : 'face_scan',
      req.user.doctorId
    );
    
    res.json(patient.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST new patient
router.post('/', patientValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Generate unique patient ID
    const count = await Patient.countDocuments();
    const patientId = `P${1000 + count + 1}`;
    
    const patient = new Patient({
      patientId,
      ...req.body
    });
    
    await patient.save();
    
    res.status(201).json({
      message: 'Patient registered',
      patient: patient.toJSON()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update patient
router.put('/:id', auth.verifyDoctor, patientValidation, async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { patientId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    res.json({
      message: 'Patient updated',
      patient: patient.toJSON()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE patient (GDPR right to erasure)
router.delete('/:id', auth.verifyDoctor, async (req, res) => {
  try {
    const patient = await Patient.findOneAndDelete({ 
      patientId: req.params.id 
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Log deletion for compliance
    console.log(`🗑️ Patient ${req.params.id} deleted - GDPR compliance`);
    
    res.json({ 
      message: 'Patient and all associated data permanently deleted',
      patientId: req.params.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;