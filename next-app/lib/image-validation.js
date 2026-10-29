// Content-based image validation.
// The upload endpoints used to trust the client-supplied `mime` string, so a
// file could be labelled image/png while containing anything. We now inspect
// the actual leading bytes (magic numbers) and only accept real JPEG/PNG/WEBP.

const SIGNATURES = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: "png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // WEBP
  },
];

/**
 * Detect the real image type from the buffer contents.
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}
