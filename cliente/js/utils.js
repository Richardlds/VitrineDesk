/* ============================================================
   UTILS.JS — VitrineDesk Cliente
   Funções utilitárias: toast, confirm, formatação, CPF, etc.
   ============================================================ */

// ────────────────────────── Configuração Supabase ──────────────────────────
const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU';

/**
 * Chamada genérica à API REST do Supabase
 * @param {string} endpoint - ex: '/rest/v1/tenants?slug=eq.xxx'
 * @param {object} options  - { method, body, headers }
 */
export async function supaFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  
  // Cache de Dados (Stale-While-Revalidate) apenas para GET
  // ──────────────────────────
  const cacheKey = `vd_cache_${endpoint}`;
  const cacheTTL = 30 * 1000; // Reduzido para 30 segundos para refletir alterações rapidamente
  
  if (method === 'GET' && typeof sessionStorage !== 'undefined') {
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        const cachedData = JSON.parse(cachedStr);
        if (Date.now() - cachedData.timestamp < cacheTTL) {
          // Dispara fetch em background para atualizar o cache silenciosamente (SWR)
          fetchSupabase(url, method, options).then(freshData => {
            if (freshData) {
               try {
                 sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: freshData }));
               } catch (e) {}
            }
          }).catch(() => {}); // ignora erros no background
          
          return cachedData.data; // Retorna cache instantaneamente
        }
      } catch (e) {
        // Cache corrompido, segue para fetch normal
      }
    }
  }

  // Fetch Normal
  const data = await fetchSupabase(url, method, options);
  
  // Salva no cache se for GET
  if (method === 'GET' && data && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (e) {
      console.warn('SWR Cache ignore: Quota Excedida ou Storage Bloqueado', e);
    }
  }
  
  return data;
}

async function fetchSupabase(url, method, options) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Faz upload de um arquivo para o Supabase Storage (bucket 'avatars').
 * @param {File} file O arquivo binário
 * @param {string} fileName O caminho completo no bucket (ex: tenant_id/12345.jpg)
 */
export async function supaUploadAvatar(file, fileName) {
  const url = `${SUPABASE_URL}/storage/v1/object/avatars/${fileName}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': file.type,
    // Em alguns casos pode ser necessário 'x-upsert': 'true'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: file
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data;
}

/**
 * Retorna a URL pública de um arquivo no bucket 'avatars'
 * @param {string} path O caminho retornado pelo upload (ex: tenant_id/12345.jpg)
 */
export function getSupaPublicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

// ────────────────────────── Web Audio API (Sons de Notificação) ──────────────────────────
let __globalAudioCtx = null;

export function playNotificationSound(type = 'info') {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        if (!__globalAudioCtx) {
            __globalAudioCtx = new AudioContext();
        }
        const ctx = __globalAudioCtx;
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        if (type === 'success') {
            // Success Chord (Duplo Tom)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
            
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.3);
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 0.5);

        } else if (type === 'error') {
            // Digital Beep (Classic Error)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.11);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);

        } else {
            // Soft Pop / Bloop (Info/Warning)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        }
    } catch (e) {
        // Ignorar erros de áudio silenciosamente
    }
}

// Desbloquear áudio no primeiro clique do usuário para garantir autoplay policy
document.addEventListener('click', () => {
    if (__globalAudioCtx && __globalAudioCtx.state === 'suspended') {
        __globalAudioCtx.resume();
    }
}, { once: true });


// ────────────────────────── Toast Notifications ──────────────────────────

/**
 * Exibe notificação flutuante (Toast)
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration 
 */
export function showToast(message, type = 'info', duration = 3000) {
  try {
    playNotificationSound(type);

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: '<i data-lucide="check-circle"></i>',
      error: '<i data-lucide="x-circle"></i>',
      warning: '<i data-lucide="alert-triangle"></i>',
      info: '<i data-lucide="info"></i>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Escapar a mensagem contra XSS
    const safeMessage = escapeHtml(message);

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${safeMessage}</span>
    `;

    container.appendChild(toast);
    
    // Forçar reflow para garantir que a transição CSS funcione
    toast.offsetHeight;
    
    if (window.lucide) {
      lucide.createIcons({ root: toast });
    }

    // Usar CSS class para animar entrada
    toast.classList.add('show');

    // Ajusta a duração com base no tipo se não for explicitamente passada
    let finalDuration = duration;
    if (duration === 3000) {
      finalDuration = type === 'error' ? 5000 : 3000;
    }

    // Remover após duração usando CSS class
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400); // 400ms = tempo da transição no css
    }, finalDuration);
  } catch (e) {
    console.error('Erro no toast:', e);
  }
}

