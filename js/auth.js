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
      password,
      options: {
        data: {
          shopName: shopName.trim(),
          type: type || 'outros',
          razaoSocial: razaoSocial || '',
          document: document || ''
        }
      }
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
      // Se não tem sessão, significa que o "Confirm Email" está ativo no Supabase
      if (!data.session) {
          showToast('✅ Conta criada! Verifique seu e-mail para ativar.', 'success');
          // Redirecionar para o login em vez do admin, ou apenas limpar o form
          setTimeout(() => {
              const loginTab = document.querySelector('.auth-tab[data-tab="login"]');
              if(loginTab) loginTab.click();
              document.getElementById('form-register').reset();
          }, 2000);
          return data;
      }

      // Se tem sessão, a verificação de e-mail não está ativa (comportamento legado)
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
        approval_status: 'approved',
        is_active: true,
        subscription_status: 'active',
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
      
      // Disparar o envio do email de boas-vindas na Vercel (dispara e esquece)
      fetch('/api/admin/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), shopName: shopName.trim() })
      }).catch(e => console.error('Erro ao chamar envio de email de boas vindas', e));

      showToast('✅ Cadastro realizado! Entrando no sistema...', 'success');
      setTimeout(() => window.location.href = '/admin/', 1500);
    }
    return data;
  } catch (err) {
    showToast('Erro de conexão. Tente novamente.', 'error');
    return null;
  }
}

// Fazer Login
export async function loginMerchant(email, password, silent = false) {
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
      if (!silent) showToast("Bem-vindo, Superadmin! 🚀", "success");
      setTimeout(() => {
        window.location.href = '/admingod/';
      }, 500);
    } else {
      // ✅ Verificar se é Owner (dono da loja)
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, is_active, approval_status')
        .eq('owner_id', data.user.id)
        .maybeSingle();

      if (tenantData) {
        if (tenantData.approval_status === 'pending') {
          await supabase.auth.signOut();
          if (!silent) showToast('Seu cadastro está em análise. Aguarde a aprovação.', 'warning');
          return null;
        }
        if (tenantData.approval_status === 'rejected') {
          await supabase.auth.signOut();
          if (!silent) showToast('Seu cadastro foi recusado. Contate o suporte.', 'error');
          return null;
        }
        if (!tenantData.is_active) {
          await supabase.auth.signOut();
          if (!silent) showToast('Sua conta está suspensa. Contate o suporte.', 'error');
          return null;
        }
        if (!silent) showToast("Login realizado!", "success");
        setTimeout(() => {
          window.location.href = '/admin/';
        }, 500);
      } else {
        // ✅ Se não é Owner, verificar se é Funcionário (Staff) na tabela tenant_users
        const { data: staffData } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', data.user.id)
          .maybeSingle();
          
        if (staffData && staffData.tenant_id) {
          sessionStorage.setItem('staff_tenant_id', staffData.tenant_id);
          if (!silent) showToast("Bem-vindo(a) à loja!", "success");
          setTimeout(() => {
            window.location.href = '/admin/';
          }, 500);
        } else {
          // Não é owner nem staff válido
          await supabase.auth.signOut();
          if (!silent) showToast('Nenhuma loja vinculada a este usuário.', 'error');
          return null;
        }
      }
    }

    return data;
  } catch (err) {
    if (!silent) {
      console.error('Detalhe técnico:', err);
      if (err.message && err.message.includes('Invalid login credentials')) {
        showToast('E-mail ou senha incorretos.', 'error');
      } else {
        showToast('Erro inesperado. Tente novamente.', 'error');
      }
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
// Login com Google
export async function loginWithGoogle() {
  try {
    localStorage.setItem('oauth_redirect', window.location.pathname);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
  } catch (err) {
    console.error('Erro no login com Google:', err);
    showToast('Erro ao iniciar login com Google', 'error');
  }
}

// Completar cadastro de usu�rio logado via Google
export async function completeGoogleRegistration(userId, email, shopName, type, razaoSocial, document) {
  if (!shopName || shopName.trim().length < 2) {
    showToast('Nome da loja � obrigat�rio', 'error');
    return null;
  }

  try {
    const slug = shopName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString().slice(-4);

    // Buscar plano padr�o
    const { data: defaultPlan } = await supabase.from('plans').select('id').eq('is_default', true).maybeSingle();

    // Buscar configura��es master para trial e mensagem
    const { data: masterSettings } = await supabase.from('master_settings').select('trial_days, welcome_msg_title, welcome_msg_body').eq('id', 1).maybeSingle();

    let vencimento = null;
    if (masterSettings && masterSettings.trial_days) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(masterSettings.trial_days));
      vencimento = d.toISOString();
    }

    const { data: insertedTenants, error: tenantError } = await supabase.from('tenants').insert([{
      owner_id: userId,
      name: shopName.trim(),
      slug: slug,
      type: type || 'barbearia',
      approval_status: 'approved',
      is_active: true,
      subscription_status: 'active',
      settings: {
        razao_social: razaoSocial || '',
        cnpj: document || '',
        email: email.trim().toLowerCase(),
        plano_id: defaultPlan ? defaultPlan.id : null,
        vencimento: vencimento
      }
    }]).select();

    if (tenantError || !insertedTenants || insertedTenants.length === 0) {
      showToast('Erro ao criar loja. Verifique se os dados est�o corretos.', 'error');
      console.error(tenantError);
      return null;
    }

    const insertedTenant = insertedTenants[0];

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

    // Criar a filial Matriz padr�o automaticamente
    await supabase.from('branches').insert([{
      tenant_id: insertedTenant.id,
      name: 'Matriz - ' + shopName.trim(),
      is_main: true
    }]);

    showToast('✅ Cadastro concluído! Entrando no sistema...', 'success');
    setTimeout(() => window.location.href = '/admin/', 1500);
    return true;
  } catch (err) {
    console.error('Detalhe tcnico ao completar cadastro:', err);
    showToast('Erro ao finalizar cadastro.', 'error');
    return null;
  }
}
