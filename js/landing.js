document.addEventListener('DOMContentLoaded', () => {

  // 1. NAVBAR SHOW/HIDE & SHRINK ON SCROLL
  let lastScrollTop = 0;
  const navbar = document.getElementById('navbar');
  const logo = navbar ? navbar.querySelector('.logo') : null;

  window.addEventListener('scroll', () => {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (navbar) {
      // Shrink effect & shadow
      if (scrollTop > 50) {
        navbar.style.padding = '8px 0';
        navbar.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
        navbar.style.background = 'rgba(9, 9, 11, 0.9)';
        if (logo) logo.style.fontSize = '20px';
      } else {
        navbar.style.padding = '16px 0';
        navbar.style.boxShadow = 'none';
        navbar.style.background = 'rgba(9, 9, 11, 0.75)';
        if (logo) logo.style.fontSize = '24px';
      }

      // Hide on scroll down, show on scroll up
      if (scrollTop > lastScrollTop && scrollTop > 150) {
        navbar.style.transform = 'translateY(-100%)';
      } else {
        navbar.style.transform = 'translateY(0)';
      }
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  });

  // 2. MOBILE HAMBURGER MENU TOGGLE (Fullscreen)
  const hamburger = document.getElementById('hamburger-toggle');
  const navLinksList = document.getElementById('nav-links');

  if (hamburger && navLinksList) {
    hamburger.addEventListener('click', () => {
      const expanded = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', !expanded);
      hamburger.classList.toggle('active');
      navLinksList.classList.toggle('open');
    });

    // Close mobile menu when clicking a link
    const links = navLinksList.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', () => {
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.classList.remove('active');
        navLinksList.classList.remove('open');
      });
    });
  }

  // 3. HERO PARTICLES ANIMATION
  const particleContainer = document.getElementById('hero-particles');
  if (particleContainer) {
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.classList.add('particle');
      const size = Math.random() * 50 + 15; // Size between 15px and 65px
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 8 + 's';
      p.style.animationDuration = (Math.random() * 12 + 12) + 's';
      particleContainer.appendChild(p);
    }

    // Parallax mouse effect for particles
    window.addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      const particles = particleContainer.querySelectorAll('.particle');
      particles.forEach((p, idx) => {
        const factor = (idx % 3 + 1) * 10;
        p.style.transform = `translate(${(x - 0.5) * factor}px, ${(y - 0.5) * factor}px)`;
      });
    });
  }

  // 4. SPOTLIGHT HOVER & MAGNETIC EFFECT (SUBSTITUI O TILT 3D)
  const tiltCards = document.querySelectorAll('.card-tilt');
  tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Magnetic subtle scale
      card.style.transform = `scale(1.02)`;
      
      // Spotlight dynamic shine glow gradient overlay
      card.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(99, 102, 241, 0.12) 0%, rgba(30, 30, 35, 0.6) 50%, rgba(15, 15, 20, 0.4) 100%)`;
      card.style.borderColor = `rgba(99, 102, 241, 0.4)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'scale(1)';
      card.style.background = 'linear-gradient(180deg, rgba(30, 30, 35, 0.6) 0%, rgba(15, 15, 20, 0.4) 100%)';
      card.style.borderColor = 'rgba(255, 255, 255, 0.05)';
    });
  });

  // 10. CUSTOM BLUR-REVEAL OBSERVER (SUBSTITUTO DO AOS)
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window && revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          observer.unobserve(entry.target); // Anima apenas 1 vez (once: true)
        }
      });
    }, {
      root: null,
      threshold: 0.15,
      rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: se não suportar, revela tudo imediatamente
    revealElements.forEach(el => el.classList.add('reveal-visible'));
  }

  // 5. FAQ ACCORDION CLICK EVENT
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const content = item.querySelector('.faq-content');

    if (trigger && content) {
      trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Close all FAQ items
        faqItems.forEach(innerItem => {
          innerItem.classList.remove('active');
          const innerTrigger = innerItem.querySelector('.faq-trigger');
          const innerContent = innerItem.querySelector('.faq-content');
          if (innerTrigger) innerTrigger.setAttribute('aria-expanded', 'false');
          if (innerContent) innerContent.style.maxHeight = '0px';
        });

        // If not active, open clicked item and smooth scroll to it
        if (!isActive) {
          item.classList.add('active');
          trigger.setAttribute('aria-expanded', 'true');
          content.style.maxHeight = content.scrollHeight + 'px';
          setTimeout(() => {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 150);
        }
      });
    }
  });

  // 6. SCROLL OBSERVER PARA OS CONTADORES (Counters)
  const counterElements = document.querySelectorAll('.counter-number');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
        }
      });
    }, { threshold: 0.1 });

    counterElements.forEach(el => observer.observe(el));
  } else {
    // Fallback if IntersectionObserver is not supported
    counterElements.forEach(counter => animateCounter(counter));
  }

  // 7. NUMBER COUNTER ANIMATION FOR PLANS
  function animateCounter(counter) {
    if (counter.classList.contains('counted')) return;
    counter.classList.add('counted');
    
    const target = +counter.getAttribute('data-target');
    const duration = 2000; // 2 seconds duration
    const stepTime = 20; // ms
    const steps = duration / stepTime;
    const stepVal = target / steps;
    
    let current = 0;
    const timer = setInterval(() => {
      current += stepVal;
      if (current >= target) {
        counter.textContent = target;
        clearInterval(timer);
      } else {
        counter.textContent = Math.floor(current);
      }
    }, stepTime);
  }

  // 8. SMOOTH SCROLL FOR LINKS
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    if(anchor.classList.contains('btn-open-contact')) return; // Ignore modal triggers
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        const targetEl = document.querySelector(href);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // 9. MODAL DE CONTATO E SUPABASE
  const contactModal = document.getElementById('contact-modal');
  const btnCloseContact = document.getElementById('btn-close-contact');
  const contactForm = document.getElementById('contact-form');
  const contactToast = document.getElementById('contact-toast');

  // Supabase Config for Landing Page
  const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU';
  
  let supabaseClient = null;
  if(window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  document.querySelectorAll('.btn-open-contact').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if(contactModal) {
        contactModal.style.display = 'flex';
      }
    });
  });

  if(btnCloseContact) {
    btnCloseContact.addEventListener('click', () => {
      contactModal.style.display = 'none';
    });
  }

  // Close on outside click
  window.addEventListener('click', (e) => {
    if(e.target === contactModal) {
      contactModal.style.display = 'none';
    }
  });

  if(contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btnSubmit = document.getElementById('btn-submit-contact');
      const originalText = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<i data-lucide="loader" class="animate-spin mr-2"></i> Enviando...';
      btnSubmit.disabled = true;

      const payload = {
        name: document.getElementById('contact-name').value,
        email: document.getElementById('contact-email').value,
        whatsapp: document.getElementById('contact-whatsapp').value,
        message: document.getElementById('contact-message').value,
        status: 'unread'
      };

      try {
        if(!supabaseClient) throw new Error('Supabase client não carregado.');
        
        const { error } = await supabaseClient.from('site_contacts').insert([payload]);
        if(error) throw error;

        contactForm.reset();
        
        contactToast.textContent = 'Mensagem enviada com sucesso! Entraremos em contato em breve.';
        contactToast.className = 'text-center mt-3 text-sm py-2 rounded-md font-medium bg-success-light text-success fade-in';
        
        setTimeout(() => {
          contactToast.classList.add('d-none');
          contactModal.style.display = 'none';
        }, 3000);

      } catch(err) {
        console.error('Erro ao enviar contato:', err);
        contactToast.textContent = 'Erro ao enviar. Tente novamente mais tarde.';
        contactToast.className = 'text-center mt-3 text-sm py-2 rounded-md font-medium bg-danger-light text-danger fade-in';
      } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
        if(window.lucide) window.lucide.createIcons();
      }
    });
  }

  // Chama fetchPlans imediatamente ao carregar o módulo
  fetchPlans();
});

