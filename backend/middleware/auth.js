const jwt = require('jsonwebtoken');
const encryption = require('../utils/encryption');

const auth = {
  // Verify doctor access
  verifyDoctor: (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.type !== 'doctor') {
        return res.status(403).json({ error: 'Doctor access required' });
      }
      
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  },
  
  // Verify face scan token
  verifyFaceToken: (req, res, next) => {
    const faceToken = req.headers['x-face-token'];
    
    if (!faceToken) {
      return res.status(401).json({ error: 'Face authentication required' });
    }
    
    const payload = encryption.verifyFaceToken(faceToken);
    
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired face token' });
    }
    
    req.facePayload = payload;
    next();
  },
  
  // Allow either doctor or patient access
  verifyPatientOrDoctor: (req, res, next) => {
    const authHeader = req.headers.authorization;
    const faceToken = req.headers['x-face-token'];
    
    // Check doctor token
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        return next();
      } catch {}
    }
    
    // Check face token
    if (faceToken) {
      const payload = encryption.verifyFaceToken(faceToken);
      if (payload && payload.patientId === req.params.id) {
        req.user = { type: 'patient', patientId: payload.patientId };
        return next();
      }
    }
    
    res.status(401).json({ error: 'Authentication required' });
  }
};

module.exports = auth;