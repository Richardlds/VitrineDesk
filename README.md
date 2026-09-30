<div align="center">
  <img src="assets/favicon.svg" alt="VitrineDesk Logo" width="110" height="110">
  <h1>VitrineDesk</h1>
  <p><strong>Plataforma SaaS Multi-Tenant All-in-One de Gestão Operacional, Autoagendamento PWA, PDV e CRM para Negócios de Serviços e Beleza.</strong></p>

  <p>
    <a href="https://github.com/Richardlds/VitrineDesk"><img src="https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o%20Ativa-00d26a?style=for-the-badge" alt="Status"></a>
    <img src="https://img.shields.io/badge/Arquitetura-Vanilla%20JS%20SPA%20(ES6%2B)-f7df1e?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/Backend-Supabase%20%7C%20PostgreSQL-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
    <img src="https://img.shields.io/badge/Pagamentos-Stripe%20API-635bff?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe">
    <img src="https://img.shields.io/badge/Mobile-PWA%20Ready-ff6b00?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA">
    <a href="LICENSE"><img src="https://img.shields.io/badge/Licen%C3%A7a-MIT-blue?style=for-the-badge" alt="Licença"></a>
  </p>

  <p>
    <a href="#-como-executar-o-projeto-localmente"><strong>Explorar Demonstração Local »</strong></a> ·
    <a href="#-decisões-de-arquitetura-e-engenharia">Decisões de Engenharia</a> ·
    <a href="#-visão-de-negócio-e-problema-resolvido">Visão de Negócio</a> ·
    <a href="#-autor--contato-profissional">Contato</a>
  </p>
</div>

---

## 💼 Visão de Negócio e Problema Resolvido

No setor de estética e prestação de serviços (salões, barbearias, clínicas e estúdios), a gestão costuma ser fragmentada entre mensagens manuais no WhatsApp, cadernos de papel e planilhas desatualizadas. Isso gera **perda de clientes por demora no atendimento**, **altas taxas de ausência (*no-shows*)**, **erros constantes no cálculo manual de comissões de parceiros** e **falta de controle sobre o fluxo de caixa e estoque**.

O **VitrineDesk** foi concebido como uma solução de software robusta (*All-in-One*) que transforma operações manuais em um fluxo digital automatizado de ponta a ponta:

### 🚀 Principais Módulos em Produção

- 📱 **Portal do Cliente PWA (Mobile-First):** O cliente final acessa um link personalizado (`/:slug`), não precisa baixar apps pesados de lojas (tecnologia PWA com instalação na tela inicial) e agenda serviços 24/7 com escolha de profissional, data, horário e checkout online.
- 📅 **Agenda Inteligente com Prevenção de Conflitos:** Grade diária e mensal que calcula dinamicamente durações de procedimentos, intervalos de descanso e disponibilidade da equipe em tempo real.
- 💰 **Frente de Caixa (PDV) & Gestão de OS:** Emissão de Ordens de Serviço (OS), múltiplos métodos de pagamento (dinheiro, cartão, PIX), controle de abertura/fechamento de caixa e conciliação financeira diária.
- 🤝 **Cálculo Automático de Comissões:** Rateio e apuração automatizada de comissões por serviço e produto para cada profissional parceiro, eliminando atritos e erros de fechamento.
- 📦 **Controle de Estoque Integrado:** Cadastro de produtos físicos de consumo interno e venda no balcão, alertas visuais de estoque mínimo e movimentação atrelada às vendas do PDV.
- 🎯 **CRM, Retenção & Planos de Assinatura:**
  - Histórico completo de frequência e ticket médio por cliente.
  - Planos de assinatura recorrentes para fidelização (ex: Clube da Barba/Cabelo).
  - Gestão de cupons de desconto, campanhas promocionais e programa de pontos.
  - *Blacklist* para mitigação de clientes com histórico de faltas não justificadas.
- 🏢 **Multi-Filiais & Controle de Acesso Baseado em Papéis (RBAC):** Gestão centralizada de múltiplas lojas com permissões granulares (*Admin, Gerente, Profissional, Atendente*).
- 👑 **Painel God Mode (SaaS Master Admin):** Painel executivo para controle de tenants (lojistas), gestão de planos de assinatura da plataforma, métricas globais de MRR/ARR e central de tickets de suporte.

---

## 🏛️ Decisões de Arquitetura e Engenharia

A arquitetura do VitrineDesk foi projetada com foco em **alta performance**, **manutenibilidade** e **segurança rigorosa em ambiente multi-tenant**:

