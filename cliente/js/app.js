// Interceptador de logs para produção (Silencia console.log, warn e error se não estiver rodando localmente)
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  console.log = function() {};
  console.warn = function() {};
  console.error = function() {};
}

// Removido DEBUG global
import { checkMaintenanceMode, getSlugFromURL, supaFetch, showToast, showConfirm, formatCurrency, formatDate, formatTime, getDayName, hexToRgb, scrollToSection, escapeHtml } from './utils.js';
import { getLoggedClient, isLogged, initAuth, updateAuthUI } from './auth.js';
import { initAgendamentos, loadMyAppointments } from './agendamentos.js';
import { initBooking } from './booking.js';

// Módulos de renderização
import { renderServices } from './renders/services.js';
import { renderTeam } from './renders/team.js';
import { renderGallery } from './renders/gallery.js';
import { renderTestimonials } from './renders/testimonials.js';
import { renderHours } from './renders/hours.js';
import { renderMap, renderSocial } from './renders/map.js';

// ────────────────────────── Estado Global ──────────────────────────
let tenant = null;
let allServices = [];
let allProfessionals = [];
export let currentTenantId = null;
export let hidePrices = false;
export let activeBranches = [];
export let selectedBranchId = null;

// Helper para exportar
export function getTenantId() {
  return currentTenantId;
}

// ────────────────────────── INIT ──────────────────────────

