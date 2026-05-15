const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');

router.post('/analyze', async (req, res) => {
  try {
    const { patientId, question } = req.body;
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are MediScan AI. Analyze patient data and answer questions. Always include: "This is AI-assisted analysis, not medical advice."' },
          { role: 'user', content: `Patient: ${patient.name}, Age: ${patient.age}, Condition: ${patient.disease}, Symptoms: ${patient.symptoms}\nQuestion: ${question}` }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    const data = await response.json();
    res.json({ analysis: data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
