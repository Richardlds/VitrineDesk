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
      const desc = service.descricao || service.description || '';

      service.category = cleanCategory;

      let imageHtml = '';
      if (showPhotos) {
        imageHtml = img 
          ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(nome)}" class="service__img" loading="lazy">`
          : `<div class="service__img--placeholder"><i data-lucide="scissors"></i></div>`;
      }

      return `
        <article class="card service service-card reveal" data-action="openBooking" data-service='${JSON.stringify(service).replace(/'/g, "&apos;")}' data-category="${escapeHtml(cleanCategory)}">
          ${showPhotos ? imageHtml : ''}
          <div class="service__body">
            <header class="service__head">
              <h3 class="truncate">${escapeHtml(nome)}</h3>
              <span class="chip chip--ghost"><i data-lucide="clock" class="icon-xs" style="width:12px;height:12px;"></i> ${duracao} min</span>
            </header>
            ${desc ? `<p class="muted truncate" style="max-height: 48px; white-space: normal; -webkit-line-clamp: 2; -webkit-box-orient: vertical; display: -webkit-box;">${escapeHtml(desc)}</p>` : ''}
            <footer class="service__foot">
              ${!hidePrices ? `<span class="price">${formatCurrency(preco)}</span>` : '<span></span>'}
              <button class="btn btn--primary btn--sm" type="button" style="pointer-events:none;">Agendar</button>
            </footer>
          </div>
        </article>
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
  let html = '<button class="chip chip--active" data-category="todos" type="button" role="tab" aria-selected="true">Todos</button>';

  categorias.forEach(cat => {
    html += `<button class="chip" data-category="${cat}" type="button" role="tab" aria-selected="false">${cat}</button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(b => {
        b.classList.remove('chip--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('chip--active');
      btn.setAttribute('aria-selected', 'true');
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