export async function init() {
  try {
    const slug = getSlugFromURL();
    if (!slug) {
      window.location.href = '../login.html';
      return;
    }

    // Mostrar loading
    document.getElementById('loading-screen')?.classList.remove('hidden');

    // Carregar dados do tenant e checar manutenção simultaneamente
    await Promise.all([
      checkMaintenanceMode(),
      loadTenant(slug)
    ]);

    // ✅ GARANTIR que o título da aba seja atualizado
    if (tenant?.settings?.title) {
      document.title = tenant.settings.title;
    } else if (tenant?.name) {
      document.title = tenant.name + ' - Agendamento Online';
    }

    if (!tenant) {
      document.getElementById('loading-screen')?.classList.add('hidden');
      document.getElementById('app')?.classList.remove('hidden');
      document.getElementById('app').innerHTML = `
        <div class="flex-center" style="min-height:100vh;flex-direction:column;gap:16px;">
          <h2 style="color:var(--text-main); display:flex; align-items:center; gap:8px;"><i data-lucide="x-circle"></i> Loja "${slug}" não encontrada</h2>
          <p class="text-muted">Verifique o endereço e tente novamente.</p>
        </div>
      `;
      return;
    }

    // Verificar se o plano está vencido
    const vencimento = tenant.settings?.vencimento;
    if (vencimento && new Date(vencimento) < new Date()) {
      document.getElementById('loading-screen')?.classList.add('hidden');
      document.getElementById('app')?.classList.remove('hidden');
      document.getElementById('app').innerHTML = `
        <div class="flex-center" style="min-height:100vh;flex-direction:column;gap:16px;text-align:center;">
          <h2 style="color:var(--text-main); display:flex; align-items:center; gap:8px;"><i data-lucide="alert-circle"></i> Loja Indisponível</h2>
          <p class="text-muted">A assinatura desta loja expirou.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Setar tenant ID e configs globais
    currentTenantId = tenant.id;
    hidePrices = tenant.hide_prices || tenant.settings?.hide_prices || false;

    // Aplicar TODAS as configurações visuais
    aplicarConfiguracoes();

    // Setup Branch Selector primeiro para que a filial padrão seja definida
    renderBranches();

    // Renderizar cada seção
    const [servicesData, professionalsData] = await Promise.all([
      renderServices(tenant),
      renderTeam(tenant)
    ]);
    allServices = servicesData;
    allProfessionals = professionalsData;
    renderGallery(tenant);
    renderTestimonials(tenant);
    renderHours(tenant);
    renderMap(tenant);
    renderSocial(tenant);
    updateStatusBadge();
    configurarWhatsApp();
    configurarBanner();
    updateHeader();

    // Inicializar módulos
    initAuth();
    initBooking();
    initAgendamentos();
    initBottomNav();
    initScrollReveal();

    // Event Delegation Global (Substitui onclick)
    document.body.addEventListener('click', async (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        if (e.target.id === 'auth-modal') {
          const { closeAuthModal } = await import('./auth.js');
          closeAuthModal();
        } else if (e.target.id === 'booking-modal') {
          const { closeBookingModal } = await import('./booking.js');
          closeBookingModal();
        } else {
          e.target.classList.remove('active');
        }
        return;
      }

      if (e.target.classList.contains('drawer-overlay')) {
        e.target.classList.remove('active');
        return;
      }

      const closeDrawerBtn = e.target.closest('[data-close-drawer]');
      if (closeDrawerBtn) {
        const drawer = closeDrawerBtn.closest('.drawer-overlay');
        if (drawer) drawer.classList.remove('active');
        return;
      }

      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      
      const action = actionEl.getAttribute('data-action');
      
      if (action === 'scrollTo') {
        e.preventDefault();
        scrollToSection(actionEl.getAttribute('data-target'));
      } else if (action === 'openAuth') {
        const { openAuthModal } = await import('./auth.js');
        openAuthModal(actionEl.getAttribute('data-tab'));
      } else if (action === 'openClientArea') {
        const { openClientAreaDrawer } = await import('./agendamentos.js');
        openClientAreaDrawer('tab-dados');
      } else if (action === 'openClientAreaAndTab') {
        const { openClientAreaDrawer } = await import('./agendamentos.js');
        openClientAreaDrawer(actionEl.getAttribute('data-target'));
      } else if (action === 'logout') {
        const { logoutCliente } = await import('./auth.js');
        logoutCliente();
      } else if (action === 'reloadPage') {
        location.reload();
      } else if (action === 'quickBook') {
        quickBook();
      } else if (action === 'openBooking') {
        const serviceData = actionEl.getAttribute('data-service');
        if (serviceData) {
          const service = JSON.parse(serviceData);
          const { openBookingModal } = await import('./booking.js');
          openBookingModal(service);
        }
      } else if (action === 'closeBooking') {
        const { closeBookingModal } = await import('./booking.js');
        closeBookingModal();
      } else if (action === 'selectProfessional') {
        const { selectProfessional } = await import('./booking.js');
        selectProfessional(actionEl.getAttribute('data-prof-id'));
      } else if (action === 'selectDate') {
        const { selectDate } = await import('./booking.js');
        selectDate(actionEl.getAttribute('data-date'));
      } else if (action === 'selectTime') {
        const { selectTime } = await import('./booking.js');
        selectTime(actionEl.getAttribute('data-time'));
      } else if (action === 'closeTermos') {
        const modal = document.getElementById('modal-termos');
        if (modal) modal.classList.remove('active');
      } else if (action === 'toggleServicesView') {
        const view = actionEl.getAttribute('data-view');
        const viewControls = document.getElementById('services-view-controls');
        const grid = document.getElementById('services-grid');
        if (viewControls && grid && view) {
          viewControls.setAttribute('data-active-view', view);
          grid.className = grid.className.replace(/\bview-[a-zA-Z0-9]+\b/g, '').trim();
          grid.classList.add(`view-${view}`);
          viewControls.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
          actionEl.classList.add('active');
        }
      }
    });

    // Event Delegation para eventos de 'change'
    document.body.addEventListener('change', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      
      const action = actionEl.getAttribute('data-action');
      if (action === 'toggleExtraService') {
        const { toggleExtraService } = await import('./booking.js');
        toggleExtraService(actionEl);
      }
    });

    // Esconder loading, mostrar app
    document.getElementById('loading-screen')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');

    // Verificar login existente
    if (isLogged()) {
      updateAuthUI(true);
    }

  } catch (e) {
    console.error('Detalhe técnico:', e);
    document.getElementById('loading-screen')?.classList.add('hidden');
    document.getElementById('app').innerHTML = `
      <div class="flex-center" style="min-height:100vh;flex-direction:column;gap:16px;">
        <h2 style="color:var(--text-main); display:flex; align-items:center; gap:8px;"><i data-lucide="alert-triangle"></i> Erro ao carregar</h2>
        <p class="text-muted">Erro inesperado. Tente novamente.</p>
        <button class="btn btn-primary" data-action="reloadPage">Tentar Novamente</button>
      </div>
    `;
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
  }
}

// ────────────────────────── Carregar Tenant ──────────────────────────

async function loadTenant(slug) {
  try {
    const data = await supaFetch(
      `/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=*`
    );

    if (data && data.length > 0) {
      tenant = data[0];

      // MERGE de personalizacao e social para a raiz (evita quebrar as verificações)
      if (tenant.settings?.personalizacao) {
        Object.assign(tenant, tenant.settings.personalizacao);
      }
      if (tenant.social) {
        Object.assign(tenant, tenant.social);
      }

      // Pegar as filiais
      try {
        const branchesData = await supaFetch(
          `/rest/v1/branches?tenant_id=eq.${tenant.id}&select=*&order=is_main.desc,name.asc`
        );
        activeBranches = branchesData || [];
      } catch (err) {
        console.warn('Erro ao carregar filiais:', err);
        activeBranches = [];
      }

      // 🔄 FORÇAR limpeza de cache antigo
      sessionStorage.removeItem('vp_tenant');
      
      try {
        sessionStorage.setItem('vp_tenant', JSON.stringify(tenant));
      } catch (e) {
        console.warn('Quota excedida no sessionStorage. Limpando imagens pesadas do cache de forma recursiva...', e);
        
        try {
            const slimTenant = JSON.parse(JSON.stringify(tenant));
            
            // Função recursiva ultra-agressiva para limpar qualquer string gigante (base64)
            const deepClearLargeStrings = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const key in obj) {
                    if (typeof obj[key] === 'string' && obj[key].length > 5000) {
                        obj[key] = ''; // Limpa a string pesada
                    } else if (typeof obj[key] === 'object') {
                        deepClearLargeStrings(obj[key]);
                    }
                }
            };

            deepClearLargeStrings(slimTenant);
            sessionStorage.setItem('vp_tenant', JSON.stringify(slimTenant));
        } catch (err) {
            console.error('Falha crítica ao salvar tenant no cache:', err);
            // Se falhar até com a versão leve, limpa tudo para evitar travamentos
            sessionStorage.clear();
        }
      }
    }
  } catch (e) {
    console.error('Erro ao carregar tenant:', e);
    throw e;
  }
}

// ────────────────────────── Aplicar Configurações ──────────────────────────

async function checkSupabase() {
  try {
    await supaFetch('/rest/v1/tenants?limit=1');
    return true;
  } catch (e) {
    console.error('Supabase inacessível:', e);
    showToast('Erro: Supabase inacessível. Verifique a conexão.', 'error');
    return false;
  }
}

function aplicarConfiguracoes() {
  try {
    const root = document.documentElement;
    const s = (prop, val) => { if (val) root.style.setProperty(prop, val); };

    // ✅ VERIFICAR se tenant está carregado
    if (!tenant) {
      console.warn('Tenant não carregado para aplicar configurações');
      return;
    }
    
    // Atualiza flag de preços
    hidePrices = tenant.settings?.personalizacao?.hide_prices || false;

    // Efeitos Globais
    const pers = tenant.settings?.personalizacao || {};
    root.setAttribute('data-glass-intensity', pers.glass_intensity || 'none');
    root.setAttribute('data-hover-animation', pers.hover_animation || 'none');

    // Favicon
    if (tenant.favicon_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
      }
      link.href = tenant.favicon_url;
    }

    // Cores Globais
    if (tenant.primary_color) {
      s('--primary', tenant.primary_color);
      s('--primary-rgb', hexToRgb(tenant.primary_color));
    }
    if (tenant.secondary_color) {
      s('--secondary', tenant.secondary_color);
      s('--secondary-rgb', hexToRgb(tenant.secondary_color));
    }
    if (tenant.accent_color) s('--accent', tenant.accent_color);
    if (tenant.border_color) s('--border', tenant.border_color);
    
    s('--bg-dark', pers.bg_color || tenant.bg_color || '#0a0a0f');
    s('--text-main', pers.text_color || tenant.text_color || '#fafafa');
    s('--text-muted', pers.text_muted_color || tenant.text_muted_color || '#9ca3af');
    s('--card-bg', pers.card_bg_color || tenant.card_bg_color || (pers.card_style === 'glass' ? 'rgba(255,255,255,0.05)' : 'var(--bg-dark)'));
    s('--bg-card', pers.card_bg_color || tenant.card_bg_color || (pers.card_style === 'glass' ? 'rgba(255,255,255,0.05)' : 'var(--bg-dark)'));
    
    // Tema Claro / Escuro
    if (tenant.theme_mode === 'light') {
      s('--bg-dark', tenant.bg_color || '#ffffff');
      s('--text-main', tenant.text_color || '#1a1a1a');
      s('--card-bg', tenant.card_bg_color || (tenant.card_style === 'glass' ? 'rgba(0,0,0,0.05)' : '#f9f9f9'));
      s('--bg-card', tenant.card_bg_color || (tenant.card_style === 'glass' ? 'rgba(0,0,0,0.05)' : '#f9f9f9'));
      // Forçar cor de texto secundário para melhor leitura no tema claro se não houver cor personalizada
      if (!tenant.text_muted_color) {
        s('--text-muted', 'rgba(0,0,0,0.6)');
      }
    }

    // Fontes e Tipografia
    if (tenant.font_family) {
      // Remover link anterior se houver
      const oldLink = document.getElementById('dynamic-font');
      if (oldLink) oldLink.remove();

      const fontName = tenant.font_family.charAt(0).toUpperCase() + tenant.font_family.slice(1);
      const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(' ', '+')}:wght@300;400;500;600;700;800&display=swap`;
      
      const link = document.createElement('link');
      link.id = 'dynamic-font';
      link.rel = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);

      const font = `'${fontName}', sans-serif`;
      s('--font-body', font);
      s('--font-title', font);
    }
    
    if (tenant.font_size) {
      s('font-size', tenant.font_size);
      s('--base-font-size', tenant.font_size);
    }
    
    if (pers.logo_size) {
      s('--logo-size', pers.logo_size);
    }
    if (pers.logo_format !== undefined) {
      s('--logo-format', pers.logo_format);
    }
    s('--header-bg', pers.topbar_bg_color || tenant.header_color || tenant.settings?.topbar?.bg_color || 'var(--bg-dark)');
    s('--header-text', pers.topbar_text_color || 'var(--text-main)');
    s('--footer-bg', pers.footer_color || tenant.settings?.footer?.color || 'var(--bg-dark)');
    s('--footer-text', pers.footer_text_color || 'var(--text-main)');

    // Top Bar Customizações Especiais
    const headerEl = document.querySelector('header');
    if (headerEl) {
      if (pers.topbar_sticky) {
        headerEl.style.position = 'sticky';
        headerEl.style.top = '0';
        headerEl.style.zIndex = '1000';
      }
      if (pers.topbar_glass_effect) {
        headerEl.style.background = 'rgba(10, 10, 15, 0.7)';
        headerEl.style.backdropFilter = 'blur(10px)';
        if (tenant.theme_mode === 'light') {
          headerEl.style.background = 'rgba(255, 255, 255, 0.8)';
        }
      }
      if (pers.topbar_logo_position === 'center') {
        const topbarContainer = headerEl.querySelector('.container.flex-between');
        if (topbarContainer) {
          topbarContainer.style.justifyContent = 'center';
          // Se tiver botões laterais, o ideal é usar grid, mas center funciona para testes base.
        }
      }
    }

    // Tipografia
    const loadGoogleFont = (fontFamily) => {
      if (!fontFamily || fontFamily === 'Inter') return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@300;400;500;600;700;800&display=swap`;
      document.head.appendChild(link);
    };

    const fontToUse = tenant.font_family || tenant.settings?.font_family;
    if (fontToUse) {
      loadGoogleFont(fontToUse);
      document.documentElement.style.setProperty('--font-display', `"${fontToUse}", sans-serif`);
    }

    // Tipografia (Fonte Global)
    if (pers.font_family) {
      const fontStr = `"${pers.font_family}", sans-serif`;
      root.style.setProperty('--font-body', fontStr);
      root.style.setProperty('--font-title', fontStr);
    }

    // Tamanho Base da Fonte
    if (pers.font_size || tenant.font_size) {
      document.documentElement.style.fontSize = pers.font_size || tenant.font_size;
    }

    // Estilo dos Cartões (Card Style / Border Radius)
    let bRadius = '12px';
    if (pers.button_style === 'square') bRadius = '0px';
    if (pers.button_style === 'pill') bRadius = '24px';
    if (pers.button_style === 'rounded') bRadius = '12px';
    // Compatibilidade com tenant antigo
    if (!pers.button_style && pers.card_style === 'square') bRadius = '0px';
    if (!pers.button_style && pers.card_style === 'pill') bRadius = '24px';
    if (pers.border_radius !== undefined && pers.border_radius !== null) {
      bRadius = pers.border_radius + 'px';
    }
    s('--radius', bRadius);

    if (pers.shadow_size !== undefined && pers.shadow_size !== null) {
      const sz = parseInt(pers.shadow_size);
      s('--shadow', `0 ${sz}px ${sz * 2.5}px rgba(0,0,0,0.25)`);
    }
    if (pers.spacing || tenant.spacing) {
      const spacingMap = { compact: '40px', normal: '60px', spacious: '80px' };
      s('--spacing-section', spacingMap[pers.spacing || tenant.spacing] || '60px');
    }

    // Logo
    if (pers.logo_size) s('--logo-size', pers.logo_size);
    if (pers.cover_height) s('--cover-height', pers.cover_height + 'px');

    // Card style (efeitos do card)
    if (pers.card_style === 'glass') {
      root.style.setProperty('--card-bg', 'rgba(255,255,255,0.05)');
      root.setAttribute('data-glass-intensity', 'medium');
    } else if (pers.card_style === 'flat') {
      s('--shadow', 'none');
      s('--border', 'var(--border)'); // mantem a borda
    } else {
      // smooth
      s('--shadow', '0 8px 32px rgba(0,0,0,0.1)');
    }

    // Título da página
    if (tenant.settings?.title) {
      document.title = tenant.settings.title;
    } else if (tenant.name) {
      document.title = tenant.name + ' - Agendamento Online';
    } else {
      document.title = 'Vitrine';
    }

    // Removido duplicações de favicon, logo e nome (tratados em updateHeader)

    // Seções ocultas
    const vis = tenant.settings?.visibilidade || {};
    if (tenant.hide_equipe || vis.hide_equipe) document.getElementById('section-equipe')?.classList.add('section-hidden');
    if (tenant.hide_depoimentos || vis.hide_depoimentos) document.getElementById('section-depoimentos')?.classList.add('section-hidden');
    if (tenant.hide_galeria || vis.hide_galeria) document.getElementById('section-galeria')?.classList.add('section-hidden');
    if (tenant.hide_mapa || vis.hide_mapa) document.getElementById('section-info')?.classList.add('section-hidden');
    if (tenant.settings?.hide_horarios || vis.hide_horarios) document.getElementById('section-horarios')?.classList.add('section-hidden');
    if (tenant.hide_prices || vis.hide_prices) document.body.classList.add('hide-prices');
    if (tenant.compact_mode) {
      root.style.setProperty('--spacing-section', '40px');
    }

  } catch (e) {
    console.error('Erro ao aplicar configurações:', e);
  }
}


function updateHeader() {
  try {
    // 🖼️ LOGO
    const logoImg = document.getElementById('logo-img');
    if (logoImg) {
      if (tenant.logo_url) {
        logoImg.src = tenant.logo_url;
        logoImg.alt = tenant.name || 'Logo';
        logoImg.classList.remove('hidden');
        logoImg.onerror = function () { this.classList.add('hidden'); };
      } else {
        logoImg.classList.add('hidden');
      }
    }

    // Capa/Banner da loja
    const coverImg = document.getElementById('cover-img');
    const coverDiv = document.getElementById('store-cover');
    const heroWrapper = document.querySelector('.hero-wrapper');
    if (coverImg && tenant.cover_url) {
      coverImg.src = tenant.cover_url;
      if (coverDiv) coverDiv.style.display = 'block';
      if (heroWrapper) heroWrapper.classList.remove('no-banner');
    } else if (coverDiv) {
      coverDiv.style.display = 'none';
      if (heroWrapper) heroWrapper.classList.add('no-banner');
    }



    // 🏪 NOME DA LOJA
    const shopName = document.getElementById('shop-name');
    if (shopName) {
      shopName.textContent = tenant.name || '';
    }

    // 🏷️ NOME NO FOOTER E COPYRIGHT
    const footerLogo = document.getElementById('footer-logo-text');
    if (footerLogo) {
      footerLogo.textContent = tenant.name || '';
    }
    const footerTextEl = document.querySelector('.footer-copyright');
    if (footerTextEl) {
      if (tenant.footer_text) {
        footerTextEl.textContent = tenant.footer_text;
      } else {
        const year = new Date().getFullYear();
        footerTextEl.textContent = `© ${year} ${tenant.name || 'VitrineDesk'} - Todos os direitos reservados`;
      }
    }

    // 🌐 FAVICON
    if (tenant.favicon_url) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        link.type = 'image/x-icon';
        document.head.appendChild(link);
      }
      link.href = tenant.favicon_url;
    }

    // 📸 GALERIA
    const galleryGrid = document.getElementById('gallery-grid');
    const gallerySection = document.getElementById('section-galeria');
    if (galleryGrid && tenant.galeria && tenant.galeria.length > 0) {
      const validImages = tenant.galeria.filter(url => url && url.startsWith('http'));
      if (validImages.length > 0) {
        galleryGrid.innerHTML = validImages.slice(0, 8).map((url, i) => `
          <div class="gallery-item reveal">
            <img src="${url}" alt="Galeria ${i + 1}" loading="lazy" onerror="this.parentElement.style.display='none'">
          </div>
        `).join('');
        if (gallerySection) gallerySection.classList.remove('section-hidden');
      }
    } else {
      if (gallerySection) gallerySection.classList.add('section-hidden');
    }

    // 📱 REDES SOCIAIS
    const socialsContainer = document.getElementById('header-socials');
    if (socialsContainer && tenant.social) {
      let social = tenant.social;
      if (typeof social === 'string') {
        try { social = JSON.parse(social); } catch (e) { social = {}; }
      }
      let html = '';
      if (social.instagram) {
        html += `<a href="https://instagram.com/${social.instagram}" target="_blank" rel="noopener" class="social-link" title="Instagram"><i data-lucide="instagram"></i></a>`;
      }
      if (social.facebook) {
        html += `<a href="${social.facebook}" target="_blank" rel="noopener" class="social-link" title="Facebook"><i data-lucide="facebook"></i></a>`;
      }
      if (social.tiktok) {
        html += `<a href="${social.tiktok}" target="_blank" rel="noopener" class="social-link" title="TikTok"><i data-lucide="music-2"></i></a>`;
      }
      if (social.youtube) {
        html += `<a href="${social.youtube}" target="_blank" rel="noopener" class="social-link" title="YouTube"><i data-lucide="youtube"></i></a>`;
      }
      socialsContainer.innerHTML = html;
      if (html) socialsContainer.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    }

  } catch (e) {
    console.error('❌ Erro ao atualizar header:', e);
  }
}

// ────────────────────────── Status Badge ──────────────────────────

function updateStatusBadge() {
  try {
    const badge = document.getElementById('status-badge');
    if (!badge) return;

    const settings = tenant.settings || {};
    const horarios = settings.horarios || settings.hours || {};

    const agora = new Date();
    const diaSemana = agora.getDay();
    const horaAtual = agora.getHours() * 60 + agora.getMinutes();

    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaKey = dias[diaSemana];
    const config = horarios[diaKey];

    let aberto = false;

    if (config && !config.fechado) {
      const [aH, aM] = (config.abertura || '08:00').split(':').map(Number);
      const [fH, fM] = (config.fechamento || '18:00').split(':').map(Number);
      const abertura = aH * 60 + aM;
      const fechamento = fH * 60 + fM;
      aberto = horaAtual >= abertura && horaAtual < fechamento;
    }

    badge.className = `shop-status-badge ${aberto ? 'status-open' : 'status-closed'}`;
    badge.innerHTML = `<span class="status-dot"></span> ${aberto ? 'Aberto agora' : 'Fechado'}`;
  } catch (e) {
    console.error('Erro ao atualizar status:', e);
  }
}

// Módulos de renderização agora são importados de js/renders/

// ────────────────────────── WhatsApp ──────────────────────────

function configurarWhatsApp() {
  try {
    const btn = document.getElementById('whatsapp-float');
    if (!btn) return;

    if (tenant.whatsapp_enabled === false) {
      btn.style.display = 'none';
      return;
    }

    if (!tenant.whatsapp) {
      btn.style.display = 'none';
      return;
    }

    const numero = tenant.whatsapp.replace(/\D/g, '');
    let url = `https://wa.me/55${numero}`;
    const msg = tenant.whatsapp_message || 'Olá, gostaria de agendar um horário!';
    url += `?text=${encodeURIComponent(msg)}`;
    btn.href = url;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.style.display = 'flex';

    if (tenant.whatsapp_color) {
      btn.style.backgroundColor = tenant.whatsapp_color;
    }

    if (tenant.whatsapp_size) {
      btn.style.width = tenant.whatsapp_size + 'px';
      btn.style.height = tenant.whatsapp_size + 'px';
    }

    if (tenant.whatsapp_position === 'left') {
      btn.classList.add('pos-left');
    }

    if (tenant.whatsapp_animation === 'bounce') {
      btn.classList.add('bounce');
    } else if (tenant.whatsapp_animation === 'pulse') {
      btn.classList.add('pulse-anim');
    }
  } catch (e) {
    console.error('Erro ao configurar WhatsApp:', e);
  }
}

