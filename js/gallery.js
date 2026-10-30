// Tab "Galerij": 3 tot 8 foto's samen in één afbeelding (1 of 2 rijen van 3 of
// 4 foto's), elke foto liggend 3:2. Bedoeld voor e-mail, met één link voor de
// hele galerij. Alles gebeurt lokaal in de browser.
(() => {
  const MAX_SLOTS = 8;
  const TILE_RATIO = 2 / 3; // hoogte / breedte
  const JPG_QUALITY = 0.85;
  const STRIP_WIDTH = 150;
  const ACCENT = '#e11d48';

  const { saveBlob, canvasToBlob, formatBytes, sanitizeName, coverRect, extension } = window.Beeld;
  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel-gallery');
  const dropzone = $('#gallery-dropzone');
  const fileInput = $('#gallery-files');
  const stage = $('#gallery-canvas');
  const zoomSlider = $('#gallery-zoom');
  const strip = $('#gallery-list');
  const statusEl = $('#gallery-status');
  const downloadButton = $('#gallery-download');

  // slots: vaste plekken 0–7; een lege plek is null. Zo schuiven foto's niet op
  // als je er één verwijdert. item: { name, url, img, zoom, fx, fy, thumb }
  const state = { slots: Array(MAX_SLOTS).fill(null), selected: 0, target: null, dragFrom: null, drag: null, sizeTimer: null };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const selected = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const transparent = () => selected('gallery-bg') === 'transparent' && Number(selected('gallery-gap')) > 0;
  const outputType = () => (transparent() ? 'image/png' : selected('gallery-type'));

  // Berekent de vakken. Restpixels gaan naar de eerste kolommen, zodat de totale
  // breedte precies klopt; elke foto wordt in zijn eigen vak bijgesneden.
  function layout() {
    const [rows, cols] = selected('gallery-layout').split('x').map(Number);
    const width = Number(selected('gallery-width'));
    const gap = Number(selected('gallery-gap'));
    const inner = width - (cols - 1) * gap;
    const base = Math.floor(inner / cols);
    const extra = inner - base * cols;
    const tileH = Math.round(base * TILE_RATIO);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      let x = 0;
      for (let c = 0; c < cols; c++) {
        const w = base + (c < extra ? 1 : 0);
        cells.push({ x, y: r * (tileH + gap), w, h: tileH });
        x += w + gap;
      }
    }
    return { width, height: rows * tileH + (rows - 1) * gap, cells, tileW: base, tileH };
  }

  function background() {
    if (Number(selected('gallery-gap')) === 0) return '#ffffff';
    const bg = selected('gallery-bg');
    if (bg === 'transparent') return null;
    return bg === 'custom' ? $('#gallery-color').value : '#ffffff';
  }

  function cropOf(item, cell) {
    return coverRect(item.img.naturalWidth, item.img.naturalHeight, cell.w, cell.h, item.zoom, item.fx, item.fy);
  }

  // preview: lege vakken en de selectie tonen; bij exporteren niet.
  function render(canvas, preview) {
    const L = layout();
    if (canvas.width !== L.width) canvas.width = L.width;
    if (canvas.height !== L.height) canvas.height = L.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, L.width, L.height);
    const bg = background();
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, L.width, L.height);
    }

    L.cells.forEach((cell, i) => {
      const item = state.slots[i];
      if (item) {
        const r = cropOf(item, cell);
        ctx.drawImage(item.img, r.x, r.y, r.w, r.h, cell.x, cell.y, cell.w, cell.h);
      } else if (preview) {
        ctx.fillStyle = '#e4e4e7';
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.fillStyle = '#71717a';
        ctx.font = `600 ${Math.round(cell.h * 0.16)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+ Foto ${i + 1}`, cell.x + cell.w / 2, cell.y + cell.h / 2);
      }
    });

    const sel = L.cells[state.selected];
    if (preview && sel && state.slots[state.selected]) {
      const lw = Math.max(2, Math.round(L.width / 220));
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = lw;
      ctx.strokeRect(sel.x + lw / 2, sel.y + lw / 2, sel.w - lw, sel.h - lw);
    }
    return L;
  }

  function fileName(L) {
    const base = sanitizeName($('#gallery-filename').value) || 'Galerij_';
    return `${base}${L.width}x${L.height}.${extension(outputType())}`;
  }

  // --- Weergave ---

  function renderThumb(item) {
    const cell = { w: STRIP_WIDTH, h: Math.round(STRIP_WIDTH * TILE_RATIO) };
    item.thumb.width = cell.w;
    item.thumb.height = cell.h;
    const ctx = item.thumb.getContext('2d');
    const r = cropOf(item, cell);
    ctx.drawImage(item.img, r.x, r.y, r.w, r.h, 0, 0, cell.w, cell.h);
  }

  function renderStrip() {
    const count = layout().cells.length;
    // Toon alle vakken van de indeling, plus gevulde plekken die erbuiten vallen.
    let last = count;
    state.slots.forEach((item, i) => { if (item) last = Math.max(last, i + 1); });

    const items = [];
    for (let i = 0; i < last; i++) {
      const item = state.slots[i];
      const li = document.createElement('li');
      li.classList.toggle('outside', i >= count);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item ? 'thumb' : 'thumb empty';

      if (item) {
        li.draggable = true;
        button.setAttribute('aria-current', String(i === state.selected));
        button.title = item.name;
        const label = document.createElement('span');
        label.textContent = `${i + 1}. ${i >= count ? 'valt buiten indeling' : item.name}`;
        button.append(item.thumb, label);
        button.addEventListener('click', () => select(i));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'thumb-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Foto ${i + 1} verwijderen`);
        remove.addEventListener('click', () => removeSlot(i));
        li.append(button, remove);
      } else {
        button.textContent = `+ Foto ${i + 1}`;
        button.addEventListener('click', () => pickFor(i));
        li.append(button);
      }

      // Volgorde wijzigen door te slepen; foto's wisselen van plek.
      li.addEventListener('dragstart', (event) => {
        state.dragFrom = i;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(i));
      });
      li.addEventListener('dragend', () => {
        state.dragFrom = null;
        strip.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
      });
      li.addEventListener('dragover', (event) => {
        if (state.dragFrom === null) return;
        event.preventDefault();
        li.classList.add('drop-target');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
      li.addEventListener('drop', (event) => {
        if (state.dragFrom === null) return;
        event.preventDefault();
        event.stopPropagation();
        const from = state.dragFrom;
        [state.slots[from], state.slots[i]] = [state.slots[i], state.slots[from]];
        state.dragFrom = null;
        state.selected = i;
        update();
      });
      items.push(li);
    }
    strip.replaceChildren(...items);
  }

  function update() {
    const L = render(stage, true);
    const filled = L.cells.filter((_, i) => state.slots[i]).length;
    const outside = state.slots.filter((item, i) => item && i >= L.cells.length).length;
    const missing = L.cells.length - filled;
    const hasAny = state.slots.some(Boolean);

    dropzone.classList.toggle('compact', hasAny);
    $('#gallery-bg-wrap').hidden = Number(selected('gallery-gap')) === 0;
    $('#gallery-color-wrap').hidden = selected('gallery-bg') !== 'custom';
    $('#gallery-type-options').hidden = transparent();
    $('#gallery-type-hint').hidden = !transparent();
    // Ruitjespatroon achter het voorbeeld maakt de transparantie zichtbaar.
    stage.classList.toggle('transparent', transparent());
    $('#gallery-size-info').textContent = `Galerij ${L.width} × ${L.height} px · elke foto ${L.tileW} × ${L.tileH} px`;
    $('#gallery-filename-info').textContent = `Wordt opgeslagen als: ${fileName(L)}`;

    const item = state.slots[state.selected];
    zoomSlider.disabled = !item;
    zoomSlider.value = item ? Math.round(item.zoom * 100) : 100;
    $('#gallery-zoom-value').textContent = `${zoomSlider.value}%`;

    let info = `${filled} van ${L.cells.length} foto's geplaatst.`;
    if (missing) info += ' Klik op een leeg vak of sleep foto\'s hierheen.';
    else info += ' Klik een foto aan en sleep om de uitsnede te verplaatsen.';
    if (outside) info += ` ${outside} foto${outside > 1 ? "'s vallen" : ' valt'} buiten deze indeling.`;
    const cell = L.cells[state.selected];
    if (item && cell && cropOf(item, cell).w < cell.w) info += ` Let op: foto ${state.selected + 1} wordt vergroot en is mogelijk minder scherp.`;
    $('#gallery-info').textContent = info;

    downloadButton.disabled = missing > 0;
    downloadButton.textContent = missing > 0 ? `Nog ${missing} foto${missing > 1 ? "'s" : ''} nodig` : 'Download galerij';

    renderStrip();
    scheduleFileSize();
  }

  function scheduleFileSize() {
    clearTimeout(state.sizeTimer);
    state.sizeTimer = setTimeout(async () => {
      if (downloadButton.disabled) return;
      const blob = await canvasToBlob(exportCanvas(), outputType(), JPG_QUALITY);
      $('#gallery-filename-info').textContent = `Wordt opgeslagen als: ${fileName(layout())} (ca. ${formatBytes(blob.size)})`;
    }, 300);
  }

  function exportCanvas() {
    const canvas = document.createElement('canvas');
    render(canvas, false);
    return canvas;
  }

  function select(i) {
    state.selected = i;
    update();
  }

  // --- Bestanden ---

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // Vult eerst het gekozen vak (als dat er is), daarna de lege vakken op volgorde.
  async function addFiles(files, target = null) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      setStatus('Geen afbeeldingen gevonden.', true);
      return;
    }
    const failed = [];
    let skipped = 0;
    let first = null;
    for (const file of images) {
      let slot = target !== null && !state.slots[target] ? target : state.slots.findIndex((s) => !s);
      target = null;
      if (slot < 0) {
        skipped++;
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const item = { name: file.name || `foto-${slot + 1}.png`, url, img, zoom: 1, fx: 0.5, fy: 0.5, thumb: document.createElement('canvas') };
        renderThumb(item);
        state.slots[slot] = item;
        first ??= slot;
      } catch {
        URL.revokeObjectURL(url);
        failed.push(file.name);
      }
    }
    const notes = [];
    if (failed.length) notes.push(`Kon niet openen: ${failed.join(', ')}.`);
    if (skipped) notes.push(`${skipped} foto${skipped > 1 ? "'s" : ''} niet toegevoegd: er zijn maximaal ${MAX_SLOTS} plekken.`);
    setStatus(notes.join(' '), notes.length > 0);
    if (first !== null) state.selected = first;
    update();
  }

  function pickFor(slot) {
    state.target = slot;
    fileInput.click();
  }

  function removeSlot(i) {
    const item = state.slots[i];
    if (!item) return;
    URL.revokeObjectURL(item.url);
    state.slots[i] = null;
    update();
  }

  function clearAll() {
    state.slots.forEach((item) => item && URL.revokeObjectURL(item.url));
    state.slots = Array(MAX_SLOTS).fill(null);
    state.selected = 0;
    setStatus('Alles gewist.');
    update();
  }

  async function download() {
    downloadButton.disabled = true;
    try {
      const L = layout();
      const blob = await canvasToBlob(exportCanvas(), outputType(), JPG_QUALITY);
      const name = fileName(L);
      saveBlob(blob, name);
      setStatus(`Gedownload: ${name} (${formatBytes(blob.size)})`);
    } catch (err) {
      setStatus(`Er ging iets mis: ${err.message}`, true);
    } finally {
      update();
    }
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  // --- Klikken, slepen en zoomen op de galerij ---

  function cellAt(event) {
    const L = layout();
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * L.width) / rect.width;
    const y = ((event.clientY - rect.top) * L.height) / rect.height;
    const index = L.cells.findIndex((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
    return { index, L };
  }

  stage.addEventListener('pointerdown', (event) => {
    const { index } = cellAt(event);
    if (index < 0) return;
    if (!state.slots[index]) {
      pickFor(index);
      return;
    }
    state.selected = index;
    stage.setPointerCapture(event.pointerId);
    state.drag = { x: event.clientX, y: event.clientY };
    update();
  });

  stage.addEventListener('pointermove', (event) => {
    const item = state.slots[state.selected];
    if (!state.drag || !item) return;
    const L = layout();
    const cell = L.cells[state.selected];
    const r = cropOf(item, cell);
    // Schermpixels → galerijpixels → pixels in het origineel.
    const scale = (r.w / cell.w) * (L.width / stage.clientWidth);
    const cx = r.x + r.w / 2 - (event.clientX - state.drag.x) * scale;
    const cy = r.y + r.h / 2 - (event.clientY - state.drag.y) * scale;
    item.fx = clamp(cx, r.w / 2, item.img.naturalWidth - r.w / 2) / item.img.naturalWidth;
    item.fy = clamp(cy, r.h / 2, item.img.naturalHeight - r.h / 2) / item.img.naturalHeight;
    state.drag = { x: event.clientX, y: event.clientY };
    render(stage, true);
  });

  const endDrag = () => {
    if (!state.drag) return;
    state.drag = null;
    const item = state.slots[state.selected];
    if (item) renderThumb(item);
    update();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function setZoom(zoom) {
    const item = state.slots[state.selected];
    if (!item) return;
    item.zoom = clamp(zoom, 1, 4);
    renderThumb(item);
    update();
  }
  zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value) / 100));
  stage.addEventListener('wheel', (event) => {
    const { index } = cellAt(event);
    if (index < 0 || !state.slots[index]) return;
    event.preventDefault();
    state.selected = index;
    setZoom(state.slots[index].zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  $('#gallery-reset').addEventListener('click', () => {
    const item = state.slots[state.selected];
    if (!item) return;
    Object.assign(item, { zoom: 1, fx: 0.5, fy: 0.5 });
    renderThumb(item);
    update();
  });

  // --- Uploaden: kiezen, slepen of plakken ---

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files, state.target);
    state.target = null;
    fileInput.value = '';
  });
  const isFileDrag = (event) => [...event.dataTransfer.types].includes('Files');
  for (const type of ['dragenter', 'dragover']) {
    panel.addEventListener(type, (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
  }
  panel.addEventListener('dragleave', (event) => {
    if (!panel.contains(event.relatedTarget)) dropzone.classList.remove('dragover');
  });
  panel.addEventListener('drop', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dropzone.classList.remove('dragover');
    // Losgelaten op een vak? Dan begint het vullen daar.
    const { index } = event.target === stage ? cellAt(event) : { index: -1 };
    addFiles(event.dataTransfer.files, index >= 0 ? index : null);
  });
  document.addEventListener('paste', (event) => {
    if (panel.hidden) return;
    const files = [...event.clipboardData.files];
    if (files.length) addFiles(files);
  });

  panel.querySelectorAll('input[type="radio"]').forEach((input) => input.addEventListener('change', update));
  $('#gallery-color').addEventListener('input', update);
  $('#gallery-filename').addEventListener('input', update);
  downloadButton.addEventListener('click', download);
  $('#gallery-clear').addEventListener('click', clearAll);
  window.addEventListener('tabchange', () => { if (!panel.hidden) update(); });
  update();
})();
