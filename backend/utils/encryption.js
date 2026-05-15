const CryptoJS = require('crypto-js');

class EncryptionService {
  hashFaceEmbedding(embedding) {
    return CryptoJS.SHA256(JSON.stringify(embedding)).toString();
  }
}

module.exports = new EncryptionService();
