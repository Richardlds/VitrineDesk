import { supaFetch, showToast, showConfirm, formatarCPF, validarCPF, mascararCPF, mascararTelefone, scrollToSection, formatDate, formatTime, showSkeleton, hideSkeleton, supaUploadAvatar, getSupaPublicUrl, getSupabaseAuthClient } from './utils.js';
import { loadMyAppointments } from './agendamentos.js';

// ────────────────────────── Estado ──────────────────────────
let currentClient = null;
let pendingGoogleUser = null; // Guarda os dados vindos do Google até completar o form

import { getTenantId } from './app.js';

// ────────────────────────── Sessão ──────────────────────────

/**
 * Retorna o cliente logado da sessão (ou null)
 */
export function getLoggedClient() {
  try {
    const data = sessionStorage.getItem('vp_client');
    if (data) {
      currentClient = JSON.parse(data);
      return currentClient;
    }
  } catch (e) {
    console.error('Erro ao ler sessão do cliente:', e);
  }
  return null;
}

/**
 * Verifica se há cliente logado
 */
export function isLogged() {
  return !!getLoggedClient();
}

/**
 * Salva cliente na sessão
 */
function saveClientSession(client) {
  try {
    currentClient = client;
    sessionStorage.setItem('vp_client', JSON.stringify(client));
  } catch (e) {
    console.error('Erro ao salvar sessão:', e);
  }
}

/**
 * Limpa sessão do cliente
 */
function clearClientSession() {
  currentClient = null;
  sessionStorage.removeItem('vp_client');
}

/**
 * O hash SHA-256 não será mais usado pois descobrimos que
 * o banco de dados tem uma trigger que encripta com Bcrypt
 */
async function hashPassword(password) {
  // Apenas retorna a senha original para ser enviada,
  // ou poderíamos remover, mas manteremos por compatibilidade estrutural
  return password;
}

// ────────────────────────── Login ──────────────────────────

export async function loginCliente(email, senha) {
  try {
    if (!email || !senha) {
      showToast('Preencha e-mail e senha', 'warning');
      return null;
    }
    
    email = email.trim().toLowerCase();

    const tenantId = getTenantId();
    if (!tenantId) {
      showToast('Erro: loja não identificada', 'error');
      return null;
    }

    // Busca o cliente APENAS pelo email
    const result = await supaFetch(
      `/rest/v1/clientes?email=eq.${encodeURIComponent(email)}&select=*`
    );

    if (!result || result.length === 0) {
      showToast('E-mail ou senha incorretos', 'error');
      return null;
    }

    const cliente = result[0];

    // Verifica o hash Bcrypt retornado pelo banco
    // A biblioteca dcodeIO.bcrypt foi injetada via CDN no HTML
    let isPasswordValid = false;
    try {
      if (window.dcodeIO && window.dcodeIO.bcrypt) {
        isPasswordValid = window.dcodeIO.bcrypt.compareSync(senha, cliente.senha);
      } else {
        console.error("Biblioteca bcryptjs não carregada!");
        showToast('Erro interno: validação indisponível', 'error');
        return null;
      }
    } catch(err) {
      console.error("Erro ao validar senha Bcrypt", err);
      showToast('E-mail ou senha incorretos', 'error');
      return null;
    }

    if (!isPasswordValid) {
      showToast('E-mail ou senha incorretos', 'error');
      return null;
    }

    // Salvar sessão
    saveClientSession(cliente);
    showToast(`Bem-vindo(a), ${cliente.nome}!`, 'success');

    // Atualizar UI
    updateAuthUI(true);
    setTimeout(() => scrollToSection('section-agendamentos'), 300);

    return cliente;
  } catch (e) {
    console.error('Erro no login:', e);
    showToast('Erro ao realizar login. Tente novamente.', 'error');
    return null;
  }
}

