import { supaFetch, formatCurrency, escapeHtml, showSkeleton, hideSkeleton } from '../utils.js';
import { hidePrices, selectedBranchId } from '../app.js';

let allServices = [];

export async function renderServices(tenant, openBookingModalCb) {
  try {
    const grid = document.getElementById('services-grid');
    if (!grid) return;

    const data = await supaFetch(
      `/rest/v1/services?tenant_id=eq.${tenant.id}&select=*`
    );

    let filteredServices = data || [];

    // Filtrar inativos (tratando null como ativo)
    filteredServices = filteredServices.filter(s => s.is_active !== false);

    // Filtrar pela filial selecionada (já que agora a escolha é na página principal)
    if (selectedBranchId) {
      filteredServices = filteredServices.filter(s => {
        if (!s.branch_ids || s.branch_ids.length === 0) return true; // se não tiver filiais configuradas, mostra em todas
        return s.branch_ids.includes(selectedBranchId);
      });

      // Aplicar preços customizados da filial
      filteredServices = filteredServices.map(s => {
        if (s.branch_prices && s.branch_prices[selectedBranchId] !== undefined && s.branch_prices[selectedBranchId] !== '') {
          s.price = parseFloat(s.branch_prices[selectedBranchId]);
          s.preco = s.price;
        }
        return s;
      });
    }

    allServices = filteredServices;

    if (allServices.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i data-lucide="scissors"></i></div><p class="empty-state-text">Nenhum serviço disponível no momento</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }


    grid.innerHTML = allServices.filter(s => !s.is_extra).map(service => {
      const nome = service.nome || service.name || 'Serviço';
      const preco = service.preco || service.price || 0;
      const duracao = service.duracao || service.duration || 30;
      const img = service.imagem_url || service.image_url || '';
      const categoryRaw = service.categoria || service.category || 'Outros';
      const showPhotos = !categoryRaw.includes('|NO_PHOTOS');
      const cleanCategory = categoryRaw.replace('|NO_PHOTOS', '');

      // Override the category string to be clean for filters and data attributes
      service.category = cleanCategory;

      let imageHtml = '';
      if (showPhotos) {
        imageHtml = img 
          ? `<img src="${escapeHtml(img)}" alt="" class="service-img" loading="lazy">`
          : `<div class="service-img-placeholder"><i data-lucide="scissors"></i></div>`;
      }

      // Set global window functions temporarily if needed by inline handlers, but better approach is attaching listeners.
      // Assuming openBookingModal is exposed globally or passed down.
      return `
        <div class="service-card reveal glass-card" data-action="openBooking" data-service='${JSON.stringify(service).replace(/'/g, "&apos;")}' data-category="${escapeHtml(cleanCategory)}">
          ${showPhotos ? `<div class="service-img-wrapper">${imageHtml}</div>` : ''}
          <div class="service-body p-3 flex flex-column gap-2" style="flex: 1; justify-content: space-between;">
            <div class="service-info flex flex-column gap-1">
              <span class="service-name text-md font-bold text-primary" style="line-height: 1.2;">${escapeHtml(nome)}</span>
              <span class="service-duration text-xs text-secondary flex align-center gap-1"><i data-lucide="clock" style="width:14px;height:14px;"></i> ${duracao} min</span>
            </div>
            <div class="service-footer flex justify-between align-center mt-2">
              ${!hidePrices ? `<span class="service-price text-lg font-bold">${formatCurrency(preco)}</span>` : '<span></span>'}
              <button class="btn border-none cursor-pointer flex align-center justify-center rounded-md" style="background: rgba(var(--primary-rgb), 0.15); color: var(--primary); padding: 6px 12px; font-weight: 600; font-size: 0.85rem;" title="Agendar">
                Agendar
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    renderServiceFilters();
    if (window.lucide) lucide.createIcons();

    // Quick book helper export
    return allServices;
  } catch (e) {
    console.error('Erro ao renderizar serviços:', e);
    return [];
  }
}

export function renderServiceFilters() {
  const container = document.getElementById('services-filters');
  if (!container) return;

  const categorias = new Set();
  allServices.filter(s => !s.is_extra).forEach(s => {
    let cat = s.categoria || s.category || 'Outros';
    cat = cat.replace('|NO_PHOTOS', '');
    if (cat) categorias.add(cat);
  });

  if (categorias.size === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  let html = '<button class="service-filter-btn active" data-category="todos">Todos</button>';

  categorias.forEach(cat => {
    html += `<button class="service-filter-btn" data-category="${cat}">${cat}</button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.service-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.service-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtrarServicos(btn.dataset.category);
    });
  });
}

function filtrarServicos(categoria) {
  const cards = document.querySelectorAll('.service-card');
  cards.forEach(card => {
    // eslint-disable-next-line no-useless-assignment
    let serviceData = {};
    try {
      serviceData = JSON.parse(card.dataset.service || '{}');
    } catch (e) {
      serviceData = {};
    }
    let serviceCat = serviceData.category || serviceData.categoria || 'Outros';
    serviceCat = serviceCat.replace('|NO_PHOTOS', '');
    
    if (categoria === 'todos' || serviceCat === categoria) {
      card.classList.remove('service-hidden');
    } else {
      card.classList.add('service-hidden');
    }
  });
}
