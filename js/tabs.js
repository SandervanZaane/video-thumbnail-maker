// Wisselen tussen de tools. De actieve tab staat in de URL (#thumbnail of
// #bijsnijden), zodat je direct naar een tool kunt linken.
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];

  function show() {
    const wanted = location.hash.slice(1);
    const active = tabs.some((tab) => tab.dataset.tab === wanted) ? wanted : tabs[0].dataset.tab;
    for (const tab of tabs) {
      const selected = tab.dataset.tab === active;
      tab.setAttribute('aria-selected', String(selected));
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    window.dispatchEvent(new Event('tabchange'));
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      history.replaceState(null, '', `#${tab.dataset.tab}`);
      show();
    });
  }
  window.addEventListener('hashchange', show);
  show();
})();
