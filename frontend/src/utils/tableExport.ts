import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

async function captureElement(target: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(target, {
    backgroundColor: '#0b1220',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: Math.max(target.scrollWidth, target.clientWidth),
    windowHeight: Math.max(target.scrollHeight, target.clientHeight),
  })
}

export async function exportElementAsPng(target: HTMLElement, fileName: string) {
  const canvas = await captureElement(target)
  const url = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`
  link.click()
}

export async function exportElementAsPdf(target: HTMLElement, fileName: string) {
  const canvas = await captureElement(target)
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const renderWidth = canvas.width * ratio
  const renderHeight = canvas.height * ratio
  const marginX = (pageWidth - renderWidth) / 2
  const marginY = (pageHeight - renderHeight) / 2
  pdf.addImage(img, 'PNG', marginX, marginY, renderWidth, renderHeight)
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}
