import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function elementToPdf(el, filename) {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const w = 210, page = 297, h = (canvas.height * w) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(img, "JPEG", 0, 0, w, h);
  for (let left = h - page, y = -page; left > 0; left -= page, y -= page) { pdf.addPage(); pdf.addImage(img, "JPEG", 0, y, w, h); }
  pdf.save(filename);
}

export function printElement(el, title) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<html><head><title>${title}</title>${document.head.innerHTML}<style>@page{size:A4;margin:10mm}body{background:#fff!important}</style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
  return true;
}
