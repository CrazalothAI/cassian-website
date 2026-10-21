// Original Cassian gallery. Project provenance: Crazaloth.
import {ARTWORK, ARTWORK_SIZES} from './artwork.js';

export function createArtworkLoader(createImage = () => new Image()) {
  const cache = new Map();
  return function load(id, priority = 'low') {
    if (!Object.hasOwn(ARTWORK, id)) return Promise.reject(new Error('Unknown artwork.'));
    const previous = cache.get(id);
    if (previous) {
      if (priority === 'high') previous.image.fetchPriority = 'high';
      return previous.promise;
    }
    const image = createImage(), config = ARTWORK[id];
    image.decoding = 'async';
    image.fetchPriority = priority;
    image.sizes = ARTWORK_SIZES;
    image.srcset = config.srcset;
    image.src = config.src;
    let timeout;
    const entry = {image};
    entry.promise = Promise.race([
      image.decode(),
      new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('Artwork timeout.')), 15000);})
    ]).then(() => {
      if (!image.naturalWidth) throw new Error('Artwork unavailable.');
      return config;
    }).catch(error => {
      if (cache.get(id) === entry) cache.delete(id);
      throw error;
    }).finally(() => clearTimeout(timeout));
    cache.set(id, entry);
    return entry.promise;
  };
}

export function createGallery({tabs, panel, art, status, setDetails, load}) {
  let request = 0;
  async function choose(tab) {
    const id = tab.dataset.voice;
    if (!Object.hasOwn(ARTWORK, id)) return;
    const current = ++request;
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tab.id);
    panel.setAttribute('aria-busy', 'true');
    panel.classList.add('is-loading');
    panel.dataset.voice = id;
    setDetails(id);
    status.hidden = false;
    status.textContent = `Loading ${tab.dataset.name} artwork…`;
    try {
      const config = await load(id, 'high');
      if (current !== request) return;
      art.width = config.width;
      art.height = config.height;
      art.sizes = ARTWORK_SIZES;
      art.srcset = config.srcset;
      art.src = config.src;
      art.alt = `${tab.dataset.name} amplifier artwork`;
      await art.decode();
      if (current !== request) return;
      status.hidden = true;
      panel.classList.remove('is-loading');
      panel.setAttribute('aria-busy', 'false');
    } catch {
      if (current !== request) return;
      panel.setAttribute('aria-busy', 'false');
      status.textContent = `${tab.dataset.name} artwork is unavailable. Select this amp again to retry.`;
    }
  }
  for (const tab of tabs) {
    const prepare = () => {void load(tab.dataset.voice).catch(() => {});};
    tab.addEventListener('pointerenter', prepare);
    tab.addEventListener('focus', prepare);
    tab.addEventListener('click', () => {void choose(tab);});
    tab.addEventListener('keydown', event => {
      const i = tabs.indexOf(tab);
      let target;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = tabs[(i+1)%tabs.length];
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = tabs[(i+tabs.length-1)%tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs.at(-1);
      if (target) {event.preventDefault(); void choose(target); target.focus();}
    });
  }
  return {choose, prepare: () => Promise.allSettled(Object.keys(ARTWORK).map(id => load(id)))};
}

export function initializeGallery({tabs, panel, art, status, setDetails}) {
  if (!tabs.length) return;
  const gallery = createGallery({tabs, panel, art, status, setDetails, load:createArtworkLoader()});
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void gallery.prepare();
      }
    }, {rootMargin:'400px'});
    observer.observe(panel);
  }
}
