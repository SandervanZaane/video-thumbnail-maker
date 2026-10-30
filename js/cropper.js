// Tab "Afbeeldingen bijsnijden": afbeeldingen uploaden, op een vast formaat
// bijsnijden en downloaden. Alles gebeurt lokaal in de browser; afbeeldingen
// worden nergens heen gestuurd en niet bewaard.
(() => {
  const MAX_WIDTH = 720;
  const THUMB_WIDTH = 220;

  const { saveBlob, canvasToBlob, formatBytes, sanitizeName, extension } = window.Beeld;
  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel-crop');
  const dropzone = $('#dropzone');
  const fileInput = $('#crop-files');
  const workspace = $('#crop-workspace');
  const stage = $('#crop-canvas');
  const zoomSlider = $('#crop-zoom');
  const list = $('#crop-list');
  const qualitySlider = $('#crop-quality');
  const statusEl = $('#crop-status');
  const buttons = [$('#crop-download'), $('#crop-download-all')];

  // item: { id, name, url, img, zoom (1–4), fx, fy (middelpunt uitsnede, 0–1), thumb }
  const state = { items: [], current: null, nextId: 1, sizeTimer: null };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const selected = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const currentItem = () => state.items.find((item) => item.id === state.current);
  const isRound = () => selected('crop-shape') === 'round';
  // Rond heeft een transparante achtergrond nodig, dus altijd PNG.
  const outputType = () => (isRound() ? 'image/png' : selected('crop-type'));

  function currentSize() {
    if (isRound()) {
      const size = selected('crop-round-size');
      const d = size === 'custom' ? clamp(Math.round(Number($('#crop-round-custom').value) || 250), 50, MAX_WIDTH) : Number(size);
      return { width: d, height: d };
    }
    const size = selected('crop-size');
    if (size === 'custom') {
      return {
        width: clamp(Math.round(Number($('#crop-custom-width').value) || 648), 50, MAX_WIDTH),
        height: clamp(Math.round(Number($('#crop-custom-height').value) || 400), 50, 2000),
      };
    }
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }

  function cropRect(item, width, height) {
    return window.Beeld.coverRect(item.img.naturalWidth, item.img.naturalHeight, width, height, item.zoom, item.fx, item.fy);
  }

  function draw(item, canvas, width, height, type) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);
    // JPG kent geen transparantie: geef transparante delen een witte achtergrond.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    const r = cropRect(item, width, height);
    ctx.save();
    if (isRound()) {
      // Alles buiten de cirkel blijft transparant.
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(item.img, r.x, r.y, r.w, r.h, 0, 0, width, height);
    ctx.restore();
    return canvas;
  }

  function fileName(item, { width, height }) {
    const base = sanitizeName(item.name.replace(/\.[^.]+$/, '')) || 'afbeelding';
    return `${base}_${isRound() ? 'rond_' : ''}${width}x${height}.${extension(outputType())}`;
  }

  // --- Weergave ---

  function renderThumb(item) {
    const { width, height } = currentSize();
    draw(item, item.thumb, THUMB_WIDTH, Math.round((THUMB_WIDTH * height) / width), outputType());
  }

  function renderList() {
    list.replaceChildren(...state.items.map((item) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thumb';
      button.setAttribute('aria-current', String(item.id === state.current));
      button.title = item.name;
      const name = document.createElement('span');
      name.textContent = item.name;
      button.append(item.thumb, name);
      button.addEventListener('click', () => select(item.id));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'thumb-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${item.name} verwijderen`);
      remove.addEventListener('click', () => removeItem(item.id));

      li.append(button, remove);
      return li;
    }));
  }

  function renderStage() {
    const item = currentItem();
    if (!item) return;
    const size = currentSize();
    const type = outputType();
    draw(item, stage, size.width, size.height, type);
    renderThumb(item);

    zoomSlider.value = Math.round(item.zoom * 100);
    $('#crop-zoom-value').textContent = `${zoomSlider.value}%`;
    const r = cropRect(item, size.width, size.height);
    let info = `${item.name} · origineel ${item.img.naturalWidth} × ${item.img.naturalHeight} px → ${size.width} × ${size.height} px. Sleep om de uitsnede te verplaatsen.`;
    if (r.w < size.width) info += ' Let op: het gekozen deel is kleiner dan het formaat en wordt vergroot, dus mogelijk minder scherp.';
    $('#crop-info').textContent = info;
    scheduleFileSize();
  }

  // Toont de verwachte bestandsgrootte, met een korte vertraging tijdens slepen.
  function scheduleFileSize() {
    clearTimeout(state.sizeTimer);
    state.sizeTimer = setTimeout(async () => {
      const item = currentItem();
      if (!item) return;
      const type = outputType();
      const blob = await canvasToBlob(stage, type, Number(qualitySlider.value) / 100);
      $('#crop-filesize').textContent = `Bestandsgrootte: ca. ${formatBytes(blob.size)}`;
    }, 250);
  }

  function updateSettings() {
    const round = isRound();
    $('#crop-rect-sizes').hidden = round;
    $('#crop-round-sizes').hidden = !round;
    $('#crop-type-options').hidden = round;
    $('#crop-custom-wrap').hidden = selected('crop-size') !== 'custom';
    $('#crop-round-custom-wrap').hidden = selected('crop-round-size') !== 'custom';
    $('#crop-quality-wrap').hidden = outputType() !== 'image/jpeg';
    // Ruitjespatroon achter het voorbeeld maakt de transparantie zichtbaar.
    stage.classList.toggle('transparent', round);
    list.classList.toggle('transparent', round);
    $('#crop-quality-value').textContent = `${qualitySlider.value}%`;
    $('#crop-download-all').hidden = state.items.length < 2;
    state.items.forEach(renderThumb);
    renderStage();
  }

  function select(id) {
    state.current = id;
    renderList();
    renderStage();
  }

  function showWorkspace() {
    const hasItems = state.items.length > 0;
    workspace.hidden = !hasItems;
    dropzone.classList.toggle('compact', hasItems);
    $('#crop-download-all').hidden = state.items.length < 2;
  }

  // --- Bestanden ---

  async function addFiles(files) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      setStatus('Geen afbeeldingen gevonden. Kies JPG-, PNG-, WebP- of GIF-bestanden.', true);
      return;
    }
    const failed = [];
    let firstNew = null;
    for (const file of images) {
      try {
        const { img, url } = await window.Beeld.loadImageFile(file);
        const item = { id: state.nextId++, name: file.name || 'geplakte-afbeelding.png', url, img, zoom: 1, fx: 0.5, fy: 0.5, thumb: document.createElement('canvas') };
        renderThumb(item);
        state.items.push(item);
        firstNew ??= item.id;
      } catch (err) {
        failed.push(err.message);
      }
    }
    setStatus(failed.length ? `Kon niet openen: ${failed.join('; ')}.` : '', failed.length > 0);
    showWorkspace();
    if (firstNew !== null) select(firstNew);
  }

  function removeItem(id) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    URL.revokeObjectURL(state.items[index].url);
    state.items.splice(index, 1);
    if (state.current === id) state.current = state.items[Math.min(index, state.items.length - 1)]?.id ?? null;
    showWorkspace();
    renderList();
    renderStage();
  }

  function clearAll() {
    state.items.forEach((item) => URL.revokeObjectURL(item.url));
    state.items = [];
    state.current = null;
    list.replaceChildren();
    stage.width = stage.height = 0;
    setStatus('Alles gewist.');
    showWorkspace();
  }

  // --- Export ---

  async function exportBlob(item) {
    const size = currentSize();
    const type = outputType();
    const canvas = draw(item, document.createElement('canvas'), size.width, size.height, type);
    return { blob: await canvasToBlob(canvas, type, Number(qualitySlider.value) / 100), name: fileName(item, size) };
  }

  async function withBusy(task) {
    buttons.forEach((b) => (b.disabled = true));
    try {
      await task();
    } catch (err) {
      setStatus(`Er ging iets mis: ${err.message}`, true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  async function downloadCurrent() {
    const item = currentItem();
    if (!item) return;
    const { blob, name } = await exportBlob(item);
    saveBlob(blob, name);
    setStatus(`Gedownload: ${name} (${formatBytes(blob.size)})`);
  }

  async function downloadZip() {
    const files = [];
    const used = new Set();
    for (const [i, item] of state.items.entries()) {
      setStatus(`ZIP maken… ${i + 1}/${state.items.length}`);
      const { blob, name } = await exportBlob(item);
      // Dubbele namen krijgen een volgnummer.
      let unique = name;
      for (let n = 2; used.has(unique); n++) unique = name.replace(/(\.\w+)$/, `-${n}$1`);
      used.add(unique);
      files.push({ name: unique, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const { width, height } = currentSize();
    const zip = window.makeZip(files);
    const zipName = `afbeeldingen_${isRound() ? 'rond_' : ''}${width}x${height}.zip`;
    saveBlob(zip, zipName);
    setStatus(`Gedownload: ${zipName} met ${files.length} afbeeldingen (${formatBytes(zip.size)})`);
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  // --- Slepen en zoomen ---

  let drag = null;
  stage.addEventListener('pointerdown', (event) => {
    const item = currentItem();
    if (!item) return;
    stage.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointermove', (event) => {
    const item = currentItem();
    if (!drag || !item) return;
    const { width, height } = currentSize();
    const r = cropRect(item, width, height);
    // Schermpixels omrekenen naar pixels in het origineel; slepen verplaatst de foto.
    const scale = r.w / stage.clientWidth;
    const cx = r.x + r.w / 2 - (event.clientX - drag.x) * scale;
    const cy = r.y + r.h / 2 - (event.clientY - drag.y) * scale;
    item.fx = clamp(cx, r.w / 2, item.img.naturalWidth - r.w / 2) / item.img.naturalWidth;
    item.fy = clamp(cy, r.h / 2, item.img.naturalHeight - r.h / 2) / item.img.naturalHeight;
    drag = { x: event.clientX, y: event.clientY };
    renderStage();
  });
  const endDrag = () => (drag = null);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function setZoom(zoom) {
    const item = currentItem();
    if (!item) return;
    item.zoom = clamp(zoom, 1, 4);
    renderStage();
  }
  zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value) / 100));
  stage.addEventListener('wheel', (event) => {
    if (!currentItem()) return;
    event.preventDefault();
    setZoom(currentItem().zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  $('#crop-reset').addEventListener('click', () => {
    const item = currentItem();
    if (!item) return;
    Object.assign(item, { zoom: 1, fx: 0.5, fy: 0.5 });
    renderStage();
  });

  // --- Uploaden: kiezen, slepen of plakken ---

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  for (const type of ['dragenter', 'dragover']) {
    panel.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
  }
  panel.addEventListener('dragleave', (event) => {
    if (!panel.contains(event.relatedTarget)) dropzone.classList.remove('dragover');
  });
  panel.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    addFiles(event.dataTransfer.files);
  });
  document.addEventListener('paste', (event) => {
    if (panel.hidden) return;
    const files = [...event.clipboardData.files];
    if (files.length) addFiles(files);
  });

  for (const id of ['#crop-custom-width', '#crop-custom-height', '#crop-round-custom', '#crop-quality']) $(id).addEventListener('input', updateSettings);
  document.querySelectorAll('input[name="crop-shape"], input[name="crop-size"], input[name="crop-round-size"], input[name="crop-type"]').forEach((input) => input.addEventListener('change', updateSettings));
  $('#crop-download').addEventListener('click', () => withBusy(downloadCurrent));
  $('#crop-download-all').addEventListener('click', () => withBusy(downloadZip));
  $('#crop-clear').addEventListener('click', clearAll);
  updateSettings();
})();
