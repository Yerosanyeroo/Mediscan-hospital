const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.post('/doctor/login', async (req, res) => {
  try {
    const { accessCode } = req.body;
    
    if (accessCode !== process.env.DOCTOR_ACCESS_CODE) {
      return res.status(401).json({ error: 'Invalid access code' });
    }
    
    const token = jwt.sign(
      { type: 'doctor', role: 'medical_staff' },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '2h' }
    );
    
    res.json({ token, type: 'Bearer', expiresIn: '2 hours' });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
