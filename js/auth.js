/* VitrineDesk - Autenticação */
import { supabase } from './config.js';
import { showToast } from './utils.js';

// Registrar novo Lojista com validações
export async function registerMerchant(email, password, shopName, type, razaoSocial, document) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    showToast('Email inválido', 'error');
    return null;
  }
  if (!password || password.length < 6) {
    showToast('Senha deve ter no mínimo 6 caracteres', 'error');
    return null;
  }
  if (!shopName || shopName.trim().length < 2) {
    showToast('Nome da loja é obrigatório', 'error');
    return null;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      if (error.message.includes('already registered')) {
        showToast('Este email já está cadastrado', 'error');
      } else {
        console.error('Detalhe técnico:', error);
        showToast('Erro inesperado. Tente novamente.', 'error');
      }
      return null;
    }

    if (data.user) {
      const slug = shopName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString().slice(-4);

      // Buscar plano padrão
      const { data: defaultPlan } = await supabase.from('plans').select('id').eq('is_default', true).maybeSingle();

      // Buscar configurações master para trial e mensagem
      const { data: masterSettings } = await supabase.from('master_settings').select('trial_days, welcome_msg_title, welcome_msg_body').eq('id', 1).maybeSingle();

      let vencimento = null;
      if (masterSettings && masterSettings.trial_days) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(masterSettings.trial_days));
        vencimento = d.toISOString();
      }

      const { data: insertedTenants, error: tenantError } = await supabase.from('tenants').insert([{
        owner_id: data.user.id,
        name: shopName.trim(),
        slug: slug,
        type: type || 'barbearia',
        approval_status: 'pending',
        is_active: false,
        settings: {
          razao_social: razaoSocial || '',
          cnpj: document || '',
          email: email.trim().toLowerCase(),
          plano_id: defaultPlan ? defaultPlan.id : null,
          vencimento: vencimento
        }
      }]).select();

      if (tenantError || !insertedTenants || insertedTenants.length === 0) {
        showToast('Erro ao criar loja', 'error');
        return null;
      }

      const insertedTenant = insertedTenants[0];

      // O Trigger trigger_notify_god_on_new_tenant avisará o God Mode no Supabase.

      // Enviar mensagem de boas vindas para o lojista
      if (masterSettings && masterSettings.welcome_msg_title && masterSettings.welcome_msg_body) {
        await supabase.from('notifications').insert([{
          tenant_id: insertedTenant.id,
          type: 'system',
          title: masterSettings.welcome_msg_title,
          message: masterSettings.welcome_msg_body,
          read: false
        }]);
      }

      // Criar a filial Matriz padrão automaticamente
      await supabase.from('branches').insert([{
        tenant_id: insertedTenant.id,
        name: 'Matriz - ' + shopName.trim(),
        is_main: true
      }]);
    }

    // Desloga imediatamente o usuário que acabou de se registrar
    await supabase.auth.signOut();

    showToast('✅ Cadastro realizado! Aguardando aprovação do administrador.', 'success');
    setTimeout(() => window.location.href = 'login.html', 3000);
    return data;
  } catch (err) {
    showToast('Erro de conexão. Tente novamente.', 'error');
    return null;
  }
}

// Fazer Login
export async function loginMerchant(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // ✅ Verificar se é SUPERADMIN pela tabela admin_users
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (adminData?.role === 'superadmin' || adminData?.role === 'admin') {
      showToast("Bem-vindo, Superadmin! 🚀", "success");
      setTimeout(() => {
        window.location.href = 'superadmin/index.html';
      }, 500);
    } else {
      // ✅ Verificar se tenant está ativo e aprovado
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('is_active, approval_status')
        .eq('owner_id', data.user.id)
        .maybeSingle();

      if (tenantData) {
        if (tenantData.approval_status === 'pending') {
          await supabase.auth.signOut();
          showToast('Seu cadastro está em análise. Aguarde a aprovação.', 'warning');
          return null;
        }
        if (tenantData.approval_status === 'rejected') {
          await supabase.auth.signOut();
          showToast('Seu cadastro foi recusado. Contate o suporte.', 'error');
          return null;
        }
        if (!tenantData.is_active) {
          await supabase.auth.signOut();
          showToast('Sua conta está suspensa. Contate o suporte.', 'error');
          return null;
        }
      }

      showToast("Login realizado!", "success");
      setTimeout(() => {
        window.location.href = 'admin/';
      }, 500);
    }

    return data;
  } catch (err) {
    console.error('Detalhe técnico:', err);
    if (err.message && err.message.includes('Invalid login credentials')) {
      showToast('E-mail ou senha incorretos.', 'error');
    } else {
      showToast('Erro inesperado. Tente novamente.', 'error');
    }
    return null;
  }
}

// Encerrar Sessão
export async function logoutMerchant() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (window.location.pathname.includes('/admin') || window.location.pathname.includes('/superadmin')) {
      window.location.href = '../login.html';
    } else {
      window.location.href = 'login.html';
    }
  } catch (err) {
    console.error('Detalhe técnico:', err);
    showToast("Erro inesperado. Tente novamente.", "error");
  }
}

// Obter Usuário Atual
export async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.user : null;
  } catch (err) {
    console.error("Erro ao obter usuário atual:", err);
    return null;
  }
}

// Obter Tenant do usuário logado
export async function getCurrentTenant() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Erro ao obter tenant:", err);
    return null;
  }
}