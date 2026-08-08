// Supabase Config for Super Admin (VitrineDesk God)
// ATENÇÃO: Migrado para ANON_KEY. É necessário configurar RLS (Role Level Security)
// no banco de dados Supabase para permitir acesso ao usuário AdminGod.

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

// Impersonation Helper (Logar como Tenant)
export function impersonateTenant(tenantId) {
    localStorage.setItem('impersonate_tenant_id', tenantId);
    if (window.showToast) window.showToast('Logado como o Lojista com sucesso.', 'success');
    setTimeout(() => {
        // Redireciona para o admin root (que usará o impersonate)
        window.open('../admin/index.html', '_blank');
    }, 1000);
}
