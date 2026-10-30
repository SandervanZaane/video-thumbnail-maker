// Video Thumbnail Maker: haalt de thumbnail van een video op, tekent er een
// play-knop overheen en laat je het resultaat downloaden in verschillende maten.

const ASPECT = 9 / 16;
// Breedte × hoogte; hoogte null = automatisch (16:9).
// Van groot naar klein (op oppervlakte), in dezelfde volgorde als in de HTML.
const PRESETS = [[1280, 720], [648, null], [648, 250], [480, 270], [320, 180]];
const PREVIEW_WIDTH = 1280;
// Van hoogste naar laagste kwaliteit; maxres bestaat niet voor elke video.
const QUALITIES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

const $ = (sel) => document.querySelector(sel);
const form = $('#url-form');
const urlInput = $('#url');
const statusEl = $('#status');
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

const state = { image: null, videoId: null };

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

function drawPlayButton(ctx, w, h, style, sizePct) {
  if (style === 'none') return;
  const cx = w / 2;
  const cy = h / 2;
  // Bij brede, lage formaten (zoals 648 × 250) schaalt de knop mee met de hoogte.
  const bw = (Math.min(w, h / ASPECT) * sizePct) / 100;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = bw * 0.12;

  let triangleSize;
  let triangleColor;
  if (style === 'red') {
    const bh = bw * 0.7;
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.28);
    ctx.fill();
    triangleSize = bh * 0.42;
    triangleColor = '#ffffff';
  } else {
    const r = bw / 2;
    const colors = {
      circle: ['rgba(255, 255, 255, 0.95)', '#18181b'],
      custom: [colorCircle.value, colorTriangle.value],
      dark: ['rgba(0, 0, 0, 0.65)', '#ffffff'],
    }[style];
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (style === 'dark') {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
    }
    triangleSize = r * 0.75;
    triangleColor = colors[1];
  }

  // Gelijkzijdige driehoek, iets naar rechts zodat hij optisch gecentreerd staat.
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = triangleColor;
  const th = triangleSize;
  const tw = th * 0.866;
  const offset = tw * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 + offset, cy - th / 2);
  ctx.lineTo(cx + tw / 2 + offset, cy);
  ctx.lineTo(cx - tw / 2 + offset, cy + th / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

// Bepaalt welk deel van de bron getoond wordt. De afbeelding wordt nooit
// geplet: wijkt de verhouding af van 16:9, dan wordt er bijgesneden (zoals
// CSS object-fit: cover). `pos` (0–1) schuift de uitsnede langs de bijgesneden as.
function sourceRect(img, width, height, pos) {
  // sddefault/hqdefault hebben zwarte balken (4:3); snij die altijd weg.
  const baseW = img.naturalWidth;
  const baseH = Math.min(img.naturalHeight, baseW * ASPECT);
  const baseY = (img.naturalHeight - baseH) / 2;

  const targetRatio = height / width;
  if (targetRatio < ASPECT) {
    // Lager dan 16:9: stuk van boven/onder af.
    const h = baseW * targetRatio;
    return { x: 0, y: baseY + (baseH - h) * pos, w: baseW, h };
  }
  // Hoger dan 16:9: stuk van links/rechts af.
  const w = baseH / targetRatio;
  return { x: (baseW - w) * pos, y: baseY, w, h: baseH };
}

// Tekent thumbnail + play-knop op het opgegeven canvas.
function render(target, width, height) {
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  const src = sourceRect(state.image, width, height, Number(cropPos.value) / 100);
  ctx.drawImage(state.image, src.x, src.y, src.w, src.h, 0, 0, width, height);

  if (darkenBox.checked) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, width, height);
  }
  drawPlayButton(ctx, width, height, selected('style'), Number(sizeSlider.value));
  return target;
}

const clampPx = (value) => Math.min(3840, Math.max(50, Math.round(value)));
const autoHeight = (width) => Math.round(width * ASPECT);

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

function updatePreview() {
  $('#button-size-value').textContent = `${sizeSlider.value}%`;
  customWrap.hidden = selected('size') !== 'custom';
  colorWrap.hidden = selected('style') !== 'custom';

  const { width, height } = currentSize();
  const ratio = height / width;
  const cropped = Math.abs(ratio - ASPECT) > 0.005;
  cropWrap.hidden = !cropped;
  $('#crop-label').textContent = ratio < ASPECT ? 'Uitsnede (boven ↔ onder)' : 'Uitsnede (links ↔ rechts)';
  $('#size-info').textContent = `Resultaat: ${width} × ${height} px` +
    (cropped ? ' — afbeelding wordt bijgesneden, niet geplet' : '');

  $('#filename-info').textContent = `Wordt opgeslagen als: ${fileName(width, height)}`;

  // Voorbeeld in dezelfde verhouding als het eindresultaat.
  if (state.image) render(canvas, PREVIEW_WIDTH, Math.round(PREVIEW_WIDTH * ratio));
}

// Eigen naam + afmetingen, zodat "alle maten" elkaar niet overschrijven.
// Tekens die besturingssystemen niet toestaan in bestandsnamen worden weggelaten.
function fileName(width, height) {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[selected('type')];
  const base = $('#filename').value.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim() || 'Video_thumbnail_';
  return `${base}${width}x${height}.${ext}`;
}

function download({ width, height }) {
  const type = selected('type');
  const out = render(document.createElement('canvas'), width, height);
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(width, height);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, type, 0.92);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const videoId = parseVideoId(urlInput.value);
  if (!videoId) {
    setStatus('Dit lijkt geen geldige videolink.', true);
    return;
  }
  setStatus('Thumbnail ophalen…');
  try {
    state.image = await fetchThumbnail(videoId);
    state.videoId = videoId;
    editor.hidden = false;
    updatePreview();
    setStatus(`Thumbnail geladen (${state.image.naturalWidth} × ${state.image.naturalHeight} px).`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

editor.addEventListener('input', updatePreview);
$('#download').addEventListener('click', () => download(currentSize()));
$('#download-all').addEventListener('click', () => {
  // Kleine pauze tussen downloads, anders blokkeren sommige browsers ze.
  PRESETS.forEach(([width, height], i) => {
    setTimeout(() => download({ width, height: height ?? autoHeight(width) }), i * 300);
  });
});
