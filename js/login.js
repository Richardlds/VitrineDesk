import { supabase } from './config.js';

import { loginMerchant, registerMerchant, loginWithGoogle, completeGoogleRegistration } from './auth.js';

import { getQueryParam, showToast, checkMaintenanceMode } from './utils.js';



const MAX_ATTEMPTS = 5;

const BLOCK_TIME = 30000;



function checkRateLimit() {

  const attempts = JSON.parse(sessionStorage.getItem('login_attempts') || '{"count":0,"blockUntil":0}');

  if (attempts.blockUntil > Date.now()) {

    const secondsLeft = Math.ceil((attempts.blockUntil - Date.now()) / 1000);

    showToast(`Muitas tentativas. Aguarde ${secondsLeft}s.`, 'error');

    return false;

  }

  return true;

}



function recordFailedAttempt() {

  const attempts = JSON.parse(sessionStorage.getItem('login_attempts') || '{"count":0,"blockUntil":0}');

  attempts.count++;

  if (attempts.count >= MAX_ATTEMPTS) {

    attempts.blockUntil = Date.now() + BLOCK_TIME;

    attempts.count = 0;

  }

  sessionStorage.setItem('login_attempts', JSON.stringify(attempts));

}



function resetAttempts() {

  sessionStorage.removeItem('login_attempts');

}



async function hashPasswordSHA256(password) {

  if (!crypto.subtle) { return `sha256:${btoa(password)}`; }

  const encoder = new TextEncoder();

  const data = encoder.encode(password);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));

  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `sha256:${hashHex}`;

}