export async function loginComGoogle(e) {
  if (e) e.preventDefault();
  try {
    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      showToast('Erro: Biblioteca de autenticação não carregada.', 'error');
      return;
    }
    
    // Inicia fluxo OAuth. O redirect volta para a mesma página.
    localStorage.setItem('oauth_redirect', window.location.pathname);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    });
  } catch (e) {
    console.error('Erro ao chamar login com Google:', e);
    showToast('Erro ao inicializar Google Login', 'error');
  }
}

// ────────────────────────── Registro ──────────────────────────

/**
 * Registra novo cliente
 * @param {object} dados - { nome, email, senha, telefone, cpf }
 * @returns {object|null}
 */
export async function registrarCliente(dados) {
  try {
    let { nome, email, senha, telefone, cpf } = dados;
    
    // Validações básicas
    if (!nome || !email || !senha || !cpf) {
      showToast('Preencha todos os campos obrigatórios (incluindo CPF)', 'warning');
      return null;
    }
    
    if (senha.length < 6) {
      showToast('A senha deve ter pelo menos 6 caracteres', 'warning');
      return null;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      showToast('Erro: loja não identificada', 'error');
      return null;
    }

    email = email.trim().toLowerCase();
    
    // ATENÇÃO: Enviamos a senha em texto plano porque sabemos que
    // o banco de dados tem uma Trigger que converte ela pra Bcrypt na inserção!
    const senhaFinal = senha;
    
    const numTelefone = telefone ? telefone.replace(/\D/g, '') : null;
    const numCpf = cpf ? cpf.replace(/\D/g, '') : null;

    // Criar payload
    const novoCliente = {
      tenant_id: tenantId,
      nome: nome.trim(),
      email,
      senha: senhaFinal,
      telefone: numTelefone,
      cpf: numCpf,
      termo_aceite_id: dados.termo_aceite_id || null,
      data_aceite_termo: dados.termo_aceite_id ? new Date().toISOString() : null
    };

    // ─────────────────────────────────────────────────────────────
    // PRÉ-CHECK DE DUPLICIDADE MÚLTIPLA
    // ─────────────────────────────────────────────────────────────
    let orConditions = [`email.eq.${encodeURIComponent(email)}`];
    if (numCpf) orConditions.push(`cpf.eq.${encodeURIComponent(numCpf)}`);
    if (numTelefone) orConditions.push(`telefone.eq.${encodeURIComponent(numTelefone)}`);
    
    const query = `/rest/v1/clientes?tenant_id=eq.${tenantId}&or=(${orConditions.join(',')})&select=email,cpf,telefone`;
    
    try {
      const duplicados = await supaFetch(query);
      if (duplicados && duplicados.length > 0) {
        const dup = duplicados[0];
        if (dup.email === email) {
          showToast('Este e-mail já está cadastrado em outra conta.', 'warning');
        } else if (numCpf && dup.cpf === numCpf) {
          showToast('Este CPF já está cadastrado em outra conta.', 'warning');
        } else if (numTelefone && dup.telefone === numTelefone) {
          showToast('Este telefone (WhatsApp) já está cadastrado.', 'warning');
        } else {
          showToast('Já existe um cadastro com esses dados.', 'warning');
        }
        return null;
      }
    } catch (checkErr) {
      console.warn("Erro no pré-check, continuando com inserção", checkErr);
    }

    // Tentar salvar direto. O Supabase (PostgreSQL) vai barrar duplicidades (Erro 409) se houver.
    const result = await supaFetch('/rest/v1/clientes', {
      method: 'POST',
      body: novoCliente
    });

    if (result && result.length > 0) {
      saveClientSession(result[0]);
      showToast('Conta criada com sucesso!', 'success');
      updateAuthUI(true);
      setTimeout(() => scrollToSection('section-agendamentos'), 300);
      return result[0];
    }

    showToast('Erro ao criar conta', 'error');
    return null;

  } catch (e) {
    console.error('Erro no registro:', e);
    
    // Tratamento direto de erro 409 (Conflito de dados já existentes)
    if (e.message.includes('409') || e.message.includes('23505')) {
      const msgError = e.message.toLowerCase();
      
      if (msgError.includes('email')) {
        showToast('Este e-mail já está cadastrado', 'warning');
      } else if (msgError.includes('telefone')) {
        showToast('Este telefone já está cadastrado', 'warning');
      } else if (msgError.includes('cpf')) {
        showToast('Este CPF já está cadastrado', 'warning');
      } else {
        showToast('Já existe um cadastro com esses dados', 'warning');
      }
      return null;
    }

    showToast('Erro inesperado ao criar conta. Tente novamente.', 'error');
    return null;
  }
}