// =============================================================================
// PLANS: Carrega e renderiza os planos dinâmicos do Supabase na landing page.
// Separado do DOMContentLoaded para poder ser reutilizado se necessário.
// =============================================================================
async function fetchPlans() {
    const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU';

    if (!window.supabase) return;
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
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
            const delay = index * 0.1;
            let featuresHtml = '';

            // Benefícios customizados cadastrados no painel God
            if (plan.benefits) {
                plan.benefits.split('\n').filter(b => b.trim() !== '').forEach(ben => {
                    featuresHtml += `<li><i data-lucide="check"></i> <span class="fw-bold">${ben.trim()}</span></li>`;
                });
            }

            const limits = feats.limits || {};

            // Convenção: max_employees >= 0 significa limitado; caso contrário, ilimitado
            if (limits.max_employees !== undefined && limits.max_employees >= 0) {
                const val = limits.max_employees;
                featuresHtml += `<li><i data-lucide="check"></i> ${val === 1 ? '1 Profissional' : 'Até ' + val + ' Profissionais'}</li>`;
            } else {
                featuresHtml += `<li><i data-lucide="infinity" class="text-accent"></i> <span class="fw-bold text-accent">Equipe Ilimitada</span></li>`;
            }

            if (limits.max_services !== undefined && limits.max_services >= 0) {
                const val = limits.max_services;
                featuresHtml += `<li><i data-lucide="check"></i> ${val === 1 ? '1 Serviço' : 'Até ' + val + ' Serviços'}</li>`;
            } else {
                featuresHtml += `<li><i data-lucide="infinity" class="text-accent"></i> <span class="fw-bold text-accent">Serviços Ilimitados</span></li>`;
            }

            if (limits.max_clients !== undefined && limits.max_clients >= 0) {
                featuresHtml += `<li><i data-lucide="check"></i> Até ${limits.max_clients} Clientes</li>`;
            } else {
                featuresHtml += `<li><i data-lucide="infinity" class="text-accent"></i> <span class="fw-bold text-accent">Clientes Ilimitados</span></li>`;
            }

            if (feats.app_agendamento === true) {
                featuresHtml += `<li><i data-lucide="check"></i> App de Agendamento</li>`;
            } else {
                featuresHtml += `<li class="dim"><i data-lucide="minus"></i> App de Agendamento</li>`;
            }

            if (feats.financeiro === true) {
                featuresHtml += `<li><i data-lucide="check"></i> Gestão Financeira</li>`;
            } else {
                featuresHtml += `<li class="dim"><i data-lucide="minus"></i> Gestão Financeira</li>`;
            }

            html += `
                <article class="plan-card ${isPremium ? 'featured' : ''} reveal" style="transition-delay: ${delay}s; opacity: 1; transform: translateY(0);">
                    ${isPremium ? '<div class="plan-badge">Recomendado</div>' : ''}
                    <div class="plan-name">${plan.name}</div>
                    <div class="plan-desc">${plan.description || 'Para elevar seu negócio.'}</div>
                    <div class="plan-price">
                        <span class="currency">R$</span><span class="price-val" data-monthly="${priceMonthly}" data-annual="${priceAnnual}">${priceMonthly}</span>
                    </div>
                    <div class="plan-period">/mês · cobrado mensalmente</div>
                    <div class="plan-sep"></div>
                    <ul class="plan-features">
                        ${featuresHtml}
                    </ul>
                    <a href="/login.html?register=true&plan_id=${plan.id}" class="btn ${isPremium ? 'btn-primary' : 'btn-outline'} btn-full">
                        ${isPremium ? 'Assinar ' + plan.name : 'Iniciar Agora'}
                    </a>
                </article>
            `;
        });

        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // Aplica o estado atual do toggle (Mensal/Anual) nos novos cards
        const isAnnual = document.getElementById('btn-annual')?.classList.contains('active');
        if (typeof window.togglePricing === 'function') {
            window.togglePricing(isAnnual ? 'annual' : 'monthly');
        }

    } catch (err) {
        console.error('[fetchPlans] Erro ao buscar planos:', err);
        const grid = document.getElementById('pricing-grid-dynamic');
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Erro ao carregar planos.</div>';
    }
}