document.addEventListener('DOMContentLoaded', async () => {



  // Initialize Lucide Icons

  if (typeof lucide !== 'undefined') {

    lucide.createIcons();

  }



  const msg = getQueryParam('msg');

  if (msg === 'pending') showToast('Seu cadastro está em análise. Aguarde a aprovação.', 'warning');

  if (msg === 'rejected') showToast('Seu cadastro foi recusado. Contate o suporte.', 'error');

  if (msg === 'suspended') showToast('Sua conta está suspensa. Contate o suporte.', 'error');

  if (msg) window.history.replaceState({}, document.title, window.location.pathname);



  await checkMaintenanceMode(supabase);

  const particlesContainer = document.getElementById('bg-particles');

  if (particlesContainer) {

    for (let i = 0; i < 15; i++) {

      const p = document.createElement('div');

      p.classList.add('particle');

      const size = Math.random() * 50 + 15;

      p.style.width = size + 'px';

      p.style.height = size + 'px';

      p.style.left = Math.random() * 100 + '%';

      p.style.top = Math.random() * 100 + '%';

      p.style.animationDelay = Math.random() * 8 + 's';

      p.style.animationDuration = (Math.random() * 12 + 12) + 's';

      particlesContainer.appendChild(p);

    }

  }



  // 1b. GOOGLE AUTH REDIRECT CHECK

  try {

    const { data: sessionData } = await supabase.auth.getSession();

    if (sessionData?.session?.user) {

      const user = sessionData.session.user;

      

      const { data: tenantData } = await supabase.from('tenants').select('id, is_active, approval_status').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

      

      if (tenantData) {

        if (tenantData.approval_status === 'pending') {

           await supabase.auth.signOut();

           window.location.href = window.location.origin + window.location.pathname + '?msg=pending';

           return;

        } else if (tenantData.approval_status === 'rejected') {

           await supabase.auth.signOut();

           window.location.href = window.location.origin + window.location.pathname + '?msg=rejected';

           return;

        } else if (!tenantData.is_active) {

           await supabase.auth.signOut();

           window.location.href = window.location.origin + window.location.pathname + '?msg=suspended';

           return;

        } else {

           window.location.href = 'admin/';

           return;

        }

      }



      const { data: adminData } = await supabase.from('admin_users').select('role').eq('id', user.id).limit(1).maybeSingle();

      if (adminData?.role === 'superadmin' || adminData?.role === 'admin') {

        window.location.href = 'admingod/';

        return;

      }



      const modalComplete = document.getElementById('modal-complete-registration');

        if (modalComplete) {

           modalComplete.style.display = 'flex';

           setTimeout(() => modalComplete.classList.add('active'), 10);

           

           const validarCPF = (cpf) => {

               cpf = cpf.replace(/[^\d]+/g,'');

               if(cpf == '' || cpf.length != 11 || /^(\d)\1{10}$/.test(cpf)) return false;

               let add = 0;

               for (let i=0; i < 9; i ++) add += parseInt(cpf.charAt(i)) * (10 - i);

               let rev = 11 - (add % 11);

               if (rev == 10 || rev == 11) rev = 0;

               if (rev != parseInt(cpf.charAt(9))) return false;

               add = 0;

               for (let i = 0; i < 10; i ++) add += parseInt(cpf.charAt(i)) * (11 - i);

               rev = 11 - (add % 11);

               if (rev == 10 || rev == 11) rev = 0;

               return rev == parseInt(cpf.charAt(10));

           };

           

           const validarCNPJ = (cnpj) => {

               cnpj = cnpj.replace(/[^\d]+/g,'');

               if(cnpj == '' || cnpj.length != 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

               let tamanho = cnpj.length - 2;

               let numeros = cnpj.substring(0,tamanho);

               let digitos = cnpj.substring(tamanho);

               let soma = 0;

               let pos = tamanho - 7;

               for (let i = tamanho; i >= 1; i--) {

                 soma += numeros.charAt(tamanho - i) * pos--;

                 if (pos < 2) pos = 9;

               }

               let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;

               if (resultado != digitos.charAt(0)) return false;

               tamanho = tamanho + 1;

               numeros = cnpj.substring(0,tamanho);

               soma = 0;

               pos = tamanho - 7;

               for (let i = tamanho; i >= 1; i--) {

                 soma += numeros.charAt(tamanho - i) * pos--;

                 if (pos < 2) pos = 9;

               }

               resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;

               return resultado == digitos.charAt(1);

           };



           const docInput = document.getElementById('google-reg-document');

           if (docInput) {

             docInput.addEventListener('input', (e) => {

               let v = e.target.value.replace(/\D/g, '');

               if (v.length <= 11) {

                 v = v.replace(/(\d{3})(\d)/, '$1.$2');

                 v = v.replace(/(\d{3})(\d)/, '$1.$2');

                 v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');

               } else {

                 v = v.replace(/^(\d{2})(\d)/, '$1.$2');

                 v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');

                 v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');

                 v = v.replace(/(\d{4})(\d)/, '$1-$2');

               }

               e.target.value = v.substring(0, 18);

             });

           }



           const formComplete = document.getElementById('form-complete-google');

           formComplete.addEventListener('submit', async (e) => {

             e.preventDefault();

             const shopName = document.getElementById('google-reg-name').value;

             const razaoSocial = document.getElementById('google-reg-razao-social').value;

             const documentVal = document.getElementById('google-reg-document').value;

             const btnSubmit = document.getElementById('btn-complete-google-submit');

             const errorMsg = document.getElementById('google-reg-document-err');

             

             if (errorMsg) errorMsg.textContent = '';

             

             const rawDoc = documentVal.replace(/[^\d]+/g,'');

             let docValido = false;

             if (rawDoc.length === 11) {

                 docValido = validarCPF(rawDoc);

             } else if (rawDoc.length === 14) {

                 docValido = validarCNPJ(rawDoc);

             }

             

             if (!docValido) {

                 if (errorMsg) errorMsg.textContent = 'CPF ou CNPJ inválido.';

                 return;

             }

             

             btnSubmit.disabled = true;

             btnSubmit.innerHTML = 'Criando...';

             

             const res = await completeGoogleRegistration(user.id, user.email, shopName, 'outros', razaoSocial, documentVal);

             

             btnSubmit.disabled = false;

             btnSubmit.innerHTML = 'Criar Minha Loja';

             

             if (res !== null) {

                 window.location.href = window.location.origin + window.location.pathname + '?msg=pending';

             }

           });

        }

    }

  } catch(e) {

    console.error('Erro Google:', e);

  }



  // 1c. GOOGLE BUTTONS CLICK

  const googleBtns = document.querySelectorAll('.btn-google-login');

  googleBtns.forEach(btn => {

    btn.addEventListener('click', () => {

      loginWithGoogle();

    });

  });



  // 2. SWITCH TAB NAVIGATION

  const tabs = document.querySelectorAll('.auth-tab');

  const forms = document.querySelectorAll('.auth-form');



  tabs.forEach(tab => {

    tab.addEventListener('click', () => {

      const targetTab = tab.getAttribute('data-tab');



      tabs.forEach(t => t.classList.remove('active'));

      tab.classList.add('active');



      forms.forEach(form => {

        form.classList.remove('active');

        if (form.id === `form-${targetTab}`) {

          form.classList.add('active');

        }

      });

    });

  });



  // Check query parameter to switch to register tab automatically

  if (getQueryParam('register') === 'true') {

    const regTab = document.querySelector('.auth-tab[data-tab="register"]');

    if (regTab) regTab.click();

  }



  // 3. TOGGLE SHOW/HIDE PASSWORD

  const togglePassBtns = document.querySelectorAll('.toggle-password');

  togglePassBtns.forEach(btn => {

    btn.addEventListener('click', () => {

      const input = btn.previousElementSibling.previousElementSibling;

      if (input && (input.type === 'password' || input.type === 'text')) {

        if (input.type === 'password') {

          input.type = 'text';

          btn.innerHTML = '<i data-lucide="eye-off" style="width: 18px; height: 18px; color: var(--text-tertiary);"></i>';

        } else {

          input.type = 'password';

          btn.innerHTML = '<i data-lucide="eye" style="width: 18px; height: 18px; color: var(--text-tertiary);"></i>';

        }

        if (window.lucide) lucide.createIcons();

      }

    });

  });



  // 4. FLOATING LABELS VALUE DETECTOR

  const inputs = document.querySelectorAll('.input-group input, .input-group select');

  inputs.forEach(input => {

    input.addEventListener('blur', () => {

      if (input.value.trim() !== '') {

        input.parentElement.classList.add('has-value');

      } else {

        input.parentElement.classList.remove('has-value');

      }

    });



    if (input.value.trim() !== '') {

      input.parentElement.classList.add('has-value');

    }

  });



  // 5. REGISTRATION PASSWORD STRENGTH METER

  const regPassword = document.getElementById('reg-password');

  const strengthBars = document.querySelectorAll('.strength-bar');



  if (regPassword) {

    regPassword.addEventListener('input', () => {

      const val = regPassword.value;

      strengthBars.forEach(b => b.className = 'strength-bar');



      if (val.length === 0) return;



      if (val.length < 6) {

        strengthBars[0].classList.add('weak');

      } else if (val.length >= 6 && val.length < 10) {

        strengthBars[0].classList.add('medium');

        strengthBars[1].classList.add('medium');

      } else {

        strengthBars[0].classList.add('strong');

        strengthBars[1].classList.add('strong');

        strengthBars[2].classList.add('strong');

      }

    });

  }



  // 5b. DOCUMENT FORMATTING AND RAZAO SOCIAL TOGGLE

  const docInput = document.getElementById('reg-document');

  const razaoGroup = document.getElementById('reg-razao-social-group');

  const razaoInput = document.getElementById('reg-razao-social');



  if (docInput && razaoGroup) {

    docInput.addEventListener('input', (e) => {

      let val = e.target.value.replace(/\D/g, ''); // Remove non-digits



      if (val.length <= 11) {

        // Formato CPF: 000.000.000-00

        val = val.replace(/(\d{3})(\d)/, '$1.$2');

        val = val.replace(/(\d{3})(\d)/, '$1.$2');

        val = val.replace(/(\d{3})(\d{1,2})$/, '$1-$2');

        razaoGroup.style.display = 'none';

        if (razaoInput) razaoInput.required = false;

      } else {

        // Formato CNPJ: 00.000.000/0000-00

        val = val.substring(0, 14); // Limita a 14 nÃÂºmeros

        val = val.replace(/^(\d{2})(\d)/, '$1.$2');

        val = val.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');

        val = val.replace(/\.(\d{3})(\d)/, '.$1/$2');

        val = val.replace(/(\d{4})(\d)/, '$1-$2');



        // SÃÂ³ exibe a Razão Social se for de fato um CNPJ

        razaoGroup.style.display = 'block';

        if (razaoInput) razaoInput.required = true;

      }



      e.target.value = val;

    });

  }



  // 6. REAL-TIME VALIDATIONS & SUBMIT FOR LOGIN

  const formLogin = document.getElementById('form-login');

  const btnLoginSubmit = document.getElementById('btn-login-submit');



  if (formLogin) {

    formLogin.addEventListener('submit', async (e) => {

      e.preventDefault();



      const emailInput = document.getElementById('login-email');

      const passwordInput = document.getElementById('login-password');

      const emailErr = document.getElementById('login-email-err');

      const passwordErr = document.getElementById('login-password-err');



      emailErr.textContent = '';

      passwordErr.textContent = '';

      emailInput.parentElement.classList.remove('invalid');

      passwordInput.parentElement.classList.remove('invalid');



      let isValid = true;

      const emailVal = emailInput.value.trim();

      const passwordVal = passwordInput.value;



      if (!emailVal) {

        emailErr.textContent = 'Por favor, insira seu identificador.';

        emailInput.parentElement.classList.add('invalid');

        isValid = false;

      }



      if (!passwordVal) {

        passwordErr.textContent = 'Por favor, insira sua senha.';

        passwordInput.parentElement.classList.add('invalid');

        isValid = false;

      }



      if (!isValid) return;



      if (!checkRateLimit()) return;



      if (btnLoginSubmit) btnLoginSubmit.classList.add('btn-loading');



      try {

        let staffTenants = null;

        try {

          // Staff check first

          const resultStaff = await supabase

            .from('tenants')

            .select('id, name, slug, settings')

            .contains('settings', { usuarios: [{ email: emailVal.toLowerCase() }] });

          staffTenants = resultStaff.data;

        } catch (staffErr) {

          console.warn('Erro ao verificar staff, continuando login de Lojista normal...', staffErr);

        }



        let foundStaff = null;

        let staffTenant = null;

        let needsPasswordUpdate = false;



        if (staffTenants && staffTenants.length > 0) {

          const hashedInputPassword = await hashPasswordSHA256(passwordVal);



          for (const t of staffTenants) {

            const usuarios = t.settings?.usuarios || [];

            const user = usuarios.find(u => u.email?.toLowerCase() === emailVal.toLowerCase());



            if (user) {

              if (user.password === hashedInputPassword) {

                foundStaff = user;

                staffTenant = t;

                break;

              } else if (user.password === passwordVal) {

                foundStaff = user;

                staffTenant = t;

                needsPasswordUpdate = true;

                break;

              }

            }

          }

        }



        if (foundStaff && staffTenant) {

          if (needsPasswordUpdate) {

            const hashedNewPassword = await hashPasswordSHA256(passwordVal);

            const updatedUsuarios = staffTenant.settings.usuarios.map(u => {

              if (u.email?.toLowerCase() === foundStaff.email?.toLowerCase()) {

                return { ...u, password: hashedNewPassword };

              }

              return u;

            });

            const newSettings = { ...staffTenant.settings, usuarios: updatedUsuarios };



            await supabase

              .from('tenants')

              .update({ settings: newSettings })

              .eq('id', staffTenant.id);

          }



          const safeStaffData = { ...foundStaff };

          delete safeStaffData.password;



          sessionStorage.setItem('staff_user', JSON.stringify(safeStaffData));

          sessionStorage.setItem('staff_auth_expires', Date.now() + (24 * 60 * 60 * 1000));

          sessionStorage.setItem('staff_tenant_id', staffTenant.id);

          localStorage.removeItem('impersonated_tenant_id');

          localStorage.removeItem('impersonate_tenant_id');

          resetAttempts();



          showToast(`Bem-vindo, ${foundStaff.name}!`, 'success');

          setTimeout(() => {

            window.location.href = 'admin/';

          }, 500);

          return;

        }



        const result = await loginMerchant(emailVal, passwordVal);



        if (result) {

          const { data: sessionData } = await supabase.auth.getSession();



          if (sessionData?.session?.user) {

            const { data: adminData } = await supabase

              .from('admin_users')

              .select('role')

              .eq('id', sessionData.session.user.id)

              .maybeSingle();



            if (adminData?.role === 'superadmin' || adminData?.role === 'admin') {

              resetAttempts();

              showToast('Bem-vindo, Superadmin!', 'success');

              setTimeout(() => {

                window.location.href = 'admingod/';

              }, 500);

              return;

            }

          }

        }



        if (!result) {

          recordFailedAttempt();

          if (btnLoginSubmit) btnLoginSubmit.classList.remove('btn-loading');

        } else {

          resetAttempts();

        }

      } catch (err) {

        console.error('Detalhe tÃÂ©cnico:', err);

        recordFailedAttempt();

        showToast('Erro inesperado ao fazer login.', 'error');

        if (btnLoginSubmit) btnLoginSubmit.classList.remove('btn-loading');

      }

    });

  }



  // 7. REAL-TIME VALIDATIONS & SUBMIT FOR REGISTER

  const formRegister = document.getElementById('form-register');

  const btnRegisterSubmit = document.getElementById('btn-register-submit');



  if (formRegister) {

    formRegister.addEventListener('submit', async (e) => {

      e.preventDefault();



      const nameInput = document.getElementById('reg-name');

      const emailInput = document.getElementById('reg-email');

      const passwordInput = document.getElementById('reg-password');

      const razaoInput = document.getElementById('reg-razao-social');

      const docInput = document.getElementById('reg-document');



      const nameErr = document.getElementById('reg-name-err');

      const emailErr = document.getElementById('reg-email-err');

      const passwordErr = document.getElementById('reg-password-err');

      const razaoErr = document.getElementById('reg-razao-social-err');

      const docErr = document.getElementById('reg-document-err');



      nameErr.textContent = '';

      emailErr.textContent = '';

      passwordErr.textContent = '';

      if (razaoErr) razaoErr.textContent = '';

      if (docErr) docErr.textContent = '';



      nameInput.parentElement.classList.remove('invalid');

      emailInput.parentElement.classList.remove('invalid');

      passwordInput.parentElement.classList.remove('invalid');

      if (razaoInput) razaoInput.parentElement.classList.remove('invalid');

      if (docInput) docInput.parentElement.classList.remove('invalid');



      let isValid = true;

      const nameVal = nameInput.value.trim();

      const emailVal = emailInput.value.trim();

      const passwordVal = passwordInput.value;

      const razaoVal = razaoInput ? razaoInput.value.trim() : '';

      const docVal = docInput ? docInput.value.trim() : '';

      const typeVal = 'outros';



      if (!nameVal || nameVal.length < 2) {

        nameErr.textContent = 'Nome da loja ÃÂ© muito curto (mÃÂ­nimo 2 caracteres).';

        nameInput.parentElement.classList.add('invalid');

        isValid = false;

      }



      if (!emailVal || !emailVal.includes('@')) {

        emailErr.textContent = 'Por favor, insira um e-mail vÃÂ¡lido.';

        emailInput.parentElement.classList.add('invalid');

        isValid = false;

      }



      if (!passwordVal || passwordVal.length < 6) {

        passwordErr.textContent = 'A senha deve ter no mÃÂ­nimo 6 caracteres.';

        passwordInput.parentElement.classList.add('invalid');

        isValid = false;

      }



      if (!isValid) return;



      if (btnRegisterSubmit) btnRegisterSubmit.classList.add('btn-loading');



      try {

        const result = await registerMerchant(emailVal, passwordVal, nameVal, typeVal, razaoVal, docVal);

        if (!result) {

          if (btnRegisterSubmit) btnRegisterSubmit.classList.remove('btn-loading');

        }

      } catch (err) {

        console.error('Detalhe tÃÂ©cnico:', err);

        showToast('Erro inesperado no cadastro.', 'error');

        if (btnRegisterSubmit) btnRegisterSubmit.classList.remove('btn-loading');

      }

    });

  }



  // Ã¢Åâ¦ CORRIGIDO: 8. Support Modal Logic - tenant_id agora ÃÂ© obrigatÃÂ³rio

  const linkSupport = document.getElementById('link-support');

  const modalSupport = document.getElementById('modal-support');

  const closeSupportBtn = modalSupport?.querySelector('.close-btn');



  if (linkSupport && modalSupport) {

    linkSupport.addEventListener('click', (e) => {

      e.preventDefault();

      modalSupport.classList.add('active');

    });

  }



  if (closeSupportBtn && modalSupport) {

    closeSupportBtn.addEventListener('click', () => {

      modalSupport.classList.remove('active');

    });



    modalSupport.addEventListener('click', (e) => {

      if (e.target === modalSupport) {

        modalSupport.classList.remove('active');

      }

    });

  }



  const formSupport = document.getElementById('form-support');

  if (formSupport) {

    formSupport.addEventListener('submit', async (e) => {

      e.preventDefault();

      const email = document.getElementById('support-email').value;

      const subject = document.getElementById('support-subject').value;

      const msg = document.getElementById('support-msg').value;

      const btnSubmit = document.getElementById('btn-support-submit');



      const origText = btnSubmit.innerHTML;

      btnSubmit.innerHTML = 'Enviando...';

      btnSubmit.disabled = true;



      try {

        // Ã¢Åâ¦ CORRIGIDO: Buscar ou criar um tenant "suporte" para associar o ticket

        // EstratÃÂ©gia: usar um tenant especial de sistema ou o primeiro tenant ativo

        let tenantId = null;



        // Tenta encontrar um tenant de sistema (slug = 'sistema' ou 'vitrinedesk')

        const { data: systemTenant } = await supabase

          .from('tenants')

          .select('id')

          .eq('slug', 'sistema')

          .maybeSingle();



        if (systemTenant) {

          tenantId = systemTenant.id;

        } else {

          // Fallback: pega o primeiro tenant ativo

          const { data: firstTenant } = await supabase

            .from('tenants')

            .select('id')

            .eq('is_active', true)

            .limit(1)

            .maybeSingle();



          if (firstTenant) {

            tenantId = firstTenant.id;

          } else {

            throw new Error('Nenhum tenant disponÃÂ­vel para associar o ticket.');

          }

        }



        // Criar o ticket na tabela support_tickets

        const { data: tData, error: tErr } = await supabase.from('support_tickets')

          .insert([{

            tenant_id: tenantId,

            contact_email: email,

            subject: subject,

            category: 'nova_loja',

            priority: 'normal',

            status: 'open'

          }])

          .select()

          .single();



        if (tErr) throw tErr;



        // Inserir a mensagem

        const { error: mErr } = await supabase.from('support_messages')

          .insert([{

            ticket_id: tData.id,

            sender_type: 'tenant',

            message: msg

          }]);



        if (mErr) throw mErr;



        showToast('Sua mensagem foi enviada! O suporte entrarÃÂ¡ em contato.', 'success');

        modalSupport.classList.remove('active');

        formSupport.reset();

      } catch (err) {

        console.error('Erro ao enviar suporte:', err);

        showToast('Erro ao enviar. Tente novamente mais tarde.', 'error');

      } finally {

        btnSubmit.innerHTML = origText;

        btnSubmit.disabled = false;

      }

    });

  }



});