// ────────────────────────── Logout ──────────────────────────

/**
 * Desloga o cliente
 */
export async function logoutCliente() {
  try {
    const confirm = await showConfirm(
      'Sair da conta',
      'Deseja realmente sair?',
      'Sair',
      'Cancelar'
    );

    if (!confirm) return;

    clearClientSession();
    showToast('Você saiu da conta', 'info');
    updateAuthUI(false);

    // Navegar para início
    scrollToSection('section-servicos');
  } catch (e) {
    console.error('Erro no logout:', e);
  }
}



// ────────────────────────── Atualizar Perfil ──────────────────────────

export function closeProfileModal() {
  try {
    const overlay = document.getElementById('profile-modal');
    if (overlay) overlay.classList.remove('active');
  } catch (e) {
    console.error('Erro ao fechar modal perfil:', e);
  }
}

/**
 * Atualiza perfil do cliente (salvo do modal)
 */
export async function updateProfile(e) {
  if (e) e.preventDefault();
  try {
    const cliente = getLoggedClient();
    if (!cliente) {
      showToast('Faça login para atualizar seu perfil', 'warning');
      return;
    }

    const nome = document.getElementById('drawer-client-name')?.value?.trim();
    const email = document.getElementById('drawer-client-email')?.value?.trim();
    const telefone = document.getElementById('drawer-client-phone')?.value?.trim();

    if (!nome || !email) {
      showToast('Nome e E-mail são obrigatórios', 'warning');
      return;
    }

    const btn = document.getElementById('btn-save-drawer-profile');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="lucide-spin"></i> Salvando...';
      if (window.lucide) lucide.createIcons({ root: btn });
    }

    const updates = {
      nome,
      email,
      telefone: telefone || null
    };

    const result = await supaFetch(
      `/rest/v1/clientes?id=eq.${cliente.id}`,
      { method: 'PATCH', body: updates }
    );

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      if (window.lucide) lucide.createIcons({ root: btn });
    }

    if (result && result.length > 0) {
      saveClientSession({ ...cliente, ...result[0] });
      showToast('Perfil atualizado com sucesso!', 'success');

      // Atualizar avatares
      const avatarLetters = document.querySelectorAll('#user-avatar-letter, #tab-avatar-letter, .client-avatar i');
      avatarLetters.forEach(avatar => {
        if (avatar.id === 'user-avatar-letter' || avatar.id === 'tab-avatar-letter') {
          avatar.textContent = (nome || 'U')[0].toUpperCase();
        }
      });
      
      const nameDisplay = document.getElementById('client-name-display');
      if (nameDisplay) nameDisplay.textContent = nome;

    } else {
      showToast('Erro ao atualizar perfil', 'error');
    }
  } catch (e) {
    console.error('Erro ao atualizar perfil:', e);
    // Tratar possível erro de conflito de email
    if (e.message && (e.message.includes('409') || e.message.includes('23505'))) {
      showToast('Este e-mail já está sendo usado por outra conta.', 'error');
    } else {
      showToast('Erro ao atualizar. Tente novamente.', 'error');
    }
    const btn = document.getElementById('btn-save-drawer-profile');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save"></i> Salvar Alterações';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
  }
}

// ────────────────────────── UI do Auth ──────────────────────────

/**
 * Atualiza a interface conforme estado logado/deslogado
 * @param {boolean} logged
 */
