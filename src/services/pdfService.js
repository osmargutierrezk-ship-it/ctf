const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');
const { generateQRBuffer } = require('./qrService');

const PURPLE = '#860063';
const ORANGE = '#F97316';
const LIGHT_GRAY = '#F3F4F6';
const DARK_GRAY = '#374151';
const MED_GRAY = '#6B7280';

const formatDate = (date) => {
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'America/Guatemala',
  }).format(new Date(date));
};

const generateSolicitudPDF = async (solicitud, appBaseUrl) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        info: {
          Title: `CTF - Solicitud ${solicitud.id_unico}`,
          Author: 'Sistema CTF',
          Subject: 'Control de Traslado de Facturas',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 120;

      // ── HEADER ─────────────────────────────────────────────────────────
      doc.rect(60, 50, pageWidth, 90).fill(PURPLE);

      // Logo real desde assets/logo.png
      const logoPath = path.join(__dirname, '../../public/assets/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 72, 60, { fit: [68, 68], align: 'center', valign: 'center' });
      } else {
        doc.rect(75, 62, 65, 65).fill('white').fillOpacity(0.15);
        doc.fillOpacity(1);
      }

      doc.fontSize(26).fillColor('white').font('Helvetica-Bold')
        .text('CTF', 155, 65);
      doc.fontSize(10).fillColor('white').font('Helvetica')
        .text('Control de Traslado de Facturas', 155, 95);
      doc.fontSize(8).fillColor('#C4B5FD')
        .text('Documento Oficial - Generado automáticamente por el sistema', 155, 112);

      // ── STATUS BADGE ───────────────────────────────────────────────────
      const badgeColor = solicitud.estado === 'RECIBIDO' ? '#10B981' : ORANGE;
      doc.rect(60 + pageWidth - 100, 62, 90, 28).fill(badgeColor);
      doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
        .text(solicitud.estado, 60 + pageWidth - 100, 70, { width: 90, align: 'center' });

      // ── FOLIO / ID ─────────────────────────────────────────────────────
      doc.moveDown(5);
      doc.rect(60, 148, pageWidth, 30).fill(LIGHT_GRAY);
      doc.fontSize(9).fillColor(MED_GRAY).font('Helvetica')
        .text('N° DE SOLICITUD:', 70, 158);
      doc.fontSize(9).fillColor(PURPLE).font('Helvetica-Bold')
        .text(solicitud.id_unico.toUpperCase(), 180, 158);

      // ── INFO SECTION ───────────────────────────────────────────────────
      let y = 196;

      const drawInfoRow = (label, value, yPos) => {
        doc.fontSize(8).fillColor(MED_GRAY).font('Helvetica').text(label, 60, yPos);
        doc.fontSize(9).fillColor(DARK_GRAY).font('Helvetica-Bold').text(value, 200, yPos);
        doc.moveTo(60, yPos + 14).lineTo(60 + pageWidth, yPos + 14).lineWidth(0.3).stroke('#E5E7EB');
      };

      drawInfoRow('ENVIADO POR:', solicitud.usuario_nombre || 'N/A', y);
      y += 22;
      drawInfoRow('ROL:', 'CONTADOR', y);
      y += 22;
      drawInfoRow('FECHA Y HORA DE ENVÍO:', formatDate(solicitud.fecha_creacion), y);
      y += 22;

      if (solicitud.estado === 'RECIBIDO' && solicitud.fecha_recepcion) {
        drawInfoRow('FECHA Y HORA DE RECEPCIÓN:', formatDate(solicitud.fecha_recepcion), y);
        y += 22;
      }

      // ── DOCUMENTS SECTION ──────────────────────────────────────────────
      y += 12;
      doc.rect(60, y, pageWidth, 28).fill(PURPLE);
      doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
        .text('DOCUMENTOS TRASLADADOS', 70, y + 9);
      y += 28;

      const documentos = Array.isArray(solicitud.documentos)
        ? solicitud.documentos
        : JSON.parse(solicitud.documentos);

      doc.rect(60, y, pageWidth, 22).fill('#EDE9FE');
      doc.fontSize(8).fillColor(PURPLE).font('Helvetica-Bold')
        .text('#', 70, y + 7)
        .text('NÚMERO DE DOCUMENTO', 100, y + 7);
      y += 22;

      documentos.forEach((doc_num, index) => {
        const rowBg = index % 2 === 0 ? 'white' : LIGHT_GRAY;
        doc.rect(60, y, pageWidth, 20).fill(rowBg);
        doc.fontSize(9).fillColor(DARK_GRAY).font('Helvetica')
          .text(String(index + 1).padStart(2, '0'), 70, y + 6)
          .text(String(doc_num).trim(), 100, y + 6);
        y += 20;
      });

      // Total row
      doc.rect(60, y, pageWidth, 24).fill('#EDE9FE');
      doc.fontSize(9).fillColor(PURPLE).font('Helvetica-Bold')
        .text(`TOTAL DE DOCUMENTOS: ${documentos.length}`, 70, y + 7);
      y += 24;

      // ── QR + FIRMAS ────────────────────────────────────────────────────
      y += 20;
      const qrUrl = `${appBaseUrl}/scan/${solicitud.id_unico}`;
      const qrBuffer = await generateQRBuffer(qrUrl);

      // QR box
      const qrBoxX = 60 + pageWidth / 2 - 80;
      doc.rect(qrBoxX - 10, y, 180, 180).fill(LIGHT_GRAY);
      doc.rect(qrBoxX - 5, y + 5, 170, 170).fill('white');
      doc.image(qrBuffer, qrBoxX + 10, y + 15, { width: 140, height: 140 });

      doc.fontSize(7).fillColor(MED_GRAY).font('Helvetica')
        .text('Escanear para confirmar recepción', qrBoxX - 10, y + 160, { width: 180, align: 'center' });

      y += 190;

      // ── SIGNATURE AREA ─────────────────────────────────────────────────
      y += 15;
      const colWidth = (pageWidth - 20) / 2;

      const drawSignatureBox = (label, xPos) => {
        doc.rect(xPos, y, colWidth, 63).stroke('#D1D5DB').lineWidth(0.5);
        doc.moveTo(xPos + 15, y + 50).lineTo(xPos + colWidth - 15, y + 50)
          .lineWidth(0.5).stroke(PURPLE);
        doc.fontSize(7).fillColor(MED_GRAY).font('Helvetica')
          .text(label, xPos, y + 54, { width: colWidth, align: 'center' });
      };

      drawSignatureBox('FIRMA Y SELLO - CONTADOR', 60);
      drawSignatureBox('FIRMA Y SELLO - TESORERÍA', 60 + colWidth + 20);

      // ── FOOTER ─────────────────────────────────────────────────────────
      const footerY = doc.page.height - 77;
      doc.rect(60, footerY, pageWidth, 1).fill('#E5E7EB');
      doc.fontSize(7).fillColor(MED_GRAY).font('Helvetica')
        .text(
          `CTF - Sistema de Control de Traslado de Facturas | Generado: ${formatDate(new Date())}`,
          60,
          footerY + 8,
          { width: pageWidth, align: 'center' }
        );
      doc.fontSize(7).fillColor(MED_GRAY)
        .text(`ID: ${solicitud.id_unico}`, 60, footerY + 20, { width: pageWidth, align: 'center' });

      doc.end();
    } catch (error) {
      console.error('[PDF] Error generando PDF:', error.message);
      reject(error);
    }
  });
};

module.exports = { generateSolicitudPDF };
