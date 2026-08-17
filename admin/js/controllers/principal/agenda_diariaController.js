import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

/* ------------------------------------------------------------------ */
/* Constantes de agenda                                                */
/* ------------------------------------------------------------------ */
const DAY_START = 8;          // 08:00
const DAY_END = 20;           // 20:00
const SLOT_MIN = 30;          // granularidade da grade
const SLOT_PX = 56;           // deve casar com --slot-h no CSS
const PX_PER_MIN = SLOT_PX / SLOT_MIN;
const PAGE_SIZE = 20;

const STATUS_LABEL = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const SELECT_GRAPH = '*, profissionais(nome, foto_url), services(name, price, duration)';

const fmtHour = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const fmtFull = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const fmtMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const hueFor = (seed) => {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
const minutesFromMidnight = (d) => d.getHours() * 60 + d.getMinutes();


export class agenda_diariaController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        
        // Estado local
        this.date = new Date();
        this.date.setHours(0, 0, 0, 0);
        this.view = "timeline";
        this.proFilter = "all";
        this.page = 1;
        this.rows = [];
        this.pros = [];
        this.loading = true;
        this.unsubscribe = null;
        this.flash = new Set();
        this.tenantId = null;
        this.channel = null;

        // Helper para queries dentro do container
        this.$ = (sel) => this.container.querySelector(sel);
    }
    
    async init() {
        this.tenantId = await getCurrentTenantId();
        if (!this.tenantId) {
            console.error("Nenhum tenant ativo encontrado na agenda.");
            return;
        }

        this.bindUI();
        this.buildGrid();
        
        await this.loadProfessionals();
        this.renderPros();
        
        await this.loadAppointments();
        this.subscribeRealtime();

        // Limpa realtime quando trocar de aba
        window.addEventListener("beforeunload", () => this.unsubscribe?.());
    }

    async loadProfessionals() {
        try {
            const { data, error } = await supabase
                .from("profissionais")
                .select("id, nome, foto_url")
                .eq("tenant_id", this.tenantId)
                .order("nome");
            if (error) throw error;
            this.pros = data ?? [];
        } catch (err) {
            if(window.showToast) window.showToast(err.message || "Erro ao carregar profissionais", "error");
            this.pros = [];
        }
    }

    get dayIso() { return isoDay(this.date); }
    get visibleRows() {
        return this.proFilter === "all"
        ? this.rows
        : this.rows.filter((r) => r.profissional_id === this.proFilter);
    }

    bindUI() {
        const root = this.container;
        
        root.querySelectorAll("[data-day]").forEach((b) =>
            b.addEventListener("click", () => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + Number(b.dataset.day));
                this.setDate(d);
            })
        );
        
        this.$("#datePicker")?.addEventListener("change", (e) => {
            if (e.target.value) this.setDate(new Date(`${e.target.value}T00:00:00`));
        });
        
        root.querySelectorAll(".agenda-tab").forEach((t) =>
            t.addEventListener("click", () => {
                this.view = t.dataset.view;
                root.querySelectorAll(".agenda-tab").forEach((x) => x.classList.toggle("is-active", x === t));
                this.$("#view-timeline").hidden = this.view !== "timeline";
                this.$("#view-table").hidden = this.view !== "table";
            })
        );
        
        const modal = this.$("#modal");
        if (modal) {
            modal.hidden = true;
            modal.addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) modal.hidden = true; });
            document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });
        }

        // Delegação de eventos da tabela e da timeline
        this.$("#tbody")?.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const { action, id } = btn.dataset;
            if (action === "details") this.openDetails(id);
            else this.updateAppointmentStatus(id, action);
        });
        
        this.$("#tlEvents")?.addEventListener("click", (e) => {
            const card = e.target.closest(".ev");
            if (card) this.openDetails(card.dataset.id);
        });
        
        this.$("#pager")?.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-page]");
            if (!btn) return;
            this.page = Number(btn.dataset.page);
            this.renderTable();
        });
    }

    setDate(d) {
        this.date = d;
        this.page = 1;
        this.loadAppointments();
    }

    getStartEnd(r) {
        const d = r.appointment_date || this.dayIso;
        const t = r.appointment_time || "00:00:00";
        const s = new Date(`${d}T${t}`);
        const dur = r.services?.duration || 30;
        const e = new Date(s.getTime() + dur * 60000);
        return { s, e };
    }

    async loadAppointments() {
        this.loading = true;
        
        const dp = this.$("#datePicker");
        if(dp) dp.value = this.dayIso;
        
        this.container.querySelectorAll("[data-day]").forEach((b) => {
            const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + Number(b.dataset.day));
            b.classList.toggle("is-active", isoDay(d) === this.dayIso);
        });
        
        this.renderSkeleton();
        
        const dateStr = this.dayIso;
        
        try {
            const { data, error } = await supabase
                .from("appointments").select(SELECT_GRAPH)
                .eq('tenant_id', this.tenantId)
                .eq("appointment_date", dateStr)
                .order("appointment_time", { ascending: true });
                
            if (error) throw error;
            this.rows = data ?? [];
        } catch (err) {
            this.rows = [];
            if(window.showToast) window.showToast(err.message || "Falha ao carregar agendamentos", "error");
        }
        
        this.loading = false;
        this.renderAll();
    }

    renderAll() {
        this.renderPros();
        this.renderKpis();
        this.renderTimeline();
        this.renderTable();
        
        const label = fmtFull.format(this.date);
        const n = this.visibleRows.length;
        const sum = this.$("#daySummary");
        if(sum) sum.textContent = `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${n} agendamento${n === 1 ? "" : "s"}`;
    }

    renderSkeleton() {
        const ev = this.$("#tlEvents");
        if(!ev) return;
        ev.innerHTML = "";
        
        const empty = this.$("#tlEmpty");
        if(empty) empty.hidden = true;
        
        const plan = [[0, 0, 3], [1, 2, 4], [2, 1, 2], [0, 6, 3], [3, 5, 5], [1, 8, 3]];
        for (const [col, slot, len] of plan) {
            const s = el("div", "sk sk-ev");
            s.style.top = `${slot * SLOT_PX}px`;
            s.style.height = `${len * SLOT_PX - 6}px`;
            s.style.left = `${col * 25 + 0.6}%`;
            s.style.width = "23.5%";
            ev.appendChild(s);
        }
        ev.style.height = `${(DAY_END - DAY_START) * 2 * SLOT_PX}px`;
        
        const kpis = this.$("#kpis");
        if(kpis) {
            kpis.innerHTML = Array.from({ length: 4 }, () =>
                `<div class="kpi"><div class="sk sk-line" style="width:46px;height:22px;margin-bottom:8px"></div>
                 <div class="sk sk-line" style="width:80px;height:10px"></div></div>`).join("");
        }
        
        const tbody = this.$("#tbody");
        if(tbody) {
            tbody.innerHTML = Array.from({ length: 6 }, () =>
                `<tr class="sk-row">${Array.from({ length: 7 }, () =>
                    `<td><div class="sk sk-line"></div></td>`).join("")}</tr>`).join("");
        }
        
        const pager = this.$("#pager");
        if(pager) pager.innerHTML = "";
    }

    renderPros() {
        const track = this.$("#prosTrack");
        if(!track) return;
        
        const count = (id) => this.rows.filter((r) => r.profissional_id === id).length;
        const chip = (id, nome, foto, n) => {
            const b = el("button", `pro-chip${this.proFilter === id ? " is-active" : ""}`);
            b.type = "button";
            const av = el("div", "agenda-avatar");
            if (foto) av.innerHTML = `<img src="${esc(foto)}" alt="" />`;
            else {
                av.textContent = initials(nome);
                av.style.background = id === "all"
                    ? "linear-gradient(140deg,var(--gold),var(--gold-2))"
                    : `linear-gradient(140deg,hsl(${hueFor(id)} 70% 66%),hsl(${(hueFor(id) + 40) % 360} 70% 52%))`;
            }
            b.append(av, el("span", "", `<span class="pro-name">${esc(nome)}</span><span class="pro-count"> · ${n}</span>`));
            b.addEventListener("click", () => {
                this.proFilter = id; this.page = 1; this.renderAll();
            });
            return b;
        };
        track.innerHTML = "";
        track.appendChild(chip("all", "Todos", null, this.rows.length));
        this.pros.forEach((p) => track.appendChild(chip(p.id, p.nome, p.foto_url, count(p.id))));
    }

    renderKpis() {
        const kpis = this.$("#kpis");
        if(!kpis) return;
        
        const rows = this.visibleRows;
        const by = (s) => rows.filter((r) => r.status === s).length;
        const revenue = rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show")
            .reduce((sum, r) => sum + Number(r.services?.price ?? 0), 0);
        const items = [
            [rows.length, "Total do dia"],
            [by("scheduled") + by("confirmed"), "Em aberto"],
            [by("completed"), "Concluídos"],
            [fmtMoney.format(revenue), "Receita prevista"],
        ];
        kpis.innerHTML = items.map(([v, l]) =>
            `<div class="kpi"><b>${esc(v)}</b><span>${l}</span></div>`).join("");
    }

    buildGrid() {
        const hours = this.$("#tlHours");
        const lines = this.$("#tlLines");
        if(!hours || !lines) return;
        
        hours.innerHTML = ""; lines.innerHTML = "";
        for (let h = DAY_START; h < DAY_END; h++) {
            hours.appendChild(el("div", "tl-hour", `${String(h).padStart(2, "0")}:00`));
            hours.appendChild(el("div", "tl-hour tl-half", `${String(h).padStart(2, "0")}:30`));
            const a = el("div", "tl-line h"); a.style.height = `${SLOT_PX}px`;
            const b = el("div", "tl-line"); b.style.height = `${SLOT_PX}px`;
            lines.append(a, b);
        }
    }

    renderTimeline() {
        const wrap = this.$("#tlEvents");
        if(!wrap) return;
        
        wrap.innerHTML = "";
        const totalPx = (DAY_END - DAY_START) * 2 * SLOT_PX;
        wrap.style.height = `${totalPx}px`;

        const rows = this.visibleRows.slice()
            .sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));
            
        const empty = this.$("#tlEmpty");
        if(empty) empty.hidden = rows.length > 0;

        const colIds = this.proFilter === "all"
            ? this.pros.map((p) => p.id)
            : [this.proFilter];
        const colCount = Math.max(colIds.length, 1);
        const colW = 100 / colCount;
        this.renderColumnHeads(colIds);

        for (const proId of colIds) {
            const list = rows.filter((r) => r.profissional_id === proId)
                .map((r) => {
                    const { s, e } = this.getStartEnd(r);
                    return { row: r, start: minutesFromMidnight(s), end: minutesFromMidnight(e), s, e };
                })
                .sort((a, b) => a.start - b.start || a.end - b.end);

            let cluster = [], clusterEnd = -1;
            const flush = () => {
                if (!cluster.length) return;
                const lanes = [];
                for (const it of cluster) {
                    let li = lanes.findIndex((laneEnd) => laneEnd <= it.start);
                    if (li === -1) { lanes.push(it.end); li = lanes.length - 1; }
                    else lanes[li] = it.end;
                    it.lane = li;
                }
                cluster.forEach((it) => { it.lanes = lanes.length; });
                cluster = [];
            };
            for (const it of list) {
                if (it.start >= clusterEnd && cluster.length) flush();
                cluster.push(it);
                clusterEnd = Math.max(clusterEnd, it.end);
            }
            flush();

            const colIndex = colIds.indexOf(proId);
            for (const it of list) {
                const topMin = Math.max(it.start - DAY_START * 60, 0);
                const dur = Math.max(it.end - it.start, 15);
                const height = Math.max(dur * PX_PER_MIN - 6, 26);
                const laneW = colW / (it.lanes || 1);
                const card = el("div", `ev${height < 52 ? " compact" : ""}${this.flash.has(it.row.id) ? " is-new" : ""}`);
                card.dataset.id = it.row.id;
                card.dataset.status = it.row.status;
                card.style.top = `${topMin * PX_PER_MIN}px`;
                card.style.height = `${height}px`;
                card.style.left = `calc(${colIndex * colW + (it.lane || 0) * laneW}% + 3px)`;
                card.style.width = `calc(${laneW}% - 6px)`;
                card.title = `${it.row.client_name} — ${it.row.services?.name}`;
                card.innerHTML = `
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; width: 100%;">
                    <span class="ev-client" style="flex: 1; line-height: 1.1;">${esc(it.row.client_name ?? "Cliente")}</span>
                    <span class="ev-time" style="flex: 0 0 auto; line-height: 1.1;">${fmtHour.format(it.s)} - ${fmtHour.format(it.e)}</span>
                  </div>
                  <div class="ev-bottom" style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; gap: 4px; width: 100%;">
                    <span class="ev-svc" style="flex: 1; white-space: normal; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${esc(it.row.services?.name ?? "")}</span>
                    <div style="flex: 0 0 auto;" title="${esc(it.row.profissionais?.nome ?? "")}">${this.avatarHTML(it.row, "sm")}</div>
                  </div>`;
                wrap.appendChild(card);
            }
        }

        const now = new Date();
        const nowEl = this.$("#tlNow");
        if(nowEl) {
            if (isoDay(now) === this.dayIso) {
                const m = minutesFromMidnight(now) - DAY_START * 60;
                const inRange = m >= 0 && m <= (DAY_END - DAY_START) * 60;
                nowEl.hidden = !inRange;
                if (inRange) nowEl.style.top = `${14 + m * PX_PER_MIN}px`;
            } else nowEl.hidden = true;
        }
    }

    renderColumnHeads(colIds) {
        let row = this.container.querySelector(".tl-head-row");
        if (!row) {
            row = el("div", "tl-head-row");
            row.append(el("div", "tl-head-spacer"), el("div", "tl-cols"));
            this.$("#view-timeline")?.insertBefore(row, this.$("#timeline"));
        }
        const cols = row.querySelector(".tl-cols");
        if(cols) {
            cols.innerHTML = colIds.map((id) => {
                const p = this.pros.find((x) => x.id === id);
                const h = hueFor(id);
                const av = p?.foto_url
                    ? `<span class="agenda-avatar sm"><img src="${esc(p.foto_url)}" alt="" /></span>`
                    : `<span class="agenda-avatar sm" style="background:linear-gradient(140deg,hsl(${h} 70% 66%),hsl(${(h + 40) % 360} 70% 52%))">${esc(initials(p?.nome))}</span>`;
                return `<span class="tl-col-head">${av}${esc(p?.nome ?? "—")}</span>`;
            }).join("");
        }
    }

    avatarHTML(row, size = "") {
        const nome = row.profissionais?.nome ?? "";
        const foto = row.profissionais?.foto_url;
        if (foto) return `<span class="agenda-avatar ${size}"><img src="${esc(foto)}" alt="" /></span>`;
        const h = hueFor(row.profissional_id);
        return `<span class="agenda-avatar ${size}" style="background:linear-gradient(140deg,hsl(${h} 70% 66%),hsl(${(h + 40) % 360} 70% 52%))">${esc(initials(nome))}</span>`;
    }

    renderTable() {
        const rows = this.visibleRows.slice().sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));
        const pages = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
        this.page = Math.min(this.page, pages);
        const slice = rows.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE);
        const tbody = this.$("#tbody");
        if(!tbody) return;

        if (!slice.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="agenda-empty">Nenhum agendamento para este filtro.</td></tr>`;
            if(this.$("#pager")) this.$("#pager").innerHTML = "";
            return;
        }

        tbody.innerHTML = slice.map((r) => {
            const { s, e } = this.getStartEnd(r);
            const done = r.status === "completed" || r.status === "cancelled";
            return `<tr${this.flash.has(r.id) ? ' style="background:rgba(242,181,68,.07)"' : ""}>
                <td><strong>${fmtHour.format(s)}</strong> – ${fmtHour.format(e)}
                    <span class="cell-sub">${fmtDate.format(s)}</span></td>
                <td>${esc(r.client_name ?? "—")}<span class="cell-sub">${esc(r.client_phone ?? "")}</span></td>
                <td><span class="cell-people">${this.avatarHTML(r, "sm")}${esc(r.profissionais?.nome ?? "—")}</span></td>
                <td>${esc(r.services?.name ?? "—")}<span class="cell-sub">${r.services?.duration ?? "?"} min</span></td>
                <td class="ta-r agenda-price">${fmtMoney.format(Number(r.services?.price ?? 0))}</td>
                <td><span class="agenda-badge ${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span></td>
                <td><div class="row-actions">
                  ${r.status === "scheduled" ? `<button class="agenda-btn tiny" data-action="confirmed" data-id="${r.id}">Confirmar</button>` : ""}
                  ${done ? "" : `<button class="agenda-btn tiny gold" data-action="completed" data-id="${r.id}">Concluir</button>`}
                  ${done ? "" : `<button class="agenda-btn tiny" data-action="cancelled" data-id="${r.id}">Cancelar</button>`}
                  <button class="agenda-btn tiny" data-action="details" data-id="${r.id}">Detalhes</button>
                </div></td>
            </tr>`;
        }).join("");

        const pager = this.$("#pager");
        if(pager) {
            pager.innerHTML = `
              <span class="muted" style="font-size:13px">
                Mostrando ${(this.page - 1) * PAGE_SIZE + 1}–${Math.min(this.page * PAGE_SIZE, rows.length)} de ${rows.length}
              </span>
              <div class="pager-btns">
                <button class="agenda-btn tiny" data-page="${this.page - 1}" ${this.page === 1 ? "disabled" : ""}>Anterior</button>
                ${Array.from({ length: pages }, (_, i) =>
                  `<button class="agenda-btn tiny ${i + 1 === this.page ? "is-active" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("")}
                <button class="agenda-btn tiny" data-page="${this.page + 1}" ${this.page === pages ? "disabled" : ""}>Próxima</button>
              </div>`;
        }
    }

    async updateAppointmentStatus(id, newStatus) {
        const row = this.rows.find((r) => r.id === id);
        const prev = row?.status;
        const clientPhone = row?.client_phone;
        
        if (row) { row.status = newStatus; this.renderAll(); } // optimistic update
        
        try {
            const { error } = await supabase
                .from("appointments").update({ status: newStatus }).eq("id", id);
                
            if (error) throw error;
            
            // Lógica de Fidelidade: Adiciona ponto se mudou para completed, tira se desfez
            if (clientPhone) {
                if (prev !== 'completed' && newStatus === 'completed') {
                    await this.processFidelityPoint(this.tenantId, clientPhone, 1);
                } else if (prev === 'completed' && newStatus !== 'completed') {
                    await this.processFidelityPoint(this.tenantId, clientPhone, -1);
                }
            }

            this.renderAll();
            if(window.showToast) window.showToast(`Status atualizado para “${STATUS_LABEL[newStatus]}”.`, "success");
        } catch (err) {
            if (row && prev) row.status = prev;
            this.renderAll();
            if(window.showToast) window.showToast(err.message || "Não foi possível atualizar o status.", "error");
        }
    }

    async processFidelityPoint(tenantId, clientPhone, amount) {
        try {
            const { data: tenantData } = await supabase.from('tenants')
                .select('settings')
                .eq('id', tenantId)
                .maybeSingle();
                
            if (!tenantData || !tenantData.settings || !tenantData.settings.fidelidade || !tenantData.settings.fidelidade.is_active) return;
            
            const { data: client } = await supabase.from('clientes')
                .select('id, pontos')
                .eq('tenant_id', tenantId)
                .eq('telefone', clientPhone)
                .maybeSingle();
                
            if (client) {
                let novosPontos = (client.pontos || 0) + amount;
                if (novosPontos < 0) novosPontos = 0;
                await supabase.from('clientes').update({ pontos: novosPontos }).eq('id', client.id);
            }
        } catch (e) {
            console.error("Erro ao processar ponto de fidelidade automático na agenda:", e);
        }
    }

    openDetails(id) {
        const r = this.rows.find((x) => x.id === id);
        if (!r) return;
        const { s, e } = this.getStartEnd(r);
        
        const mTitle = this.$("#mTitle");
        if(mTitle) mTitle.textContent = r.client_name ?? "Agendamento";
        
        const mBody = this.$("#mBody");
        if(mBody) {
            mBody.innerHTML = `
              <dl class="dl">
                <dt>Status</dt><dd><span class="agenda-badge ${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span></dd>
                <dt>Quando</dt><dd>${fmtDate.format(s)} · ${fmtHour.format(s)} – ${fmtHour.format(e)}</dd>
                <dt>Profissional</dt><dd>${esc(r.profissionais?.nome ?? "—")}</dd>
                <dt>Serviço</dt><dd>${esc(r.services?.name ?? "—")} (${r.services?.duration ?? "?"} min)</dd>
                <dt>Preço</dt><dd>${fmtMoney.format(Number(r.services?.price ?? 0))}</dd>
                <dt>Telefone</dt><dd>${esc(r.client_phone ?? "—")}</dd>
                <dt>Protocolo</dt><dd style="font-size:12px;color:var(--color-text-muted)">${esc(r.id)}</dd>
              </dl>
              <div class="agenda-modal-actions">
                <button class="agenda-btn tiny" data-m="confirmed">Confirmar</button>
                <button class="agenda-btn tiny gold" data-m="completed">Concluir</button>
                <button class="agenda-btn tiny" data-m="cancelled">Cancelar</button>
                <button class="agenda-btn tiny" data-m="no_show">Não compareceu</button>
              </div>`;
              
            mBody.querySelectorAll("button[data-m]").forEach((b) =>
                b.addEventListener("click", () => {
                    const modal = this.$("#modal");
                    if(modal) modal.hidden = true;
                    this.updateAppointmentStatus(r.id, b.dataset.m);
                })
            );
        }
        
        const modal = this.$("#modal");
        if(modal) modal.hidden = false;
    }

    subscribeRealtime() {
        this.unsubscribe?.();
        
        const channelName = `agenda_diaria_${this.tenantId}_${Math.random().toString(36).substr(2, 9)}`;
        this.channel = supabase.channel(channelName)
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "appointments", filter: `tenant_id=eq.${this.tenantId}` },
                async (p) => {
                    const row = await this._hydrate(p.new);
                    this.handleRealtimeEvent("INSERT", row);
                }
            )
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "appointments", filter: `tenant_id=eq.${this.tenantId}` },
                async (p) => {
                    const row = await this._hydrate(p.new);
                    this.handleRealtimeEvent("UPDATE", row);
                }
            )
            .subscribe((s) => {
                // Removemos o elemento de realtime indicator por hora, ou logamos.
                console.log("Realtime status:", s);
            });
            
        this.unsubscribe = () => { supabase.removeChannel(this.channel); };
    }
    
    async _hydrate(row) {
        const { data } = await supabase.from("appointments").select(SELECT_GRAPH).eq("id", row.id).single();
        return data ?? row;
    }
    
    handleRealtimeEvent(type, row) {
        if (!row?.appointment_date) return;

        
        if (row.appointment_date !== this.dayIso) return;
        this.upsert(row);
        this.flash.add(row.id);
        setTimeout(() => { this.flash.delete(row.id); }, 6000);
        this.renderAll();
    }

    upsert(row) {
        const i = this.rows.findIndex((r) => r.id === row.id);
        if (i === -1) this.rows.push(row); else this.rows[i] = { ...this.rows[i], ...row };
    }
}