// ────────────────────────── Confirm Modal ──────────────────────────

/**
 * Exibe modal de confirmação estilizado (substitui window.confirm)
 * @param {string} title   - Título
 * @param {string} message - Mensagem
 * @param {string} confirmText - Texto do botão confirmar (padrão 'Confirmar')
 * @param {string} cancelText  - Texto do botão cancelar (padrão 'Cancelar')
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
  return new Promise((resolve) => {
    try {
      // Remover overlay existente
      const existingOverlay = document.querySelector('.confirm-overlay');
      if (existingOverlay) existingOverlay.remove();

      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <h3 class="confirm-title">${title}</h3>
          <p class="confirm-message">${message}</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" id="btn-confirm-cancel" style="z-index:11001;">${cancelText}</button>
            <button class="btn btn-danger" id="btn-confirm-ok" style="z-index:11001;">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('active'));

      const fechar = (result) => {
        overlay.classList.remove('active');
        setTimeout(() => {
          if (overlay.parentNode) overlay.remove();
          resolve(result);
        }, 300);
      };

      document.getElementById('btn-confirm-ok')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fechar(true);
      });

      document.getElementById('btn-confirm-cancel')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fechar(false);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) fechar(false);
      });

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          fechar(false);
        }
      };
      document.addEventListener('keydown', escHandler);
    } catch (e) {
      console.error('Erro no confirm:', e);
      resolve(false);
    }
  });
}

// ────────────────────────── Formatação ──────────────────────────

/**
 * Formata valor em Real brasileiro
 * @param {number} value
 * @returns {string} ex: "R$ 45,00"
 */
export function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/**
 * Formata data ISO para dd/mm/aaaa
 * @param {string} dateStr - ex: '2026-06-21'
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Formata hora HH:MM
 * @param {string} timeStr - ex: '14:30:00' ou '14:30'
 * @returns {string} '14:30'
 */
export function formatTime(timeStr) {
  if (!timeStr) return '-';
  return timeStr.substring(0, 5);
}

/**
 * Nome do dia da semana em português
 * @param {number} dayIndex - 0=Dom, 1=Seg...
 * @returns {string}
 */
export function getDayName(dayIndex) {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[dayIndex] || '';
}

/**
 * Nome abreviado do mês em português
 * @param {number} monthIndex - 0=Jan...
 * @returns {string}
 */
export function getMonthName(monthIndex) {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return months[monthIndex] || '';
}

// ────────────────────────── Validação de CPF ──────────────────────────

/**
 * Valida CPF (11 dígitos com dígitos verificadores)
 * @param {string} cpf
 * @returns {boolean}
 */
export function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  // Elimina CPFs conhecidos inválidos
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10])) return false;

  return true;
}

/**
 * Formata CPF: 123.456.789-00
 * @param {string} cpf
 * @returns {string}
 */
export function formatarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Aplica máscara CPF em tempo real (para input)
 * @param {HTMLInputElement} input
 */
export function mascararCPF(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  input.value = v;
}

/**
 * Aplica máscara telefone (XX) XXXXX-XXXX
 * @param {HTMLInputElement} input
 */
export function mascararTelefone(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 6) {
    v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/(\d{0,2})/, '($1');
  }
  input.value = v;
}

// ────────────────────────── Helpers gerais ──────────────────────────

/**
 * Obtém slug do tenant a partir da URL
 * @returns {string|null}
 */
