// Supabase Config
// ATENÇÃO: Utilizando a chave 'anon' pública com RLS configurado.

const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU';

// O supabase-js expõe `window.supabase` através da CDN (index.html).
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: window.sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// Helper global para gerenciar qual Tenant (Lojista) está ativo
let cachedTenantId = null;

export async function getCurrentTenantId() {
    if (cachedTenantId) return cachedTenantId;

    // 1. Check for Impersonation (Superadmin impersonating a tenant)
    const impersonated = localStorage.getItem('impersonate_tenant_id');
    if (impersonated) {
        cachedTenantId = impersonated;
        return cachedTenantId;
    }

    // 2. Check for Staff user
    const staffTenantId = sessionStorage.getItem('staff_tenant_id');
    const staffUserStr = sessionStorage.getItem('staff_user');
    const staffExpires = sessionStorage.getItem('staff_auth_expires');

    if (staffTenantId && staffUserStr && staffExpires) {
        if (Date.now() < parseInt(staffExpires)) {
            cachedTenantId = staffTenantId;
            return cachedTenantId;
        } else {
            // Expired staff session
            sessionStorage.removeItem('staff_tenant_id');
            sessionStorage.removeItem('staff_user');
            sessionStorage.removeItem('staff_auth_expires');
        }
    }

    // 2.5 Fast Path: LocalStorage Cache
    const savedTenantId = localStorage.getItem('my_tenant_id');
    const savedUserId = localStorage.getItem('my_user_id');
    const { data: sessionData } = await supabase.auth.getSession();

    if (sessionData?.session?.user?.id && sessionData.session.user.id === savedUserId && savedTenantId) {
        cachedTenantId = savedTenantId;
        return cachedTenantId;
    }

    // 3. Pegar usuário autenticado (Owner via Supabase)
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
        console.error('Usuário não autenticado ou sessão expirada.');
        window.location.href = '../login.html';
        return null;
    }

    // Buscar o tenant que pertence a este usuário
    const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_id', authData.user.id)
        .single();

    if (error || !data) {
        console.error('Nenhum tenant vinculado a este usuário foi encontrado!');
        return null;
    }

    cachedTenantId = data.id;
    localStorage.setItem('my_tenant_id', cachedTenantId);
    localStorage.setItem('my_user_id', authData.user.id);
    return cachedTenantId;
}

// ────────────────────────── Funções Utilitárias Globais ──────────────────────────

/**
 * Faz o upload de um arquivo para um bucket do Supabase Storage e retorna a URL pública
 * @param {File} file O arquivo a ser upado
 * @param {string} bucketName O nome do bucket (ex: 'tenant-images', 'avatars')
 * @param {string} tenantId O ID do tenant (usado para organizar as pastas no bucket)
 * @returns {Promise<string|null>} A URL pública do arquivo ou null se não for enviado
 */
export async function uploadImageToSupabase(file, bucketName, tenantId) {
    if (!file) return null;

    // Extrai a extensão do arquivo
    const fileExt = file.name.split('.').pop();

    // Cria um nome de arquivo único evitando colisões e organizando por tenant
    const fileName = `${tenantId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Faz o upload para o Storage
    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        console.error(`Erro de upload Supabase Storage no bucket ${bucketName}:`, uploadError);
        throw uploadError;
    }

    // Obtém a URL pública do arquivo
    const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

    return urlData.publicUrl;
}