// ────────────────────────── Banner ──────────────────────────

function configurarBanner() {
  try {
    const banner = document.getElementById('banner-promo');
    if (!banner) return;

    // Acessar a nova configuração via settings.promo_bar
    const promoActive = tenant.settings?.promo_bar?.active === true;
    const promoText = tenant.settings?.promo_bar?.text || tenant.banner_text;

    if (!promoActive || !promoText || !promoText.trim()) {
      banner.style.display = 'none';
      return;
    }

    // Mostrar banner
    banner.style.display = 'block';

    // Cor de fundo
    const bgColor = tenant.settings?.promo_bar?.bg_color || tenant.banner_color;
    if (bgColor) {
      banner.style.background = bgColor;
    }

    // Cor do texto e Texto
    const textCol = tenant.settings?.promo_bar?.text_color || tenant.banner_text_color;
    const textEl = document.getElementById('banner-promo-text');
    if (textEl) {
      textEl.textContent = promoText;
      if (textCol) {
        textEl.style.color = textCol;
      }
    }
  } catch (e) {
    console.error('Erro ao configurar banner:', e);
  }
}

// ────────────────────────── Scroll Reveal ──────────────────────────

function initScrollReveal() {
  try {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal:not(.visible)').forEach(el => observer.observe(el));
  } catch (e) {
    console.error('Erro no scroll reveal:', e);
  }
}

