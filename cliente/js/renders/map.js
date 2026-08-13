import { showSkeleton, hideSkeleton } from '../utils.js';

export async function renderMap(tenant) {
  try {
    const mapContainer = document.getElementById('map-embed');
    const addressEl = document.getElementById('info-address');
    const phoneEl = document.getElementById('info-phone');

    if (mapContainer) showSkeleton('map-embed', 'map');

    const settings = tenant.settings || {};
    const rawEndereco = settings.endereco || tenant.endereco; // fallback pro tenant direto por segurança
    const rawMapaUrl = settings.mapa_url || tenant.social?.google_maps;

    // 1. WhatsApp Formatting
    if (phoneEl && tenant.whatsapp) {
      let phone = tenant.whatsapp.replace(/\D/g, '');
      if (phone.startsWith('55')) phone = phone.substring(2);
      if (phone.length === 11) phone = `(${phone.substring(0,2)}) ${phone.substring(2,7)}-${phone.substring(7)}`;
      else if (phone.length === 10) phone = `(${phone.substring(0,2)}) ${phone.substring(2,6)}-${phone.substring(6)}`;
      else phone = tenant.whatsapp;
      phoneEl.innerHTML = `<i data-lucide="phone" class="icon-xs inline-block mr-1"></i> ${phone}`;
      if (window.lucide) window.lucide.createIcons({ root: phoneEl.parentElement });
      document.getElementById('info-phone-container')?.classList.remove('hidden');
    } else if (phoneEl) {
      document.getElementById('info-phone-container')?.classList.add('hidden');
    }

    // 2. Parse Address
    let addressText = '';
    let mapEmbedHtml = '';
    let isUrl = false;

    if (rawEndereco) {
      let endRaw = rawEndereco;
      if (typeof endRaw === 'string') {
        try { endRaw = JSON.parse(endRaw); } catch (e) {}
      }

      if (typeof endRaw === 'object' && endRaw !== null) {
        addressText = [endRaw.rua, endRaw.numero, endRaw.bairro, endRaw.cidade, endRaw.estado].filter(Boolean).join(', ');
        mapEmbedHtml = `<iframe src="https://maps.google.com/maps?q=${encodeURIComponent(addressText)}&output=embed" allowfullscreen></iframe>`;
      } else if (typeof endRaw === 'string') {
        endRaw = endRaw.trim();
        if (endRaw.toLowerCase().startsWith('<iframe')) {
          addressText = '';
          mapEmbedHtml = endRaw;
        } else if (endRaw.startsWith('http://') || endRaw.startsWith('https://')) {
          isUrl = true;
          addressText = '';
          mapEmbedHtml = ''; // Link direto não carrega em iframe por segurança (X-Frame-Options)
        } else {
          addressText = endRaw;
          mapEmbedHtml = `<iframe src="https://maps.google.com/maps?q=${encodeURIComponent(addressText)}&output=embed" allowfullscreen></iframe>`;
        }
      }
    }

    // 3. Render Address & Maps Button
    if (addressEl) {
      addressEl.innerHTML = ''; // Limpar
      
      const textSpan = document.createElement('span');
      textSpan.textContent = addressText || 'Endereço disponível no mapa';
      if (!addressText && !mapEmbedHtml && !rawMapaUrl) {
         textSpan.textContent = '-'; // Se não tiver nada, bota tracinho
      }
      if (!addressText) textSpan.classList.add('muted');
      addressEl.appendChild(textSpan);

      // Descobrir qual link do Maps usar
      let mapsLink = rawMapaUrl;
      if (isUrl && !mapsLink) mapsLink = rawEndereco;

      if (mapsLink && !mapsLink.toLowerCase().trim().startsWith('javascript:')) {
        addressEl.appendChild(document.createElement('br'));
        const btn = document.createElement('a');
        btn.href = mapsLink;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.className = 'btn btn--primary map-btn mt-2 inline-flex align-center gap-2';
        btn.innerHTML = '<i data-lucide="map" class="icon-sm"></i> Abrir no Maps';
        addressEl.appendChild(btn);
      }
      
      if (window.lucide) window.lucide.createIcons({ root: addressEl });
    }

    // 4. Render Iframe
    if (mapContainer) {
      if (mapEmbedHtml) {
        mapContainer.style.display = 'block';
        hideSkeleton('map-embed'); // Remove o esqueleto imediatamente para não quebrar a visibilidade
        
        // Remove loading="lazy" and onload do mapEmbedHtml que geramos, caso existam, 
        // pois podem bugar no Chrome/Edge com a intervention de lazy load.
        mapEmbedHtml = mapEmbedHtml.replace('loading="lazy"', '');
        mapEmbedHtml = mapEmbedHtml.replace(/onload="[^"]*"/, '');
        
        mapContainer.innerHTML = mapEmbedHtml;
      } else {
        hideSkeleton('map-embed');
        mapContainer.style.display = 'none';
      }
    }

  } catch (e) {
    console.error('Erro ao renderizar mapa e contato:', e);
  }
}

