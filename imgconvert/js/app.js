/**
 * app.js — Entry point + all feature logic
 * Features: before/after preview · size delta · drag-to-reorder · clipboard paste
 *           per-file format override · EXIF strip toggle · dark/light mode
 *           live size estimate · improved keyboard a11y · convert button progress text
 */

(() => {
  let files   = [];
  let results = [];

  // ── Element refs ──
  const wsEmpty        = document.getElementById('ws-empty');
  const wsFilled       = document.getElementById('ws-filled');
  const fileInput      = document.getElementById('file-input');
  const fileInputMore  = document.getElementById('file-input-more');
  const convertBtn     = document.getElementById('convert-btn');
  const downloadAllBtn = document.getElementById('download-all');
  const qualitySlider  = document.getElementById('quality-slider');
  const qualityVal     = document.getElementById('quality-val');
  const qualityRow     = document.getElementById('quality-row');
  const bgColorInput   = document.getElementById('bg-color');
  const bgColorHex     = document.getElementById('bg-color-hex');
  const bgRow          = document.getElementById('bg-row');
  const resizeW        = document.getElementById('resize-w');
  const resizeH        = document.getElementById('resize-h');
  const keepAspect     = document.getElementById('keep-aspect');
  const renameInput    = document.getElementById('rename-pattern');
  const fileCountEl    = document.getElementById('ws-file-count');
  const progressBar    = document.getElementById('progress-bar');
  const progressFill   = document.getElementById('progress-fill');
  const progressLabel  = document.getElementById('progress-label');
  const stripExifToggle= document.getElementById('strip-exif');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const estimateBadge  = document.getElementById('estimate-badge');

  let targetFormat = 'png';

  // ══════════════════════════════════════════
  // FEATURE 7 — Dark / Light mode toggle
  // ══════════════════════════════════════════
  const saved = localStorage.getItem('imgconvert-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);

  themeToggleBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('imgconvert-theme', next);
    updateThemeBtn(next);
  });

  function updateThemeBtn(theme) {
    themeToggleBtn.textContent = theme === 'dark' ? '☀' : '☾';
    themeToggleBtn.title = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
  }

  // ══════════════════════════════════════════
  // Format buttons
  // ══════════════════════════════════════════
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      targetFormat = btn.dataset.fmt;
      updateFormatUI();
      resetResults();
    });
  });

  function updateFormatUI() {
    const lossy = ['jpg','webp','avif'].includes(targetFormat);
    qualityRow.classList.toggle('opt-hidden', !lossy);
    const needsBg = ['jpg','bmp','gif','tiff','ico'].includes(targetFormat);
    bgRow.classList.toggle('opt-hidden', !needsBg);
    resizeW.placeholder = targetFormat === 'ico' ? '32' : 'W';
    resizeH.placeholder = targetFormat === 'ico' ? '32' : 'H';
    UI.renderFormatWarning(targetFormat);
    updateEstimate();
  }

  // ══════════════════════════════════════════
  // FEATURE 8 — Live size estimate
  // ══════════════════════════════════════════
  function updateEstimate() {
    if (!estimateBadge) return;
    // Use dimensions from first loaded file if available
    const firstFile = files[0];
    if (!firstFile || !firstFile._naturalW) { estimateBadge.style.display = 'none'; return; }
    const q = parseInt(qualitySlider.value);
    let w = firstFile._naturalW;
    let h = firstFile._naturalH;
    // Apply resize if set
    if (resizeW.value || resizeH.value) {
      const rw = parseInt(resizeW.value) || 0;
      const rh = parseInt(resizeH.value) || 0;
      if (rw) w = rw;
      if (rh) h = rh;
    }
    const est = Converter.estimateSize(w, h, targetFormat, q);
    estimateBadge.textContent = `~${est} / file`;
    estimateBadge.style.display = 'inline-flex';
  }

  qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = qualitySlider.value + '%';
    updateEstimate();
  });

  bgColorInput.addEventListener('input', () => {
    bgColorHex.textContent = bgColorInput.value.toUpperCase();
  });

  resizeW.addEventListener('input', updateEstimate);
  resizeH.addEventListener('input', updateEstimate);

  // Preload natural dimensions for estimate
  function preloadDimensions(file) {
    if (file._naturalW) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); file._naturalW = img.naturalWidth; file._naturalH = img.naturalHeight; updateEstimate(); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  // ══════════════════════════════════════════
  // Workspace state
  // ══════════════════════════════════════════
  function setWorkspaceState(state) {
    wsEmpty.style.display  = state === 'filled' ? 'none'  : 'block';
    wsFilled.style.display = state === 'filled' ? 'flex'  : 'none';
  }

  // ── Drop zone (empty state) ──
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop',      e => { e.preventDefault(); dropZone.classList.remove('dragover'); addFiles(Array.from(e.dataTransfer.files)); });

  // Drop on filled panel
  wsFilled.addEventListener('dragover', e => e.preventDefault());
  wsFilled.addEventListener('drop',     e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); });

  // Keyboard a11y for drop zone
  dropZone.setAttribute('tabindex', '0');
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('aria-label', 'Klik atau tekan Enter untuk memilih gambar');
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

  fileInput.addEventListener('change',     () => { addFiles(Array.from(fileInput.files));     fileInput.value = ''; });
  fileInputMore.addEventListener('change', () => { addFiles(Array.from(fileInputMore.files)); fileInputMore.value = ''; });

  // ══════════════════════════════════════════
  // FEATURE 4 — Paste from clipboard (Ctrl+V)
  // ══════════════════════════════════════════
  document.addEventListener('paste', e => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const pastedFiles = imageItems.map((item, i) => {
      const blob = item.getAsFile();
      // Give pasted files a meaningful name
      const ext  = item.type.split('/')[1] || 'png';
      return new File([blob], `clipboard-${Date.now()}-${i}.${ext}`, { type: item.type });
    });
    addFiles(pastedFiles);
    UI.showAlert('upload-alert', 'success', 'Gambar dari clipboard ditambahkan', `${pastedFiles.length} gambar dari Ctrl+V berhasil dimuat.`);
    setTimeout(() => UI.hideAlert('upload-alert'), 3000);
  });

  // ── Add files ──
  function addFiles(newFiles) {
    let rejected = 0;
    newFiles.forEach(f => {
      if (files.some(x => x.name === f.name && x.size === f.size)) return;
      const v = Converter.validate(f);
      if (!v.ok) { rejected++; return; }
      files.push(f);
      preloadDimensions(f);
    });
    if (rejected > 0) {
      UI.showAlert('upload-alert', 'danger', `${rejected} file ditolak`, `File melebihi ${Converter.MAX_MB}MB atau bukan format gambar.`);
      setTimeout(() => UI.hideAlert('upload-alert'), 5000);
    }
    resetResults();
    if (files.length > 0) { setWorkspaceState('filled'); render(); }
  }

  function removeFile(idx) {
    if (idx === -1) {
      files.forEach(f => { if (f._thumbUrl) URL.revokeObjectURL(f._thumbUrl); });
      files = []; results = [];
    } else {
      if (files[idx]._thumbUrl) URL.revokeObjectURL(files[idx]._thumbUrl);
      files.splice(idx, 1); results.splice(idx, 1);
    }
    resetResults();
    if (files.length === 0) setWorkspaceState('empty');
    else render();
  }

  function resetResults() {
    results = [];
    downloadAllBtn.style.display = 'none';
    updateEstimate();
  }

  // ══════════════════════════════════════════
  // FEATURE 3 — Drag-to-reorder file list
  // ══════════════════════════════════════════
  let dragSrcIdx = null;

  function makeDraggable(item, idx) {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragSrcIdx = null; });
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragSrcIdx === null || dragSrcIdx === idx) return;
      // Reorder arrays
      const [movedFile] = files.splice(dragSrcIdx, 1);
      files.splice(idx, 0, movedFile);
      const [movedResult] = results.splice(dragSrcIdx, 1);
      results.splice(idx, 0, movedResult);
      render();
    });
  }

  // ══════════════════════════════════════════
  // Render file list
  // ══════════════════════════════════════════
  function render() {
    const doneCount  = results.filter(r => r && r.blob).length;
    const errorCount = results.filter(r => r && r.error).length;
    if (fileCountEl) {
      fileCountEl.textContent = `${files.length} file`
        + (doneCount  ? ` · ${doneCount} selesai`  : '')
        + (errorCount ? ` · ${errorCount} gagal`   : '');
    }
    renderFileItems();
  }

  function renderFileItems() {
    const container = document.getElementById('file-list');
    if (!container) return;
    container.innerHTML = '';

    files.forEach((file, i) => {
      const res = results[i];
      if (!file._thumbUrl) file._thumbUrl = URL.createObjectURL(file);
      if (res && res.blob && !res.url) res.url = URL.createObjectURL(res.blob);

      const item = document.createElement('div');
      item.className = 'file-item';

      // FEATURE 2 — Size delta badge
      let sizeDeltaHTML = '';
      if (res && res.blob) {
        const diff = res.newSize - res.originalSize;
        const pct  = Math.abs(Math.round((diff / res.originalSize) * 100));
        if (diff < 0) sizeDeltaHTML = `<span class="size-delta shrink">↓ ${pct}%</span>`;
        else if (pct > 0) sizeDeltaHTML = `<span class="size-delta grow">↑ ${pct}%</span>`;
        else sizeDeltaHTML = `<span class="size-delta neutral">= sama</span>`;
      }

      let statusHTML = `<span class="status-pill">menunggu</span>`;
      let actionHTML = '';

      if (res === 'converting') {
        statusHTML = `<span class="status-pill converting">⏳</span>`;
      } else if (res && res.error) {
        statusHTML = `<span class="status-pill error" title="${res.error}">✗ gagal</span>`;
      } else if (res && res.blob) {
        statusHTML = `<span class="status-pill done">✓ ${res.width}×${res.height}</span>`;
        actionHTML = `
          <button class="preview-btn" data-idx="${i}" title="Lihat perbandingan" aria-label="Preview before/after">⊙</button>
          <a class="dl-btn" href="${res.url}" download="${res.filename}">Unduh</a>`;
      }

      // FEATURE 5 — Per-file format override dropdown
      const allFmts = Object.keys(Converter.FORMAT_MAP);
      const currentFmt = file._formatOverride || targetFormat;
      const fmtOptions = allFmts.map(f =>
        `<option value="${f}" ${f === currentFmt ? 'selected' : ''}>${f.toUpperCase()}</option>`
      ).join('');

      const sizeWarnHtml = (!res && file.size > Converter.WARN_BYTES)
        ? `<div class="size-warn">⚠ File besar, mungkin lambat</div>` : '';

      item.innerHTML = `
        <div class="file-drag-handle" title="Seret untuk urut ulang">⠿</div>
        <img class="file-thumb" src="${file._thumbUrl}" alt="" />
        <div class="file-info">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-meta">
            ${Converter.formatBytes(file.size)}
            ${res && res.blob ? `→ ${Converter.formatBytes(res.newSize)} ${sizeDeltaHTML}` : ''}
          </div>
          ${res && res.error ? `<div class="size-warn error-text">${res.error}</div>` : ''}
          ${sizeWarnHtml}
        </div>
        <div class="file-actions">
          <select class="fmt-override" title="Format untuk file ini" aria-label="Format override">
            ${fmtOptions}
          </select>
          ${statusHTML}
          ${actionHTML}
          <button class="file-remove" title="Hapus" aria-label="Hapus file">×</button>
        </div>
      `;

      // FEATURE 5 — per-file override listener
      item.querySelector('.fmt-override').addEventListener('change', e => {
        const chosen = e.target.value;
        file._formatOverride = (chosen === targetFormat) ? null : chosen;
        // Don't re-render the whole list, just let it persist
      });

      // FEATURE 1 — Before/after preview trigger
      if (res && res.blob) {
        item.querySelector('.preview-btn')?.addEventListener('click', () => openPreviewModal(i));
      }

      item.querySelector('.file-remove').addEventListener('click', () => removeFile(i));

      // FEATURE 3 — Drag-to-reorder
      makeDraggable(item, i);

      container.appendChild(item);
    });

    const clearBtn = document.getElementById('clear-all-btn');
    if (clearBtn) clearBtn.onclick = () => removeFile(-1);

    const anyDone = results.some(r => r && r.blob);
    downloadAllBtn.style.display = (anyDone && files.length > 1) ? 'block' : 'none';
  }

  // ══════════════════════════════════════════
  // FEATURE 1 — Before / After preview modal
  // ══════════════════════════════════════════
  function openPreviewModal(idx) {
    const file = files[idx];
    const res  = results[idx];
    if (!res || !res.blob) return;

    const modal = document.getElementById('preview-modal');
    const origImg = document.getElementById('preview-orig');
    const convImg = document.getElementById('preview-conv');
    const origMeta = document.getElementById('preview-orig-meta');
    const convMeta = document.getElementById('preview-conv-meta');
    const slider   = document.getElementById('preview-slider');

    if (!file._thumbUrl) file._thumbUrl = URL.createObjectURL(file);
    if (!res.url) res.url = URL.createObjectURL(res.blob);

    origImg.src = file._thumbUrl;
    convImg.src = res.url;

    origMeta.textContent = `Original · ${Converter.formatBytes(file.size)}${res.origW ? ` · ${res.origW}×${res.origH}` : ''}`;
    convMeta.textContent = `${targetFormat.toUpperCase()} · ${Converter.formatBytes(res.newSize)} · ${res.width}×${res.height}`;

    // Reset slider to 50%
    slider.value = 50;
    applySlider(50);

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));

    // Trap focus in modal
    modal.querySelector('.modal-close').focus();
  }

  function applySlider(val) {
    const pct = val + '%';
    const leftPanel = document.getElementById('preview-left');
    const divider   = document.getElementById('preview-divider');
    if (leftPanel) leftPanel.style.width = pct;
    if (divider)   divider.style.left    = pct;
  }

  document.getElementById('preview-slider')?.addEventListener('input', e => applySlider(e.target.value));

  document.getElementById('modal-close-btn')?.addEventListener('click', closePreviewModal);
  document.getElementById('preview-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePreviewModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreviewModal();
  });

  function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }

  // ══════════════════════════════════════════
  // Convert
  // ══════════════════════════════════════════
  convertBtn.addEventListener('click', async () => {
    if (!files.length) return;
    convertBtn.disabled = true;
    downloadAllBtn.style.display = 'none';
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    if (progressLabel) progressLabel.textContent = `0 / ${files.length}`;
    results = new Array(files.length).fill('converting');
    render();

    const opts = {
      format:    targetFormat,
      quality:   parseInt(qualitySlider.value),
      bg:        bgColorInput.value,
      stripExif: stripExifToggle ? stripExifToggle.checked : true,
      resize:    (resizeW.value || resizeH.value) ? {
        width: parseInt(resizeW.value) || 0,
        height: parseInt(resizeH.value) || 0,
        keepAspect: keepAspect.checked,
      } : null,
      newName: renameInput.value.trim() || null,
    };
    if (targetFormat === 'ico' && !opts.resize) opts.resize = { width: 32, height: 32, keepAspect: true };

    results = await Converter.convertAll(files, opts, (done, total) => {
      progressFill.style.width = Math.round((done / total) * 100) + '%';
      if (progressLabel) progressLabel.textContent = `${done} / ${total}`;
      render();
    });

    results.forEach(r => { if (r && r.blob && !r.url) r.url = URL.createObjectURL(r.blob); });

    const doneCount = results.filter(r => r && r.blob).length;
    convertBtn.textContent = `Konversi Semua`;
    convertBtn.disabled = false;
    setTimeout(() => { progressBar.style.display = 'none'; }, 700);
    render();
  });

  // ── Download ZIP ──
  downloadAllBtn.addEventListener('click', async () => {
    if (typeof JSZip === 'undefined') { alert('JSZip belum siap.'); return; }
    const zip = new JSZip();
    results.forEach(r => { if (r && r.blob) zip.file(r.filename, r.blob); });
    downloadAllBtn.textContent = 'Mempersiapkan ZIP...';
    downloadAllBtn.disabled = true;
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'imgconvert-hasil.zip';
    a.click();
    downloadAllBtn.textContent = '⬇ Unduh ZIP';
    downloadAllBtn.disabled = false;
  });

  // ── Init ──
  updateFormatUI();
  setWorkspaceState('empty');
})();