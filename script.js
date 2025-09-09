// ==============================
// Помощники UI
// ==============================
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg || 'Готово';
  t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1400);
};

// ==============================
// Состояние приложения
// ==============================
let companies = [];     // [{name, insights: [..]}]
let filter = '';
const STATUS_NONE = '';
const STATUS_HOT  = 'hot';
const STATUS_WARM = 'warm';
const STATUS_COLD = 'cold';
const STATUS_LABEL = {
  [STATUS_HOT]: 'Горячий лид',
  [STATUS_WARM]: 'Обычный лид',
  [STATUS_COLD]: 'Не наш клиент'
};
const STATUS_CLASS = {
  [STATUS_HOT]: 'hot',
  [STATUS_WARM]: 'warm',
  [STATUS_COLD]: 'cold'
};
const STORAGE_KEY = 'lead-tracker-statuses-v1';
const COMPANIES_STORAGE_KEY = 'lead-tracker-companies-v1';
let statuses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); // { [companyName]: status }

// ==============================
// Парсинг текста
// ==============================
function parseCompaniesText(text) {
  if (!text || !text.trim()) return [];
  
  const companies = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  let currentCompany = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Проверяем, является ли строка названием компании
    if (line.startsWith('Компания:') || line.startsWith('Компания ')) {
      // Сохраняем предыдущую компанию, если есть
      if (currentCompany && currentCompany.name && currentCompany.insights.length > 0) {
        companies.push(currentCompany);
      }
      
      // Начинаем новую компанию
      const companyName = line.replace(/^Компания:?\s*/, '').trim();
      currentCompany = {
        name: companyName,
        insights: []
      };
    }
    // Проверяем, является ли строка инсайтом (начинается с - или •)
    else if (currentCompany && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))) {
      const insight = line.replace(/^[-•*]\s*/, '').trim();
      if (insight) {
        currentCompany.insights.push(insight);
      }
    }
    // Если строка не пустая и не является заголовком, но у нас есть текущая компания, добавляем как инсайт
    else if (currentCompany && line && !line.toLowerCase().includes('инсайты')) {
      currentCompany.insights.push(line);
    }
  }
  
  // Добавляем последнюю компанию
  if (currentCompany && currentCompany.name && currentCompany.insights.length > 0) {
    companies.push(currentCompany);
  }
  
  return companies;
}

// ==============================
// Рендер списка
// ==============================
function normalizeText(s){ return (s||'').toString().trim(); }
function splitInsights(s){
  return normalizeText(s)
    .replace(/\r\n/g,'\n')
    .replace(/\u2022/g, '\n') // '•'
    .split('\n')
    .map(x=>x.replace(/^[\s•\-–●]+/,'').trim())
    .filter(Boolean);
}

function render(){
  const list = $('#list');
  list.innerHTML = '';
  const q = filter.toLowerCase();
  const filtered = companies.filter(c => c.name.toLowerCase().includes(q));

  if(!filtered.length){
    $('#empty').style.display = 'block';
    updateProgress();
    return;
  } else {
    $('#empty').style.display = 'none';
  }

  for(const c of filtered){
    const item = document.createElement('article');
    item.className = 'item';
    const st = statuses[c.name] || STATUS_NONE;

    if(st === STATUS_HOT) item.classList.add('color-hot');
    if(st === STATUS_WARM) item.classList.add('color-warm');
    if(st === STATUS_COLD) item.classList.add('color-cold');

    item.innerHTML = `
      <div class="item-header">
        <div class="name">${escapeHtml(c.name)}</div>
        <div style="display:flex; align-items:center; gap:10px">
          <span class="tag ${STATUS_CLASS[st]||''}">${st ? STATUS_LABEL[st] : 'Без статуса'}</span>
          <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 9l6 6 6-6" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
      <div class="details">
        <ul class="insights">
          ${c.insights.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
        <div class="status-controls">
          <button class="chip hot" data-act="set" data-status="${STATUS_HOT}">✅ Горячий лид</button>
          <button class="chip warm" data-act="set" data-status="${STATUS_WARM}">🙂 Обычный лид</button>
          <button class="chip cold" data-act="set" data-status="${STATUS_COLD}">🕊 Не наш клиент</button>
          <button class="chip reset" data-act="reset">Сбросить</button>
        </div>
      </div>
    `;
    const header = $('.item-header', item);
    const details = $('.details', item);
    const openToggle = ()=>{
      const isOpen = item.classList.toggle('open');
      if(isOpen){ details.style.maxHeight = details.scrollHeight + 'px'; }
      else { details.style.maxHeight = '0px'; }
    };
    header.addEventListener('click', openToggle);

    $('.status-controls', item).addEventListener('click', async (e)=>{
      const btn = e.target.closest('button');
      if(!btn) return;
      if(btn.dataset.act === 'set'){
        const newStatus = btn.dataset.status;
        setStatus(c.name, newStatus);
        render();
        toast('Статус сохранён');

        /* ДОБАВЛЕНО: салют при выборе "Горячий" или "Обычный" */
        if(newStatus === STATUS_HOT || newStatus === STATUS_WARM){
          fireConfettiSmall();
        }

        if(progressProcessed() === companies.length) {
          await sleep(250);
          fireConfettiBig();
          toast('Отличная работа! Все компании обработаны 🎉');
        }
      } else if(btn.dataset.act === 'reset'){
        setStatus(c.name, STATUS_NONE);
        render();
        toast('Статус снят');
      }
    });

    list.appendChild(item);
    details.style.maxHeight = '0px';
  }
  updateProgress();
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}

