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

  extension(type) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[type];
  },
};
