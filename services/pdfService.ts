
// @ts-ignore
const { PDFDocument, degrees } = window.PDFLib;

export interface PageInfo {
  url: string;
  width: number;
  height: number;
}

/**
 * Converts a data URL image to grayscale (Black and White).
 */
async function convertToGrayscale(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Standard grayscale weights: 0.3R + 0.59G + 0.11B
        const avg = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
        data[i] = avg;     // R
        data[i + 1] = avg; // G
        data[i + 2] = avg; // B
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Renders the last page of a PDF as a data URL image.
 */
export async function getPdfPageAsImage(pdfBytes: ArrayBuffer): Promise<PageInfo> {
  // @ts-ignore
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pdf.numPages);
  
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error("Could not create canvas context");
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };
  
  await page.render(renderContext).promise;
  
  return {
    url: canvas.toDataURL(),
    width: viewport.width,
    height: viewport.height
  };
}

/**
 * Embeds images into the last page of a PDF.
 */
export async function embedSignaturesInPdf(
  existingPdfBytes: ArrayBuffer, 
  signatures: { url: string; x: number; y: number; width: number; height: number; rotation: number }[],
  uiEditorWidth: number,
  uiEditorHeight: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width: pdfWidth, height: pdfHeight } = lastPage.getSize();

  const scale = pdfWidth / uiEditorWidth;

  for (const sig of signatures) {
    // Convert asset to grayscale for Black and White output
    const grayscaleUrl = await convertToGrayscale(sig.url);
    const imageBytes = await fetch(grayscaleUrl).then(res => res.arrayBuffer());
    let image;
    
    // Always use PNG embedding for transparency support
    image = await pdfDoc.embedPng(imageBytes);

    const finalWidth = sig.width * scale;
    const finalHeight = sig.height * scale;
    const finalX = sig.x * scale;
    const finalY = pdfHeight - (sig.y * scale) - finalHeight;

    lastPage.drawImage(image, {
      x: finalX,
      y: finalY,
      width: finalWidth,
      height: finalHeight,
      rotate: degrees(sig.rotation),
    });
  }

  return await pdfDoc.save();
}
