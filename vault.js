// Cassian hardware showcase. Original project provenance: Crazaloth.
export function initializeVault({buttons, cards, status}) {
  const categories = new Set(['all', 'metal', 'british', 'clean']);
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      if (!categories.has(category)) return;
      let visible = 0;
      for (const card of cards) {
        card.hidden = category !== 'all' && card.dataset.category !== category;
        if (!card.hidden) visible++;
      }
      for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
      status.textContent = `${String(visible).padStart(2, '0')} / 15 HEADS · ${button.textContent.trim()}`;
    });
  }
}
if (typeof document !== 'undefined') {
  initializeVault({buttons: [...document.querySelectorAll('[data-filter]')],
    cards: [...document.querySelectorAll('[data-category]')], status: document.getElementById('vault-status')});
}
