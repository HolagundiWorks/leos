import QRCode from 'qrcode';

// Generate a QR code as a base64 PNG data URL. Used for verification QRs on
// certificates and letters (offline-friendly: encodes a human-readable
// verification payload that a scanner shows as text).
export async function makeQr(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}