// ────────────────────────── Navegação Inferior ──────────────────────────

function initBottomNav() {
  try {
    const navItems = document.querySelectorAll('.mobile-nav-item');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const target = item.dataset.target;

        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        if (target) {
          scrollToSection(target);
        }
      });
    });

    const sections = document.querySelectorAll('.section[id]');
    const topbarHeight = document.querySelector('.topbar')?.offsetHeight || 70;

    window.addEventListener('scroll', debounce(() => {
      let current = '';
      
      sections.forEach(section => {
        const top = section.getBoundingClientRect().top;
        if (top < topbarHeight + 150) {
          current = section.id;
        }
      });
      
      // Se estiver no topo (current vazio) ou em uma seção sem botão na navbar (ex: filiais, capa), 
      // força 'section-servicos' como padrão para manter o ícone colorido
      if (!current || current === 'section-filiais' || current === 'section-info' || current === 'section-social' || current === 'section-galeria' || current === 'section-depoimentos') {
        current = 'section-servicos';
      }

      navItems.forEach(item => {
        if (item.dataset.target) {
          item.classList.toggle('active', item.dataset.target === current);
        }
      });
    }, 100));

    // Disparar uma vez para inicializar o estado correto do navbar
    setTimeout(() => window.dispatchEvent(new Event('scroll')), 500);

  } catch (e) {
    console.error('Erro na nav inferior:', e);
  }
}

