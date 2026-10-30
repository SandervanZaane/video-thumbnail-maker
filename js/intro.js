// Korte openingsanimatie, zoals een app die opstart. Speelt één keer per
// bezoek: niet opnieuw na verversen binnen hetzelfde tabblad, en niet bij
// "minder beweging". Klikken of een toets indrukken slaat hem over.
(() => {
  let seen = false;
  try {
    seen = sessionStorage.getItem('intro-seen') === '1';
    sessionStorage.setItem('intro-seen', '1');
  } catch {
    // Geen opslag beschikbaar: dan speelt de animatie gewoon.
  }
  if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  root.classList.add('intro-play');
  const end = () => root.classList.remove('intro-play');

  window.addEventListener('DOMContentLoaded', () => {
    const intro = document.getElementById('intro');
    intro.addEventListener('animationend', (event) => {
      if (event.animationName === 'intro-done') end();
    });
    intro.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end, { once: true });
    setTimeout(end, 3500); // vangnet
  });
})();
