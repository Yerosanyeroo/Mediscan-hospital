const encryption = require('./encryption');

class FaceProcessor {
  /**
   * Process raw face image data into a consistent hash
   * This is the same algorithm used in the frontend
   */
  static generateFaceHash(imageData) {
    const data = imageData.data;
    const hashParts = [];
    const width = imageData.width;

    // Define 9 regions (3x3 grid) for face analysis
    const regions = [
      { x: 0, y: 0, w: 83, h: 100 },
      { x: 83, y: 0, w: 84, h: 100 },
      { x: 167, y: 0, w: 83, h: 100 },
      { x: 0, y: 100, w: 83, h: 100 },
      { x: 83, y: 100, w: 84, h: 100 },
      { x: 167, y: 100, w: 83, h: 100 },
      { x: 0, y: 200, w: 83, h: 100 },
      { x: 83, y: 200, w: 84, h: 100 },
      { x: 167, y: 200, w: 83, h: 100 }
    ];

    regions.forEach(region => {
      let r = 0, g = 0, b = 0, count = 0;

      for (let y = region.y; y < region.y + region.h && y < imageData.height; y++) {
        for (let x = region.x; x < region.x + region.w && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      const avgR = Math.floor(r / count);
      const avgG = Math.floor(g / count);
      const avgB = Math.floor(b / count);

      hashParts.push(
        avgR.toString(16).padStart(2, '0'),
        avgG.toString(16).padStart(2, '0'),
        avgB.toString(16).padStart(2, '0')
      );
    });

    return hashParts.join('');
  }

  /**
   * Calculate similarity between two face hashes
   */
  static calculateSimilarity(hash1, hash2) {
    if (!hash1 || !hash2) return 0;
    if (hash1 === hash2) return 1.0;

    const len = Math.min(hash1.length, hash2.length);
    let totalDifference = 0;

    for (let i = 0; i < len; i++) {
      const val1 = parseInt(hash1[i], 16);
      const val2 = parseInt(hash2[i], 16);
      totalDifference += Math.abs(val1 - val2);
    }

    const maxDifference = 15 * len;
    return Math.max(0, Math.min(1, 1 - (totalDifference / maxDifference)));
  }

  /**
   * Validate face data quality
   */
  static validateFaceData(imageData) {
    const issues = [];

    if (!imageData || !imageData.data) {
      issues.push('No image data provided');
      return { valid: false, issues };
    }

    // Check image dimensions
    if (imageData.width < 200 || imageData.height < 200) {
      issues.push('Image resolution too low');
    }

    // Check for sufficient contrast
    const data = imageData.data;
    let brightnessSum = 0;
    const sampleSize = Math.min(1000, data.length / 4);

    for (let i = 0; i < sampleSize; i++) {
      const idx = i * 4;
      brightnessSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    }

    const avgBrightness = brightnessSum / sampleSize;
    
    if (avgBrightness < 30) {
      issues.push('Image too dark - improve lighting');
    } else if (avgBrightness > 225) {
      issues.push('Image too bright - reduce lighting');
    }

    return {
      valid: issues.length === 0,
      issues,
      quality: {
        brightness: Math.round(avgBrightness),
        resolution: `${imageData.width}x${imageData.height}`
      }
    };
  }
}

module.exports = FaceProcessor;