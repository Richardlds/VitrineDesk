import { supabase } from './core/supabaseClient.js';

const TIMEOUT_MINUTES = 30;
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;
let inactivityTimer;

/**
 * Realiza o login do Superadmin
 * @param {string} email Email do administrador
 * @param {string} password Senha do administrador
 * @returns {Promise<Object>} Dados do usuário em caso de sucesso
 */
export async function login(email, password) {
    try {
        // 1. Tentar autenticar com Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) throw authError;

        const userId = authData.user.id;

        // 2. Verificar role diretamente no banco via tabela admin_users
        const { data: userData, error: userError } = await supabase
            .from('admin_users')
            .select('role')
            .eq('id', userId)
            .single();

        if (userError || !userData || userData.role !== 'superadmin') {
            await supabase.auth.signOut();
            throw new Error('Acesso negado: o usuário não é um Superadmin.');
        }

        // Registrar log de login (Fire and forget)
        logActivity('login', `Superadmin ${email} realizou login`);

        return authData;
    } catch (error) {
        console.error('Erro no login do Superadmin:', error);
        throw error;
    }
}

/**
 * Realiza o logout do sistema
 */
export async function logout() {
    try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            await logActivity('logout', `Superadmin ${data.session.user.email} realizou logout`);
        }
    } catch (e) {
        console.warn('Falha ao registrar log de logout:', e);
    }
    
    await supabase.auth.signOut();
    window.location.href = '/admingod/login';
}

/**
 * Verifica se a sessão é válida e redireciona caso não seja
 */
export async function requireAuth() {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
        window.location.href = '/admingod/login';
        return false;
    }

    // Validação server-side em tempo real
    const { data: userData, error: userError } = await supabase
        .from('admin_users')
        .select('role')
        .eq('id', data.session.user.id)
        .single();

    if (userError || !userData || userData.role !== 'superadmin') {
        await supabase.auth.signOut();
        window.location.href = '/admingod/login';
        return false;
    }

    setupInactivityTimeout();
    return true;
}

/**
 * Redireciona para o painel se já estiver logado
 */
export async function requireGuest() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
        const { data: userData } = await supabase
            .from('admin_users')
            .select('role')
            .eq('id', data.session.user.id)
            .single();

        if (userData && userData.role === 'superadmin') {
            window.location.href = '/admingod/';
            return false;
        }
    }
    return true;
}

/**
 * Controla o timeout de inatividade.
 * Usa AbortController para garantir que listeners anteriores sejam removidos
 * antes de registrar novos (evita acúmulo de listeners a cada chamada).
 */
let _inactivityAbortController = null;

function setupInactivityTimeout() {
    // Abortar o controller anterior (remove todos os listeners registrados com ele)
    if (_inactivityAbortController) {
        _inactivityAbortController.abort();
    }
    _inactivityAbortController = new AbortController();
    const signal = _inactivityAbortController.signal;

    // Limpar timer existente
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const resetTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            if (window.showToast) {
                showToast('Sessão expirada por inatividade. Redirecionando...', 'warning');
            }
            logout();
        }, TIMEOUT_MS);
    };

    // Registrar listeners com o signal do AbortController
    // → serão automaticamente removidos quando o controller for abortado
    const opts = { signal };
    window.addEventListener('mousemove', resetTimer, opts);
    window.addEventListener('keypress', resetTimer, opts);
    window.addEventListener('click', resetTimer, opts);
    window.addEventListener('scroll', resetTimer, opts);

    resetTimer();
}

/**
 * Ações válidas para o log de atividades do Superadmin.
 * Qualquer ação fora desta lista será registrada como 'unknown_action'.
 */
const VALID_LOG_ACTIONS = new Set([
    'login', 'logout', 'create_tenant', 'edit_tenant', 'delete_tenant',
    'toggle_status', 'login_as_tenant', 'edit_tenant', 'approve_tenant',
    'reject_tenant', 'add_domain', 'remove_domain', 'check_dns',
    'send_notification', 'clear_logs', 'export_data', 'save_settings',
    'unknown_action'
]);

/**
 * Registra logs de atividades do Superadmin com sanitização de entrada.
 * @param {string} action - Ação realizada (deve ser uma das VALID_LOG_ACTIONS)
 * @param {string} details - Detalhes da ação (truncado a 500 chars)
 */
export async function logActivity(action, details) {
    try {
        const safeAction = VALID_LOG_ACTIONS.has(action) ? action : 'unknown_action';
        const safeDetails = typeof details === 'string'
            ? details.slice(0, 500)
            : String(details ?? '').slice(0, 500);

        await supabase.from('activity_log').insert([{
            tenant_id: null,
            action: safeAction,
            details: safeDetails
        }]);
    } catch (e) {
        console.error('Erro ao salvar log de atividade:', e);
    }
}
