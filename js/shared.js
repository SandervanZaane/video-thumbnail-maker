// Gedeelde hulpfuncties. Bestanden worden alleen lokaal gemaakt en via een
// tijdelijke blob-URL gedownload; er wordt niets verstuurd.
window.Beeld = {
  saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  },

  formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },

  // Laat tekens weg die besturingssystemen niet toestaan in bestandsnamen.
  sanitizeName(name) {
    return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim();
  },

  // Geeft de browser even ruimte om de pagina bij te werken tijdens zwaar werk.
  nextTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  },

  // De grootst mogelijke uitsnede in verhouding w:h uit een afbeelding van
  // iw × ih, gedeeld door de zoom, rond middelpunt (fx, fy) in 0–1. Blijft altijd
  // binnen de afbeelding: nooit pletten, nooit lege randen.
  coverRect(iw, ih, w, h, zoom, fx, fy) {
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    let cw = iw;
    let ch = ih;
    if (iw / ih > w / h) cw = (ih * w) / h;
    else ch = (iw * h) / w;
    cw /= zoom;
    ch /= zoom;
    return {
      x: clamp(fx * iw - cw / 2, 0, iw - cw),
      y: clamp(fy * ih - ch / 2, 0, ih - ch),
      w: cw,
      h: ch,
    };
  },

  // Opent een afbeeldingsbestand van je eigen apparaat. Lukt dat niet via een
  // blob-URL, dan volgt een tweede poging via een data-URL. Mislukt alles, dan
  // geeft de fout een begrijpelijke reden. Geeft { img, url } terug; url is de
  // blob-URL die later vrijgegeven moet worden (of null).
  async loadImageFile(file) {
    const open = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    if (!file.size) throw new Error(`${file.name} is leeg (0 bytes)`);
    let head;
    try {
      head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    } catch {
      throw new Error(`${file.name} kan niet worden gelezen (staat het bestand misschien alleen in de cloud, zoals OneDrive of iCloud?)`);
    }

    const url = URL.createObjectURL(file);
    try {
      return { img: await open(url), url };
    } catch {
      URL.revokeObjectURL(url);
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { img: await open(dataUrl), url: null };
    } catch {
      // val door naar de foutmelding
    }

    // Kijk naar de eerste bytes om te zien wat het bestand werkelijk is.
    const ascii = String.fromCharCode(...head);
    const kind =
      head[0] === 0xff && head[1] === 0xd8 ? 'JPG' :
      ascii.startsWith('\x89PNG') ? 'PNG' :
      ascii.startsWith('GIF8') ? 'GIF' :
      ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP' ? 'WebP' :
      /ftyp(heic|heix|mif1|msf1|hevc)/.test(ascii) ? 'HEIC' :
      /ftypavif/.test(ascii) ? 'AVIF' :
      /^\s*</.test(ascii) ? 'HTML' : null;
    if (kind === 'HEIC') throw new Error(`${file.name} is een HEIC-foto (iPhone-formaat) die je browser niet kan openen; sla hem op als JPG en probeer opnieuw`);
    if (kind === 'HTML') throw new Error(`${file.name} is geen afbeelding maar een webpagina (misschien een mislukte download)`);
    const ext = (file.name.split('.').pop() || '').toUpperCase().replace('JPEG', 'JPG');
    if (kind && kind !== ext) throw new Error(`${file.name} is eigenlijk een ${kind}-bestand, en dat kan je browser niet openen`);
    throw new Error(`${file.name} is beschadigd of onvolledig (${window.Beeld.formatBytes(file.size)})`);
  },

  extension(type) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[type];
  },
};
