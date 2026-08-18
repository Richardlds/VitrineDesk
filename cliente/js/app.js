// Interceptador de logs para produção (Silencia console.log, warn e error se não estiver rodando localmente)
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  console.log = function () { };
  console.warn = function () { };
  console.error = function () { };
}

// Removido DEBUG global
import { checkMaintenanceMode, getSlugFromURL, supaFetch, showToast, showConfirm, formatCurrency, formatDate, formatTime, getDayName, hexToRgb, scrollToSection, escapeHtml } from './utils.js';
import { getLoggedClient, isLogged, initAuth, updateAuthUI } from './auth.js';
import { initAgendamentos, loadMyAppointments } from './agendamentos.js';
import { initBooking } from './booking.js';
import { initPlanos } from './planos.js';

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
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.classList.remove('hidden');
        appEl.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'flex-center';
        container.style.cssText = 'min-height:100vh;flex-direction:column;gap:16px;';

        const heading = document.createElement('h2');
        heading.style.cssText = 'color:var(--text-main); display:flex; align-items:center; gap:8px;';

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'x-circle');

        const textNode = document.createTextNode(` Loja "${slug}" não encontrada`);

        heading.appendChild(icon);
        heading.appendChild(textNode);

        const p = document.createElement('p');
        p.className = 'text-muted';
        p.textContent = 'Verifique o endereço e tente novamente.';

        container.appendChild(heading);
        container.appendChild(p);

        appEl.appendChild(container);
        if (window.lucide) window.lucide.createIcons();
      }
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
    injectDynamicManifest(tenant, slug);

    // Inicializar módulos
    initAuth();
    initBooking();
    initAgendamentos();
    initPlanos();
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

      const openDrawerBtn = e.target.closest('[data-open]');
      if (openDrawerBtn) {
        const targetId = openDrawerBtn.getAttribute('data-open');
        const drawer = document.getElementById(targetId);
        if (drawer) drawer.classList.add('active');
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
      } else if (action === 'openPrivacidade') {
        const modal = document.getElementById('modal-termos');
        const title = document.getElementById('modal-termos-title');
        const content = document.getElementById('termos-conteudo');
        if (modal && title && content) {
          title.textContent = 'Política de Privacidade e Cookies';
          content.innerHTML = `
            <p class="mb-3">Sua privacidade é importante para nós. Esta política explica como coletamos, usamos e protegemos suas informações pessoais.</p>
            <h4 class="mb-2 mt-4 text-primary">1. Coleta de Dados</h4>
            <p class="mb-3 text-sm">Coletamos informações que você fornece diretamente, como nome, e-mail e telefone ao criar uma conta ou agendamento.</p>
            <h4 class="mb-2 mt-4 text-primary">2. Uso de Cookies</h4>
            <p class="mb-3 text-sm">Utilizamos cookies e o armazenamento local do navegador para manter sua sessão (login) segura e lembrar das suas preferências de interface. Nós não vendemos seus dados para anunciantes de terceiros.</p>
            <h4 class="mb-2 mt-4 text-primary">3. Segurança e Direitos</h4>
            <p class="mb-3 text-sm">Todos os dados sensíveis são criptografados. Você tem o direito de solicitar a exclusão da sua conta e de todos os seus dados a qualquer momento entrando em contato diretamente com o estabelecimento.</p>
          `;
          modal.classList.add('active');
        }
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
    if (tenant.border_color) {
      s('--border', tenant.border_color);
      s('--border-glass', tenant.border_color);
    }

    s('--bg-dark', pers.bg_color || tenant.bg_color || '#0a0a0f');
    s('--text-main', pers.text_color || tenant.text_color || '#fafafa');
    s('--text-muted', pers.text_muted_color || tenant.text_muted_color || '#9ca3af');
    s('--text-btn', pers.text_btn_color || '#ffffff');
    s('--success', pers.success_color || '#10b981');
    s('--warning', pers.warning_color || '#f59e0b');
    s('--danger', pers.danger_color || '#ef4444');
    
    const cardBgColor = pers.card_bg_color || tenant.card_bg_color || (pers.card_style === 'glass' ? 'rgba(255,255,255,0.05)' : 'var(--bg-dark)');
    s('--card-bg', cardBgColor);
    s('--bg-card', cardBgColor);
    s('--glass', cardBgColor);

    const primaryGlow = tenant.accent_color || tenant.secondary_color || tenant.primary_color;
    if (primaryGlow) s('--primary-glow', primaryGlow);

    // Tema Claro / Escuro
    if (tenant.theme_mode === 'light') {
      s('--bg-dark', tenant.bg_color || '#ffffff');
      s('--text-main', tenant.text_color || '#1a1a1a');
      s('--card-bg', tenant.card_bg_color || (tenant.card_style === 'glass' ? 'color-mix(in srgb, var(--text-main) 5%, transparent)' : '#f9f9f9'));
      s('--bg-card', tenant.card_bg_color || (tenant.card_style === 'glass' ? 'color-mix(in srgb, var(--text-main) 5%, transparent)' : '#f9f9f9'));
      // Cor de texto secundário para melhor leitura no tema claro
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
        headerEl.style.background = 'color-mix(in srgb, var(--bg-dark) 70%, transparent)';
        headerEl.style.backdropFilter = 'blur(10px)';
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
      // color-mix calcula o glassmorphism dinamicamente a partir de --text-main
      root.style.setProperty('--card-bg', 'var(--bg-glass-5)');
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
        logoImg.style.display = 'block';
        logoImg.onerror = function () { this.style.display = 'none'; };
      } else {
        logoImg.style.display = 'none';
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
    const shopNameNav = document.getElementById('shop-name-nav');
    if (shopNameNav) {
      shopNameNav.textContent = tenant.name || '';
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

    // 🎪 BANNERS
    const bannersGrid = document.getElementById('banners-grid');
    const bannersSection = document.getElementById('section-banners');
    
    // Ler do formato de banners
    let banners = tenant.settings?.personalizacao?.banners || [];

    if (bannersGrid && banners.length > 0) {
      const validBanners = banners.filter(url => url && typeof url === 'string' && url.startsWith('http'));
      if (validBanners.length > 0) {
        bannersGrid.innerHTML = validBanners.map((url, i) => `
          <img src="${url}" alt="Banner ${i + 1}" loading="lazy" class="reveal">
        `).join('');
        if (bannersSection) bannersSection.classList.remove('section-hidden');
        
        // Autoplay e Controles do carrossel
        if (validBanners.length > 1) {
          const btnPrev = document.getElementById('banner-prev');
          const btnNext = document.getElementById('banner-next');
          const dotsContainer = document.getElementById('banner-dots');
          
          if (btnPrev) btnPrev.classList.remove('hidden');
          if (btnNext) btnNext.classList.remove('hidden');
          if (dotsContainer) {
            dotsContainer.classList.remove('hidden');
            dotsContainer.innerHTML = validBanners.map((_, i) => `<div class="banner-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
          }

          let currentIndex = 0;
          
          const updateScroll = (index) => {
            if (!bannersGrid) return;
            currentIndex = index;
            bannersGrid.scrollTo({
              left: bannersGrid.clientWidth * currentIndex,
              behavior: 'smooth'
            });
            if (dotsContainer) {
               Array.from(dotsContainer.children).forEach((dot, i) => {
                   dot.classList.toggle('active', i === currentIndex);
               });
            }
          };

          const nextSlide = () => updateScroll((currentIndex + 1) % validBanners.length);
          const prevSlide = () => updateScroll((currentIndex - 1 + validBanners.length) % validBanners.length);

          if (btnNext) btnNext.onclick = () => { clearInterval(window.bannersInterval); nextSlide(); };
          if (btnPrev) btnPrev.onclick = () => { clearInterval(window.bannersInterval); prevSlide(); };
          if (dotsContainer) {
             dotsContainer.onclick = (e) => {
                if (e.target.classList.contains('banner-dot')) {
                   clearInterval(window.bannersInterval);
                   updateScroll(parseInt(e.target.dataset.index));
                }
             };
          }

          // Escutar scroll manual para atualizar dots
          bannersGrid.addEventListener('scroll', () => {
             const index = Math.round(bannersGrid.scrollLeft / bannersGrid.clientWidth);
             if (index !== currentIndex) {
                 currentIndex = index;
                 if (dotsContainer) {
                     Array.from(dotsContainer.children).forEach((dot, i) => {
                         dot.classList.toggle('active', i === currentIndex);
                     });
                 }
             }
          }, { passive: true });

          if (window.bannersInterval) clearInterval(window.bannersInterval);
          window.bannersInterval = setInterval(nextSlide, 4500);
          
          // Pausar auto-play ao interagir
          bannersGrid.addEventListener('touchstart', () => clearInterval(window.bannersInterval), {passive: true});
          bannersGrid.addEventListener('mouseenter', () => clearInterval(window.bannersInterval), {passive: true});
        }
      } else {
        if (bannersSection) bannersSection.classList.add('section-hidden');
      }
    } else {
      if (bannersSection) bannersSection.classList.add('section-hidden');
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

    badge.className = `badge ${aberto ? 'badge--open' : 'badge--closed'}`;
    badge.innerHTML = `<span class="badge__dot" aria-hidden="true"></span> ${aberto ? 'Aberto agora' : 'Fechado'}`;
  } catch (e) {
    console.error('Erro ao atualizar badge de status:', e);
  }
}

// ────────────────────────── Manifest Dinâmico (PWA) ──────────────────────────

function injectDynamicManifest(tenant, slug) {
  try {
    const bg_color = tenant.settings?.personalizacao?.bg_color || tenant.bg_color || "#0a0a0f";
    const theme_color = tenant.primary_color || "#3B82F6";
    const logo = tenant.logo_url || "/assets/icon-192.png";
    
    const baseUrl = window.location.origin + window.location.pathname;
    
    const manifest = {
      id: `${baseUrl}?id=${slug}`,
      name: tenant.name || "VitrineDesk",
      short_name: tenant.name || "Vitrine",
      description: "Agendamento online",
      start_url: `${baseUrl}?slug=${slug}`,
      scope: baseUrl,
      display: "standalone",
      background_color: bg_color,
      theme_color: theme_color,
      icons: [
        {
          src: logo,
          sizes: "192x192",
          purpose: "any maskable"
        },
        {
          src: logo,
          sizes: "512x512",
          purpose: "any maskable"
        }
      ]
    };

    const stringManifest = JSON.stringify(manifest);
    const blob = new Blob([stringManifest], {type: 'application/json'});
    const manifestURL = URL.createObjectURL(blob);

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = manifestURL;
  } catch (e) {
    console.warn("Erro ao gerar manifest dinâmico:", e);
  }
}


// Módulos de renderização agora são importados de js/renders/

// ────────────────────────── WhatsApp ──────────────────────────

function configurarWhatsApp() {
  try {
    const btn = document.getElementById('whatsapp-float');
    if (!btn) return;

    const pers = (tenant.settings && tenant.settings.personalizacao) ? tenant.settings.personalizacao : (tenant.settings || {});

    if (pers.whatsapp_enabled === false) {
      btn.style.display = 'none';
      return;
    }

    // O numero do whatsapp fica na raiz do tenant
    if (!tenant.whatsapp) {
      btn.style.display = 'none';
      return;
    }

    const numero = tenant.whatsapp.replace(/\D/g, '');
    let url = `https://wa.me/55${numero}`;
    const msg = pers.whatsapp_message || 'Olá, gostaria de agendar um horário!';
    url += `?text=${encodeURIComponent(msg)}`;
    btn.href = url;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.style.display = 'grid';

    if (pers.whatsapp_color) {
      btn.style.backgroundColor = pers.whatsapp_color;
    }

    if (pers.whatsapp_size) {
      btn.style.width = pers.whatsapp_size + 'px';
      btn.style.height = pers.whatsapp_size + 'px';
    }

    if (pers.whatsapp_position === 'left') {
      btn.classList.add('pos-left');
    }

    if (pers.whatsapp_animation === 'bounce') {
      btn.classList.add('bounce');
    } else if (pers.whatsapp_animation === 'pulse') {
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
      banner.classList.add('hidden');
      return;
    }

    // Mostrar banner
    banner.classList.remove('hidden');

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

    window.addEventListener('scroll', throttle(() => {
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

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

// ────────────────────────── View Toggles (List / Grid) ──────────────────────────
function setupViewToggles() {
  const btnList = document.getElementById('btn-view-list');
  const btnGrid = document.getElementById('btn-view-grid');
  const servicesGrid = document.getElementById('services-grid');
  if (!btnList || !btnGrid || !servicesGrid) return;

  const currentView = localStorage.getItem('vitrinedesk_view_mode') || 'list';

  const setView = (mode) => {
    if (mode === 'grid') {
      servicesGrid.classList.remove('view-list');
      servicesGrid.classList.add('view-grid');
      btnGrid.classList.add('active');
      btnList.classList.remove('active');
    } else {
      servicesGrid.classList.remove('view-grid');
      servicesGrid.classList.add('view-list');
      btnList.classList.add('active');
      btnGrid.classList.remove('active');
    }
    localStorage.setItem('vitrinedesk_view_mode', mode);
  };

  setView(currentView);

  btnList.addEventListener('click', () => setView('list'));
  btnGrid.addEventListener('click', () => setView('grid'));
}

// ────────────────────────── Iniciar ao carregar ──────────────────────────// 🚀 Iniciar ao carregar 🚀
document.addEventListener('DOMContentLoaded', () => {
  setupViewToggles();
  initCookieConsent();
  init();
});

function initCookieConsent() {
  const banner = document.getElementById('cookie-banner');
  const btnAccept = document.getElementById('btn-accept-cookies');
  if (!banner || !btnAccept) return;

  const hasAccepted = localStorage.getItem('cookie_consent');
  if (!hasAccepted) {
    banner.style.display = 'block';
  }

  btnAccept.addEventListener('click', () => {
    localStorage.setItem('cookie_consent', 'true');
    banner.style.animation = 'slideDownFade 0.5s ease forwards';
    setTimeout(() => { banner.style.display = 'none'; }, 500);
  });
}
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
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('ServiceWorker registrado com sucesso:', registration.scope);
    }).catch(err => {
      console.log('Falha no registro do ServiceWorker:', err);
    });
  });
}

// ────────────────────────── Custom PWA Install Prompt ──────────────────────────
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Impede que o Chrome mostre o mini-infobar padrão
  e.preventDefault();
  // Guarda o evento para dispararmos quando o usuário clicar no nosso botão
  deferredPrompt = e;
  // Exibe o nosso banner customizado
  showCustomInstallBanner();
});

function showCustomInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'glass-card flex align-center justify-between gap-3';
  banner.style.cssText = 'position: fixed; bottom: 80px; left: 16px; right: 16px; z-index: 9999; padding: 12px 16px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-card); animation: slideUp 0.5s ease-out forwards; box-shadow: var(--shadow);';
  
  banner.innerHTML = `
    <div style="display:flex; align-items:center; gap: 12px;">
      <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); display: flex; align-items:center; justify-content:center;">
        <i data-lucide="download"></i>
      </div>
      <div>
        <h4 style="margin:0; font-size: 14px; font-weight: 600; color: var(--text-main);">Instalar Aplicativo</h4>
        <p style="margin:0; font-size: 12px; color: var(--text-muted);">Acesse mais rápido da tela inicial</p>
      </div>
    </div>
    <div style="display:flex; gap: 8px; align-items:center;">
      <button id="btn-pwa-dismiss" style="background:transparent; border:none; color: var(--text-muted); cursor:pointer; padding: 4px; display:flex; align-items:center; justify-content:center; border-radius: 50%;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
      <button id="btn-pwa-install" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; min-height: unset; border-radius: 8px; font-weight: bold;">Instalar</button>
    </div>
  `;
  
  document.body.appendChild(banner);
  if (window.lucide) window.lucide.createIcons({ root: banner });

  document.getElementById('btn-pwa-dismiss').addEventListener('click', () => {
    banner.style.display = 'none';
    deferredPrompt = null;
  });

  document.getElementById('btn-pwa-install').addEventListener('click', async () => {
    banner.style.display = 'none';
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User PWA install outcome:', outcome);
      deferredPrompt = null;
    }
  });
}

