import { showSkeleton, hideSkeleton } from '../utils.js';

export async function renderMap(tenant) {
  try {
    // Show skeleton para o mapa
    const mapContainer = document.getElementById('map-embed');
    if (mapContainer) {
      showSkeleton('map-embed', 'map');
    }

    const addressEl = document.getElementById('info-address');
    if (addressEl && tenant.endereco) {
      let endereco = tenant.endereco;
      if (typeof endereco === 'string') {
        try { endereco = JSON.parse(endereco); } catch (e) { /* string simples */ }
      }

      if (typeof endereco === 'object') {
        const parts = [endereco.rua, endereco.numero, endereco.bairro, endereco.cidade, endereco.estado].filter(Boolean);
        addressEl.innerHTML = parts.join(', ');
      } else {
        addressEl.innerHTML = endereco;
      }
      
      if (tenant.social?.google_maps) {
          let addressHtml = addressEl.innerHTML;
          addressHtml += `<br><a href="${tenant.social.google_maps}" target="_blank" class="btn btn-primary map-btn"><i data-lucide="map" class="icon-sm"></i> Abrir no Maps</a>`;
          addressEl.innerHTML = addressHtml;
          if (window.lucide) window.lucide.createIcons({ root: addressEl });
      }
    }

    const phoneEl = document.getElementById('info-phone');
    if (phoneEl && tenant.whatsapp) {
      phoneEl.textContent = tenant.whatsapp;
    }

    if (mapContainer && tenant.endereco) {
      let endStr = '';
      if (typeof tenant.endereco === 'string') {
        endStr = tenant.endereco;
      } else if (typeof tenant.endereco === 'object') {
        const e = tenant.endereco;
        endStr = [e.rua, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(', ');
      }

      if (endStr) {
        mapContainer.innerHTML = `<iframe src="https://maps.google.com/maps?q=${encodeURIComponent(endStr)}&output=embed" allowfullscreen loading="lazy" onload="document.getElementById('map-embed').classList.remove('skeleton-loading')"></iframe>`;
      } else {
        hideSkeleton('map-embed');
      }
    } else if (mapContainer) {
      hideSkeleton('map-embed');
    }
  } catch (e) {
    console.error('Erro ao renderizar mapa:', e);
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
          <a href="${finalUrl}" target="_blank" rel="noopener noreferrer" class="social-btn glass-card social-btn-card" 
style="color:${rede.color}; background: color-mix(in srgb, ${rede.color} 10%, var(--card-bg)); border: 1px solid color-mix(in srgb, ${rede.color} 30%, transparent);">
            ${rede.svg}
            <span class="social-btn-text">${rede.name}</span>
          </a>
        `;
    });

    container.innerHTML = html;


  } catch (e) {
    console.error('Erro ao renderizar redes sociais:', e);
  }
}
