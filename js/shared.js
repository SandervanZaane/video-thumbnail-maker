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

  extension(type) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[type];
  },
};
