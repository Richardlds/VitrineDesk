import { showSkeleton, hideSkeleton } from '../utils.js';

export async function renderHours(tenant) {
  try {
    const table = document.getElementById('hours-table');
    if (!table) return;

    // Show skeleton loading
    showSkeleton('hours-table', 'hours');

    // Pequeno delay para visualização do skeleton
    await new Promise(resolve => setTimeout(resolve, 300));

    // Remove skeleton loading
    hideSkeleton('hours-table');

    const settings = tenant.settings || {};
    const horarios = settings.horarios || settings.hours || {};

    const dias = [
      { key: 'segunda', label: 'Segunda-feira' },
      { key: 'terca', label: 'Terça-feira' },
      { key: 'quarta', label: 'Quarta-feira' },
      { key: 'quinta', label: 'Quinta-feira' },
      { key: 'sexta', label: 'Sexta-feira' },
      { key: 'sabado', label: 'Sábado' },
      { key: 'domingo', label: 'Domingo' }
    ];

    const hoje = new Date().getDay();
    const diaHojeKey = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][hoje];

    table.innerHTML = dias.map(dia => {
      const h = horarios[dia.key];
      const isToday = dia.key === diaHojeKey;
      const horario = h
        ? (h.fechado ? 'Fechado' : `${h.abertura || '08:00'} - ${h.fechamento || '18:00'}`)
        : '-';

      return `
        <tr class="${isToday ? 'today' : ''}">
          <td>${dia.label}</td>
          <td>${horario}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Erro ao renderizar horários:', e);
  }
}