// ==============================
// Прогресс
// ==============================
function progressProcessed(){
  let n = 0;
  for(const c of companies){ if((statuses[c.name]||'') !== '') n++; }
  return n;
}
function updateProgress(){
  const total = companies.length;
  const done = progressProcessed();
  $('#count').textContent = `${done} / ${total}`;
  const pct = total ? Math.round((done/total)*100) : 0;
  $('#fill').style.width = pct + '%';
}

function setStatus(name, st){
  if(st && ![STATUS_HOT,STATUS_WARM,STATUS_COLD].includes(st)) st = STATUS_NONE;
  if(st){ statuses[name] = st; }
  else { delete statuses[name]; }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
}

// ==============================
// Управление данными
// ==============================
function loadCompanies() {
  const saved = localStorage.getItem(COMPANIES_STORAGE_KEY);
  if (saved) {
    try {
      companies = JSON.parse(saved);
      return true;
    } catch (e) {
      console.warn('Ошибка загрузки сохраненных компаний:', e);
    }
  }
  return false;
}

function saveCompanies() {
  localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(companies));
}

function loadSampleData() {
  const sampleText = `Компания: TopCareer
Инсайты:
- Онлайн-школа для HR с сообществом 50 000+ специалистов, создаёт курсы для роста HR-лидеров
- Резидент «Сколково» и победитель Recruitment Awards 2024
- Разработала 20+ программ обучения (HRD, HRBP и др.), активно освещает тренды HR Tech
- Организатор онлайн-конференций (#АнтиконфаHR, People vs Data и др.)
- Поддерживается фондом «Сколково», способствует цифровизации HR-обучения

Компания: ECCO East
Инсайты:
- Российское подразделение ECCO, сохранившее работу на рынке и локализующее процессы
- Онлайн-продажи выросли в 10 раз в 2020, сейчас фокус на омниканальности
- Внедрило CVM-маркетинг, рост выручки с базы +51% в 2023
- Активно внедряет ERP, loyalty-программу и дашборды
- Развивает гибридные офисы-хабы для удалёнки

Компания: Ассоциация организационного развития
Инсайты:
- Первое сообщество экспертов по оргразвитию в РФ и СНГ
- Проводит форумы и вебинары о цифровизации HR и применении ИИ
- Недавний вебинар «HR на автопилоте» (сентябрь 2025)
- Создала «Центр нормирования» – площадку стандартов
- Объединяет 100+ HRD и консультантов по гибридным форматам работы`;

  $('#textInput').value = sampleText;
  processTextInput();
}

function processTextInput() {
  const text = $('#textInput').value.trim();
  if (!text) {
    toast('Введите текст с компаниями');
    return;
  }

  const parsedCompanies = parseCompaniesText(text);
  if (parsedCompanies.length === 0) {
    toast('Не удалось найти компании в тексте. Проверьте формат.');
    return;
  }

  companies = parsedCompanies;
  saveCompanies();
  render();
  toast(`Загружено ${companies.length} компаний`);
}