```mermaid
flowchart TD
    subgraph Client_Layer["🖥️ Camada de Apresentação (Client-Side)"]
        PWA["Portal PWA (/:slug)<br/>Agendamento & Catálogo"]
        ADMIN["Painel Lojista (/admin/)<br/>SPA Vanilla JS + Controllers"]
        GOD["Painel God Mode (/admingod/)<br/>Gestão Global de Tenants"]
    end

    subgraph Core_Engine["⚙️ SPA Core & Routing"]
        ROUTER["Router.js (Hash Navigation)"]
        STATE["StateManager.js (Reactive Store)"]
        DS["Design System Nativo (Dark Mode Glassmorphic)"]
    end

    subgraph Serverless_Layer["⚡ Backend & Serverless (/api)"]
        API_PAY["Stripe Webhooks & Checkouts"]
        API_AUTH["Admin User Provisioning (Service Role)"]
        API_MAIL["Resend Transactional Emails"]
    end

    subgraph Data_Layer["🗄️ Supabase PostgreSQL Engine"]
        RLS["Row Level Security (RLS)<br/>Isolamento estrito por tenant_id"]
        AUTH_JWT["Supabase Auth (JWT Claims)"]
    end

    Client_Layer --> CORE["Core Engine"]
    CORE --> ROUTER
    ROUTER -->|Dynamic Import| STATE
    ADMIN -->|Token JWT / Anon Key| RLS
    PWA -->|Token JWT / Anon Key| RLS
    ADMIN -->|Ações Administrativas| Serverless_Layer
    PWA -->|Iniciar Checkout| API_PAY
    Serverless_Layer -->|Service Role Key (Bypass RLS Seguro)| Data_Layer
```

### 1. Padrão SPA Vanilla JS com ES6 Modules (Zero Build Step)
- **Por que esta escolha?** Em vez de sobrecarregar o projeto com frameworks pesados e longos tempos de compilação (*bundling overhead*), a aplicação adota uma arquitetura SPA pura em **JavaScript ES6 nativo**.
- **Carregamento Sob Demanda:** O `Router.js` intercepta a navegação por hash (`#/categoria/tela`), realiza o `fetch` do fragmento HTML da view e executa o `import()` dinâmico assíncrono do Controller responsável, garantindo carregamento instantâneo.
- **Gerenciamento de Ciclo de Vida:** Todos os Controllers implementam o método `destroy()` para desregistrar *event listeners* e limpar referências em memória, prevenindo vazamentos de memória (*memory leaks*).

### 2. Isolamento de Dados Multi-Tenant via Row Level Security (RLS)
- **Segurança em Nível de Banco:** O isolamento entre diferentes lojistas não depende unicamente de filtros na aplicação; ele é garantido nativamente no PostgreSQL via **Supabase Row Level Security (RLS)**.
- **Defesa em Profundidade:** Toda requisição autenticada carrega o token JWT do usuário. O banco de dados valida se o `tenant_id` da linha pertence à organização do usuário autenticado.

