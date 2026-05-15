const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Patient = require('../models/Patient');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are MediScan AI, a medical assistant in a secure hospital system.

RULES:
- You can discuss the authenticated patient's OWN medical records
- NEVER provide final diagnoses - always recommend doctor consultation
- If asked about another patient, refuse politely
- Always include: "⚠️ This is AI-assisted analysis, not medical advice."
- Be professional, empathetic, and helpful
- For emergencies, immediately advise calling 911

OUTPUT FORMAT:
📋 ANALYSIS: (summary of findings)
🔍 KEY POINTS: (bullet points)
💡 RECOMMENDATIONS: (numbered actions)
⚠️ DISCLAIMER: This is AI analysis, not medical advice.`;

// Analyze patient with AI
router.post('/analyze', auth.verifyPatientOrDoctor, async (req, res) => {
  try {
    const { patientId, question } = req.body;

    if (!patientId || !question) {
      return res.status(400).json({ error: 'Patient ID and question are required' });
    }

    // Get patient data
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patientData = patient.toJSON();

    // Build context with patient information
    const context = `
PATIENT INFORMATION (Authorized Access):
- Name: ${patientData.name}
- Age: ${patientData.age}
- Blood Type: ${patientData.bloodType}
- Primary Condition: ${patientData.disease}
- Current Symptoms: ${patientData.symptoms}
- Medical History: ${patientData.history}
- Current Medications: ${patientData.medications}
- Status: ${patientData.status}

PATIENT'S QUESTION: ${question}

Please analyze this patient's information and answer their question.`;

    // Call Groq API
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: context }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'AI API request failed');
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Log the AI access
    await patient.logAccess('ai_analysis');

    res.json({
      analysis: aiResponse,
      patientId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Analysis Error:', error);
    res.status(500).json({ 
      error: 'AI analysis failed',
      message: error.message 
    });
  }
});

// Get AI insights for dashboard
router.get('/insights', auth.verifyDoctor, async (req, res) => {
  try {
    const patients = await Patient.find({ status: 'active' }).limit(20);
    const conditions = patients.map(p => p.toJSON().disease).join(', ');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { 
            role: 'system', 
            content: 'Provide 2-3 brief, actionable hospital management insights based on current patient conditions.' 
          },
          { 
            role: 'user', 
            content: `Current patient conditions: ${conditions}. Give management insights.` 
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    const data = await response.json();
    
    res.json({
      insights: data.choices[0].message.content,
      patientCount: patients.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

module.exports = router;