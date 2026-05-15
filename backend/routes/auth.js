const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Doctor authentication
router.post('/doctor/login', async (req, res) => {
  try {
    const { accessCode } = req.body;

    if (!accessCode) {
      return res.status(400).json({ error: 'Access code required' });
    }

    // Verify against stored code
    if (accessCode !== process.env.DOCTOR_ACCESS_CODE) {
      return res.status(401).json({ error: 'Invalid access code' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        type: 'doctor',
        role: 'medical_staff',
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      type: 'Bearer',
      expiresIn: '2 hours',
      message: 'Doctor authenticated successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Verify token validity
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ 
      valid: true, 
      type: decoded.type,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// Logout (client-side token removal)
router.post('/doctor/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;