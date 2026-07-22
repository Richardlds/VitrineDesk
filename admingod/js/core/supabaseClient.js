// Supabase Config for Super Admin (VitrineDesk God)
// ATENÇÃO: Utilizando a chave SERVICE_ROLE para contornar o RLS globalmente.

const SUPABASE_URL = 'https://ioadqdpxbuqdlwamqtxm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODk2OSwiZXhwIjoyMDk2ODI0OTY5fQ.xpNp3X4DBiTpOYLaeN8KPb0M-NHTaQJog-vU8PelUlI';

// O supabase-js expõe `window.supabase` através da CDN (index.html).
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