function clearData() {
  if (confirm('Вы уверены, что хотите очистить все данные?')) {
    companies = [];
    statuses = {};
    localStorage.removeItem(COMPANIES_STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    $('#textInput').value = '';
    render();
    toast('Данные очищены');
  }
}

// ==============================
// Поиск
// ==============================
$('#q').addEventListener('input', (e)=>{ filter = e.target.value.trim(); render(); });
$('#clear').addEventListener('click', ()=>{ $('#q').value=''; filter=''; render(); });

// ==============================
// Инициализация
// ==============================
(function init(){
  // Загружаем сохраненные данные или показываем пустой интерфейс
  if (!loadCompanies()) {
    companies = [];
  }
  render();
  bootConfetti();
  setupPWA();
  setupModal();
})();

// ==============================
// Конфетти и мотивация
// ==============================
let fx, ctx, fxW=0, fxH=0, rafId=0, particles=[];
function bootConfetti(){
  //fx = $('#fx'); ctx = fx.getContext('2d', { alpha:true });
  //resizeFx();
  //window.addEventListener('resize', resizeFx);
}
function resizeFx(){
  fxW = fx.width = Math.floor(window.innerWidth  * devicePixelRatio);
  fxH = fx.height= Math.floor((window.innerHeight)* devicePixelRatio);
  ctx.scale(devicePixelRatio, devicePixelRatio);
}
function makeParticle(big=false){
  const cx = window.innerWidth/2;
  const cy = window.innerHeight*0.35;
  const angle = (Math.random()*Math.PI) - (Math.PI/2);
  const speed = (big? 9:6) + Math.random()*5;
  const size  = (big? 6:3) + Math.random()*4;
  const colors = ['#E30611','#FFB3B8','#1FBF75','#F5C400','#2D8CFF','#FFFFFF','#111111'];
  return {
    x: cx, y: cy, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - (big? 6:4),
    g: .25, size, rot: Math.random()*Math.PI, vr: (Math.random()-.5)*0.3, color: colors[(Math.random()*colors.length)|0], life: 60+(Math.random()*40|0)
  };
}
function step(){
  ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
    ctx.restore();
    if(p.life<=0 || p.y>window.innerHeight+40) particles.splice(i,1);
  }
  if(particles.length){ rafId = requestAnimationFrame(step); }
  else { cancelAnimationFrame(rafId); rafId=0; }
}
function fireConfettiSmall(){
  for(let i=0;i<70;i++) particles.push(makeParticle(false));
  if(!rafId) step();
}
function fireConfettiBig(){
  for(let i=0;i<300;i++) particles.push(makeParticle(true));
  if(!rafId) step();
}

// ==============================
// PWA / установка
// ==============================
function drawIcon(size=192){
  const cvs = document.createElement('canvas');
  cvs.width=size; cvs.height=size;
  const c = cvs.getContext('2d');
  c.fillStyle = '#E30611'; c.fillRect(0,0,size,size);
  c.font = Math.floor(size*0.62) + 'px "Apple Color Emoji","Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText('🤝', size/2, size/2+2);
  return cvs.toDataURL('image/png');
}
function setupPWA(){
  try{
    const icon192 = drawIcon(192);
    const icon512 = drawIcon(512);
    const manifest = {
      name: 'MTS Link · Лид-трекер',
      short_name: 'Лид-трекер',
      start_url: '.',
      scope: '.',
      display: 'standalone',
      background_color: '#E30611',
      theme_color: '#E30611',
      icons: [
        { src: icon192, sizes:'192x192', type:'image/png', purpose:'any maskable'},
        { src: icon512, sizes:'512x512', type:'image/png', purpose:'any maskable'}
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('link');
    link.rel='manifest'; link.href=url; document.head.appendChild(link);

    const apple = document.createElement('link');
    apple.rel='apple-touch-icon'; apple.href=icon192;
    document.head.appendChild(apple);
  }catch(e){ console.warn('Manifest error', e); }

  if('serviceWorker' in navigator && window.isSecureContext){
    const swCode = `
      self.addEventListener('install', (e)=>{ self.skipWaiting(); });
      self.addEventListener('activate', (e)=>{ self.clients.claim(); });
      self.addEventListener('fetch', (e)=>{
        if(e.request.mode==='navigate'){
          e.respondWith(fetch(e.request).catch(()=>caches.match('app-shell')||Promise.resolve(Response.error())));
        }
      });
      (async ()=>{
        try{
          const cache = await caches.open('lead-tracker-v1');
          const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
          if(clients && clients[0]){
            const url = clients[0].url;
            const res = await fetch(url, {cache:'reload'});
            await cache.put('app-shell', res);
          }
        }catch(e){}
      })();
    `;
    const blob = new Blob([swCode], {type:'text/javascript'});
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(()=>{});
  }

  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e;
    $('#installBtn').style.display='inline-flex';
  });
  $('#installBtn').addEventListener('click', async ()=>{
    if(!deferredPrompt){ toast('Добавьте на главный экран через меню браузера'); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if(outcome==='accepted') $('#installBtn').style.display='none';
  });
}

// ==============================
// Модалка ввода
// ==============================
function setupModal(){
  const modal = document.getElementById('inputModal');
  const openBtn = document.getElementById('openModalBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const processBtn = document.getElementById('processTextBtn');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');

  const open = ()=>{
    modal.style.display = 'block';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    setTimeout(()=>{ document.getElementById('textInput').focus(); }, 0);
  };
  const close = ()=>{
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target.hasAttribute('data-close')) close(); });
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && modal.classList.contains('open')) close(); });

  processBtn.addEventListener('click', ()=>{ processTextInput(); close(); });
  loadSampleBtn.addEventListener('click', loadSampleData);
  clearDataBtn.addEventListener('click', ()=>{ clearData(); close(); });
}