### 3. Separação Estrita de Credenciais & Backend Serverless
- **Frontend Seguro:** O código exposto ao navegador consome estritamente a chave pública anônima (`anon key`).
- **Funções com Privilégio Elevado:** Operações sensíveis (provisionamento de novos colaboradores, cobranças Stripe e conciliação de webhooks) rodam em Serverless Functions na pasta [`/api`](file:///c:/Users/richard.santo/Documents/GitHub/VitrineDesk/api), utilizando a `SUPABASE_SERVICE_ROLE_KEY` de forma isolada e segura.

### 4. Design System Nativo & Padrão Visual Premium
- **Consistência Visual:** Construído sobre um Design System proprietário em CSS moderno (`design-system.css`), utilizando variáveis CSS (*tokens*), paleta *Dark Mode Glassmorphic*, microinterações e biblioteca unificada de ícones **Lucide**.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias & Ferramentas |
| :--- | :--- |
| **Frontend Core** | Vanilla JavaScript (ES6 Modules), HTML5 Semântico, CSS3 Moderno (Custom Properties & Glassmorphism) |
| **Arquitetura & SPA** | SPA Router nativo, StateManager reativo, Dynamic Module Loader (`import()`) |
| **Mobile & Offline** | Progressive Web App (PWA), Service Workers (`sw.js`), Web App Manifest |
| **Backend & Banco** | [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Auth JWT, Edge Functions) |
| **Pagamentos & Assinaturas** | [Stripe API](https://stripe.com/) (Checkout Sessions, Customer Portal, Webhooks) |
| **Mensageria & E-mails** | [Resend API](https://resend.com/) (Disparo transacional de boas-vindas e lembretes) |
| **UI Libraries** | [Lucide Icons](https://lucide.dev/), [FullCalendar](https://fullcalendar.io/), [Swiper.js](https://swiperjs.com/) |
| **DevOps, Lint & Deploy** | [Vercel](https://vercel.com/) (Static & Serverless Functions), ESLint 10+, GitHub Actions CI |

---

## 💻 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** `>= 18.x` (LTS recomendado: `20.x` ou `22.x`)
- **npm** (incluso com o Node.js)
- Conta no [Supabase](https://supabase.com/) (com o schema do banco e RLS configurados)

### Passo a Passo de Execução

1. **Clonar o Repositório:**
   ```bash
   git clone https://github.com/Richardlds/VitrineDesk.git
   cd VitrineDesk
   ```

2. **Instalar Dependências:**
   ```bash
   npm install
   ```

3. **Configurar as Variáveis de Ambiente:**
   Crie seu arquivo `.env` a partir do modelo de exemplo:
   ```bash
   cp .env.example .env
   ```

   Preencha as variáveis de ambiente necessárias:
   ```env
   # Supabase
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-anon-publica
   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-privada

   # Stripe (Opcional para testes locais)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. **Executar a Verificação de Qualidade de Código:**
   ```bash
   npm run lint
   ```

5. **Iniciar a Aplicação Localmente:**
   ```bash
   # Opção A: Servidor estático leve (SPA & Views)
   npm run serve

   # Opção B: Ambiente completo com Serverless Functions (/api)
   npm run start-dev
   ```

6. **Acessar as Telas:**
   - **Landing Page:** `http://localhost:3000/`
   - **Painel do Lojista (Admin):** `http://localhost:3000/admin/`
   - **Portal do Cliente (PWA):** `http://localhost:3000/cliente/?tenant=demo`
   - **Super Admin (God Mode):** `http://localhost:3000/admingod/`

---

## 📁 Estrutura de Pastas

```text
VitrineDesk/
├── .github/                 # Workflows de CI/CD, Issue Forms e PR Template
├── admin/                   # Painel Administrativo do Lojista (SPA)
│   ├── js/
│   │   ├── controllers/     # Controladores por módulo (Agenda, PDV, Estoque, CRM, etc.)
│   │   └── core/            # Router.js, StateManager.js, supabaseClient.js, app.js
│   ├── views/               # Fragmentos HTML das telas carregadas dinamicamente
│   └── sw.js                # Service Worker do Admin PWA
├── admingod/                # Painel Master / Super Admin do SaaS (God Mode)
│   ├── js/ & views/         # Gestão global de tenants, planos, métricas e tickets
├── api/                     # Serverless Functions (Node.js na Vercel)
│   ├── admin/               # Criação de colaboradores e disparo de e-mails
│   ├── client/              # Notificações e planos de clientes
│   └── stripe/              # Checkouts, assinaturas e webhooks Stripe
├── cliente/                 # Portal PWA de Autoagendamento do Cliente Final
│   ├── js/ & css/           # Fluxo de agendamento, catálogo, carrinho e autenticação
│   └── index.html           # Ponto de entrada PWA do cliente
├── css/                     # Design System Nativo (design-system.css)
├── js/                      # Módulos compartilhados (auth.js, config.js, utils.js)
├── supabase/                # Migrações SQL, triggers e funções de banco
├── .env.example             # Modelo documentado de variáveis de ambiente
├── CONTRIBUTING.md          # Diretrizes de contribuição e padrões de código
├── eslint.config.js         # Configuração de linting com ESLint
└── package.json             # Dependências, metadados e scripts de execução
```

---

## 👨‍💻 Autor & Contato Profissional

Desenvolvido por **Richard Santo** — Desenvolvedor Full Stack focado em arquitetura escalável, código limpo e soluções SaaS de alto impacto para o mercado.

<div align="left">
  <p>
    <a href="https://github.com/Richardlds">
      <img src="https://img.shields.io/badge/GitHub-Richardlds-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub">
    </a>
    <a href="mailto:richardlds@hotmail.com">
      <img src="https://img.shields.io/badge/E--mail-Contato%20Direto-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="E-mail">
    </a>
  </p>
</div>

---

## 📄 Licença

Este projeto é distribuído sob os termos da **Licença MIT**. Para mais detalhes, consulte o arquivo [`LICENSE`](LICENSE).
