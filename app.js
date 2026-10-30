// YouTube Thumbnail Maker: haalt de thumbnail van een video op, tekent er een
// play-knop overheen en laat je het resultaat downloaden in verschillende maten.

const ASPECT = 9 / 16;
const PRESET_WIDTHS = [1280, 640, 480, 320];
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

const state = { image: null, videoId: null };

// Haalt het video-ID uit alle gangbare YouTube-linkvormen, of accepteert een kaal ID.
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
      // YouTube geeft een grijze placeholder van 120x90 terug als een kwaliteit ontbreekt.
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
  const bw = (w * sizePct) / 100;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = bw * 0.12;

  let triangleSize;
  let triangleColor;
  if (style === 'youtube') {
    const bh = bw * 0.7;
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.28);
    ctx.fill();
    triangleSize = bh * 0.42;
    triangleColor = '#ffffff';
  } else {
    const r = bw / 2;
    ctx.fillStyle = style === 'circle' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.65)';
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
    triangleColor = style === 'circle' ? '#18181b' : '#ffffff';
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

// Tekent thumbnail + play-knop op het opgegeven canvas, uitgesneden naar 16:9.
function render(target, width) {
  const height = Math.round(width * ASPECT);
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  const img = state.image;
  // sddefault/hqdefault hebben zwarte balken (4:3); snij die weg.
  const srcH = Math.min(img.naturalHeight, img.naturalWidth * ASPECT);
  const srcY = (img.naturalHeight - srcH) / 2;
  ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, width, height);

  if (darkenBox.checked) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, width, height);
  }
  drawPlayButton(ctx, width, height, selected('style'), Number(sizeSlider.value));
  return target;
}

function currentWidth() {
  const size = selected('size');
  if (size !== 'custom') return Number(size);
  const w = Math.round(Number(customWidth.value));
  return Math.min(3840, Math.max(50, w || 800));
}

function updatePreview() {
  $('#button-size-value').textContent = `${sizeSlider.value}%`;
  const custom = selected('size') === 'custom';
  customWrap.hidden = !custom;
  if (custom) $('#custom-height').textContent = `× ${Math.round(currentWidth() * ASPECT)} px`;
  if (state.image) render(canvas, 1280);
}

function download(width) {
  const type = selected('type');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type];
  const out = render(document.createElement('canvas'), width);
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thumbnail-${state.videoId}-${out.width}x${out.height}.${ext}`;
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
    setStatus('Dit lijkt geen geldige YouTube-link.', true);
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
$('#download').addEventListener('click', () => download(currentWidth()));
$('#download-all').addEventListener('click', () => {
  // Kleine pauze tussen downloads, anders blokkeren sommige browsers ze.
  PRESET_WIDTHS.forEach((w, i) => setTimeout(() => download(w), i * 300));
});