export function updateAuthUI(logged) {
  try {
    const body = document.body;
    const btnAuth = document.getElementById('btn-auth');
    const userMenu = document.getElementById('user-menu');
    
    // Tab bar elements
    const guestTabs = document.querySelectorAll('.mobile-tab-bar .guest-only');
    const loggedTabs = document.querySelectorAll('.mobile-tab-bar .logged-only');

    if (logged) {
      body.classList.add('is-logged');
      const cliente = getLoggedClient();
      const letra = (cliente?.nome || 'U')[0].toUpperCase();

      // Esconder botão "Entrar", mostrar avatar (Topnav e Mobile)
      if (btnAuth) btnAuth.classList.add('hidden');
      
      const mobileAvatar = document.querySelector('.mobile-tab-bar .logged-only[data-action="openClientArea"]');
      const avatarHTML = cliente && cliente.foto_url
        ? `<img src="${cliente.foto_url}" style="width: 24px; height: 24px; object-fit: cover; border-radius: 50%;">`
        : `<div class="user-avatar-small bg-primary flex-center text-white" style="width:24px; height:24px; border-radius:50%; font-size:0.75rem; font-weight:bold;">${(cliente?.nome || 'U')[0].toUpperCase()}</div>`;

      if (userMenu) {
        userMenu.classList.remove('hidden');
        if (cliente && cliente.foto_url) {
          userMenu.innerHTML = `<img src="${cliente.foto_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
          userMenu.innerHTML = `<div class="user-avatar-small" id="user-avatar-letter">${(cliente?.nome || 'U')[0].toUpperCase()}</div>`;
        }
      }

      if (mobileAvatar) {
        mobileAvatar.innerHTML = avatarHTML;
      }

      // Carregar agendamentos (se a função existir)
      if (typeof loadMyAppointments === 'function') {
        loadMyAppointments();
      }

      // Carregar próximos agendamentos
      loadProximosAgendamentos();
    } else {
      body.classList.remove('is-logged');
      if (btnAuth) btnAuth.classList.remove('hidden');
      if (userMenu) userMenu.classList.add('hidden');
    }

    // Fechar modais abertos
    closeAuthModal();
  } catch (e) {
    console.error('Erro ao atualizar UI auth:', e);
  }
}

// ────────────────────────── Modal de Auth ──────────────────────────

/**
 * Abre modal de login/cadastro
 * @param {string} tab - 'login' ou 'register'
 */
export function openAuthModal(tab = 'login') {
  try {
    const overlay = document.getElementById('auth-modal');
    if (!overlay) return;

    overlay.classList.add('active');

    // Ativar aba correta
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form-panel').forEach(p => p.classList.remove('active'));

    const tabEl = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
    const panelEl = document.getElementById(`auth-${tab}`);

    if (tabEl) tabEl.classList.add('active');
    if (panelEl) panelEl.classList.add('active');
  } catch (e) {
    console.error('Erro ao abrir modal auth:', e);
  }
}

/**
 * Fecha modal de auth
 */
export function closeAuthModal() {
  try {
    const overlay = document.getElementById('auth-modal');
    if (overlay) overlay.classList.remove('active');
  } catch (e) {
    console.error('Erro ao fechar modal auth:', e);
  }
}

// ────────────────────────── Inicialização ──────────────────────────

/**
 * Inicializa listeners do auth
 */
export function initAuth() {
  if (window._authInitialized) return;
  window._authInitialized = true;
  try {
    // Verificar sessão Google (OAuth redirect callback)
    checkGoogleOAuthSession();

    // Abas de auth
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => openAuthModal(tab.dataset.tab));
    });

    const btnGoogleLogin = document.getElementById('btn-google-login');
    if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', loginComGoogle);

    const btnGoogleRegister = document.getElementById('btn-google-register');
    if (btnGoogleRegister) btnGoogleRegister.addEventListener('click', loginComGoogle);

    const formGoogleComplete = document.getElementById('form-google-complete');
    if (formGoogleComplete) formGoogleComplete.addEventListener('submit', submitGoogleComplete);

    const formLogin = document.getElementById('form-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formLogin.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="lucide-spin"></i> Entrando...';
        if (window.lucide) lucide.createIcons({ root: btn });

        try {
          const email = document.getElementById('login-email')?.value?.trim();
          const senha = document.getElementById('login-senha')?.value;
          const result = await loginCliente(email, senha);
          if (result) {
            closeAuthModal();
          }
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
          if (window.lucide) lucide.createIcons({ root: btn });
        }
      });
    }

    // Form registro
    const formRegister = document.getElementById('form-register');
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formRegister.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="lucide-spin"></i> Criando...';
        if (window.lucide) lucide.createIcons({ root: btn });
        try {
          const termosCheck = document.getElementById('register-termos');
          if (termosCheck && !termosCheck.checked) {
            showToast('Você precisa aceitar os Termos de Uso', 'warning');
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons({ root: btn });
            return;
          }

          let termoAceiteId = null;
          try {
            const tenantId = getTenantId();
            const termoData = await supaFetch(`/rest/v1/termos_aceite?tenant_id=eq.${tenantId}&is_active=eq.true&select=id&order=created_at.desc&limit=1`);
            if (termoData && termoData.length > 0) {
              termoAceiteId = termoData[0].id;
            }
          } catch(err) {
            console.warn("Nenhum termo ativo encontrado ou erro ao buscar");
          }

          const dados = {
            nome: document.getElementById('register-nome')?.value?.trim(),
            email: document.getElementById('register-email')?.value?.trim(),
            senha: document.getElementById('register-senha')?.value,
            telefone: document.getElementById('register-telefone')?.value?.trim(),
            cpf: document.getElementById('register-cpf')?.value,
            termo_aceite_id: termoAceiteId
          };
          const result = await registrarCliente(dados);
          if (result) {
            closeAuthModal();
          }
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
          if (window.lucide) lucide.createIcons({ root: btn });
        }
      });
    }

    // Modal Termos de Uso
    const linkTermos = document.getElementById('link-termos-uso');
    const modalTermos = document.getElementById('modal-termos');
    const termosConteudo = document.getElementById('termos-conteudo');
    
    if (linkTermos && modalTermos) {
      linkTermos.addEventListener('click', async (e) => {
        e.preventDefault();
        modalTermos.classList.add('active');
        showSkeleton('termos-conteudo', 'terms');
        try {
          const tenantId = getTenantId();
          const termoData = await supaFetch(`/rest/v1/termos_aceite?tenant_id=eq.${tenantId}&is_active=eq.true&select=texto_termo&order=created_at.desc&limit=1`);
          hideSkeleton('termos-conteudo');
          if (termoData && termoData.length > 0) {
            termosConteudo.textContent = termoData[0].texto_termo;
          } else {
            termosConteudo.textContent = 'Nenhum termo de uso definido pelo estabelecimento.';
          }
        } catch(err) {
          hideSkeleton('termos-conteudo');
          termosConteudo.textContent = 'Erro ao carregar os termos. Tente novamente.';
        }
      });
    }

    // Botão entrar
    const btnAuth = document.getElementById('btn-auth');
    if (btnAuth) {
      btnAuth.addEventListener('click', () => openAuthModal('login'));
    }

    // Fechar modal auth
    document.querySelectorAll('[data-close-auth]').forEach(btn => {
      btn.addEventListener('click', closeAuthModal);
    });

    // Fechar auth clicando fora
    const authModal = document.getElementById('auth-modal');
    if (authModal) {
      authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
      });
    }

    // Fechar perfil clicando fora
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) closeProfileModal();
      });
    }

    // Lógica de Upload de Avatar
    const avatarWrapper = document.getElementById('client-avatar-wrapper');
    const avatarUpload = document.getElementById('client-avatar-upload');
    if (avatarWrapper && avatarUpload) {
      avatarWrapper.addEventListener('click', () => avatarUpload.click());

      avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validar tamanho (máx 2MB)
        if (file.size > 2 * 1024 * 1024) {
          showToast('A imagem deve ter no máximo 2MB', 'warning');
          return;
        }

        try {
          const cliente = getLoggedClient();
          if (!cliente) return;
          
          const tenantId = getTenantId();

          // Preview Imediato
          const objectUrl = URL.createObjectURL(file);
          const avatarImg = document.getElementById('client-avatar-img');
          const avatarIcon = document.getElementById('client-avatar-icon');
          if (avatarImg) {
            avatarImg.src = objectUrl;
            avatarImg.classList.remove('hidden');
          }
          if (avatarIcon) avatarIcon.classList.add('hidden');

          showToast('Fazendo upload da imagem...', 'info', 2000);

          // Upload para o Storage
          const fileExt = file.name.split('.').pop();
          const fileName = `${tenantId}/${Date.now()}.${fileExt}`;
          await supaUploadAvatar(file, fileName);
          const publicUrl = getSupaPublicUrl(fileName);

          // Salvar a URL no Auth (user_metadata) para evitar erro 400
          const supabaseAuth = getSupabaseAuthClient();
          if (supabaseAuth) {
            await supabaseAuth.auth.updateUser({
              data: { foto_url: publicUrl, avatar_url: publicUrl }
            }).catch(console.error);
          }

          // Atualizar estado e sessão
          const result = [{ foto_url: publicUrl }];
          if (result && result.length > 0) {
            saveClientSession({ ...cliente, ...result[0] });
            showToast('Foto atualizada com sucesso!', 'success');
            
            // Atualiza Header
            const headerAvatar = document.querySelector('.user-menu');
            if (headerAvatar) {
              headerAvatar.innerHTML = `<img src="${publicUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }

            // Atualiza Tab Bar Mobile
            const mobileAvatar = document.querySelector('.mobile-tab-bar .logged-only[data-action="openClientArea"]');
            if (mobileAvatar) {
              mobileAvatar.innerHTML = `<img src="${publicUrl}" style="width: 24px; height: 24px; object-fit: cover; border-radius: 50%;">`;
            }
          } else {
            showToast('Erro ao atualizar foto no banco.', 'error');
          }

        } catch (err) {
          console.error('Erro no upload de avatar:', err);
          showToast('Erro ao fazer upload da imagem.', 'error');
        }
      });
    }

    // Botão logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      // Listener removido daqui pois o app.js já gerencia via data-action="logout"
      // para evitar que o modal de confirmação apareça 2 vezes.
    }

    // Botão salvar perfil (antigo)
    const btnSaveProfile = document.getElementById('btn-save-profile');
    if (btnSaveProfile) {
      btnSaveProfile.addEventListener('click', updateProfile);
    }
    
    // Novo form do drawer de perfil
    const formUpdateProfile = document.getElementById('form-update-profile');
    if (formUpdateProfile) {
      formUpdateProfile.addEventListener('submit', updateProfile);
    }

    // Máscara CPF
    const cpfInputs = document.querySelectorAll('[data-mask="cpf"]');
    cpfInputs.forEach(input => {
      input.addEventListener('input', () => mascararCPF(input));
    });

    // Máscara telefone
    const telInputs = document.querySelectorAll('[data-mask="telefone"]');
    telInputs.forEach(input => {
      input.addEventListener('input', () => mascararTelefone(input));
    });

    // Floating labels e Validação Visual
    document.querySelectorAll('.input-group input, .input-group select').forEach(input => {
      
      const validateInput = () => {
        const group = input.closest('.input-group');
        if (!group) return;
        
        // Verifica se tem valor para subir a label
        if (input.value) {
          group.classList.add('has-value');
        } else {
          group.classList.remove('has-value');
          // Se estiver vazio, removemos as classes de validação
          group.classList.remove('valid', 'invalid');
          return;
        }

        // Validação customizada para CPF
        if (input.dataset.mask === 'cpf') {
          if (input.value.length === 14 && validarCPF(input.value)) {
            group.classList.remove('invalid');
            group.classList.add('valid');
          } else if (input.value.length === 14) {
            group.classList.remove('valid');
            group.classList.add('invalid');
          } else {
            group.classList.remove('valid', 'invalid');
          }
          return;
        }

        // Validação HTML5 padrão para os demais (email, tel, etc)
        if (input.checkValidity()) {
          group.classList.remove('invalid');
          group.classList.add('valid');
        } else {
          group.classList.remove('valid');
          group.classList.add('invalid');
        }
      };

      input.addEventListener('blur', validateInput);
      input.addEventListener('input', () => {
        if (input.closest('.input-group')?.classList.contains('invalid')) {
          validateInput(); // revalida em tempo real se já estava inválido
        }
        if (input.dataset.mask === 'cpf' && input.value.length === 14) {
          validateInput(); // Auto valida CPF assim que preencher 14 caracteres
        }
      });

      // Checar valor inicial
      if (input.value) {
        validateInput();
      }
    });


    // Verificar sessão existente ao iniciar
    if (isLogged()) {
      updateAuthUI(true);
    }
  } catch (e) {
    console.error('Erro ao inicializar auth:', e);
  }
}