export function getSlugFromURL() {
  // 1. Tentar Hash (#/loja1) - Ideal para localhost simples e URL Limpa
  const hash = window.location.hash;
  if (hash && hash.startsWith('#/')) {
    return hash.substring(2).split('?')[0].split('/')[0];
  }

  // 2. Tentar Parâmetro Explicito (?slug=loja1)
  const params = new URLSearchParams(window.location.search);
  let slug = params.get('slug');
  if (slug) {
    // Atualiza a URL para a versão limpa com hash sem recarregar (se num localhost simples)
    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname + '#/' + slug;
        window.history.replaceState(null, '', cleanUrl);
    }
    return slug;
  }

  // 3. Tentar Query String sem chave (?loja1) -> localhost:5500/cliente/?loja1
  const search = window.location.search.substring(1);
  if (search && !search.includes('=')) {
    slug = search.split('&')[0].split('/')[0];
    if (slug) {
        if (window.history && window.history.replaceState) {
            const cleanUrl = window.location.pathname + '#/' + slug;
            window.history.replaceState(null, '', cleanUrl);
        }
        return slug;
    }
  }

  // 4. Fallback Pathname (/cliente/loja1 ou /loja1) -> se o servidor usar rewrite
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(p => p && p !== 'index.html');
  if (parts.length > 0) {
     const clienteIdx = parts.indexOf('cliente');
     const vitrineIdx = parts.indexOf('vitrinedesk');
     
     if (clienteIdx !== -1 && parts.length > clienteIdx + 1) {
       return parts[clienteIdx + 1];
     }
     if (vitrineIdx !== -1 && parts.length > vitrineIdx + 1) {
       return parts[vitrineIdx + 1];
     }
     if (parts.length === 1 && parts[0] !== 'cliente' && parts[0] !== 'vitrinedesk') {
       return parts[0];
     }
  }
  
  return null;
}

/**
 * Verifica modo manutenção (Global)
 */
export async function checkMaintenanceMode() {
    try {
        const data = await supaFetch('/rest/v1/master_settings?id=eq.1&select=maintenance_mode');
            
        if (!data || data.length === 0 || !data[0].maintenance_mode) return;
        
        // Bloquear acesso
        document.body.innerHTML = `
            <div class="maintenance-screen">
                <h1 class="maintenance-title">🛠️ Loja em Manutenção</h1>
                <p class="maintenance-text">O sistema está passando por melhorias. Tente novamente mais tarde.</p>
            </div>
        `;
        throw new Error('Manutenção ativa');
    } catch (e) {
        if (e.message === 'Manutenção ativa') throw e;
        console.error('Erro na checagem de manutencao:', e);
    }
}

/**
 * Converte hex para RGB
 * @param {string} hex - ex: '#8b5cf6'
 * @returns {string} '139, 92, 246'
 */
