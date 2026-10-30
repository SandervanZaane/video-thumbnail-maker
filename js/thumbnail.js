// Tab "Video thumbnail": haalt de thumbnail van een video op (of gebruikt een
// eigen afbeelding), tekent er een play-knop overheen en exporteert als PNG,
// JPG of geanimeerde GIF.
(() => {
  const ASPECT = 9 / 16;
  // Breedte × hoogte, van groot naar klein; hoogte null = automatisch (16:9).
  const PRESETS = [[1280, 720], [648, null], [648, 250]];
  const PREVIEW_WIDTH = 1280;
  // Van hoogste naar laagste kwaliteit; maxres bestaat niet voor elke video.
  const QUALITIES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

  // Animatie: een rustige ring die vanuit de knop uitdijt en vervaagt, daarna
  // een korte pauze. Het eerste GIF-frame is de rusttoestand.
  const PULSE_FRAMES = 18;
  const PULSE_DELAY_CS = 7; // 18 × 70 ms ≈ 1,3 s beweging
  const REST_DELAY_CS = 90; // 0,9 s rust
  const PULSE_MS = PULSE_FRAMES * PULSE_DELAY_CS * 10;
  const CYCLE_MS = PULSE_MS + REST_DELAY_CS * 10;

  const STYLES = {
    red: { fill: '#ff0000', icon: '#ffffff', ring: '#ffffff', rect: true },
    white: { fill: 'rgba(255, 255, 255, 0.95)', icon: '#18181b', ring: '#ffffff' },
    dark: { fill: 'rgba(0, 0, 0, 0.65)', icon: '#ffffff', ring: '#ffffff', stroke: 'rgba(255, 255, 255, 0.9)' },
  };

  const { saveBlob, canvasToBlob, formatBytes, sanitizeName, extension } = window.Beeld;
  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel-thumbnail');
  const form = $('#url-form');
  const urlInput = $('#url');
  const statusEl = $('#status');
  const exportStatus = $('#export-status');
  const editor = $('#editor');
  const canvas = $('#canvas');
  const sizeSlider = $('#button-size');
  const darkenBox = $('#darken');
  const customWrap = $('#custom-wrap');
  const customWidth = $('#custom-width');
  const customHeight = $('#custom-height');
  const cropWrap = $('#crop-wrap');
  const cropPos = $('#crop-pos');
  const colorWrap = $('#color-wrap');
  const colorCircle = $('#color-circle');
  const colorTriangle = $('#color-triangle');
  const exportButtons = [$('#download'), $('#download-all')];

  const state = { image: null, videoId: null, letterboxed: false, uploadUrl: null, raf: null };

  // Haalt het video-ID uit alle gangbare videolinkvormen, of accepteert een kaal ID.
  function parseVideoId(input) {
    const text = input.trim();
    if (/^[\w-]{11}$/.test(text)) return text;
    let url;
    try {
      url = new URL(text.startsWith('http') ? text : `https://${text}`);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (match) return match[1];
    }
    return null;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // nodig om het canvas later te kunnen exporteren
      img.referrerPolicy = 'no-referrer';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Kon ${src} niet laden`));
      img.src = src;
    });
  }

  async function fetchThumbnail(videoId) {
    for (const quality of QUALITIES) {
      try {
        const img = await loadImage(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);
        // De bron geeft een grijze placeholder van 120x90 terug als een kwaliteit ontbreekt.
        if (img.naturalWidth > 120) return img;
      } catch {
        // probeer de volgende kwaliteit
      }
    }
    throw new Error('Geen thumbnail gevonden voor deze video.');
  }

  // --- Tekenen ---

  function styleColors() {
    const style = selected('style');
    if (style === 'custom') return { fill: colorCircle.value, icon: colorTriangle.value, ring: colorCircle.value };
    return STYLES[style];
  }

  // Bij brede, lage formaten (zoals 648 × 250) schaalt de knop mee met de hoogte.
  function buttonWidth(w, h) {
    return (Math.min(w, h / ASPECT) * Number(sizeSlider.value)) / 100;
  }

  function buttonPath(ctx, cx, cy, bw, rect) {
    ctx.beginPath();
    if (rect) {
      const bh = bw * 0.7;
      ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.28);
    } else {
      ctx.arc(cx, cy, bw / 2, 0, Math.PI * 2);
    }
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // pulse: null = stilstaand, 0–1 = moment in de animatie.
  function drawPlayButton(ctx, w, h, pulse) {
    const colors = styleColors();
    const cx = w / 2;
    const cy = h / 2;
    let bw = buttonWidth(w, h);

    ctx.save();
    if (pulse !== null && pulse > 0 && pulse < 1) {
      const e = easeOut(pulse);
      ctx.globalAlpha = 0.55 * (1 - e);
      ctx.lineWidth = bw * 0.035;
      ctx.strokeStyle = colors.ring;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = bw * 0.04;
      buttonPath(ctx, cx, cy, bw * (1 + 0.45 * e), colors.rect);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // De knop zelf "ademt" heel licht mee.
      bw *= 1 + 0.025 * Math.sin(Math.PI * pulse);
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = bw * 0.12;
    ctx.fillStyle = colors.fill;
    buttonPath(ctx, cx, cy, bw, colors.rect);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (colors.stroke) {
      ctx.lineWidth = Math.max(2, bw * 0.03);
      ctx.strokeStyle = colors.stroke;
      ctx.stroke();
    }

    // Gelijkzijdige driehoek, iets naar rechts zodat hij optisch gecentreerd staat.
    const th = colors.rect ? bw * 0.7 * 0.42 : bw * 0.375;
    const tw = th * 0.866;
    const offset = tw * 0.12;
    ctx.fillStyle = colors.icon;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2 + offset, cy - th / 2);
    ctx.lineTo(cx + tw / 2 + offset, cy);
    ctx.lineTo(cx - tw / 2 + offset, cy + th / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Bepaalt welk deel van de bron getoond wordt. De afbeelding wordt nooit
  // geplet: wijkt de verhouding af, dan wordt er bijgesneden (zoals CSS
  // object-fit: cover). `pos` (0–1) schuift de uitsnede langs de bijgesneden as.
  // Videothumbnails in lage kwaliteit hebben zwarte balken (4:3); die tellen niet mee.
  function baseHeight(img) {
    return state.letterboxed ? Math.min(img.naturalHeight, img.naturalWidth * ASPECT) : img.naturalHeight;
  }

  function sourceRect(img, width, height, pos) {
    const baseW = img.naturalWidth;
    const baseH = baseHeight(img);
    const baseY = (img.naturalHeight - baseH) / 2;

    const targetRatio = height / width;
    if (targetRatio < baseH / baseW) {
      const h = baseW * targetRatio;
      return { x: 0, y: baseY + (baseH - h) * pos, w: baseW, h };
    }
    const w = baseH / targetRatio;
    return { x: (baseW - w) * pos, y: baseY, w, h: baseH };
  }

  function render(target, width, height, pulse = null) {
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const ctx = target.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    const src = sourceRect(state.image, width, height, Number(cropPos.value) / 100);
    ctx.drawImage(state.image, src.x, src.y, src.w, src.h, 0, 0, width, height);
    if (darkenBox.checked) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, width, height);
    }
    drawPlayButton(ctx, width, height, pulse);
    return target;
  }

  // --- Instellingen ---

  function selected(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  }

  const clampPx = (value) => Math.min(3840, Math.max(50, Math.round(value)));
  const autoHeight = (width) => Math.round(width * ASPECT);
  const isGif = () => selected('type') === 'image/gif';

  function currentSize() {
    const size = selected('size');
    let width;
    let height;
    if (size === 'custom') {
      width = clampPx(Number(customWidth.value) || 800);
      height = customHeight.value ? clampPx(Number(customHeight.value)) : null;
    } else {
      const [w, h] = size.split('x');
      width = Number(w);
      height = h === 'auto' ? null : Number(h);
    }
    return { width, height: height ?? autoHeight(width) };
  }

  function fileName(width, height) {
    const base = sanitizeName($('#filename').value) || 'Video_thumbnail_';
    return `${base}${width}x${height}.${extension(selected('type'))}`;
  }

  function previewHeight() {
    const { width, height } = currentSize();
    return Math.round((PREVIEW_WIDTH * height) / width);
  }

  // Laat de animatie live zien zolang GIF gekozen is en deze tab open staat.
  function animate(now) {
    if (!state.image || !isGif() || panel.hidden) {
      state.raf = null;
      return;
    }
    const t = now % CYCLE_MS;
    render(canvas, PREVIEW_WIDTH, previewHeight(), t < PULSE_MS ? t / PULSE_MS : null);
    state.raf = requestAnimationFrame(animate);
  }

  function updatePreview() {
    $('#button-size-value').textContent = `${sizeSlider.value}%`;
    customWrap.hidden = selected('size') !== 'custom';
    colorWrap.hidden = selected('style') !== 'custom';
    $('#gif-hint').hidden = !isGif();

    const { width, height } = currentSize();
    // Bijgesneden als de uitsnede smaller of lager is dan het bruikbare beeld.
    const src = state.image && sourceRect(state.image, width, height, 0);
    const fullWidth = src && src.w >= state.image.naturalWidth - 1;
    const cropped = Boolean(src) && (!fullWidth || src.h < baseHeight(state.image) - 1);
    cropWrap.hidden = !cropped;
    $('#crop-label').textContent = fullWidth ? 'Uitsnede (boven ↔ onder)' : 'Uitsnede (links ↔ rechts)';
    $('#size-info').textContent = `Resultaat: ${width} × ${height} px` + (cropped ? ' · bijgesneden, niet geplet' : '');
    $('#filename-info').textContent = `Wordt opgeslagen als: ${fileName(width, height)}`;

    if (!state.image || panel.hidden) return;
    if (isGif()) {
      if (!state.raf) state.raf = requestAnimationFrame(animate);
    } else {
      render(canvas, PREVIEW_WIDTH, previewHeight());
    }
  }

  // --- Export ---

  async function makeGif(width, height, onProgress) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // Alleen het gebied rond de knop beweegt; de overige frames bevatten alleen dat stuk.
    const reach = Math.ceil(buttonWidth(width, height) * 0.95);
    const x0 = Math.max(0, Math.floor(width / 2) - reach);
    const y0 = Math.max(0, Math.floor(height / 2) - reach);
    const x1 = Math.min(width, Math.ceil(width / 2) + reach);
    const y1 = Math.min(height, Math.ceil(height / 2) + reach);

    render(c, width, height);
    const frames = [{ x: 0, y: 0, w: width, h: height, delay: REST_DELAY_CS, data: ctx.getImageData(0, 0, width, height).data }];
    for (let i = 1; i < PULSE_FRAMES; i++) {
      render(c, width, height, i / PULSE_FRAMES);
      frames.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, delay: PULSE_DELAY_CS, data: ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data });
    }
    const bytes = await window.GifEncoder.encode(width, height, frames, onProgress);
    return new Blob([bytes], { type: 'image/gif' });
  }

  async function exportImage({ width, height }, label) {
    const type = selected('type');
    const name = fileName(width, height);
    let blob;
    if (type === 'image/gif') {
      blob = await makeGif(width, height, (done, total) => {
        setExportStatus(`${label}GIF maken… ${Math.round((done / total) * 100)}%`);
      });
    } else {
      blob = await canvasToBlob(render(document.createElement('canvas'), width, height), type, 0.92);
    }
    saveBlob(blob, name);
    return `${name} (${formatBytes(blob.size)})`;
  }

  async function runExport(sizes) {
    exportButtons.forEach((b) => (b.disabled = true));
    try {
      const done = [];
      for (const [i, size] of sizes.entries()) {
        const label = sizes.length > 1 ? `${i + 1}/${sizes.length} · ` : '';
        setExportStatus(`${label}Bezig…`);
        done.push(await exportImage(size, label));
        // Kleine pauze tussen downloads, anders blokkeren sommige browsers ze.
        if (sizes.length > 1) await new Promise((r) => setTimeout(r, 300));
      }
      setExportStatus(`Gedownload: ${done.join(', ')}`);
    } catch (err) {
      setExportStatus(`Er ging iets mis: ${err.message}`, true);
    } finally {
      exportButtons.forEach((b) => (b.disabled = false));
    }
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  function setExportStatus(text, isError = false) {
    exportStatus.textContent = text;
    exportStatus.classList.toggle('error', isError);
  }

  function showImage(img, letterboxed, message) {
    state.image = img;
    state.letterboxed = letterboxed;
    editor.hidden = false;
    setExportStatus('');
    updatePreview();
    setStatus(message);
  }

  // --- Gebeurtenissen ---

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const videoId = parseVideoId(urlInput.value);
    if (!videoId) {
      setStatus('Dit lijkt geen geldige videolink.', true);
      return;
    }
    setStatus('Thumbnail ophalen…');
    try {
      const img = await fetchThumbnail(videoId);
      state.videoId = videoId;
      showImage(img, true, `Thumbnail geladen (${img.naturalWidth} × ${img.naturalHeight} px).`);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  $('#thumb-upload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl);
    state.uploadUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(state.uploadUrl);
      state.videoId = null;
      urlInput.value = '';
      showImage(img, false, `Eigen afbeelding geladen: ${file.name} (${img.naturalWidth} × ${img.naturalHeight} px).`);
    } catch {
      setStatus(`Kan ${file.name} niet openen.`, true);
    }
  });

  editor.addEventListener('input', updatePreview);
  window.addEventListener('tabchange', updatePreview);
  $('#download').addEventListener('click', () => runExport([currentSize()]));
  $('#download-all').addEventListener('click', () => {
    runExport(PRESETS.map(([width, height]) => ({ width, height: height ?? autoHeight(width) })));
  });
})();
