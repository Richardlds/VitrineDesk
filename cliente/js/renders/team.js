import { supaFetch, escapeHtml, showSkeleton, hideSkeleton } from '../utils.js';
import { selectedBranchId } from '../app.js';

export async function renderTeam(tenant) {
  try {
    const grid = document.getElementById('team-grid');
    if (!grid) return;

    const data = await supaFetch(
      `/rest/v1/profissionais?tenant_id=eq.${tenant.id}&select=*&order=nome.asc`
    );

    let allProfessionals = data || [];
    
    // Filtrar inativos (tratando null como ativo)
    allProfessionals = allProfessionals.filter(p => p.ativo !== false);

    // Filtrar pela filial selecionada na página principal
    if (selectedBranchId) {
      allProfessionals = allProfessionals.filter(p => {
        if (!p.branch_ids || p.branch_ids.length === 0) return true;
        return p.branch_ids.includes(selectedBranchId);
      });
    }

    if (allProfessionals.length === 0) {
      document.getElementById('section-equipe')?.classList.add('section-hidden');
      return allProfessionals;
    }

    grid.innerHTML = allProfessionals.map(prof => `
      <article class="card member reveal">
        ${prof.foto_url
        ? `<img src="${escapeHtml(prof.foto_url)}" alt="${escapeHtml(prof.nome)}" class="member__avatar" loading="lazy">`
        : `<div class="member__avatar" style="display:flex; align-items:center; justify-content:center; background:color-mix(in oklab, var(--primary) 20%, transparent); color:var(--primary);"><i data-lucide="user"></i></div>`
      }
        <h3>${escapeHtml(prof.nome || 'Profissional')}</h3>
        <p class="muted">${escapeHtml(prof.cargo || prof.especialidade || '')}</p>
        <span class="chip chip--ghost">5,0 ★</span>
      </article>
    `).join('');
    if (window.lucide) lucide.createIcons();
    return allProfessionals;
  } catch (e) {
    console.error('Erro ao renderizar equipe:', e);
    return [];
  }
}
