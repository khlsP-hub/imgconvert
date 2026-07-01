/**
 * app.js — Entry point + all feature logic
 * Features: before/after preview · size delta · drag-to-reorder · clipboard paste
 *           per-file format override · EXIF strip toggle · dark/light mode
 *           live size estimate · improved keyboard a11y · convert button progress text
 */

(() => {
  let files      = [];
  let results    = [];
  let docOutputs = [];   // outputs from document conversions (PDF/HTML/merged)

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
    const isDocOut = targetFormat === 'pdf' || targetFormat === 'html';
    // Quality applies to lossy image output, and to PDF (embedded JPEG) for pdf output.
    const lossy = ['jpg','webp','avif'].includes(targetFormat) || targetFormat === 'pdf';
    qualityRow.classList.toggle('opt-hidden', !lossy);
    // BG / resize / EXIF only make sense for image output.
    const needsBg = ['jpg','bmp','gif','tiff','ico'].includes(targetFormat);
    bgRow.classList.toggle('opt-hidden', !needsBg);
    const resizeRow = resizeW.closest('.opt-row');
    const keepAspectRow = keepAspect.closest('.opt-row');
    const exifRow = stripExifToggle ? stripExifToggle.closest('.opt-row') : null;
    if (resizeRow)     resizeRow.classList.toggle('opt-hidden', isDocOut);
    if (keepAspectRow) keepAspectRow.classList.toggle('opt-hidden', isDocOut);
    if (exifRow)       exifRow.classList.toggle('opt-hidden', isDocOut);
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
    if (targetFormat === 'pdf' || targetFormat === 'html') { estimateBadge.style.display = 'none'; return; }
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
    if (typeof DocConverter !== 'undefined' && DocConverter.detectKind(file) !== 'image') return;
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
      UI.showAlert('upload-alert', 'danger', `${rejected} file ditolak`, `File melebihi ${Converter.MAX_MB}MB atau bukan gambar/PDF/HTML.`);
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
    hideDocResults();
    updateEstimate();
  }

  function hideDocResults() {
    docOutputs.forEach(o => { if (o.url) URL.revokeObjectURL(o.url); });
    docOutputs = [];
    const card = document.getElementById('doc-results');
    if (card) card.style.display = 'none';
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
      const kind = (typeof DocConverter !== 'undefined') ? DocConverter.detectKind(file) : 'image';
      if (kind === 'image' && !file._thumbUrl) file._thumbUrl = URL.createObjectURL(file);
      if (res && res.blob && !res.url) res.url = URL.createObjectURL(res.blob);

      const thumbHTML = kind === 'image'
        ? `<img class="file-thumb" src="${file._thumbUrl}" alt="" />`
        : `<div class="file-thumb thumb-doc">${kind === 'pdf' ? 'PDF' : kind === 'html' ? 'HTML' : '?'}</div>`;

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

      // FEATURE 5 — Per-file format override dropdown (image files only)
      const allFmts = Object.keys(Converter.FORMAT_MAP);
      const currentFmt = file._formatOverride || targetFormat;
      const fmtOptions = allFmts.map(f =>
        `<option value="${f}" ${f === currentFmt ? 'selected' : ''}>${f.toUpperCase()}</option>`
      ).join('');
      const overrideHTML = kind === 'image'
        ? `<select class="fmt-override" title="Format untuk file ini" aria-label="Format override">${fmtOptions}</select>`
        : '';

      const sizeWarnHtml = (!res && file.size > Converter.WARN_BYTES)
        ? `<div class="size-warn">⚠ File besar, mungkin lambat</div>` : '';

      item.innerHTML = `
        <div class="file-drag-handle" title="Seret untuk urut ulang">⠿</div>
        ${thumbHTML}
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
          ${overrideHTML}
          ${statusHTML}
          ${actionHTML}
          <button class="file-remove" title="Hapus" aria-label="Hapus file">×</button>
        </div>
      `;

      // FEATURE 5 — per-file override listener (only present for image files)
      item.querySelector('.fmt-override')?.addEventListener('change', e => {
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

    // Route to the document pipeline if the output is PDF/HTML, or any input is PDF/HTML.
    const kinds = (typeof DocConverter !== 'undefined') ? files.map(f => DocConverter.detectKind(f)) : [];
    const involvesDoc = targetFormat === 'pdf' || targetFormat === 'html'
      || kinds.some(k => k === 'pdf' || k === 'html');
    if (involvesDoc) { await runDocJob(); return; }

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
    autoDownloadAll(results.filter(r => r && r.blob));

    const doneCount = results.filter(r => r && r.blob).length;
    convertBtn.textContent = `Konversi Semua`;
    convertBtn.disabled = false;
    setTimeout(() => { progressBar.style.display = 'none'; }, 700);
    render();
  });

  // ══════════════════════════════════════════
  // Auto-download hasil konversi (tombol Unduh manual = cadangan)
  // ══════════════════════════════════════════
  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Unduh setiap output otomatis. 1 file → langsung; banyak file → berjeda
  // agar tidak di-drop browser (Chrome minta izin "unduh banyak file" sekali).
  function autoDownloadAll(items) {
    const list = (items || []).filter(it => it && it.url && it.filename);
    list.forEach((it, i) => setTimeout(() => triggerDownload(it.url, it.filename), i * 350));
  }

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

  // ══════════════════════════════════════════
  // Document conversion pipeline (HTML↔PDF · PDF→Image · Image→PDF)
  // ══════════════════════════════════════════
  async function runDocJob() {
    if (typeof DocConverter === 'undefined') { UI.showAlert('upload-alert', 'danger', 'Modul belum siap', 'Library konversi dokumen belum termuat.'); return; }

    convertBtn.disabled = true;
    convertBtn.textContent = 'Mengonversi…';
    downloadAllBtn.style.display = 'none';
    hideDocResults();
    results = new Array(files.length).fill(null);
    render();
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    if (progressLabel) progressLabel.textContent = `0 / ${files.length}`;

    const opts = {
      quality: parseInt(qualitySlider.value),
      bg:      bgColorInput.value,
      resize:  (resizeW.value || resizeH.value) ? {
        width: parseInt(resizeW.value) || 0,
        height: parseInt(resizeH.value) || 0,
        keepAspect: keepAspect.checked,
      } : null,
      newName: renameInput.value.trim() || null,
    };

    let out;
    try {
      out = await DocConverter.run(files, targetFormat, opts, (done, total) => {
        progressFill.style.width = Math.round((done / total) * 100) + '%';
        if (progressLabel) progressLabel.textContent = `${done} / ${total}`;
      });
    } catch (err) {
      UI.showAlert('upload-alert', 'danger', 'Konversi gagal', err.message || String(err));
      convertBtn.disabled = false;
      convertBtn.textContent = 'Konversi Semua';
      progressBar.style.display = 'none';
      return;
    }

    docOutputs = out.outputs || [];
    renderDocResults(docOutputs, out.notes || []);
    autoDownloadAll(docOutputs);

    convertBtn.disabled = false;
    convertBtn.textContent = 'Konversi Semua';
    setTimeout(() => { progressBar.style.display = 'none'; }, 700);
  }

  function renderDocResults(outputs, notes) {
    const card     = document.getElementById('doc-results');
    const list     = document.getElementById('doc-results-list');
    const notesBox = document.getElementById('doc-results-notes');
    const emptyMsg = document.getElementById('doc-results-empty');
    const zipBtn   = document.getElementById('doc-zip-btn');
    if (!card || !list) return;

    list.innerHTML = '';
    outputs.forEach(o => {
      o.url = URL.createObjectURL(o.blob);
      const row = document.createElement('div');
      row.className = 'doc-result-row';
      const dims = o.width ? ` · ${o.width}×${o.height}` : '';
      const src  = o.sourceLabel ? `${o.sourceLabel} · ` : '';
      row.innerHTML = `
        <div class="doc-result-info">
          <div class="doc-result-name" title="${o.filename}">${o.filename}</div>
          <div class="doc-result-meta">${src}${Converter.formatBytes(o.blob.size)}${dims}</div>
        </div>
        <a class="dl-btn" href="${o.url}" download="${o.filename}">Unduh</a>`;
      list.appendChild(row);
    });

    if (notesBox) {
      notesBox.innerHTML = (notes && notes.length)
        ? notes.map(n => `<div class="doc-note">⚠ ${n}</div>`).join('')
        : '';
    }
    if (emptyMsg) emptyMsg.style.display = outputs.length ? 'none' : 'block';
    if (zipBtn)   zipBtn.style.display   = outputs.length > 1 ? 'inline-flex' : 'none';

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('doc-zip-btn')?.addEventListener('click', async () => {
    if (typeof JSZip === 'undefined' || !docOutputs.length) return;
    const btn = document.getElementById('doc-zip-btn');
    const zip = new JSZip();
    docOutputs.forEach(o => zip.file(o.filename, o.blob));
    btn.textContent = 'Mempersiapkan ZIP…';
    btn.disabled = true;
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'imgconvert-dokumen.zip';
    a.click();
    btn.textContent = '⬇ Unduh Semua (ZIP)';
    btn.disabled = false;
  });

  // ── Init ──
  updateFormatUI();
  setWorkspaceState('empty');
})();