export function renderSocial(tenant) {
  try {
    const sectionSocial = document.getElementById('section-social');
    const container = document.getElementById('social-links-container');
    
    if (!sectionSocial || !container || !tenant.social) {
      if (sectionSocial) sectionSocial.style.display = 'none';
      return;
    }

    let socialData = tenant.social;
    if (typeof socialData === 'string') {
      try { socialData = JSON.parse(socialData); } catch (e) { socialData = {}; }
    }

    // SVG Brutos das marcas
    const icons = {
      instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
      facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
      tiktok: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>`,
      youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.1C2.5 7.1 2 9.5 2 12c0 2.5.5 4.9.5 4.9s1.3 1.3 3.5 1.7C8.1 19 12 19 12 19s3.9 0 6-.4c2.2-.4 3.5-1.7 3.5-1.7s.5-2.4.5-4.9c0-2.5-.5-4.9-.5-4.9s-1.3-1.3-3.5-1.7C15.9 5 12 5 12 5s-3.9 0-6 .4C3.8 5.8 2.5 7.1 2.5 7.1z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>`,
      twitter: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/></svg>`,
      linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>`,
      website: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>`
    };

    // Filtra apenas as redes que têm URL
    const redesDisponiveis = [];
    if (socialData.instagram) redesDisponiveis.push({ name: 'Instagram', url: socialData.instagram, svg: icons.instagram, color: '#E1306C' });
    if (socialData.facebook) redesDisponiveis.push({ name: 'Facebook', url: socialData.facebook, svg: icons.facebook, color: '#1877F2' });
    if (socialData.tiktok) redesDisponiveis.push({ name: 'TikTok', url: socialData.tiktok, svg: icons.tiktok, color: '#000000' });
    if (socialData.youtube) redesDisponiveis.push({ name: 'YouTube', url: socialData.youtube, svg: icons.youtube, color: '#FF0000' });
    if (socialData.twitter) redesDisponiveis.push({ name: 'Twitter', url: socialData.twitter, svg: icons.twitter, color: '#1DA1F2' });
    if (socialData.linkedin) redesDisponiveis.push({ name: 'LinkedIn', url: socialData.linkedin, svg: icons.linkedin, color: '#0A66C2' });
    if (socialData.website) redesDisponiveis.push({ name: 'Website', url: socialData.website, svg: icons.website, color: 'var(--primary)' });

    if (redesDisponiveis.length === 0) {
      sectionSocial.style.display = 'none';
      return;
    }

    sectionSocial.style.display = 'block';
    
    let html = '';
    redesDisponiveis.forEach(rede => {
      // Formata URL caso não tenha http
      let finalUrl = rede.url;
      if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
      
      html += `
          <a href="${finalUrl}" target="_blank" rel="noopener noreferrer" class="social-btn glass-card" 
style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-pill); color:${rede.color}; background: color-mix(in srgb, ${rede.color} 10%, var(--card-bg)); border: 1px solid color-mix(in srgb, ${rede.color} 30%, transparent); text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: transform 0.2s; min-width: 140px; flex: 1;">
            ${rede.svg.replace('width="32" height="32"', 'width="24" height="24"')}
            <span style="color: var(--text-main);">${rede.name}</span>
          </a>
        `;
    });

    container.innerHTML = html;


  } catch (e) {
    console.error('Erro ao renderizar redes sociais:', e);
  }
}
