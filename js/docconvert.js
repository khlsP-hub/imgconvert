/**
 * docconvert.js — Document conversion engine (100% browser-side)
 *
 * Supports:
 *   • HTML  → PDF    (jsPDF + html2canvas)
 *   • Gambar → PDF   (jsPDF, banyak gambar digabung jadi 1 PDF multi-halaman)
 *   • PDF   → Gambar (pdf.js, tiap halaman → PNG/JPG/WEBP)
 *   • PDF   → HTML   (pdf.js, ekstraksi teks berposisi — pendekatan, bukan 1:1)
 *
 * Tidak ada upload ke server. Library di-load via CDN di index.html:
 *   window.jspdf (jsPDF UMD) · window.html2canvas · window.pdfjsLib
 */

const DocConverter = (() => {

  const PDFJS_WORKER =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // ── Helpers ────────────────────────────────────────────────
  function detectKind(file) {
    const n = (file.name || '').toLowerCase();
    const t = (file.type || '').toLowerCase();
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (t === 'text/html' || n.endsWith('.html') || n.endsWith('.htm')) return 'html';
    if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|ico|svg|jfif)$/i.test(n)) return 'image';
    return 'other';
  }

  function baseName(file) { return (file.name || 'file').replace(/\.[^.]+$/, ''); }
  function sanitize(name) { return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); }

  /** Replicate the app's rename semantics: {name} & {n} (2-digit). */
  function applyName(pattern, file, index) {
    if (!pattern || !pattern.trim()) return baseName(file);
    return pattern
      .replace('{name}', baseName(file))
      .replace('{n}', String((index || 0) + 1).padStart(2, '0'))
      .trim();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readAsText(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
    });
  }
  function readAsArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file);
    });
  }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Gambar tidak dapat dimuat.'));
      img.src = url;
    });
  }

  /** Normalize any image file to a JPEG dataURL on white background. */
  async function imageToJpegDataUrl(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 1;
      c.height = img.naturalHeight || 1;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      return { dataUrl: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function getJsPDF() {
    const ns = window.jspdf || window.jsPDF;
    const ctor = ns && (ns.jsPDF || ns);
    if (!ctor) throw new Error('Library jsPDF belum termuat.');
    return ctor;
  }

  function getPdfjs() {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('Library pdf.js belum termuat.');
    if (!lib._workerConfigured) {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      lib._workerConfigured = true;
    }
    return lib;
  }

  // ── 1. Gambar → PDF (gabung) ───────────────────────────────
  async function imagesToPdf(files, outName) {
    const JsPDF = getJsPDF();
    const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 24;
    let first = true;

    for (const file of files) {
      const { dataUrl, w, h } = await imageToJpegDataUrl(file);
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const s = Math.min(maxW / w, maxH / h);
      const drawW = w * s;
      const drawH = h * s;
      if (!first) pdf.addPage();
      first = false;
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;
      pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH);
    }

    const blob = pdf.output('blob');
    return { blob, filename: sanitize(outName) + '.pdf' };
  }

  // ── 2. HTML → PDF ──────────────────────────────────────────
  async function htmlToPdf(file, outName) {
    if (!window.html2canvas) throw new Error('Library html2canvas belum termuat.');
    const html = await readAsText(file);
    const A4_PX = 794; // ~ A4 width @ 96dpi

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText =
      'position:fixed;left:-99999px;top:0;width:' + A4_PX + 'px;height:1123px;border:0;background:#fff;';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(html);
      doc.close();
      await waitForIframe(iframe);

      const body = doc.body || doc.documentElement;
      const canvas = await window.html2canvas(body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: A4_PX,
        windowWidth: A4_PX,
      });

      const JsPDF = getJsPDF();
      const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = canvas.height * (pageW / canvas.width);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Multi-page via negative-offset slicing.
      let heightLeft = imgH;
      let posY = 0;
      pdf.addImage(dataUrl, 'JPEG', 0, posY, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        posY -= pageH;
        pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, posY, imgW, imgH);
        heightLeft -= pageH;
      }

      const blob = pdf.output('blob');
      return { blob, filename: sanitize(outName) + '.pdf' };
    } finally {
      iframe.remove();
    }
  }

  function waitForIframe(iframe) {
    return new Promise(resolve => {
      const finish = () => setTimeout(resolve, 200);
      try {
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') return finish();
      } catch (e) { /* ignore */ }
      iframe.onload = finish;
      setTimeout(resolve, 3000); // hard cap
    });
  }

  // ── 3. PDF → Gambar ────────────────────────────────────────
  async function pdfToImages(file, opts) {
    const pdfjs = getPdfjs();
    const data = await readAsArrayBuffer(file);
    const pdfDoc = await pdfjs.getDocument({ data }).promise;

    const fmt = opts.format === 'jpg' ? 'image/jpeg'
      : opts.format === 'webp' ? 'image/webp'
      : 'image/png';
    const ext = opts.format === 'jpg' ? 'jpg' : opts.format === 'webp' ? 'webp' : 'png';
    const q = fmt === 'image/png' ? undefined
      : Math.max(1, Math.min(100, opts.quality || 92)) / 100;
    const scale = opts.scale || 2;

    const outputs = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (fmt !== 'image/png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, fmt, q));
      outputs.push({
        blob,
        filename: sanitize(`${opts.outName}-hal${String(p).padStart(2, '0')}.${ext}`),
        width: canvas.width,
        height: canvas.height,
      });
      if (opts.onPage) opts.onPage(p, pdfDoc.numPages);
    }
    return outputs;
  }

  // ── 4. PDF → HTML (ekstraksi teks berposisi) ───────────────
  async function pdfToHtml(file, outName) {
    const pdfjs = getPdfjs();
    const data = await readAsArrayBuffer(file);
    const pdfDoc = await pdfjs.getDocument({ data }).promise;

    let pages = '';
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let spans = '';
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        const x = tx[4];
        const y = tx[5];
        const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
        spans +=
          `<span style="position:absolute;left:${x.toFixed(1)}px;` +
          `top:${(y - fontHeight).toFixed(1)}px;font-size:${fontHeight.toFixed(1)}px;` +
          `white-space:pre;">${escapeHtml(item.str)}</span>`;
      }
      pages +=
        `<div class="pdf-page" style="position:relative;` +
        `width:${viewport.width.toFixed(0)}px;height:${viewport.height.toFixed(0)}px;` +
        `margin:0 auto 24px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);overflow:hidden;">` +
        `${spans}</div>`;
    }

    const html =
      `<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="UTF-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
      `<title>${escapeHtml(baseName(file))}</title>\n` +
      `<style>body{margin:0;padding:24px;background:#525659;font-family:Arial,Helvetica,sans-serif;color:#000;}` +
      `.pdf-page span{line-height:1;}</style>\n</head>\n<body>\n${pages}</body>\n</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    return { blob, filename: sanitize(outName) + '.html' };
  }

  // ── Orchestrator ───────────────────────────────────────────
  /**
   * Routes a batch of files to the right conversion based on input kind
   * and chosen output format. Returns { outputs:[{blob,filename,...}], notes:[] }.
   */
  async function run(files, outFormat, opts, onProgress) {
    const outputs = [];
    const notes = [];
    const kinds = files.map(detectKind);
    const total = files.length;
    let done = 0;
    const tick = () => { done++; if (onProgress) onProgress(done, total); };

    if (outFormat === 'pdf') {
      // gambar → 1 PDF gabungan ; html → masing-masing PDF ; pdf → dilewati
      const imgFiles = files.filter((f, i) => kinds[i] === 'image');
      const htmlFiles = files.filter((f, i) => kinds[i] === 'html');
      files.forEach((f, i) => { if (kinds[i] === 'pdf') notes.push(`${f.name}: sudah berformat PDF, dilewati.`); });
      files.forEach((f, i) => { if (kinds[i] === 'other') notes.push(`${f.name}: tipe tidak didukung untuk → PDF.`); });

      if (imgFiles.length) {
        try {
          const name = applyName(opts.newName, { name: 'gambar' }, 0) || 'gambar';
          const out = await imagesToPdf(imgFiles, name);
          out.sourceLabel = `${imgFiles.length} gambar → 1 PDF`;
          outputs.push(out);
        } catch (e) { notes.push(`Gabung gambar ke PDF gagal: ${e.message}`); }
        imgFiles.forEach(tick);
      }
      for (let i = 0; i < htmlFiles.length; i++) {
        const f = htmlFiles[i];
        try {
          const out = await htmlToPdf(f, applyName(opts.newName, f, i));
          out.sourceLabel = f.name;
          outputs.push(out);
        } catch (e) { notes.push(`${f.name}: ${e.message}`); }
        tick();
      }

    } else if (outFormat === 'html') {
      // pdf → html ; lainnya dilewati
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (kinds[i] === 'pdf') {
          try {
            const out = await pdfToHtml(f, applyName(opts.newName, f, i));
            out.sourceLabel = f.name;
            outputs.push(out);
          } catch (e) { notes.push(`${f.name}: ${e.message}`); }
        } else if (kinds[i] === 'html') {
          notes.push(`${f.name}: sudah berformat HTML, dilewati.`);
        } else {
          notes.push(`${f.name}: hanya PDF yang bisa dikonversi ke HTML.`);
        }
        tick();
      }

    } else {
      // output gambar: pdf → gambar per halaman ; gambar → konversi biasa
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (kinds[i] === 'pdf') {
          try {
            const imgs = await pdfToImages(f, {
              format: outFormat,
              quality: opts.quality,
              outName: applyName(opts.newName, f, i),
            });
            imgs.forEach(o => { o.sourceLabel = `${f.name}`; outputs.push(o); });
          } catch (e) { notes.push(`${f.name}: ${e.message}`); }
        } else if (kinds[i] === 'image') {
          try {
            const r = await Converter.convert(f, {
              format: outFormat,
              quality: opts.quality,
              resize: opts.resize,
              bg: opts.bg,
              newName: opts.newName ? opts.newName.replace('{n}', String(i + 1).padStart(2, '0')) : null,
            });
            outputs.push({ blob: r.blob, filename: r.filename, width: r.width, height: r.height, sourceLabel: f.name });
          } catch (e) { notes.push(`${f.name}: ${e.message}`); }
        } else if (kinds[i] === 'html') {
          notes.push(`${f.name}: HTML → gambar belum didukung. Pilih output PDF.`);
        } else {
          notes.push(`${f.name}: tipe file tidak didukung.`);
        }
        tick();
      }
    }

    return { outputs, notes };
  }

  return { detectKind, run, imagesToPdf, htmlToPdf, pdfToImages, pdfToHtml };
})();
