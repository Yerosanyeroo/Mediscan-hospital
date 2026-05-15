const CryptoJS = require('crypto-js');
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    if (!this.encryptionKey || this.encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
    }
  }

  /**
   * Encrypt sensitive patient data before storing
   */
  encryptField(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', 
      Buffer.from(this.encryptionKey), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt patient data for authorized access
   */
  decryptField(encryptedText) {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', 
      Buffer.from(this.encryptionKey), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Hash face embedding for comparison
   */
  hashFaceEmbedding(embedding) {
    return CryptoJS.SHA256(JSON.stringify(embedding)).toString();
  }

  /**
   * Generate secure token for face data access
   */
  generateFaceToken(patientId) {
    const payload = {
      patientId,
      type: 'face_access',
      timestamp: Date.now(),
      random: crypto.randomBytes(8).toString('hex')
    };
    return CryptoJS.AES.encrypt(
      JSON.stringify(payload), 
      this.encryptionKey
    ).toString();
  }

  /**
   * Verify face token
   */
  verifyFaceToken(token) {
    try {
      const bytes = CryptoJS.AES.decrypt(token, this.encryptionKey);
      const payload = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      
      // Token expires after 30 minutes
      if (Date.now() - payload.timestamp > 30 * 60 * 1000) {
        return null;
      }
      
      return payload;
    } catch {
      return null;
    }
  }
}

module.exports = new EncryptionService();