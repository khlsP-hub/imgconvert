/**
 * converter.js — Core image conversion engine
 * Canvas API only, 100% browser-side.
 */

const Converter = (() => {

  const FORMAT_MAP = {
    png:  { mime: 'image/png',  lossy: false },
    jpg:  { mime: 'image/jpeg', lossy: true  },
    webp: { mime: 'image/webp', lossy: true  },
    gif:  { mime: 'image/png',  lossy: false, note: 'gif-static' },
    bmp:  { mime: 'image/bmp',  lossy: false },
    avif: { mime: 'image/avif', lossy: true  },
    tiff: { mime: 'image/png',  lossy: false, note: 'tiff-remap' },
    ico:  { mime: 'image/png',  lossy: false, note: 'ico-png'    },
  };

  const MAX_MB     = 50;
  const WARN_MB    = 20;
  const MAX_BYTES  = MAX_MB * 1024 * 1024;
  const WARN_BYTES = WARN_MB * 1024 * 1024;

  function validate(file) {
    if (file.size > MAX_BYTES)
      return { ok: false, error: `File terlalu besar (maks. ${MAX_MB}MB). Ukuran: ${formatBytes(file.size)}.` };
    if (!file.type.startsWith('image/') && !isKnownImageExtension(file.name) && !isDocumentFile(file))
      return { ok: false, error: 'Format file tidak dikenali (gambar, PDF, atau HTML).' };
    return { ok: true, warn: file.size > WARN_BYTES ? `File besar (${formatBytes(file.size)}), proses mungkin lambat.` : null };
  }

  function isKnownImageExtension(name) {
    return /\.(png|jpg|jpeg|webp|gif|bmp|avif|tiff?|ico|svg|heic|heif|jfif)$/i.test(name);
  }

  /** PDF / HTML documents — handled by docconvert.js, allowed past validation. */
  function isDocumentFile(file) {
    const n = (file.name || '');
    const t = (file.type || '');
    return t === 'application/pdf' || t === 'text/html' || /\.(pdf|html?|htm)$/i.test(n);
  }

  /** Rough pre-conversion size estimate for quality preview badge */
  function estimateSize(naturalW, naturalH, format, quality) {
    const pixels = naturalW * naturalH;
    let bpp;
    if (format === 'png' || format === 'tiff') bpp = 3.5;
    else if (format === 'bmp')  bpp = 3;
    else {
      const q = Math.max(1, Math.min(100, quality)) / 100;
      if (format === 'avif')      bpp = 0.3 * q;
      else if (format === 'webp') bpp = 0.8 * q;
      else                        bpp = 1.2 * q; // jpg
    }
    return formatBytes(Math.round(pixels * bpp));
  }

  function convert(file, opts = {}) {
    return new Promise((resolve, reject) => {
      const { format = 'png', quality = 92, resize = null, bg = '#ffffff', newName = null } = opts;
      const fmtInfo = FORMAT_MAP[format] || FORMAT_MAP['png'];
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let outW = img.naturalWidth;
        let outH = img.naturalHeight;

        if (resize && (resize.width || resize.height)) {
          const targetW = parseInt(resize.width)  || 0;
          const targetH = parseInt(resize.height) || 0;
          if (resize.keepAspect) {
            const aspect = img.naturalWidth / img.naturalHeight;
            if (targetW && targetH) {
              if (targetW / targetH > aspect) { outH = targetH; outW = Math.round(targetH * aspect); }
              else                             { outW = targetW; outH = Math.round(targetW / aspect); }
            } else if (targetW) { outW = targetW; outH = Math.round(targetW / aspect); }
            else                { outH = targetH; outW = Math.round(targetH * aspect); }
          } else {
            if (targetW) outW = targetW;
            if (targetH) outH = targetH;
          }
        }

        const MAX_DIM = 8000;
        if (outW > MAX_DIM || outH > MAX_DIM) {
          const scale = Math.min(MAX_DIM / outW, MAX_DIM / outH);
          outW = Math.round(outW * scale);
          outH = Math.round(outH * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        const needsBg = ['jpg','bmp','gif','tiff','ico'].includes(format);
        if (needsBg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, outW, outH); }
        ctx.drawImage(img, 0, 0, outW, outH);

        const q = fmtInfo.lossy ? (Math.max(1, Math.min(100, quality)) / 100) : undefined;

        canvas.toBlob(blob => {
          if (!blob) { reject(new Error(`Browser tidak mendukung output format ${format}.`)); return; }
          const baseName = file.name.replace(/\.[^.]+$/, '');
          const outputName = newName && newName.trim()
            ? newName.replace('{name}', baseName).trim() + '.' + format
            : baseName + '.' + format;

          resolve({
            blob,
            filename:     sanitizeFilename(outputName),
            originalSize: file.size,
            newSize:      blob.size,
            width:        outW,
            height:       outH,
            origW:        img.naturalWidth,
            origH:        img.naturalHeight,
          });
        }, fmtInfo.mime, q);
      };

      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Gambar tidak dapat dimuat.')); };
      img.src = objectUrl;
    });
  }

  async function convertAll(files, opts, onProgress) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const v = validate(file);
      if (!v.ok) {
        results.push({ file, error: v.error });
      } else {
        try {
          const fileOpts = { ...opts };
          if (file._formatOverride) fileOpts.format = file._formatOverride;
          if (opts.newName) fileOpts.newName = opts.newName.replace('{n}', String(i + 1).padStart(2, '0'));
          const result = await convert(file, fileOpts);
          result.file = file;
          result.warn = v.warn;
          results.push(result);
        } catch (err) {
          results.push({ file, error: err.message });
        }
      }
      if (onProgress) onProgress(i + 1, files.length);
    }
    return results;
  }

  function formatBytes(b) {
    if (b < 1024)    return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  }

  return { validate, convert, convertAll, formatBytes, estimateSize, MAX_MB, WARN_MB, MAX_BYTES, WARN_BYTES, FORMAT_MAP };
})();