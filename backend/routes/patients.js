const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');

router.get('/', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ addedDate: -1 });
    res.json({ patients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const count = await Patient.countDocuments();
    const patient = new Patient({
      patientId: `P${1000 + count + 1}`,
      ...req.body
    });
    await patient.save();
    res.status(201).json(patient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Patient.findOneAndDelete({ patientId: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
