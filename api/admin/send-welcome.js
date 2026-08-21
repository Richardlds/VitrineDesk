export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, shopName } = req.body;

    if (!email || !shopName) {
      return res.status(400).json({ error: 'E-mail e Nome da Loja são obrigatórios' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      console.warn("Aviso: RESEND_API_KEY não configurada no ambiente. E-mail de boas vindas não enviado.");
      return res.status(200).json({ status: 'skipped', reason: 'Missing API Key' });
    }

    const htmlContent = `
      <div style="background-color: #f6f9fc; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="background: #ffffff; max-width: 500px; margin: 0 auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(50,50,93,0.11), 0 1px 3px rgba(0,0,0,0.08); padding: 40px;">
              <div style="color: #007bff; font-weight: bold; font-size: 24px; margin-bottom: 30px;">VitrineDesk</div>
              <h2 style="color: #1a1f36; font-size: 24px; margin-top: 0; font-weight: 600;">Bem-vindo(a) à VitrineDesk!</h2>
              <p style="color: #3c4257; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Olá, dono(a) da <strong>${shopName}</strong>!</p>
              <p style="color: #3c4257; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Sua conta foi ativada com sucesso. A partir de agora, você tem acesso completo ao painel para configurar seus serviços, agenda e pagamentos.</p>
              <a href="https://vitrinedesk.com/login.html" style="display: inline-block; background: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Acessar Meu Painel</a>
              <p style="color: #697386; font-size: 14px; margin-top: 30px; line-height: 1.5;">Se precisar de ajuda para configurar sua loja, nossa equipe de suporte está à disposição.</p>
          </div>
      </div>
    `;

    // Chamada nativa para a API do Resend (sem necessidade de instalar SDK)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'VitrineDesk <suporte@vitrinedesk.com>', // ALERTA: O domínio deve estar verificado no Resend!
        to: email,
        subject: `Sua loja ${shopName} foi criada com sucesso! 🚀`,
        html: htmlContent
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erro Resend:', errorData);
      return res.status(response.status).json({ error: 'Falha ao enviar e-mail de boas vindas', details: errorData });
    }

    const data = await response.json();
    return res.status(200).json({ status: 'success', data });

  } catch (error) {
    console.error('Erro na Vercel Function (send-welcome):', error);
    return res.status(500).json({ error: 'Erro Interno do Servidor' });
  }
}
