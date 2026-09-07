(function () {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function formatDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:T.*)?)?$/);
    let year, month, day;
    if (match) [, year, month, day] = match;
    else {
      match = text.match(/^(\d{1,2})[\/-](\d{1,2}|[a-záé]+)[\/-](\d{4})$/i);
      if (!match) return text;
      [, day, month, year] = match;
      if (!/^\d+$/.test(month)) month = months.indexOf(normalize(month).slice(0, 3)) + 1;
    }
    const y = Number(year), m = Number(month), d = day == null ? null : Number(day);
    if (m < 1 || m > 12 || (d !== null && (d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()))) return text;
    return `${d === null ? '' : d + ' '}${months[m - 1]} ${y}`;
  }
  window.OXXO_HOME = { formatDate, normalize };
  const key = 'oxxo-home-favorites-v1';
  function init() {
    const search = document.getElementById('home-search');
    if (!search) return;
    const cards = [...document.querySelectorAll('a.db-card')].map(card => ({
      card, href: card.getAttribute('href'), title: card.querySelector('.db-card__title').textContent.trim(),
      description: card.querySelector('.db-card__desc')?.textContent.trim() || '',
      area: card.closest('[data-folder-group]')?.dataset.folderGroup || 'rh',
    }));
    let favorites;
    try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); favorites = new Set(Array.isArray(saved) ? saved.filter(href => cards.some(c => c.href === href)) : []); }
    catch (_) { favorites = new Set(); }
    const favoriteList = document.getElementById('home-favorites');
    function link(card) {
      const a = document.createElement('a'); a.href = card.href; a.textContent = card.title; return a;
    }
    function renderFavorites() {
      favoriteList.replaceChildren();
      cards.filter(c => favorites.has(c.href)).forEach(c => favoriteList.append(link(c)));
      if (!favoriteList.childElementCount) favoriteList.textContent = 'Marca una estrella para guardar tus accesos aquí.';
      cards.forEach(c => { c.button.textContent = favorites.has(c.href) ? '★' : '☆'; c.button.setAttribute('aria-pressed', String(favorites.has(c.href))); c.button.setAttribute('aria-label', `${favorites.has(c.href) ? 'Quitar de' : 'Agregar a'} favoritos: ${c.title}`); });
    }
    cards.forEach(c => {
      const wrap = document.createElement('div'); wrap.className = 'home-card-wrap';
      c.card.before(wrap); wrap.append(c.card);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'home-favorite-toggle';
      c.button = button; wrap.append(button);
      button.addEventListener('click', () => {
        favorites.has(c.href) ? favorites.delete(c.href) : favorites.add(c.href);
        try { localStorage.setItem(key, JSON.stringify([...favorites])); } catch (_) { /* La selección funciona durante esta sesión. */ }
        renderFavorites();
      });
    });
    renderFavorites();
    const results = document.getElementById('home-search-results');
    function filter() {
      const query = normalize(search.value);
      document.body.classList.toggle('home-searching', Boolean(query));
      results.hidden = !query; results.replaceChildren();
      document.getElementById('home-search-clear').hidden = !query;
      if (!query) { document.getElementById('home-search-status').textContent = ''; return; }
      const matches = cards.filter(c => normalize(c.title + ' ' + c.description + ' ' + c.area).includes(query));
      document.getElementById('home-search-status').textContent = `${matches.length} resultados en todas las áreas`;
      matches.forEach(c => { const a = link(c); const small = document.createElement('small'); small.textContent = c.description; a.append(small); results.append(a); });
      if (!matches.length) results.textContent = 'No encontramos tableros. Prueba con vacaciones, bajas o inventarios.';
    }
    // Pista del atajo dentro del campo. Es cosmetica: si no se puede
    // insertar, la busqueda sigue funcionando igual.
    const row = search.closest('.home-search-row');
    if (row && !row.querySelector('.home-search-kbd')) {
      const hint = document.createElement('span');
      hint.className = 'home-search-kbd'; hint.textContent = '/'; hint.setAttribute('aria-hidden', 'true');
      row.append(hint);
    }

    // Navegacion con flechas sobre los resultados: antes solo se podia
    // llegar a ellos tabulando uno por uno.
    function options() { return [...results.querySelectorAll('a')]; }
    function activeIndex() { return options().findIndex(a => a.hasAttribute('data-active')); }
    function activate(index) {
      const list = options();
      if (!list.length) return;
      const next = (index + list.length) % list.length;
      list.forEach(a => a.removeAttribute('data-active'));
      list[next].setAttribute('data-active', '');
      list[next].scrollIntoView({ block: 'nearest' });
    }

    search.addEventListener('input', () => { filter(); row?.classList.toggle('has-query', Boolean(search.value)); });
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { search.value = ''; filter(); row?.classList.remove('has-query'); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!options().length) return;
        e.preventDefault();
        activate(activeIndex() + (e.key === 'ArrowDown' ? 1 : -1));
        return;
      }
      if (e.key === 'Enter') {
        const target = options()[activeIndex()] || options()[0];
        if (target) { e.preventDefault(); target.click(); }
      }
    });
    // "/" enfoca la busqueda desde cualquier parte de la portada, salvo
    // cuando ya se esta escribiendo en otro campo.
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault(); search.focus(); search.select();
    });
    document.getElementById('home-search-clear').addEventListener('click', () => {
      search.value = ''; filter(); row?.classList.remove('has-query'); search.focus();
    });
    const configIds = { 'dashboard-1':'d1', 'dashboard-2':'d2', 'dashboard-3':'d3', 'dashboard-4':'s4', 'dashboard-5':'s5', 'dashboard-6':'s6', 'dashboard-7':'s7', 'dashboard-8':'d8', 'dashboard-11':'d11', 'dashboard-12':'m12', 'dashboard-13':'a13', 'dashboard-14':'c14', inventarios:'inventories', 'dashboard-9':'s9', promociones:'promos' };
    OXXO.loadSystemConfig().then(config => cards.forEach(c => {
      const id = configIds[c.href.split('/').pop().replace('.html', '')];
      let date = c.card.querySelector('.db-card__update strong');
      if (!date) { const box = document.createElement('div'); box.className = 'db-card__update'; box.append('Actualización: '); date = document.createElement('strong'); box.append(date); c.card.querySelector('.db-card__footer').prepend(box); }
      date.textContent = formatDate(config?.[id]?.ultima_actualizacion) || 'Sin fecha registrada';
    })).catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', init);
})();
