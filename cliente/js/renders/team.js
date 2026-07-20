import { supaFetch, escapeHtml, showSkeleton, hideSkeleton } from '../utils.js';
import { selectedBranchId } from '../app.js';

export async function renderTeam(tenant) {
  try {
    const grid = document.getElementById('team-grid');
    if (!grid) return;

    // Show skeleton loading
    showSkeleton('team-grid', 'team', 3);

    const data = await supaFetch(
      `/rest/v1/profissionais?tenant_id=eq.${tenant.id}&select=*&order=nome.asc`
    );

    let allProfessionals = data || [];
    
    // Filtrar inativos (tratando null como ativo)
    allProfessionals = allProfessionals.filter(p => p.ativo !== false);

    // Remove skeleton loading
    hideSkeleton('team-grid');

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
      <div class="team-card reveal glass-card">
        ${prof.foto_url
        ? `<img src="${escapeHtml(prof.foto_url)}" alt="${escapeHtml(prof.nome)}" class="team-avatar" loading="lazy">`
        : `<div class="team-avatar-placeholder"><i data-lucide="user"></i></div>`
      }
        <h4 class="team-name">${escapeHtml(prof.nome || 'Profissional')}</h4>
        <p class="team-role">${escapeHtml(prof.cargo || prof.especialidade || '')}</p>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
    return allProfessionals;
  } catch (e) {
    console.error('Erro ao renderizar equipe:', e);
    return [];
  }
}
