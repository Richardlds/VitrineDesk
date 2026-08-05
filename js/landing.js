// Inicialização direta, pois o script está no fim do <body>
const initLanding = () => {
  // 1. NAVBAR SCROLL EFFECT
  const header = document.querySelector('.header-main');
  
  const handleScroll = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check

  // 2. MOBILE MENU TOGGLE
  const btnMenu = document.getElementById('btn-menu-toggle');
  const navMobile = document.getElementById('nav-mobile');
  const mobileLinks = navMobile?.querySelectorAll('a');

  if (btnMenu && navMobile) {
    const toggleMenu = () => {
      const isOpen = navMobile.classList.contains('active');
      navMobile.classList.toggle('active');
      btnMenu.setAttribute('aria-expanded', !isOpen);
      
      // Update Lucide icon if available
      const icon = btnMenu.querySelector('i');
      if (icon && window.lucide) {
        icon.setAttribute('data-lucide', isOpen ? 'menu' : 'x');
        lucide.createIcons({ nodes: [icon] });
      }
    };

    btnMenu.addEventListener('click', toggleMenu);

    // Close on link click
    if (mobileLinks) {
      mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
          if (navMobile.classList.contains('active')) toggleMenu();
        });
      });
    }
  }

  // 3. SCROLL REVEAL ANIMATIONS (Intersection Observer)
  const revealElements = document.querySelectorAll('.reveal-up');
  
  if ('IntersectionObserver' in window && revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target); // Animate only once
        }
      });
    }, {
      root: null,
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback if no observer support
    revealElements.forEach(el => el.classList.add('is-visible'));
  }

  // 4. SMOOTH SCROLL FOR IN-PAGE LINKS
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#' && href.startsWith('#')) {
        const targetEl = document.querySelector(href);
        if (targetEl) {
          e.preventDefault();
          // Offset for sticky header
          const offset = 80;
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;
  
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }
    });
  });

};

// Executa a inicialização
// Executa a inicialização
initLanding();
fetchPlans();

// =============================================================================
// PRICING LOGIC & SUPABASE FETCH
// =============================================================================

// Global toggle logic for Monthly/Annual
window.togglePricing = function(mode) {
  const btnMonthly = document.getElementById('btn-monthly');
  const btnAnnual = document.getElementById('btn-annual');
  const indicator = document.getElementById('pricing-indicator');
  const priceValues = document.querySelectorAll('.price-val');
  
  if (!btnMonthly || !btnAnnual || !indicator) return;

  if (mode === 'monthly') {
    btnMonthly.setAttribute('aria-pressed', 'true');
    btnAnnual.setAttribute('aria-pressed', 'false');
    indicator.style.transform = 'translateX(0)';
    indicator.style.width = `${btnMonthly.offsetWidth}px`;
    
    priceValues.forEach(el => {
      el.textContent = el.dataset.monthly;
    });
  } else {
    btnAnnual.setAttribute('aria-pressed', 'true');
    btnMonthly.setAttribute('aria-pressed', 'false');
    indicator.style.transform = `translateX(${btnMonthly.offsetWidth}px)`;
    indicator.style.width = `${btnAnnual.offsetWidth}px`;
    
    priceValues.forEach(el => {
      el.textContent = el.dataset.annual;
    });
  }
};

// Initialize indicator width on load
window.addEventListener('load', () => {
  const btnMonthly = document.getElementById('btn-monthly');
  const indicator = document.getElementById('pricing-indicator');
  if (btnMonthly && indicator) {
    indicator.style.width = `${btnMonthly.offsetWidth}px`;
  }
});