async function checkGoogleOAuthSession() {
  try {
    const supabase = getSupabaseAuthClient();
    if (!supabase) return;

    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Erro ao verificar sessão Google:', error);
      return;
    }

    if (session && session.user) {
      // Usuário autenticado pelo Google!
      // Vamos sincronizar com a nossa tabela `clientes`
      const email = session.user.email;
      const nome = session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Cliente';
      const avatar_url = session.user.user_metadata?.avatar_url || '';
      const tenantId = getTenantId();

      if (!tenantId) return;

      // 1. Verifica se já existe para ESTE tenant específico
      const busca = await supaFetch(`/rest/v1/clientes?email=eq.${encodeURIComponent(email)}&tenant_id=eq.${tenantId}&select=*`);
      
      let clienteFinal = null;

      if (busca && busca.length > 0) {
        // Já existe, atualiza foto se não tinha
        clienteFinal = busca[0];
        if (!clienteFinal.foto_url && avatar_url) {
          const supabaseAuth = getSupabaseAuthClient();
          if (supabaseAuth) {
             supabaseAuth.auth.updateUser({ data: { foto_url: avatar_url } }).catch(console.error);
          }
          clienteFinal.foto_url = avatar_url;
        }
      } else {
        // Não existe, precisamos dos dados complementares (CPF, telefone)
        pendingGoogleUser = {
          tenantId,
          nome,
          email,
          avatar_url
        };
        
        // Esconde modal de login principal se estiver aberto
        closeAuthModal();
        
        // Abre o modal de complemento
        const modalComplete = document.getElementById('modal-google-complete');
        if (modalComplete) modalComplete.classList.add('active');
        
        // Interrompe o fluxo aqui até o form ser submetido
        return;
      }

      if (clienteFinal) {
        saveClientSession(clienteFinal);
        updateAuthUI(true);
        // O Supabase remove o access_token do hash automaticamente, então vamos sempre dar boas-vindas
        // se a URL ainda tiver # ou se acabamos de fazer o fluxo
        showToast(`Bem-vindo(a), ${clienteFinal.nome}!`, 'success');
        
        // Limpa a URL se tiver hash vazio
        if (window.location.hash === '' || window.location.hash === '#') {
           window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    }
  } catch (e) {
    console.error('Erro no sync do Google OAuth:', e);
    showToast('Falha ao sincronizar perfil do Google. Tente novamente.', 'error');
  }
}

/**
 * Carrega e exibe os próximos agendamentos do cliente
 */
export async function loadProximosAgendamentos() {
  try {
    const section = document.getElementById('section-upcoming-appointments');
    const serviceNameEl = document.getElementById('upcoming-service-name');
    const dateTimeEl = document.getElementById('upcoming-date-time');
    
    if (!section || !serviceNameEl || !dateTimeEl) return;

    const cliente = getLoggedClient();
    if (!cliente) {
      section.classList.add('hidden');
      return;
    }

    const tenantId = getTenantId();
    if (!tenantId) return;

    // Buscar próximos agendamentos (confirmados ou pendentes, data >= hoje)
    const hoje = new Date().toISOString().split('T')[0];
    
    let phoneParam = '';
    if (cliente.telefone) {
      const phoneRaw = cliente.telefone.replace(/\D/g, '');
      if (/^\d{10,11}$/.test(phoneRaw)) {
        phoneParam = phoneRaw;
      }
    }
    const emailParam = encodeURIComponent(cliente.email || '');

    const data = await supaFetch(
      `/rest/v1/appointments?tenant_id=eq.${tenantId}&or=(client_phone.eq.${phoneParam},client_email.eq.${emailParam})&appointment_date=gte.${hoje}&status=in.(confirmed,pending)&select=*,services(name,price,duration)&order=appointment_date.asc,appointment_time.asc&limit=1`
    );

    if (!data || data.length === 0) {
      // Sem agendamentos futuros, esconder seção
      section.classList.add('hidden');
      return;
    }

    const agendamento = data[0];
    const serviceName = agendamento.services?.name || 'Serviço';
    const dateFormatted = formatDate(agendamento.appointment_date);
    const timeFormatted = formatTime(agendamento.appointment_time);
    const statusLabel = agendamento.status === 'confirmed' ? 'Confirmado' : 'Pendente';

    serviceNameEl.textContent = serviceName;
    dateTimeEl.innerHTML = `<i data-lucide="calendar" class="icon-sm"></i> ${dateFormatted} às ${timeFormatted} &bull; <span style="color:var(--primary); font-weight:600;">${statusLabel}</span>`;
    section.classList.remove('hidden');

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Erro ao carregar próximos agendamentos:', e);
  }
}

// (Removido export para window para evitar poluição global)

// (Removido openClientAreaAndTab do window)

// ────────────────────────── Google Cadastro Complementar ──────────────────────────

export async function submitGoogleComplete(e) {
  e.preventDefault();
  if (!pendingGoogleUser) return;
  
  const form = e.target;
  const cpfInput = form.querySelector('#google-complete-cpf').value;
  const telInput = form.querySelector('#google-complete-telefone').value;

  const numCpf = cpfInput.replace(/\D/g, '');
  const numTel = telInput.replace(/\D/g, '');

  if (!numCpf || !numTel) {
    showToast('Preencha CPF e Telefone.', 'warning');
    return;
  }

  if (!validarCPF(numCpf)) {
    showToast('CPF inválido.', 'error');
    return;
  }

  const { tenantId, nome, email, avatar_url } = pendingGoogleUser;

  // Mostra loading
  const btn = form.querySelector('button[type="submit"]');
  const oldBtnHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Salvando...';
  btn.disabled = true;

  try {
    const novoCliente = {
      tenant_id: tenantId,
      nome: nome,
      email: email,
      senha: 'oauth_google_' + Date.now(),
      cpf: numCpf,
      telefone: numTel,
      data_aceite_termo: new Date().toISOString()
    };

    const result = await supaFetch('/rest/v1/clientes', {
      method: 'POST',
      body: novoCliente
    });

    if (result && result.length > 0) {
      const clienteFinal = result[0];
      clienteFinal.foto_url = avatar_url;
      
      saveClientSession(clienteFinal);
      updateAuthUI(true);
      showToast(`Bem-vindo(a), ${clienteFinal.nome}!`, 'success');
      
      const modalComplete = document.getElementById('modal-google-complete');
      if (modalComplete) modalComplete.classList.remove('active');
      
      if (window.location.hash === '' || window.location.hash === '#') {
         window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } else {
       showToast('Falha ao concluir cadastro', 'error');
    }
  } catch (err) {
    console.error('Erro ao salvar complemento google:', err);
    showToast('Este CPF já está cadastrado ou ocorreu um erro.', 'error');
  } finally {
    btn.innerHTML = oldBtnHtml;
    btn.disabled = false;
    if (window.lucide) window.lucide.createIcons();
  }
}
