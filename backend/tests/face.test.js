const FaceProcessor = require('../utils/faceProcessor');

describe('Face Processor', () => {
  test('should generate consistent hash from same data', () => {
    const mockImageData = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(128),
      width: 640,
      height: 480
    };

    const hash1 = FaceProcessor.generateFaceHash(mockImageData);
    const hash2 = FaceProcessor.generateFaceHash(mockImageData);

    expect(hash1).toBe(hash2);
  });

  test('should detect different faces', () => {
    const face1 = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(100),
      width: 640,
      height: 480
    };

    const face2 = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(200),
      width: 640,
      height: 480
    };

    const hash1 = FaceProcessor.generateFaceHash(face1);
    const hash2 = FaceProcessor.generateFaceHash(face2);

    const similarity = FaceProcessor.calculateSimilarity(hash1, hash2);
    expect(similarity).toBeLessThan(0.9);
  });

  test('should validate face quality', () => {
    const darkImage = {
      data: new Uint8ClampedArray(640 * 480 * 4).fill(10),
      width: 640,
      height: 480
    };

    const result = FaceProcessor.validateFaceData(darkImage);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Image too dark - improve lighting');
  });
});