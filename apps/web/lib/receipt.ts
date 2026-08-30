import jsPDF from 'jspdf';

export interface ReceiptItem {
  productName: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  storeName: string;
  storeLogoUrl?: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  items: ReceiptItem[];
  // Shown as a line item between the products and the Neto/IVA breakdown —
  // amount and iva/neto below are already post-discount.
  discount?: { label: string; amount: number };
  neto: number;
  iva: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // CORS or network failure — the receipt still generates without a logo.
    return null;
  }
}

function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'WEBP' | 'JPEG' {
  const ext = /^data:image\/(\w+);/.exec(dataUrl)?.[1]?.toLowerCase();
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WEBP';
  return 'JPEG';
}

// Builds the receipt PDF — shared by generateReceiptPdf (download) and
// generateReceiptPdfBase64 (emailing, via the sendReceiptEmail Cloud
// Function) so the two never drift into different layouts.
async function buildReceiptDoc(data: ReceiptData): Promise<jsPDF> {
  const width = 80;
  const lineHeight = 5;
  const baseHeight = 65;
  const contactLines = [data.storeAddress, data.storePhone, data.storeEmail].filter(Boolean).length;
  const height = baseHeight + data.items.length * lineHeight + (data.storeLogoUrl ? 22 : 0)
    + (data.discount && data.discount.amount > 0 ? lineHeight : 0) + contactLines * 4 + 5;

  const doc = new jsPDF({ unit: 'mm', format: [width, height] });
  const margin = 4;
  const centerX = width / 2;
  let y = 8;

  if (data.storeLogoUrl) {
    const logoDataUrl = await fetchImageAsDataUrl(data.storeLogoUrl);
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, imageFormatFromDataUrl(logoDataUrl), centerX - 10, y, 20, 20);
        y += 23;
      } catch {
        // Corrupt/unsupported image data — skip the logo, receipt still generates.
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(data.storeName, centerX, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('REGISTRO DE VENTA', centerX, y, { align: 'center' });
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (data.storeAddress) { doc.text(data.storeAddress, centerX, y, { align: 'center' }); y += 3.5; }
  if (data.storePhone) { doc.text(data.storePhone, centerX, y, { align: 'center' }); y += 3.5; }
  if (data.storeEmail) { doc.text(data.storeEmail, centerX, y, { align: 'center' }); y += 3.5; }
  y += 1.5;

  doc.setFontSize(8);
  doc.text(new Date(data.createdAt).toLocaleString('es-CL'), centerX, y, { align: 'center' });
  y += 4;
  doc.text(`Medio de pago: ${PAYMENT_LABEL[data.paymentMethod] || data.paymentMethod}`, centerX, y, { align: 'center' });
  y += 5;

  doc.setDrawColor(180);
  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFontSize(8);
  data.items.forEach((item) => {
    const label = `${item.quantity}x ${item.productName}`;
    doc.text(label.length > 28 ? label.slice(0, 27) + '…' : label, margin, y);
    doc.text(`$${(item.price * item.quantity).toLocaleString('es-CL')}`, width - margin, y, { align: 'right' });
    y += lineHeight;
  });

  y += 1;
  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFontSize(8);
  if (data.discount && data.discount.amount > 0) {
    doc.text(data.discount.label, margin, y);
    doc.text(`-$${Math.round(data.discount.amount).toLocaleString('es-CL')}`, width - margin, y, { align: 'right' });
    y += lineHeight;
  }
  doc.text('Neto', margin, y);
  doc.text(`$${Math.round(data.neto).toLocaleString('es-CL')}`, width - margin, y, { align: 'right' });
  y += 4;
  doc.text('IVA (19%)', margin, y);
  doc.text(`$${Math.round(data.iva).toLocaleString('es-CL')}`, width - margin, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', margin, y);
  doc.text(`$${data.total.toLocaleString('es-CL')}`, width - margin, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Gracias por su compra — JunglApp', centerX, y, { align: 'center' });

  return doc;
}

// Generates and downloads a receipt sized for an 80mm thermal-printer roll.
// The store prints the resulting PDF through their printer's normal print
// dialog — this is plain PDF generation, not ESC/POS printer integration.
export async function generateReceiptPdf(data: ReceiptData): Promise<void> {
  const doc = await buildReceiptDoc(data);
  doc.save(`boleta-${new Date(data.createdAt).getTime()}.pdf`);
}

// Same receipt, returned as a plain base64 string (no data: URI prefix) for
// the sendReceiptEmail callable's `attachments[].content`.
export async function generateReceiptPdfBase64(data: ReceiptData): Promise<string> {
  const doc = await buildReceiptDoc(data);
  // jsPDF's types only expose the data-URI form ("data:application/pdf;base64,...")
  // — strip the prefix to get the plain base64 the Resend attachment API wants.
  return doc.output('datauristring').split(',')[1];
}
