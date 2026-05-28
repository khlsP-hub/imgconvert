/**
 * ui.js — DOM render helpers, alerts, format warnings.
 * All file-list rendering is done in app.js (single source of truth).
 */

const UI = (() => {

  const FORMAT_WARNINGS = {
    gif: {
      level: 'warn',
      title: 'GIF: Animasi tidak didukung',
      body: 'Gambar animasi GIF akan dikonversi menjadi gambar diam (frame pertama saja).',
    },
    tiff: {
      level: 'warn',
      title: 'TIFF: Kompatibilitas terbatas',
      body: 'Output TIFF menggunakan encoding PNG. Beberapa software mungkin tidak membacanya sebagai TIFF standar.',
    },
    ico: {
      level: 'warn',
      title: 'ICO: Output adalah PNG 32×32',
      body: 'File .ico berisi satu gambar PNG 32×32. Untuk multi-resolusi gunakan software seperti GIMP.',
    },
    avif: {
      level: 'info',
      title: 'AVIF: Butuh browser modern',
      body: 'Hanya Chrome 85+, Edge 85+, Firefox 93+. Jika gagal, coba WEBP.',
    },
  };

  function renderFormatWarning(fmt) {
    const el = document.getElementById('format-warning');
    if (!el) return;
    const info = FORMAT_WARNINGS[fmt];
    if (!info) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    el.innerHTML = buildAlert(info.level, info.title, info.body);
  }

  function buildAlert(level, title, body) {
    const icons = { info: 'ℹ️', warn: '⚠️', danger: '🚫', success: '✓' };
    return `
      <div class="alert ${level}">
        <span class="alert-icon">${icons[level] || 'ℹ️'}</span>
        <div class="alert-text"><strong>${title}</strong>${body}</div>
      </div>`;
  }

  function showAlert(containerId, level, title, body) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = buildAlert(level, title, body);
    el.style.display = 'block';
  }

  function hideAlert(containerId) {
    const el = document.getElementById(containerId);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  function setProgress(current, total) {
    const bar  = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    const label= document.getElementById('progress-label');
    if (!bar || !fill) return;
    if (total === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    fill.style.width = Math.round((current / total) * 100) + '%';
    if (label) label.textContent = `${current} / ${total}`;
    if (current >= total) setTimeout(() => { bar.style.display = 'none'; }, 700);
  }

  return { renderFormatWarning, buildAlert, showAlert, hideAlert, setProgress };
})();