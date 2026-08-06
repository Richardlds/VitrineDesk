import { escapeHtml, showSkeleton, hideSkeleton } from '../utils.js';

export function renderTestimonials(tenant) {
  try {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;

    let depoimentos = tenant.depoimentos;
    if (typeof depoimentos === 'string') {
      try { depoimentos = JSON.parse(depoimentos); } catch (e) { depoimentos = []; }
    }

    if (!depoimentos || depoimentos.length === 0) {
      document.getElementById('section-depoimentos')?.classList.add('section-hidden');
      return;
    }

    grid.innerHTML = depoimentos.map(dep => {
      const estrelas = dep.nota || dep.rating || 5;
      return `
        <article class="card quote reveal">
          <p class="quote__stars" aria-label="${estrelas} de 5 estrelas">${'★'.repeat(Math.round(estrelas))}${'☆'.repeat(5 - Math.round(estrelas))}</p>
          <blockquote>${escapeHtml(dep.texto || dep.text || '')}</blockquote>
          <footer class="quote__foot">
            <div style="width:40px;height:40px;border-radius:50%;background:color-mix(in oklab, var(--primary) 20%, transparent);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:bold;">${escapeHtml((dep.autor || dep.author || 'C')[0].toUpperCase())}</div>
            <div><strong>${escapeHtml(dep.autor || dep.author || 'Cliente')}</strong></div>
          </footer>
        </article>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Erro ao renderizar depoimentos:', e);
  }
}
