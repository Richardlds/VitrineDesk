import { escapeHtml, showSkeleton, hideSkeleton } from '../utils.js';

export function renderTestimonials(tenant) {
  try {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;

    // Show skeleton loading
    showSkeleton('testimonials-grid', 'testimonials', 3);

    let depoimentos = tenant.depoimentos;
    if (typeof depoimentos === 'string') {
      try { depoimentos = JSON.parse(depoimentos); } catch (e) { depoimentos = []; }
    }

    // Remove skeleton loading
    hideSkeleton('testimonials-grid');

    if (!depoimentos || depoimentos.length === 0) {
      document.getElementById('section-depoimentos')?.classList.add('section-hidden');
      return;
    }

    grid.innerHTML = depoimentos.map(dep => {
      const estrelas = dep.nota || dep.rating || 5;
      return `
        <div class="testimonial-card reveal glass-card">
          <div class="testimonial-stars" style="display:flex; gap:2px; color:#fbbf24;">
            ${Array.from({ length: 5 }, (_, i) =>
        `<i data-lucide="star" style="width:16px; height:16px; opacity:${i < estrelas ? 1 : 0.2}" fill="${i < estrelas ? 'currentColor' : 'none'}"></i>`
      ).join('')}
          </div>
          <p class="testimonial-text">"${escapeHtml(dep.texto || dep.text || '')}"</p>
          <span class="testimonial-author">— ${escapeHtml(dep.autor || dep.author || 'Cliente')}</span>
        </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Erro ao renderizar depoimentos:', e);
  }
}