export function hexToRgb(hex) {
  if (!hex) return '139, 92, 246';
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Debounce simples
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Scroll suave para uma seção
 * @param {string} sectionId - ID da seção (sem #)
 */
export function scrollToSection(sectionId) {
  try {
    const el = document.getElementById(sectionId);
    if (el) {
      const topbar = document.querySelector('.topbar');
      const offset = topbar ? topbar.offsetHeight : 70;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  } catch (e) {
    console.error('Erro ao rolar para seção:', e);
  }
}

// Removido export do scrollToSection para o window

/**
 * Escapa HTML para prevenir XSS
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════
// SKELETON LOADING SYSTEM
// ═══════════════════════════════════════════

export const SkeletonTemplates = {
  // Cards de serviço (grid com imagem + texto)
  services: (count = 6) => Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-card-body">
        <div class="skeleton skeleton-text-lg"></div>
        <div class="skeleton skeleton-text-md"></div>
      </div>
    </div>
  `).join(''),

  // Cards da equipe (avatar circular + nome + cargo)
  team: (count = 3) => Array(count).fill(`
    <div class="skeleton-card team-skeleton">
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton skeleton-text-md skel-mt-3"></div>
      <div class="skeleton skeleton-text-sm skel-mt-1"></div>
    </div>
  `).join(''),

  // Grid de galeria (imagens retangulares)
  gallery: (count = 4) => Array(count).fill(`
    <div class="skeleton skeleton-gallery"></div>
  `).join(''),

  // Cards de depoimentos (estrelas + texto + autor)
  testimonials: (count = 3) => Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton skeleton-stars"></div>
      <div class="skeleton skeleton-text-md skel-mt-3"></div>
      <div class="skeleton skeleton-text-lg skel-mt-1"></div>
      <div class="skeleton skeleton-text-sm skel-mt-2 skel-w-40"></div>
    </div>
  `).join(''),

  // Tabela de horários (7 dias da semana)
  hours: () => `
    <div class="skeleton-card skel-card-hours">
      ${Array(7).fill(`
        <div class="skeleton-hours-row">
          <div class="skeleton skeleton-text-sm skel-w-40"></div>
          <div class="skeleton skeleton-text-sm skel-w-30"></div>
        </div>
      `).join('')}
    </div>
  `,

  // Seção de mapa e contato
  map: () => `
    <div class="skeleton-card skel-card-map">
      <div class="flex-1">
        <div class="skeleton skeleton-text-md skel-mb-3"></div>
        <div class="skeleton skeleton-text-sm skel-mb-1"></div>
        <div class="skeleton skeleton-text-sm skel-w-60"></div>
      </div>
      <div class="skeleton skel-image-box"></div>
    </div>
  `,

  // Lista de agendamentos do cliente
  appointments: (count = 3) => Array(count).fill(`
    <div class="skeleton-card skel-card-app">
      <div class="flex-between skel-mb-3">
        <div class="skeleton skeleton-text-md skel-w-50"></div>
        <div class="skeleton skel-badge"></div>
      </div>
      <div class="flex-gap-4">
        <div class="skeleton skeleton-text-sm skel-w-30"></div>
        <div class="skeleton skeleton-text-sm skel-w-20"></div>
        <div class="skeleton skeleton-text-sm skel-w-15"></div>
      </div>
    </div>
  `).join(''),

  // Seleção de profissionais no booking
  professionals: (count = 3) => Array(count).fill(`
    <div class="skeleton-card prof-skeleton">
      <div class="skeleton skeleton-avatar-sm"></div>
      <div class="skeleton skeleton-text-sm skel-mt-2"></div>
    </div>
  `).join(''),

  // Termos de uso
  terms: () => `
    <div class="skel-card-hours">
      <div class="skeleton skeleton-text-lg skel-w-40 skel-mb-4"></div>
      ${Array(4).fill(`
        <div class="skeleton skeleton-text-md skel-w-100 skel-mb-1"></div>
        <div class="skeleton skeleton-text-md skel-w-90 skel-mb-1"></div>
        <div class="skeleton skeleton-text-md skel-w-95 skel-mb-3"></div>
      `).join('')}
    </div>
  `,

  // Grade de horários disponíveis
  timeSlots: (count = 8) => `
    <div class="skel-grid-4">
      ${Array(count).fill(`
        <div class="skeleton skel-time-box"></div>
      `).join('')}
    </div>
  `,
};

/**
 * Exibe skeleton loading em um container
 * @param {string} containerId - ID do elemento HTML
 * @param {string} templateKey - Chave do template (services, team, gallery, etc)
 * @param {number} count - Quantidade de itens (opcional)
 */
export function showSkeleton(containerId, templateKey, count = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = SkeletonTemplates[templateKey];
  if (!template) {
    console.warn(`Template de skeleton "${templateKey}" não encontrado`);
    return;
  }

  container.innerHTML = typeof template === 'function' 
    ? template(count) 
    : template;

  container.classList.add('skeleton-loading');
}

/**
 * Remove o skeleton loading de um container
 * @param {string} containerId - ID do elemento HTML
 */
export function hideSkeleton(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.classList.remove('skeleton-loading');
  }
}