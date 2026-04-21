const QRCode = require('qrcode');

const generateQRBuffer = async (url) => {
  try {
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 250,
      margin: 2,
      color: {
        dark: '#3B1F8C',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    });
    return buffer;
  } catch (error) {
    console.error('[QR] Error generando QR:', error.message);
    throw new Error('Error al generar código QR');
  }
};

const generateQRDataURL = async (url) => {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 250,
      margin: 2,
      color: {
        dark: '#3B1F8C',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    });
    return dataUrl;
  } catch (error) {
    console.error('[QR] Error generando QR DataURL:', error.message);
    throw new Error('Error al generar código QR');
  }
};

module.exports = { generateQRBuffer, generateQRDataURL };