// ────────────────────────── Quick Booking ──────────────────────────

async function quickBook() {
  try {
    if (allServices.length > 0) {
      const { openBookingModal } = await import('./booking.js');
      openBookingModal(allServices[0]);
    } else {
      scrollToSection('section-servicos');
    }
  } catch (e) {
    console.error('Erro no quick book:', e);
  }
}

// ────────────────────────── Helper: debounce ──────────────────────────

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ────────────────────────── Iniciar ao carregar ──────────────────────────// 🚀 Iniciar ao carregar 🚀
document.addEventListener('DOMContentLoaded', init);

export function getBranchById(branchId) {
  if (!activeBranches) return null;
  const b = activeBranches.find(x => x.id === branchId);
  return b || null;
}

export function renderBranches() {
  const branches = activeBranches || [];
  const section = document.getElementById('section-filiais');
  const grid = document.getElementById('branches-grid');
  
  if (!section || !grid) return;

  if (branches.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Se há apenas 1 filial (a matriz), seleciona ela automaticamente
  if (branches.length === 1) {
    section.classList.add('hidden');
    selectedBranchId = branches[0].id;
    return;
  }

  // Define a default se não houver (matriz)
  if (!selectedBranchId) {
    const matriz = branches.find(b => b.is_main) || branches[0];
    selectedBranchId = matriz.id;
  }

  grid.innerHTML = branches.map(b => {
    const isSelected = b.id === selectedBranchId;
    return `
      <div class="service-card reveal glass-card branch-card ${isSelected ? 'selected' : ''}" data-id="${b.id}" style="cursor:pointer; border: ${isSelected ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.05)'};">
        <div class="service-img-wrapper" style="height: 140px;">
          ${b.image_url 
            ? `<img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.name)}" class="service-img" loading="lazy">` 
            : `<div class="service-img-placeholder"><i data-lucide="map-pin"></i></div>`
          }
        </div>
        <div class="service-card-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
             <h3 class="service-card-title">${escapeHtml(b.name)}</h3>
             ${b.is_main ? `<span class="badge" style="background:var(--primary); color:white; font-size:10px;">Matriz</span>` : ''}
          </div>
          ${b.description ? `<p class="service-card-desc" style="margin-bottom:8px;">${escapeHtml(b.description)}</p>` : ''}
          ${b.address ? `<p style="font-size: 0.8rem; color: var(--text-muted); display:flex; gap:4px; align-items:center;"><i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHtml(b.address)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();

  // Adicionar eventos de clique nos cards
  document.querySelectorAll('.branch-card').forEach(card => {
    card.addEventListener('click', async () => {
      const newId = card.getAttribute('data-id');
      if (newId === selectedBranchId) return; // already selected
      
      selectedBranchId = newId;
      
      // Update visual selection
      document.querySelectorAll('.branch-card').forEach(c => {
        c.classList.remove('selected');
        c.style.border = '1px solid rgba(255,255,255,0.05)';
      });
      card.classList.add('selected');
      card.style.border = '2px solid var(--primary)';

      // Re-render Services and Team based on the newly selected branch
      const tenantStr = sessionStorage.getItem('vp_tenant');
      if (tenantStr) {
        const tenant = JSON.parse(tenantStr);
        await renderServices(tenant);
        await renderTeam(tenant);
        initScrollReveal();
      }
    });
  });
}



// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/cliente/sw.js').then(registration => {
      console.log('ServiceWorker registrado com sucesso:', registration.scope);
    }).catch(err => {
      console.log('Falha no registro do ServiceWorker:', err);
    });
  });
}

