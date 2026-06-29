import { toCanvas } from "html-to-image";

export async function downloadInvoicePdf(element: HTMLElement, filename: string) {
  const { jsPDF } = await import("jspdf");

  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        })
    )
  );

  const canvas = await toCanvas(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    skipFonts: true,
    filter: (node) => {
      if (node instanceof HTMLElement && node.classList.contains("no-print")) {
        return false;
      }
      return true;
    },
  });

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error("Canvas vide");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  let imgWidth = pageWidth;
  let imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (imgHeight > pageHeight) {
    const scale = pageHeight / imgHeight;
    imgWidth = pageWidth * scale;
    imgHeight = pageHeight;
  }

  const xOffset = (pageWidth - imgWidth) / 2;
  pdf.addImage(imgData, "JPEG", xOffset, 0, imgWidth, imgHeight);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
