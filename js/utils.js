/* VitrineDesk - Utilitários Globais */

// Mostrar Notificação Toast
export function showToast(message, type = 'info', onClickCallback = null) {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }



  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info'
  };
  const iconName = icons[type] || 'info';

  toast.innerHTML = `
    <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
    <div class="toast-message">${message}</div>
  `;
  container.appendChild(toast);
  
  if (window.lucide) {
    lucide.createIcons({ root: toast });
  }

  let timeoutId;

  const removeToast = () => {
    toast.classList.remove('show');
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  };

  if (onClickCallback) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      if (timeoutId) clearTimeout(timeoutId);
      onClickCallback();
      removeToast();
    });
  } else {
    toast.addEventListener('click', () => {
      if (timeoutId) clearTimeout(timeoutId);
      removeToast();
    });
  }

  // Trigger slide-in animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  timeoutId = setTimeout(() => {
    removeToast();
  }, 3000);
}

// Controle de Modal
export function initModals() {
  const modalTriggers = document.querySelectorAll('[data-modal]');
  modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const modalId = trigger.getAttribute('data-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    });
  });

  const closeButtons = document.querySelectorAll('.close-btn, [data-close-modal]');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) modal.classList.remove('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
      e.target.classList.remove('active');
    }
  });
}

// Formatar Moeda
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

// Formatar Data
export function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR', options);
}

// Formatar Hora
export function formatTime(timeString) {
  return timeString?.substring(0, 5) || '';
}

// Formatar Telefone
export function formatPhone(v) {
  if (!v) return '-';
  v = v.replace(/\D/g, "");
  if (v.length >= 11) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
  if (v.length === 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6, 10)}`;
  return v;
}

// Formatar CPF
export function formatCPF(v) {
  if (!v) return '-';
  v = v.replace(/\D/g, "");
  if (v.length === 11) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
  return v;
}

// Obter Parâmetro da URL
export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Gerar slug
export function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function fecharModais() {
  const confirmModal = document.getElementById('confirm-modal-custom');
  const alertModal = document.getElementById('alert-modal-custom');
  if (confirmModal) {
    confirmModal.classList.remove('active');
    confirmModal.style.display = 'none';
  }
  if (alertModal) {
    alertModal.classList.remove('active');
    alertModal.style.display = 'none';
  }
}

export function showConfirm(param1, param2) {
  let titulo = "Confirmação";
  let mensagem = "";

  if (param2 === undefined) {
    mensagem = param1;
  } else {
    titulo = param1;
    mensagem = param2;
  }

  return new Promise((resolve) => {
    let confirmModal = document.getElementById('confirm-modal-custom');
    if (!confirmModal) {
      // Injeta o modal dinamicamente se não existir na página
      const html = `
        <div class="modal-overlay" id="confirm-modal-custom" style="display:none; z-index:9999;">
          <div class="modal-content" style="max-width:420px; padding:28px; text-align:center;">
            <div style="width:48px;height:48px;background:rgba(245,158,11,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
              <i data-lucide="alert-triangle" style="width:24px;height:24px;color:#f59e0b;"></i>
            </div>
            <h3 id="confirm-title" style="margin-bottom:10px;font-size:1.1rem;">Confirmação</h3>
            <p id="confirm-message" style="margin-bottom:24px;color:var(--text-secondary,#aaa);font-size:0.95rem;"></p>
            <div style="display:flex;gap:12px;justify-content:center;">
              <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
              <button class="btn btn-primary" id="confirm-ok">Confirmar</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      confirmModal = document.getElementById('confirm-modal-custom');
      if (window.lucide) lucide.createIcons({ root: confirmModal });
    }

    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const btnOk = document.getElementById('confirm-ok');
    const btnCancel = document.getElementById('confirm-cancel');

    if (titleEl) titleEl.textContent = titulo;
    if (msgEl) msgEl.textContent = mensagem;

    const newBtnOk = btnOk.cloneNode(true);
    const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

    const handleConfirm = () => {
      fecharModais();
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      fecharModais();
      cleanup();
      resolve(false);
    };

    const handleOverlayClick = (e) => {
      if (e.target === confirmModal) {
        handleCancel();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    const cleanup = () => {
      confirmModal.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeyDown);
    };

    newBtnOk.addEventListener('click', handleConfirm);
    newBtnCancel.addEventListener('click', handleCancel);
    confirmModal.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeyDown);

    confirmModal.style.display = 'flex';
    setTimeout(() => {
      confirmModal.classList.add('active');
    }, 10);
  });
}

