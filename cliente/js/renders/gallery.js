import { showSkeleton, hideSkeleton } from '../utils.js';

export function renderGallery(tenant) {
  try {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    let galeria = tenant.galeria;
    if (typeof galeria === 'string') {
      try { galeria = JSON.parse(galeria); } catch (e) { galeria = []; }
    }

    if (!galeria || galeria.length === 0) {
      document.getElementById('section-galeria')?.classList.add('section-hidden');
      return;
    }

    grid.innerHTML = galeria.slice(0, 6).map((img, i) => {
      const url = typeof img === 'string' ? img : img.url || img.src || '';
      return `<img src="${url}" alt="Galeria ${i + 1}" loading="lazy" class="reveal">`;
    }).join('');
  } catch (e) {
    console.error('Erro ao renderizar galeria:', e);
  }
}