async function fetchPlans() {
  const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU';

  if (!window.supabase) {
    console.error('Supabase library not found on window!');
    const grid = document.getElementById('pricing-grid-dynamic');
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--danger);">Erro: Biblioteca Supabase não carregada.</div>';
    return;
  }

  try {
    // Desabilitamos a persistência de sessão para evitar crash de Tracking Prevention
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    const { data: plans, error } = await supabaseClient
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) throw error;

    const grid = document.getElementById('pricing-grid-dynamic');
    if (!grid) return;

    if (!plans || plans.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Nenhum plano disponível no momento.</div>';
      return;
    }

    let html = '';
    plans.forEach((plan, index) => {
      const feats = plan.features || {};
      const priceMonthly = plan.price || 0;

      // Usa o preço anual salvo ou calcula fallback de -20%
      let priceAnnual = feats.price_annual;
      if (priceAnnual === undefined || priceAnnual === null) {
        priceAnnual = Math.round(priceMonthly * 0.8);
      }

      const isPremium = plan.is_default || index === 1;
      const delayClass = `delay-${(index + 1) * 100}`;
      let featuresHtml = '';

      // Benefícios customizados cadastrados no painel God
      if (plan.benefits) {
        // Tenta quebrar por \n (escapado) ou quebra de linha real
        const sep = plan.benefits.includes('\\n') ? '\\n' : '\n';
        plan.benefits.split(sep).filter(b => b.trim() !== '').forEach(ben => {
          let icon = 'check-circle-2';
          let text = ben.trim();
          
          // Suporta o formato "icone|Texto" ou "icone:Texto"
          if (text.includes('|')) {
            const parts = text.split('|');
            icon = parts[0].trim();
            text = parts.slice(1).join('|').trim();
          } else if (text.includes(':')) {
            const parts = text.split(':');
            icon = parts[0].trim();
            text = parts.slice(1).join(':').trim();
          }

          featuresHtml += `<li><i data-lucide="${icon}" style="color: var(--accent-primary)"></i> <strong>${text}</strong></li>`;
        });
      }

      const limits = feats.limits || {};

      if (limits.max_employees !== undefined && limits.max_employees >= 0) {
        const val = limits.max_employees;
        featuresHtml += `<li><i data-lucide="users"></i> ${val === 1 ? '1 Profissional' : 'Até ' + val + ' Profissionais'}</li>`;
      }

      if (limits.max_services !== undefined && limits.max_services >= 0) {
        const val = limits.max_services;
        featuresHtml += `<li><i data-lucide="scissors"></i> ${val === 1 ? '1 Serviço' : 'Até ' + val + ' Serviços'}</li>`;
      }

      if (limits.max_clients !== undefined && limits.max_clients >= 0) {
        featuresHtml += `<li><i data-lucide="contact"></i> Até ${limits.max_clients} Clientes</li>`;
      }

      if (feats.app_agendamento === true) {
        featuresHtml += `<li><i data-lucide="smartphone"></i> App de Agendamento</li>`;
      } else {
        featuresHtml += `<li class="disabled"><i data-lucide="minus"></i> App de Agendamento</li>`;
      }

      if (feats.financeiro === true) {
        featuresHtml += `<li><i data-lucide="pie-chart"></i> Gestão Financeira</li>`;
      } else {
        featuresHtml += `<li class="disabled"><i data-lucide="minus"></i> Gestão Financeira</li>`;
      }

      html += `
        <article class="plan-card ${isPremium ? 'featured' : ''} is-visible ${delayClass}">
          ${isPremium ? '<div class="plan-badge-top">Recomendado</div>' : ''}
          <div class="plan-header">
            <h3 class="plan-name">${plan.name}</h3>
            <p class="plan-desc">${plan.description || 'Para elevar seu negócio.'}</p>
          </div>
          <div class="plan-price-wrapper">
            <span class="plan-currency">R$</span>
            <span class="plan-price price-val" data-monthly="${priceMonthly}" data-annual="${priceAnnual}">${priceMonthly}</span>
            <div class="plan-period">/mês · cobrado mensalmente</div>
          </div>
          <ul class="plan-features-list">
            ${featuresHtml}
          </ul>
          <a href="/login.html?register=true&plan_id=${plan.id}" class="btn ${isPremium ? 'btn-primary' : 'btn-outline'} btn-full">
            ${isPremium ? 'Assinar ' + plan.name : 'Iniciar Agora'}
          </a>
        </article>
      `;
    });

    grid.innerHTML = html;
    
    // Re-initialize Lucide icons for dynamically added content
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Apply current toggle state
    const btnAnnual = document.getElementById('btn-annual');
    const isAnnual = btnAnnual && btnAnnual.getAttribute('aria-pressed') === 'true';
    if (typeof window.togglePricing === 'function') {
      window.togglePricing(isAnnual ? 'annual' : 'monthly');
    }

  } catch (err) {
    console.error('[fetchPlans] Erro ao buscar planos:', err);
    const grid = document.getElementById('pricing-grid-dynamic');
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 2rem;">
        Erro ao carregar planos: ${err.message || err.toString()}<br>
        <span style="font-size: 0.8rem; color: var(--text-muted)">Por favor, verifique se a API do Supabase está acessível.</span>
      </div>`;
    }
  }
}