export function showAlert(param1, param2) {
  let titulo = "Atenção";
  let mensagem = "";

  if (param2 === undefined) {
    mensagem = param1;
  } else {
    titulo = param1;
    mensagem = param2;
  }

  return new Promise((resolve) => {
    let alertModal = document.getElementById('alert-modal-custom');
    if (!alertModal) {
      // Injeta o modal dinamicamente se não existir na página
      const html = `
        <div class="modal-overlay" id="alert-modal-custom" style="display:none; z-index:9999;">
          <div class="modal-content" style="max-width:420px; padding:28px; text-align:center;">
            <div style="width:48px;height:48px;background:rgba(99,102,241,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
              <i data-lucide="info" style="width:24px;height:24px;color:#6366f1;"></i>
            </div>
            <h3 id="alert-title" style="margin-bottom:10px;font-size:1.1rem;">Atenção</h3>
            <p id="alert-message" style="margin-bottom:24px;color:var(--text-secondary,#aaa);font-size:0.95rem;"></p>
            <div style="display:flex;justify-content:center;">
              <button class="btn btn-primary" id="alert-ok">OK</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      alertModal = document.getElementById('alert-modal-custom');
      if (window.lucide) lucide.createIcons({ root: alertModal });
    }

    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const btnOk = document.getElementById('alert-ok');

    if (titleEl) titleEl.textContent = titulo;
    if (msgEl) msgEl.textContent = mensagem;

    const newBtnOk = btnOk.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);

    const handleOk = () => {
      fecharModais();
      cleanup();
      resolve();
    };

    const handleOverlayClick = (e) => {
      if (e.target === alertModal) {
        handleOk();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleOk();
      }
    };

    const cleanup = () => {
      alertModal.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeyDown);
    };

    newBtnOk.addEventListener('click', handleOk);
    alertModal.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeyDown);

    alertModal.style.display = 'flex';
    setTimeout(() => {
      alertModal.classList.add('active');
    }, 10);
  });
}

// Expor no escopo global para compatibilidade com scripts não-módulo
window.showToast = showToast;
window.showConfirm = showConfirm;
window.showAlert = showAlert;

// Export other utilities as needed
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

export async function checkMaintenanceMode(supabase) {
    try {
        const { data, error } = await supabase
            .from("global_settings")
            .select("value")
            .eq("key", "maintenance_mode")
            .maybeSingle();
            
        if (error || !data || !data.value) return;
        
        const config = data.value;
        if (config.active) {
            // Pegar IP do usuario
            let myIp = "";
            try {
                const res = await fetch("https://api.ipify.org?format=json");
                const ipData = await res.json();
                myIp = ipData.ip;
            } catch(e) { (() => {}) /* console.log */("Erro ao obter IP para verificacao de manutencao"); }
            
            // Verificar whitelist
            const whitelist = config.whitelist || [];
            if (!whitelist.includes(myIp)) {
                // Bloquear acesso
                document.body.innerHTML = `
                    <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:${config.bg || "#18181b"}; color:${config.color || "#ffffff"}; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999999; font-family: sans-serif; padding: 2rem; text-align: center;">
                        <h1 style="font-size:3rem; margin-bottom:1rem;">${config.title || "Manutenção"}</h1>
                        <p style="font-size:1.2rem; margin-bottom:2rem; max-width:600px;">${config.msg || "Voltamos logo."}</p>
                        ${config.time ? `<p style="font-weight:bold; font-size: 1.1rem;">Previsão de volta: ${config.time}</p>` : ""}
                    </div>
                `;
                // Para a execução adicional se possível
                throw new Error("Manutenção Ativa");
            }
        }
    } catch (e) {
        if (e.message === "Manutenção Ativa") throw e;
        console.error("Erro ao verificar modo manutenção:", e);
    }
}
export function showPrompt(titulo, mensagem, placeholder = '') {
  return new Promise((resolve) => {
    // Tenta encontrar ou criar um modal de prompt
    let promptModal = document.getElementById('prompt-modal-custom');
    
    if (!promptModal) {
      const html = `
        <div class="modal-overlay" id="prompt-modal-custom" style="display:none; z-index:9999;">
          <div class="modal-content" style="max-width: 400px; padding: 24px; text-align: center;">
            <h3 id="prompt-title" style="margin-bottom: 12px;">${titulo}</h3>
            <p id="prompt-message" style="margin-bottom: 16px; color: var(--text-secondary);">${mensagem}</p>
            <input type="text" id="prompt-input" class="form-control" placeholder="${placeholder}" style="margin-bottom: 24px; width: 100%;">
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button class="btn btn-secondary" id="prompt-cancel">Cancelar</button>
              <button class="btn btn-primary" id="prompt-ok">OK</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      promptModal = document.getElementById('prompt-modal-custom');
    } else {
      document.getElementById('prompt-title').innerText = titulo;
      document.getElementById('prompt-message').innerText = mensagem;
      document.getElementById('prompt-input').placeholder = placeholder;
      document.getElementById('prompt-input').value = '';
    }

    const input = document.getElementById('prompt-input');
    const btnOk = document.getElementById('prompt-ok');
    const btnCancel = document.getElementById('prompt-cancel');

    const closeModal = (result) => {
      promptModal.style.display = 'none';
      promptModal.classList.remove('active');
      
      // Remove listeners para nao duplicar
      btnOk.onclick = null;
      btnCancel.onclick = null;
      
      resolve(result);
    };

    btnOk.onclick = () => closeModal(input.value);
    btnCancel.onclick = () => closeModal(null);

    promptModal.style.display = 'flex';
    promptModal.classList.add('active');
    setTimeout(() => input.focus(), 100);
  });
}
