// Tab "Diashow": 2 tot 6 afbeeldingen worden een geanimeerde GIF die steeds
// wisselt, eventueel met een vervagende of schuivende overgang. Bedoeld voor
// e-mail, dus met oog voor een kleine bestandsgrootte. Alles gebeurt lokaal.
(() => {
  const MIN_IMAGES = 2;
  const MAX_IMAGES = 6;
  const WARN_BYTES = 1024 * 1024;
  const STRIP_WIDTH = 150;
  // Hoe lang elk beeld blijft staan, in honderdsten van een seconde.
  const HOLD_CS = { slow: 250, normal: 150, fast: 100 };
  const TRANSITION_STEP_CS = 6;
  // "Kleiner maken" gaat steeds een stap omlaag. Tussenbeelden staan maar kort
  // in beeld, dus die krijgen altijd minder kleuren dan de stilstaande beelden.
  // Geen dithering: met een eigen palet per foto is dat zelden nodig en ruis
  // maakt een GIF veel groter.
  const LEVELS = [
    { colors: 256, steps: 3, stepColors: 64, label: 'beste kwaliteit' },
    { colors: 128, steps: 2, stepColors: 48, label: 'lichter' },
    { colors: 64, steps: 2, stepColors: 32, label: 'nog lichter' },
    { colors: 48, steps: 1, stepColors: 24, label: 'zo licht mogelijk' },
  ];

  const { saveBlob, formatBytes, sanitizeName, coverRect, loadImageFile } = window.Beeld;
  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel-slides');
  const dropzone = $('#slide-dropzone');
  const fileInput = $('#slide-files');
  const workspace = $('#slide-workspace');
  const stage = $('#slide-canvas');
  const zoomSlider = $('#slide-zoom');
  const strip = $('#slide-list');
  const statusEl = $('#slide-status');
  const makeButton = $('#slide-make');

  // item: { name, url, img, zoom, fx, fy, thumb }
  const state = { items: [], selected: 0, level: 0, result: null, dragFrom: null, drag: null, busy: false };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const selected = (name) => {
    const select = document.querySelector(`select[name="${name}"]`);
    return select ? select.value : document.querySelector(`input[name="${name}"]:checked`).value;
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function currentSize() {
    const [width, height] = selected('slide-size').split('x').map(Number);
    return { width, height };
  }

  function fileName() {
    const { width, height } = currentSize();
    return `${sanitizeName($('#slide-filename').value) || 'Diashow_'}${width}x${height}.gif`;
  }

  function paint(ctx, item, x, width, height) {
    const r = coverRect(item.img.naturalWidth, item.img.naturalHeight, width, height, item.zoom, item.fx, item.fy);
    ctx.drawImage(item.img, r.x, r.y, r.w, r.h, x, 0, width, height);
  }

  // --- Weergave ---

  function renderThumb(item) {
    const { width, height } = currentSize();
    item.thumb.width = STRIP_WIDTH;
    item.thumb.height = Math.round((STRIP_WIDTH * height) / width);
    const ctx = item.thumb.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    paint(ctx, item, 0, item.thumb.width, item.thumb.height);
  }

  function renderStage() {
    const item = state.items[state.selected];
    if (!item) return;
    const { width, height } = currentSize();
    if (stage.width !== width) stage.width = width;
    if (stage.height !== height) stage.height = height;
    const ctx = stage.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    paint(ctx, item, 0, width, height);
  }

  function renderStrip() {
    const items = state.items.map((item, i) => {
      const li = document.createElement('li');
      li.draggable = true;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thumb';
      button.title = item.name;
      button.setAttribute('aria-current', String(i === state.selected));
      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${item.name}`;
      button.append(item.thumb, label);
      button.addEventListener('click', () => select(i));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'thumb-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Afbeelding ${i + 1} verwijderen`);
      remove.addEventListener('click', () => removeItem(i));

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
        // Verplaatsen (niet wisselen): de rest schuift op, zoals in een diashow.
        const [moved] = state.items.splice(state.dragFrom, 1);
        state.items.splice(i, 0, moved);
        state.dragFrom = null;
        state.selected = i;
        changed();
      });

      li.append(button, remove);
      return li;
    });

    if (state.items.length < MAX_IMAGES) {
      const li = document.createElement('li');
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'thumb empty';
      add.textContent = '+ Toevoegen';
      add.addEventListener('click', () => fileInput.click());
      li.append(add);
      items.push(li);
    }
    strip.replaceChildren(...items);
  }

  function update() {
    const count = state.items.length;
    workspace.hidden = count === 0;
    dropzone.classList.toggle('compact', count > 0);

    const item = state.items[state.selected];
    zoomSlider.value = item ? Math.round(item.zoom * 100) : 100;
    $('#slide-zoom-value').textContent = `${zoomSlider.value}%`;

    const seconds = HOLD_CS[selected('slide-speed')] / 100;
    $('#slide-speed-info').textContent = `Elk beeld staat ${String(seconds).replace('.', ',')} seconde in beeld.`;
    $('#slide-filename-info').textContent = `Wordt opgeslagen als: ${fileName()}`;

    let info = `${count} van max. ${MAX_IMAGES} afbeeldingen.`;
    if (count < MIN_IMAGES) info += ` Voeg er nog ${MIN_IMAGES - count} toe.`;
    else info += ' Sleep in het beeld om de uitsnede te verplaatsen.';
    if (item) {
      const { width } = currentSize();
      const r = coverRect(item.img.naturalWidth, item.img.naturalHeight, width, currentSize().height, item.zoom, item.fx, item.fy);
      if (r.w < width) info += ` Let op: afbeelding ${state.selected + 1} wordt vergroot en is mogelijk minder scherp.`;
    }
    $('#slide-info').textContent = info;

    makeButton.disabled = state.busy || count < MIN_IMAGES;
    renderStage();
    renderStrip();
  }

  // Elke wijziging maakt een eerder gemaakte GIF ongeldig.
  function changed() {
    clearResult();
    state.items.forEach(renderThumb);
    update();
  }

  function clearResult() {
    if (state.result) URL.revokeObjectURL(state.result.url);
    state.result = null;
    $('#slide-result-card').hidden = true;
    $('#slide-result').removeAttribute('src');
  }

  function select(i) {
    state.selected = i;
    update();
  }

  // --- GIF maken ---

  function buildFrames(level) {
    const { width, height } = currentSize();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    const grab = (delay, colors) => ({ x: 0, y: 0, w: width, h: height, delay, colors, dither: 0, data: ctx.getImageData(0, 0, width, height).data });

    const transition = selected('slide-transition');
    const { colors, steps: stepCount, stepColors } = LEVELS[level];
    const steps = transition === 'none' ? 0 : stepCount;
    const hold = HOLD_CS[selected('slide-speed')];
    const n = state.items.length;
    const frames = [];

    for (let i = 0; i < n; i++) {
      const current = state.items[i];
      const next = state.items[(i + 1) % n]; // de laatste gaat weer over in de eerste
      paint(ctx, current, 0, width, height);
      frames.push(grab(hold, colors));
      for (let s = 1; s <= steps; s++) {
        const t = easeInOut(s / (steps + 1));
        // Lichte bewegingsonscherpte: onzichtbaar in 60 ms, maar veel kleinere frames.
        ctx.filter = 'blur(1.2px)';
        if (transition === 'fade') {
          paint(ctx, current, 0, width, height);
          ctx.globalAlpha = t;
          paint(ctx, next, 0, width, height);
          ctx.globalAlpha = 1;
        } else {
          // Schuiven: het volgende beeld duwt het huidige naar links.
          const offset = Math.round(t * width);
          paint(ctx, current, -offset, width, height);
          paint(ctx, next, width - offset, width, height);
        }
        ctx.filter = 'none';
        frames.push(grab(TRANSITION_STEP_CS, stepColors));
      }
    }
    return frames;
  }

  async function makeGif() {
    if (state.items.length < MIN_IMAGES || state.busy) return;
    state.busy = true;
    makeButton.disabled = true;
    $('#slide-smaller').disabled = true;
    clearResult();
    try {
      const level = LEVELS[state.level];
      const frames = buildFrames(state.level);
      const bytes = await window.GifEncoder.encodeSlides(currentSize().width, currentSize().height, frames, (done, total) => {
        setStatus(`GIF maken… ${Math.round((done / total) * 100)}%`);
      });
      const blob = new Blob([bytes], { type: 'image/gif' });
      state.result = { blob, url: URL.createObjectURL(blob) };
      showResult(level);
      setStatus('');
    } catch (err) {
      setStatus(`Er ging iets mis: ${err.message}`, true);
    } finally {
      state.busy = false;
      $('#slide-smaller').disabled = false;
      update();
    }
  }

  function showResult(level) {
    const { blob, url } = state.result;
    const tooBig = blob.size > WARN_BYTES;
    const lightest = state.level === LEVELS.length - 1;
    $('#slide-result').src = url;
    $('#slide-result-card').hidden = false;
    $('#slide-result-info').textContent = `${fileName()} · ${formatBytes(blob.size)} · ${level.label}`;

    const warning = $('#slide-warning');
    warning.hidden = !tooBig;
    if (tooBig) {
      warning.textContent = lightest
        ? 'Dit bestand is groter dan 1 MB, ook op de lichtste stand. Gebruik minder afbeeldingen, kies "Geen" als overgang of het lagere formaat.'
        : 'Dit bestand is groter dan 1 MB. Dat laadt traag in e-mail, vooral op mobiel. Klik op "Kleiner maken" voor een lichtere versie.';
    }
    $('#slide-smaller').hidden = lightest;
    $('#slide-best').hidden = state.level === 0;
  }

  // --- Bestanden ---

  async function addFiles(files) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      setStatus('Geen afbeeldingen gevonden.', true);
      return;
    }
    const failed = [];
    let skipped = 0;
    let first = null;
    for (const file of images) {
      if (state.items.length >= MAX_IMAGES) {
        skipped++;
        continue;
      }
      try {
        const { img, url } = await loadImageFile(file);
        const item = { name: file.name || 'geplakte-afbeelding.png', url, img, zoom: 1, fx: 0.5, fy: 0.5, thumb: document.createElement('canvas') };
        state.items.push(item);
        first ??= state.items.length - 1;
      } catch (err) {
        failed.push(err.message);
      }
    }
    const notes = [];
    if (failed.length) notes.push(`Kon niet openen: ${failed.join('; ')}.`);
    if (skipped) notes.push(`${skipped} afbeelding${skipped > 1 ? 'en' : ''} niet toegevoegd: maximaal ${MAX_IMAGES}.`);
    setStatus(notes.join(' '), notes.length > 0);
    if (first !== null) state.selected = first;
    changed();
  }

  function removeItem(i) {
    URL.revokeObjectURL(state.items[i].url);
    state.items.splice(i, 1);
    state.selected = clamp(state.selected, 0, Math.max(0, state.items.length - 1));
    changed();
  }

  function clearAll() {
    state.items.forEach((item) => URL.revokeObjectURL(item.url));
    state.items = [];
    state.selected = 0;
    setStatus('Alles gewist.');
    changed();
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  // --- Slepen en zoomen ---

  stage.addEventListener('pointerdown', (event) => {
    if (!state.items[state.selected]) return;
    stage.setPointerCapture(event.pointerId);
    state.drag = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointermove', (event) => {
    const item = state.items[state.selected];
    if (!state.drag || !item) return;
    const { width, height } = currentSize();
    const r = coverRect(item.img.naturalWidth, item.img.naturalHeight, width, height, item.zoom, item.fx, item.fy);
    const scale = r.w / stage.clientWidth;
    const cx = r.x + r.w / 2 - (event.clientX - state.drag.x) * scale;
    const cy = r.y + r.h / 2 - (event.clientY - state.drag.y) * scale;
    item.fx = clamp(cx, r.w / 2, item.img.naturalWidth - r.w / 2) / item.img.naturalWidth;
    item.fy = clamp(cy, r.h / 2, item.img.naturalHeight - r.h / 2) / item.img.naturalHeight;
    state.drag = { x: event.clientX, y: event.clientY };
    renderStage();
  });
  const endDrag = () => {
    if (!state.drag) return;
    state.drag = null;
    changed();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function setZoom(zoom) {
    const item = state.items[state.selected];
    if (!item) return;
    item.zoom = clamp(zoom, 1, 4);
    changed();
  }
  zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value) / 100));
  stage.addEventListener('wheel', (event) => {
    const item = state.items[state.selected];
    if (!item) return;
    event.preventDefault();
    setZoom(item.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });
  $('#slide-reset').addEventListener('click', () => {
    const item = state.items[state.selected];
    if (!item) return;
    Object.assign(item, { zoom: 1, fx: 0.5, fy: 0.5 });
    changed();
  });

  // --- Uploaden: kiezen, slepen of plakken ---

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
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
    addFiles(event.dataTransfer.files);
  });
  document.addEventListener('paste', (event) => {
    if (panel.hidden) return;
    const files = [...event.clipboardData.files];
    if (files.length) addFiles(files);
  });

  // --- Instellingen en knoppen ---

  panel.querySelectorAll('[name="slide-size"], [name="slide-speed"], [name="slide-transition"]').forEach((input) => input.addEventListener('change', changed));
  $('#slide-filename').addEventListener('input', () => {
    $('#slide-filename-info').textContent = `Wordt opgeslagen als: ${fileName()}`;
    if (state.result) $('#slide-result-info').textContent = `${fileName()} · ${formatBytes(state.result.blob.size)} · ${LEVELS[state.level].label}`;
  });
  makeButton.addEventListener('click', makeGif);
  $('#slide-smaller').addEventListener('click', () => {
    state.level = Math.min(LEVELS.length - 1, state.level + 1);
    makeGif();
  });
  $('#slide-best').addEventListener('click', () => {
    state.level = 0;
    makeGif();
  });
  $('#slide-download').addEventListener('click', () => {
    if (!state.result) return;
    saveBlob(state.result.blob, fileName());
    setStatus(`Gedownload: ${fileName()} (${formatBytes(state.result.blob.size)})`);
  });
  $('#slide-clear').addEventListener('click', clearAll);
  update();
})();
