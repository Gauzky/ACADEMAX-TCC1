// =============================================
// === INICIALIZAÇÃO ===
// =============================================
if (!localStorage.getItem('academax_user') || !localStorage.getItem('academax_token')) {
    const legacy = localStorage.getItem('gympro_user');
    if (legacy) {
        localStorage.setItem('academax_user', legacy);
        localStorage.removeItem('gympro_user');
    } else {
        // Redireciona para o login se não tiver usuário OU se não tiver o token
        window.location.href = '/login';
    }
}

const loggedUser = JSON.parse(localStorage.getItem('academax_user') || '{}');
const API = 'https://academaxx.com.br/api';
// Helper: fetch com header de autenticação
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    // Pega o token do localStorage
    const token = localStorage.getItem('academax_token'); 
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`; // Envia o token
    }
    
    const res = await fetch(url, options);
    
    if (res.status === 401) {
        showToast('Sessão expirada. Faça login novamente.', 'warning');
        localStorage.removeItem('academax_user');
        localStorage.removeItem('academax_token');
        setTimeout(() => window.location.href = '/login', 1500);
        throw new Error('Unauthorized');
    }
    
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro na requisição');
    }
    return res;
}


let DB = { workouts: [], history: [] };
let targetUserIdForWorkout = null;
let globalClients = [];

// =============================================
// === TOAST ===
// =============================================
function showToast(message, type = 'info') {
    let toast = document.getElementById('academax-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'academax-toast';
        document.body.appendChild(toast);
    }
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const colors = { success: '#22c55e', error: '#ef4444', info: 'var(--accent)', warning: '#f59e0b' };
    toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};font-size:16px;flex-shrink:0;"></i><span>${message}</span>`;
    toast.classList.add('toast-show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('toast-show'), 3000);
}

// =============================================
// === DIALOG DE CONFIRMAÇÃO (substitui confirm()) ===
// =============================================
let _confirmCallback = null;
function showConfirm(title, message, icon = '⚠️', onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    document.getElementById('confirm-icon').innerText = icon;
    _confirmCallback = onConfirm;
    document.getElementById('confirm-dialog').classList.remove('hidden');
}
function executeConfirm() {
    document.getElementById('confirm-dialog').classList.add('hidden');
    if (_confirmCallback) _confirmCallback();
    _confirmCallback = null;
}
function cancelConfirm() {
    document.getElementById('confirm-dialog').classList.add('hidden');
    _confirmCallback = null;
}

// =============================================
// === LOADING SPINNER ===
// =============================================
function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Aguarde...';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}

// =============================================
// === CARREGAMENTO DO BANCO ===
// =============================================
async function loadDB() {
    try {
        // NOVO: Agora busca o usuário, os treinos e o histórico ao mesmo tempo
        const [resU, resW, resH] = await Promise.all([
            authFetch(`${API}/users/${loggedUser.id}`),
            authFetch(`${API}/workouts/${loggedUser.id}`),
            authFetch(`${API}/history/${loggedUser.id}`)
        ]);
        
        // NOVO: Pega os dados atualizados do banco e salva no navegador
        const freshUser = await resU.json();
        Object.assign(loggedUser, freshUser);
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        
        DB.workouts = await resW.json();
        DB.history  = await resH.json();
        
        // Carrega dados atualizados do banco na memória do app
        userGoals = loggedUser.goals || [];
        bodyMeasures = loggedUser.measures || [];
        schedule = loggedUser.schedule || {};
        restoreActiveWorkoutState();
        renderDashboard();
        renderWorkouts();
        renderHistory();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Erro ao conectar com o servidor.', 'warning');
    }
}

// =============================================
// === NAVEGAÇÃO ===
// =============================================
function navigateTo(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active-view');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    if (viewName === 'dashboard')  renderDashboard();
    if (viewName === 'workouts')   renderWorkouts();
    if (viewName === 'history')    renderHistory();
    if (viewName === 'progression') renderProgression();
    if (viewName === 'clients')    renderClients();
    if (viewName === 'measures')   loadMeasuresView();
    if (viewName === 'achievements') loadAchievementsView();
    if (viewName === 'schedule')   loadScheduleView();
    if (viewName === 'goals')      loadGoalsView();
    if (viewName === 'profile')    loadProfileData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================
// === TEMA ===
// =============================================
function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('academax_theme', isLight ? 'light' : 'dark');
    document.getElementById('theme-btn').innerHTML = `<i class="fa-solid fa-${isLight ? 'moon' : 'sun'}"></i>`;
    if (weightChart) initWeightChart();
    if (progressionChart) loadExerciseProgression(document.getElementById('progression-select')?.value);
}

function applyTheme() {
    const saved = localStorage.getItem('academax_theme');
    if (saved === 'light') {
        document.body.classList.add('light');
        const btn = document.getElementById('theme-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
    const accent = localStorage.getItem('academax_accent') || 'indigo';
    document.body.dataset.accent = accent;
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.accent === accent);
    });
}

function setAccent(accent) {
    document.body.dataset.accent = accent;
    localStorage.setItem('academax_accent', accent);
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.accent === accent);
    });
    if (weightChart) initWeightChart();
    if (progressionChart) loadExerciseProgression(document.getElementById('progression-select')?.value);
    showToast('Cor atualizada!', 'success');
}

// =============================================
// === DASHBOARD ===
// =============================================
function renderDashboard() {
    const name = loggedUser.name?.split(' ')[0] || 'Atleta';
    document.getElementById('user-name').innerText = name;
    document.getElementById('today-workout').innerText = DB.workouts.length > 0
        ? `${DB.workouts[0].name} — ${DB.workouts[0].desc}`
        : 'Nenhum treino criado';
    document.getElementById('total-workouts').innerText = DB.history.length;
    const vol = DB.history.reduce((s, h) => s + h.volume, 0);
    document.getElementById('total-volume').innerText = vol.toFixed(1);
    const resumeBtn = document.getElementById('resume-btn');
    resumeBtn.style.display = (activeWorkout && activeExerciseIndex < flatSets.length) ? 'flex' : 'none';
    initWeightChart();
}

let weightChart = null;
function initWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;
    if (weightChart) weightChart.destroy();

    let labels = [], data = [];
    if (DB.history.length > 0) {
        DB.history.slice(-8).forEach(h => {
            labels.push(new Date(h.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }));
            data.push(parseFloat(h.volume.toFixed(1)));
        });
    } else {
        labels = ['Sem dados']; data = [0];
    }

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    const isLight = document.body.classList.contains('light');
    const tickColor = isLight ? '#71717a' : '#52525b';

    weightChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Volume (kg)', data,
                borderColor: accent,
                backgroundColor: `${accent}18`,
                borderWidth: 2.5, fill: true, tension: 0.4,
                pointBackgroundColor: accent, pointRadius: 3, pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } },
                x: { grid: { display: false }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } }
            }
        }
    });
}

// =============================================
// === TREINOS ===
// =============================================
function renderWorkouts() {
    const list = document.getElementById('workouts-list');
    if (DB.workouts.length === 0) {
        list.innerHTML = `
            <div class="card" style="text-align:center;padding:40px 20px;">
                <i class="fa-solid fa-dumbbell" style="font-size:36px;color:var(--text-3);margin-bottom:14px;display:block;"></i>
                <p style="color:var(--text-2);margin-bottom:16px;">Você ainda não tem treinos criados.</p>
                <button class="btn-primary" style="width:auto;margin:0 auto;" onclick="openCreateWorkoutModal()">
                    <i class="fa-solid fa-plus"></i> Criar primeiro treino
                </button>
            </div>`;
        return;
    }
    list.innerHTML = '';
    DB.workouts.forEach(w => {
        const div = document.createElement('div');
        div.className = 'workout-item';
        div.innerHTML = `
            <div class="workout-info">
                <h3>${w.name}</h3>
                <p>${w.desc} · ${w.exercises.length} exercício${w.exercises.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="workout-actions">
                <button class="btn-action btn-edit" onclick="editWorkout('${w.id}')"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                <button class="btn-action btn-delete" onclick="confirmDeleteWorkout('${w.id}')"><i class="fa-solid fa-trash-can"></i></button>
                <button class="btn-action btn-start" onclick="startWorkout('${w.id}')"><i class="fa-solid fa-play"></i> Iniciar</button>
            </div>`;
        list.appendChild(div);
    });
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (DB.history.length === 0) {
        list.innerHTML = `<div class="card" style="text-align:center;padding:36px;">
            <i class="fa-solid fa-clock-rotate-left" style="font-size:32px;color:var(--text-3);display:block;margin-bottom:12px;"></i>
            <p style="color:var(--text-2);">Nenhum treino realizado ainda.</p>
        </div>`;
        return;
    }
    list.innerHTML = '';
    DB.history.slice().reverse().forEach(h => {
        const div = document.createElement('div');
        div.className = 'workout-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        div.innerHTML = `
            <div class="workout-info">
                <h3>${h.workoutName}</h3>
                <p>${new Date(h.date).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}
                · <strong style="color:var(--success);">${h.volume.toFixed(1)} kg</strong></p>
            </div>
            <button class="btn-action btn-delete" onclick="confirmDeleteHistory('${h.id}')" style="flex: 0 0 auto;">
                <i class="fa-solid fa-trash-can"></i>
            </button>`;
        list.appendChild(div);
    });
}

// Função que abre o menu de opções de exclusão
function openDeleteOptions(sessionId, exName = null, setIdx = null) {
    let title = 'Excluir Registro';
    let message = 'O que você deseja excluir?';
    
    // Cria botões dinâmicos no modal de confirmação
    const confirmDialog = document.getElementById('confirm-dialog');
    const actionsDiv = confirmDialog.querySelector('.confirm-dialog-actions');
    
    // Reseta os botões originais para não acumular
    actionsDiv.innerHTML = `
        <button class="btn-ghost" onclick="cancelConfirm()">Cancelar</button>
    `;

    // Se passou um exercício e uma série específica
    if (exName !== null && setIdx !== null) {
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteSpecificSet('${sessionId}', '${exName}', ${setIdx})">Só a Série</button>`;
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteSpecificExercise('${sessionId}', '${exName}')">Todo o Exercício</button>`;
        message = `Você está no exercício <strong>${exName}</strong>.<br>Deseja apagar apenas esta série ou todas as séries deste exercício?`;
    } else {
        // Se não passou série, é exclusão do treino inteiro
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteWholeWorkout('${sessionId}')">Treino Inteiro</button>`;
    }

    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerHTML = message;
    document.getElementById('confirm-icon').innerText = '🗑️';
    document.getElementById('confirm-dialog').classList.remove('hidden');
}

// 1. Abre o modal perguntando o que quer excluir
function openDeleteOptions(sessionId, exName = null, setIdx = null) {
    const confirmDialog = document.getElementById('confirm-dialog');
    const actionsDiv = confirmDialog.querySelector('.confirm-dialog-actions');
    
    actionsDiv.innerHTML = `<button class="btn-ghost" onclick="cancelConfirm()">Cancelar</button>`;

    if (exName !== null && setIdx !== null) {
        // Se clicou na Evolução, mostra as 3 opções
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteSpecificSet('${sessionId}', ${setIdx})">Série</button>`;
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteSpecificExercise('${sessionId}', '${exName}')">Exercício</button>`;
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteWholeWorkout('${sessionId}')">Treino Inteiro</button>`;
        
        document.getElementById('confirm-title').innerText = 'O que excluir?';
        document.getElementById('confirm-message').innerHTML = `Você está no exercício <strong>${exName}</strong>.<br>Escolha o nível de exclusão:`;
    } else {
        // Se clicou no Histórico, só pode apagar o treino inteiro
        actionsDiv.innerHTML += `<button class="btn-danger" onclick="deleteWholeWorkout('${sessionId}')">Excluir Treino</button>`;
        document.getElementById('confirm-title').innerText = 'Excluir Treino';
        document.getElementById('confirm-message').innerText = 'Tem certeza que deseja apagar este treino inteiro do histórico?';
    }

    document.getElementById('confirm-icon').innerText = '🗑️';
    document.getElementById('confirm-dialog').classList.remove('hidden');
}

// 2. Excluir apenas a Série
async function deleteSpecificSet(sessionId, setIdx) {
    document.getElementById('confirm-dialog').classList.add('hidden');
    const session = DB.history.find(h => h.id === sessionId);
    if (!session) return;

    // Remove a série pelo índice exato
    session.sets.splice(setIdx, 1);
    
    // Se o array de sets ficou vazio, apaga o treino inteiro
    if (session.sets.length === 0) {
        return deleteWholeWorkout(sessionId);
    }

    // Recalcula o volume
    session.volume = session.sets.reduce((acc, s) => acc + (s.actualReps * s.actualWeight), 0);

    await saveUpdatedHistory(session);
    showToast('Série excluída!', 'success');
}

// 3. Excluir um Exercício Inteiro (remove todas as séries dele)
async function deleteSpecificExercise(sessionId, exName) {
    document.getElementById('confirm-dialog').classList.add('hidden');
    const session = DB.history.find(h => h.id === sessionId);
    if (!session) return;

    session.sets = session.sets.filter(s => s.exName !== exName);
    
    if (session.sets.length === 0) {
        return deleteWholeWorkout(sessionId);
    }

    session.volume = session.sets.reduce((acc, s) => acc + (s.actualReps * s.actualWeight), 0);
    await saveUpdatedHistory(session);
    showToast(`Exercício excluído!`, 'success');
}

// 4. Excluir o Treino Inteiro (da aba histórico ou evolução)
async function deleteWholeWorkout(sessionId) {
    document.getElementById('confirm-dialog').classList.add('hidden');
    try {
        await authFetch(`${API}/history/${sessionId}`, { method: 'DELETE' });
        DB.history = DB.history.filter(h => h.id !== sessionId);
        renderHistory();
        loadExerciseProgression(document.getElementById('progression-select')?.value);
        showToast('Treino excluído do histórico!', 'success');
    } catch (e) {
        showToast('Erro ao excluir treino.', 'error');
    }
}

// 5. Salva a atualização no banco (PUT)
async function saveUpdatedHistory(session) {
    try {
        await authFetch(`${API}/history/${session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume: session.volume, sets: session.sets })
        });
        
        // Atualiza a tela de evolução e o histórico
        renderHistory();
        loadExerciseProgression(document.getElementById('progression-select')?.value);
    } catch (e) {
        showToast('Erro ao atualizar o banco.', 'error');
        console.error(e);
    }
}
// =============================================
// === VÍDEO INLINE ===
// =============================================
// IDs REAIS do YouTube para TODOS os 56 exercicios (canais brasileiros de musculacao).
const videoIds = {
    'Supino Reto com Barra':              '8UiTPNj66AU',
    'Supino Reto com Halteres':           '31j_Io3ncRg',
    'Supino Inclinado':                   'RGeSgQmO1EU',
    'Supino Declinado':                   '5nnQbU4jPuQ',
    'Crucifixo no Banco':                 'fG2fUgin3Zw',
    'Crucifixo Inclinado':                'HnUoBqPY9dI',
    'Crossover na Polia':                 'E3aha5zhlc0',
    'Peck Deck (Máquina)':                'a5XwjsD3AOI',
    'Flexão de Braço':                    'RRi0-tvte6A',
    'Paralelas (Mergulho)':               'RZeBsAZ9diY',
    'Puxada Frontal':                     '1i1lO78rESE',
    'Barra Fixa':                         'qaGsiwbCL2Y',
    'Remada Curvada':                     'shZ9Bq4rOQg',
    'Remada Baixa (Triângulo)':           'zLXot5N6uW0',
    'Remada Unilateral':                  'SUvZiVClLKw',
    'Levantamento Terra':                 'QiqUXcz2iyA',
    'Pulldown (Pegada Aberta)':           'mPmfwbc_svw',
    'Face Pull':                          'kYMTJAx_dTM',
    'Agachamento Livre':                  'rM6SDUdl9fs',
    'Agachamento no Smith':               '7p_qycgzx4U',
    'Leg Press 45°':                      'waAxlYvtCcI',
    'Cadeira Extensora':                  'el3oHblB5DM',
    'Cadeira Flexora':                    'YyvSfVjQeL0',
    'Mesa Flexora':                       'YyvSfVjQeL0',
    'Stiff':                              'QiqUXcz2iyA',
    'Afundo (Passada)':                   'rM6SDUdl9fs',
    'Panturrilha em Pé':                  'tPiLhI7TkLE',
    'Panturrilha Sentada':                'tPiLhI7TkLE',
    'Hack Agachamento':                   '7p_qycgzx4U',
    'Rosca Direta com Barra':             'Et1wgGMGW8w',
    'Rosca Direta com Halteres':          'w9_ggo0_34k',
    'Rosca Alternada':                    '6Zz_RG0EHFE',
    'Rosca Martelo':                      'YrZ0qzBi-kk',
    'Rosca Concentrada':                  'rT7DgCr-3pg',
    'Rosca Scott (Máquina)':              'LIcKp31AvQY',
    'Rosca 21':                           'Et1wgGMGW8w',
    'Tríceps Pulley (Barra)':             'BI881NpBDHs',
    'Tríceps Pulley (Corda)':             'l3rHYPtMUo8',
    'Tríceps Francês':                    '2-LAMcpzODU',
    'Tríceps Testa':                      'AY0kcO-tx30',
    'Tríceps Banco (Dips)':               'OPyI6B68tHw',
    'Tríceps Coice':                      'TQehNnJT_hE',
    'Desenvolvimento com Halteres':       '7UjIQY-_PBc',
    'Desenvolvimento no Smith':           '7UjIQY-_PBc',
    'Elevação Lateral':                   '4Ula_q5b2Bg',
    'Elevação Frontal':                   'jannLx4RxKo',
    'Crucifixo Inverso (Posterior)':      'BYUNDfHB3cY',
    'Remada Alta':                        'shZ9Bq4rOQg',
    'Encolhimento':                       'tPiLhI7TkLE',
    'Abdominal Supra (Crunch)':           'uCLRkDNltzw',
    'Abdominal Infra':                    'P9KvihVxwCo',
    'Prancha (Plank)':                    'uCLRkDNltzw',
    'Abdominal Bicicleta':                'uCLRkDNltzw',
    'Elevação de Pernas':                 'P9KvihVxwCo',
    'Abdominal na Polia':                 'uCLRkDNltzw',
    'Prancha Lateral':                    'uCLRkDNltzw',
};

// =============================================
// === VÍDEO INLINE (YOUTUBE) ===
// =============================================
function openVideo(name) {
    const id = videoIds[name];
    const modal = document.getElementById('video-modal');
    const title = document.getElementById('video-modal-title');
    const iframe = document.getElementById('video-iframe');
    if (!modal || !iframe) return;
    if (title) title.innerText = name;
    iframe.src = id
        ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&hl=pt-BR`
        : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent('como fazer ' + name + ' academia')}`;
    modal.classList.remove('hidden');
}
function closeVideoModal() {
    const modal  = document.getElementById('video-modal');
    const iframe = document.getElementById('video-iframe');
    if (modal)  modal.classList.add('hidden');
    if (iframe) iframe.src = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideoModal(); });

const exerciseLibrary = [
    { name: 'Supino Reto com Barra', muscle: 'Peito', img: 'https://img.youtube.com/vi/8UiTPNj66AU/hqdefault.jpg' },
    { name: 'Supino Reto com Halteres', muscle: 'Peito', img: 'https://img.youtube.com/vi/31j_Io3ncRg/hqdefault.jpg' },
    { name: 'Supino Inclinado', muscle: 'Peito', img: 'https://img.youtube.com/vi/RGeSgQmO1EU/hqdefault.jpg' },
    { name: 'Supino Declinado', muscle: 'Peito', img: 'https://img.youtube.com/vi/5nnQbU4jPuQ/hqdefault.jpg' },
    { name: 'Crucifixo no Banco', muscle: 'Peito', img: 'https://img.youtube.com/vi/fG2fUgin3Zw/hqdefault.jpg' },
    { name: 'Crucifixo Inclinado', muscle: 'Peito', img: 'https://img.youtube.com/vi/HnUoBqPY9dI/hqdefault.jpg' },
    { name: 'Crossover na Polia', muscle: 'Peito', img: 'https://img.youtube.com/vi/E3aha5zhlc0/hqdefault.jpg' },
    { name: 'Peck Deck (Máquina)', muscle: 'Peito', img: 'https://img.youtube.com/vi/a5XwjsD3AOI/hqdefault.jpg' },
    { name: 'Flexão de Braço', muscle: 'Peito', img: 'https://img.youtube.com/vi/RRi0-tvte6A/hqdefault.jpg' },
    { name: 'Paralelas (Mergulho)', muscle: 'Peito', img: 'https://img.youtube.com/vi/RZeBsAZ9diY/hqdefault.jpg' },
    { name: 'Puxada Frontal', muscle: 'Costas', img: 'https://img.youtube.com/vi/1i1lO78rESE/hqdefault.jpg' },
    { name: 'Barra Fixa', muscle: 'Costas', img: 'https://img.youtube.com/vi/qaGsiwbCL2Y/hqdefault.jpg' },
    { name: 'Remada Curvada', muscle: 'Costas', img: 'https://img.youtube.com/vi/shZ9Bq4rOQg/hqdefault.jpg' },
    { name: 'Remada Baixa (Triângulo)', muscle: 'Costas', img: 'https://img.youtube.com/vi/zLXot5N6uW0/hqdefault.jpg' },
    { name: 'Remada Unilateral', muscle: 'Costas', img: 'https://img.youtube.com/vi/SUvZiVClLKw/hqdefault.jpg' },
    { name: 'Levantamento Terra', muscle: 'Costas', img: 'https://img.youtube.com/vi/QiqUXcz2iyA/hqdefault.jpg' },
    { name: 'Pulldown (Pegada Aberta)', muscle: 'Costas', img: 'https://img.youtube.com/vi/mPmfwbc_svw/hqdefault.jpg' },
    { name: 'Face Pull', muscle: 'Costas', img: 'https://img.youtube.com/vi/kYMTJAx_dTM/hqdefault.jpg' },
    { name: 'Agachamento Livre', muscle: 'Pernas', img: 'https://img.youtube.com/vi/rM6SDUdl9fs/hqdefault.jpg' },
    { name: 'Agachamento no Smith', muscle: 'Pernas', img: 'https://img.youtube.com/vi/7p_qycgzx4U/hqdefault.jpg' },
    { name: 'Leg Press 45°', muscle: 'Pernas', img: 'https://img.youtube.com/vi/waAxlYvtCcI/hqdefault.jpg' },
    { name: 'Cadeira Extensora', muscle: 'Pernas', img: 'https://img.youtube.com/vi/el3oHblB5DM/hqdefault.jpg' },
    { name: 'Cadeira Flexora', muscle: 'Pernas', img: 'https://img.youtube.com/vi/YyvSfVjQeL0/hqdefault.jpg' },
    { name: 'Mesa Flexora', muscle: 'Pernas', img: 'https://img.youtube.com/vi/YyvSfVjQeL0/hqdefault.jpg' },
    { name: 'Stiff', muscle: 'Pernas', img: 'https://img.youtube.com/vi/QiqUXcz2iyA/hqdefault.jpg' },
    { name: 'Afundo (Passada)', muscle: 'Pernas', img: 'https://img.youtube.com/vi/rM6SDUdl9fs/hqdefault.jpg' },
    { name: 'Panturrilha em Pé', muscle: 'Pernas', img: 'https://img.youtube.com/vi/tPiLhI7TkLE/hqdefault.jpg' },
    { name: 'Panturrilha Sentada', muscle: 'Pernas', img: 'https://img.youtube.com/vi/tPiLhI7TkLE/hqdefault.jpg' },
    { name: 'Hack Agachamento', muscle: 'Pernas', img: 'https://img.youtube.com/vi/7p_qycgzx4U/hqdefault.jpg' },
    { name: 'Rosca Direta com Barra', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/Et1wgGMGW8w/hqdefault.jpg' },
    { name: 'Rosca Direta com Halteres', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/w9_ggo0_34k/hqdefault.jpg' },
    { name: 'Rosca Alternada', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/6Zz_RG0EHFE/hqdefault.jpg' },
    { name: 'Rosca Martelo', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/YrZ0qzBi-kk/hqdefault.jpg' },
    { name: 'Rosca Concentrada', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/rT7DgCr-3pg/hqdefault.jpg' },
    { name: 'Rosca Scott (Máquina)', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/LIcKp31AvQY/hqdefault.jpg' },
    { name: 'Rosca 21', muscle: 'Bíceps', img: 'https://img.youtube.com/vi/Et1wgGMGW8w/hqdefault.jpg' },
    { name: 'Tríceps Pulley (Barra)', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/BI881NpBDHs/hqdefault.jpg' },
    { name: 'Tríceps Pulley (Corda)', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/l3rHYPtMUo8/hqdefault.jpg' },
    { name: 'Tríceps Francês', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/2-LAMcpzODU/hqdefault.jpg' },
    { name: 'Tríceps Testa', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/AY0kcO-tx30/hqdefault.jpg' },
    { name: 'Tríceps Banco (Dips)', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/OPyI6B68tHw/hqdefault.jpg' },
    { name: 'Tríceps Coice', muscle: 'Tríceps', img: 'https://img.youtube.com/vi/TQehNnJT_hE/hqdefault.jpg' },
    { name: 'Desenvolvimento com Halteres', muscle: 'Ombro', img: 'https://img.youtube.com/vi/7UjIQY-_PBc/hqdefault.jpg' },
    { name: 'Desenvolvimento no Smith', muscle: 'Ombro', img: 'https://img.youtube.com/vi/7UjIQY-_PBc/hqdefault.jpg' },
    { name: 'Elevação Lateral', muscle: 'Ombro', img: 'https://img.youtube.com/vi/4Ula_q5b2Bg/hqdefault.jpg' },
    { name: 'Elevação Frontal', muscle: 'Ombro', img: 'https://img.youtube.com/vi/jannLx4RxKo/hqdefault.jpg' },
    { name: 'Crucifixo Inverso (Posterior)', muscle: 'Ombro', img: 'https://img.youtube.com/vi/BYUNDfHB3cY/hqdefault.jpg' },
    { name: 'Remada Alta', muscle: 'Ombro', img: 'https://img.youtube.com/vi/shZ9Bq4rOQg/hqdefault.jpg' },
    { name: 'Encolhimento', muscle: 'Ombro', img: 'https://img.youtube.com/vi/tPiLhI7TkLE/hqdefault.jpg' },
    { name: 'Abdominal Supra (Crunch)', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/uCLRkDNltzw/hqdefault.jpg' },
    { name: 'Abdominal Infra', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/P9KvihVxwCo/hqdefault.jpg' },
    { name: 'Prancha (Plank)', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/uCLRkDNltzw/hqdefault.jpg' },
    { name: 'Abdominal Bicicleta', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/uCLRkDNltzw/hqdefault.jpg' },
    { name: 'Elevação de Pernas', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/P9KvihVxwCo/hqdefault.jpg' },
    { name: 'Abdominal na Polia', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/uCLRkDNltzw/hqdefault.jpg' },
    { name: 'Prancha Lateral', muscle: 'Abdômen', img: 'https://img.youtube.com/vi/uCLRkDNltzw/hqdefault.jpg' },
];

let tempExercisesToAdd = [];
let editingWorkoutId   = null;
let currentMuscleTab   = 'Peito';

function openCreateWorkoutModal() {
    editingWorkoutId = null;
    tempExercisesToAdd = [];
    document.getElementById('new-workout-name').value = '';
    document.getElementById('new-workout-desc').value = '';
    document.getElementById('form-modal-title').innerText = 'Novo Treino';
    document.getElementById('save-workout-btn').innerHTML = '<i class="fa-solid fa-check"></i> Salvar';
    document.getElementById('create-workout-modal').classList.remove('hidden');
    renderAddedExercises();
    renderLibrary();
}

function editWorkout(id) {
    const w = DB.workouts.find(x => x.id === id);
    if (!w) return;
    editingWorkoutId = id;
    tempExercisesToAdd = JSON.parse(JSON.stringify(w.exercises));
    document.getElementById('new-workout-name').value = w.name;
    document.getElementById('new-workout-desc').value = w.desc;
    document.getElementById('form-modal-title').innerText = 'Editar Treino';
    document.getElementById('save-workout-btn').innerHTML = '<i class="fa-solid fa-pen"></i> Atualizar';
    document.getElementById('create-workout-modal').classList.remove('hidden');
    renderAddedExercises();
    renderLibrary();
}

function renderLibrary() {
    const muscles = [...new Set(exerciseLibrary.map(e => e.muscle))];
    const searchVal = (document.getElementById('ex-search')?.value || '').toLowerCase().trim();
    document.getElementById('exercises-tabs').innerHTML = muscles
        .map(m => `<button class="tab-btn ${m === currentMuscleTab ? 'active-tab' : ''}" onclick="changeMuscleTab('${m}')">${m}</button>`)
        .join('');
    document.getElementById('exercises-library').innerHTML = exerciseLibrary
        .filter(ex => ex.muscle === currentMuscleTab)
        .filter(ex => !searchVal || ex.name.toLowerCase().includes(searchVal))
        .map((ex, i) => {
            const gi = exerciseLibrary.indexOf(ex);
            // Fallback: placeholder com as iniciais do exercício (em vez de 'A' genérico)
            const initials = ex.name.replace(/[^a-zA-ZÀ-ú\s]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 3).join('').toUpperCase();
            const fallback = `https://placehold.co/80x80/1c1c21/6366f1?text=${initials}`;
            return `<div class="exercise-lib-item">
                <img src="${ex.img}" alt="${ex.name}" class="ex-thumb" onerror="this.onerror=null;this.src='${fallback}'">
                <div class="ex-info">
                    <span>${ex.name}</span>
                    <button class="btn-video" onclick="openVideo('${ex.name}')">
                        <i class="fa-solid fa-circle-play"></i> Ver vídeo
                    </button>
                </div>
                <button class="btn-add-lib" onclick="openExerciseConfig(${gi})">
                    <i class="fa-solid fa-plus"></i> Add
                </button>
            </div>`;
        }).join('');
}

function changeMuscleTab(muscle) {
    currentMuscleTab = muscle;
    renderLibrary();
}

function renderAddedExercises() {
    document.getElementById('added-count').innerText = tempExercisesToAdd.length;
    const div = document.getElementById('added-exercises-list');
    if (tempExercisesToAdd.length === 0) {
        div.innerHTML = '<p style="color:var(--text-3);font-size:13px;padding:4px 0;">Nenhum exercício adicionado ainda.</p>';
        return;
    }
    div.innerHTML = tempExercisesToAdd.map((ex, i) => `
        <div class="added-item">
            <span><i class="fa-solid fa-check"></i> ${ex.name} (${ex.sets.length} séries)</span>
            <button class="btn-remove" onclick="removeAddedExercise(${i})">Remover</button>
        </div>`).join('');
}

function removeAddedExercise(i) { tempExercisesToAdd.splice(i, 1); renderAddedExercises(); }

function closeCreateModal() {
    targetUserIdForWorkout = null;
    document.getElementById('create-workout-modal').classList.add('hidden');
}

// === CONFIGURAR EXERCÍCIO ===
let currentExerciseConfig = null;
let tempSetsCount = 3;

function openExerciseConfig(libIndex) {
    currentExerciseConfig = exerciseLibrary[libIndex];
    tempSetsCount = 3;
    document.getElementById('modal-title').innerText = currentExerciseConfig.name;
    document.getElementById('exercise-modal').classList.remove('hidden');
    updateSetsUI();
}

function adjustSets(val) {
    tempSetsCount = Math.max(1, tempSetsCount + val);
    updateSetsUI();
}

function updateSetsUI() {
    document.getElementById('sets-count').innerText = tempSetsCount;
    let html = `<div class="set-row-labels"><span></span><span>Reps</span><span>Carga (kg)</span></div>`;
    for (let i = 0; i < tempSetsCount; i++) {
        html += `<div class="set-row">
            <span class="set-num-label">${i + 1}</span>
            <input type="number" value="10" id="reps-${i}" min="1">
            <input type="number" value="20" id="weight-${i}" min="0" step="0.5">
        </div>`;
    }
    document.getElementById('sets-config-container').innerHTML = html;
}

function saveExercise() {
    const sets = Array.from({ length: tempSetsCount }, (_, i) => ({
        reps:   parseInt(document.getElementById(`reps-${i}`).value)   || 10,
        weight: parseFloat(document.getElementById(`weight-${i}`).value) || 20,
    }));
    tempExercisesToAdd.push({ name: currentExerciseConfig.name, sets, restTime: 60 });
    document.getElementById('exercise-modal').classList.add('hidden');
    renderAddedExercises();
    showToast(`${currentExerciseConfig.name} adicionado!`, 'success');
}
function closeModal() { document.getElementById('exercise-modal').classList.add('hidden'); }

async function saveNewWorkout() {
    const name = document.getElementById('new-workout-name').value.trim();
    const desc = document.getElementById('new-workout-desc').value.trim();
    if (!name || tempExercisesToAdd.length === 0) {
        showToast('Dê um nome e adicione pelo menos 1 exercício.', 'warning'); return;
    }
    const btn = document.getElementById('save-workout-btn');
    setButtonLoading(btn, true);
    const userId = targetUserIdForWorkout || loggedUser.id;
    
    try {
        const res = await authFetch(`${API}/workouts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, desc, exercises: tempExercisesToAdd, userId })
        });
        
        const savedWorkout = await res.json(); 
        
        if (!targetUserIdForWorkout) {
            if (editingWorkoutId) {
                const w = DB.workouts.find(x => x.id === editingWorkoutId);
                if (w) { w.name = name; w.desc = desc; w.exercises = tempExercisesToAdd; }
                showToast('Treino atualizado!', 'success');
            } else {
                DB.workouts.push(savedWorkout); // <--- Usa o ID real do banco
                showToast('Treino criado!', 'success');
            }
            renderWorkouts();
         } else {
        // Notifica o cliente sobre o novo treino recomendado
        authFetch(`${API}/users/${targetUserIdForWorkout}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'workout',
                title: 'Novo treino recomendado!',
                message: `Seu personal recomendou o treino "${name}". Confira agora!`
            })
        }).catch(() => {});
        viewClient(targetUserIdForWorkout);
        showToast('Treino recomendado ao cliente!', 'success');
    }
    } catch (e) {
        showToast('Erro ao criar treino.', 'error');
        console.error(e);
    }

    editingWorkoutId = null; targetUserIdForWorkout = null;
    setButtonLoading(btn, false);
    closeCreateModal();
}
// =============================================
// === TREINO ATIVO ===
// =============================================
let activeWorkout       = null;
let activeExerciseIndex = 0;
let flatSets            = [];
let timerInterval       = null;
let timeLeft            = 0;

function saveActiveWorkoutState() {
    if (activeWorkout) {
        localStorage.setItem('academax_active_workout', JSON.stringify({
            activeWorkout,
            activeExerciseIndex,
            flatSets
        }));
    } else {
        localStorage.removeItem('academax_active_workout');
    }
}

// NOVO: Função para recuperar o treino se a página for atualizada
function restoreActiveWorkoutState() {
    const saved = localStorage.getItem('academax_active_workout');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            // Verifica se o treino realmente tem dados válidos
            if (data.activeWorkout && data.flatSets && data.flatSets.length > 0) {
                activeWorkout = data.activeWorkout;
                activeExerciseIndex = data.activeExerciseIndex;
                flatSets = data.flatSets;
            }
        } catch (e) {
            localStorage.removeItem('academax_active_workout');
        }
    }
}

function startWorkout(workoutId) {
    if (!workoutId && DB.workouts.length > 0) workoutId = DB.workouts[0].id;
    activeWorkout = DB.workouts.find(w => w.id === workoutId);
    if (!activeWorkout) { showToast('Crie um treino primeiro.', 'warning'); return; }
    clearInterval(timerInterval); timeLeft = 0; flatSets = [];
    activeWorkout.exercises.forEach(ex => {
        ex.sets.forEach((set, si) => {
            flatSets.push({ exName: ex.name, setIdx: si, totalSets: ex.sets.length,
                plannedReps: set.reps, plannedWeight: set.weight, restTime: ex.restTime });
        });
    });
    activeExerciseIndex = 0;
    navigateTo('active-workout');
    renderActiveSet();
    saveActiveWorkoutState();
}

function resumeWorkout() {
    if (!activeWorkout || activeExerciseIndex >= flatSets.length) {
        showToast('Nenhum treino em andamento.', 'info'); return;
    }
    clearInterval(timerInterval); timeLeft = 0;
    document.getElementById('rest-timer').classList.add('hidden');
    document.getElementById('exercise-active-view').classList.remove('hidden');
    navigateTo('active-workout');
    renderActiveSet();
}

function renderActiveSet() {
    if (activeExerciseIndex >= flatSets.length) { finishWorkout(); return; }
    const s = flatSets[activeExerciseIndex];
    document.getElementById('active-exercise-name').innerText = s.exName;
    document.getElementById('active-set-num').innerText       = s.setIdx + 1;
    document.getElementById('active-total-sets').innerText    = s.totalSets;
    document.getElementById('active-reps').value              = s.plannedReps;
    document.getElementById('active-weight').value            = s.plannedWeight;
    document.getElementById('workout-progress').style.width   = `${(activeExerciseIndex / flatSets.length) * 100}%`;
    document.getElementById('rest-timer').classList.add('hidden');
    document.getElementById('exercise-active-view').classList.remove('hidden');
}

function completeSet() {
    const s = flatSets[activeExerciseIndex];
    s.actualReps   = parseInt(document.getElementById('active-reps').value);
    s.actualWeight = parseFloat(document.getElementById('active-weight').value);
    activeExerciseIndex++;
    saveActiveWorkoutState();
    startRestTimer(s.restTime);
}

function startRestTimer(seconds) {
    document.getElementById('exercise-active-view').classList.add('hidden');
    document.getElementById('rest-timer').classList.remove('hidden');
    timeLeft = seconds;
    document.getElementById('timer-display').innerText = timeLeft;
    clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = timeLeft;
        
        if (timeLeft <= 0) { 
            clearInterval(timerInterval); 
            
            // NOVO: Vibrar o celular (se suportado)
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            
            // NOVO: Tocar um bipe usando a API de áudio do navegador
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.value = 880; // Frequência do som (A5)
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.3); // Toca por 0.3 segundos
            } catch (e) { console.log('Áudio não suportado'); }

            renderActiveSet(); 
        }
    }, 1000);
}

function adjustTimer(val) {
    timeLeft = Math.max(0, timeLeft + val);
    document.getElementById('timer-display').innerText = timeLeft;
}
function skipRest() { clearInterval(timerInterval); timeLeft = 0; renderActiveSet(); }

function confirmFinishWorkout() {
    showConfirm('Finalizar treino', 'Deseja encerrar o treino agora? O progresso será salvo.', '🏁', finishWorkout);
}

async function finishWorkout() {
    clearInterval(timerInterval); timeLeft = 0;
    if (activeWorkout) {
        const volume = flatSets.reduce((s, x) => s + (x.actualReps && x.actualWeight ? x.actualReps * x.actualWeight : 0), 0);
        try {
            await authFetch(`${API}/history`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: loggedUser.id, workoutId: activeWorkout.id, volume, sets: flatSets })
            });
        } catch (e) {}
        DB.history.push({ id: Date.now().toString(), workoutName: activeWorkout.name, date: new Date().toISOString(), volume, sets: flatSets });
        showToast(`🎉 Treino concluído! ${volume.toFixed(1)} kg de volume.`, 'success');
    }
    activeWorkout = null; activeExerciseIndex = 0; flatSets = [];
     localStorage.removeItem('academax_active_workout');
    navigateTo('dashboard');
}

// =============================================
// === EVOLUÇÃO ===
// =============================================
let progressionChart = null;

function renderProgression() {
    const select = document.getElementById('progression-select');
    select.innerHTML = '<option value="">Selecione...</option>';
    const exSet = new Set();
    let allRecs = [];
    DB.history.forEach(s => s.sets.forEach(set => {
        if (set.exName) exSet.add(set.exName);
        if (set.actualWeight) allRecs.push({ date: new Date(s.date).toLocaleDateString('pt-BR'), weight: set.actualWeight });
    }));
    const exArr = [...exSet].sort();
    exArr.forEach(ex => { select.innerHTML += `<option value="${ex}">${ex}</option>`; });
    calcTimeStats(allRecs);
    if (exArr.length > 0) { select.value = exArr[0]; loadExerciseProgression(exArr[0]); }
    else {
        document.getElementById('progression-stats').classList.add('hidden');
        document.getElementById('progression-list').innerHTML = `<div class="card" style="text-align:center;padding:36px;">
            <i class="fa-solid fa-chart-line" style="font-size:32px;color:var(--text-3);display:block;margin-bottom:12px;"></i>
            <p style="color:var(--text-2);">Faça seu primeiro treino para ver a evolução.</p>
        </div>`;
        if (progressionChart) progressionChart.destroy();
    }
}

function calcTimeStats(records) {
    const today = new Date();
    let w = 0, m = 0, y = 0;
    records.forEach(r => {
        const p = r.date.split('/');
        const d = new Date(p[2], p[1]-1, p[0]);
        if (d.getFullYear() === today.getFullYear()) {
            if (r.weight > y) y = r.weight;
            if (d.getMonth() === today.getMonth()) {
                if (r.weight > m) m = r.weight;
                if (Math.floor((today - d) / 86400000) <= 7 && r.weight > w) w = r.weight;
            }
        }
    });
    document.getElementById('stat-week').innerText  = w + ' kg';
    document.getElementById('stat-month').innerText = m + ' kg';
    document.getElementById('stat-year').innerText  = y + ' kg';
}

function loadExerciseProgression(exName) {
    if (!exName) { document.getElementById('progression-stats').classList.add('hidden'); return; }
    
    const records = [];
    // Agora pegamos o ID da sessão e o index exato da série no array
    DB.history.forEach(session => {
        session.sets.forEach((set, idx) => {
            if (set.exName === exName && set.actualWeight) {
                records.push({ 
                    sessionId: session.id, 
                    setIdx: idx, 
                    date: new Date(session.date).toLocaleDateString('pt-BR'), 
                    weight: set.actualWeight, 
                    reps: set.actualReps 
                });
            }
        });
    });

    if (records.length === 0) {
        document.getElementById('progression-stats').classList.add('hidden');
        document.getElementById('progression-list').innerHTML = '<p class="subtitle">Sem dados para este exercício.</p>';
        return;
    }

    const weights = records.map(r => r.weight);
    document.getElementById('prog-start-weight').innerText = weights[0] + ' kg';
    document.getElementById('prog-max-weight').innerText   = Math.max(...weights) + ' kg';
    document.getElementById('progression-stats').classList.remove('hidden');
    
    const list = document.getElementById('progression-list');
    
    // Desenha a lista com o botão passando os dados corretos
    list.innerHTML = records.slice().reverse().map(r => {
        const isRec = r.weight === Math.max(...weights);
        return `<div class="prog-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; padding: 12px; background: var(--bg-card); border-radius: 8px;">
            <div class="prog-date">
                <span class="day" style="font-weight:700; font-size:14px;">${r.date}</span>
                <span class="reps" style="font-size:12px; color:var(--text-3);">${r.reps} reps</span>
            </div>
            <div style="display:flex; align-items:center; gap: 8px;">
                <span class="prog-weight" style="color:var(--success); font-weight:700;">${r.weight} kg</span>
                ${isRec ? '<span class="prog-record" style="font-size:10px; background:var(--accent); color:#fff; padding:2px 6px; border-radius:10px;"><i class="fa-solid fa-trophy"></i> Recorde</span>' : ''}
                <button class="btn-action btn-delete" onclick="openDeleteOptions('${r.sessionId}', '${exName}', ${r.setIdx})" style="padding: 6px 10px;" title="Excluir">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    // O resto do código do gráfico (Chart.js) continua igual...
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    const isLight = document.body.classList.contains('light');
    const tickColor = isLight ? '#71717a' : '#52525b';
    if (progressionChart) progressionChart.destroy();
    
    progressionChart = new Chart(document.getElementById('progressionChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: records.map(r => r.date),
            datasets: [{
                label: 'Carga (kg)', data: weights,
                borderColor: accent, backgroundColor: `${accent}18`,
                borderWidth: 2.5, fill: true, tension: 0.3,
                pointBackgroundColor: accent, pointRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: isLight ? '#18181b' : '#f4f4f5', font: { family: 'DM Sans' } } } },
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } },
                x: { grid: { display: false }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } }
            }
        }
    });
}function loadExerciseProgression(exName) {
    if (!exName) { document.getElementById('progression-stats').classList.add('hidden'); return; }
    
    const records = [];
    // Agora pegamos o ID da sessão e o index exato da série no array
    DB.history.forEach(session => {
        session.sets.forEach((set, idx) => {
            if (set.exName === exName && set.actualWeight) {
                records.push({ 
                    sessionId: session.id, 
                    setIdx: idx, 
                    date: new Date(session.date).toLocaleDateString('pt-BR'), 
                    weight: set.actualWeight, 
                    reps: set.actualReps 
                });
            }
        });
    });

    if (records.length === 0) {
        document.getElementById('progression-stats').classList.add('hidden');
        document.getElementById('progression-list').innerHTML = '<p class="subtitle">Sem dados para este exercício.</p>';
        return;
    }

    const weights = records.map(r => r.weight);
    document.getElementById('prog-start-weight').innerText = weights[0] + ' kg';
    document.getElementById('prog-max-weight').innerText   = Math.max(...weights) + ' kg';
    document.getElementById('progression-stats').classList.remove('hidden');
    
    const list = document.getElementById('progression-list');
    
    // Desenha a lista com o botão passando os dados corretos
    list.innerHTML = records.slice().reverse().map(r => {
        const isRec = r.weight === Math.max(...weights);
        return `<div class="prog-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; padding: 12px; background: var(--bg-card); border-radius: 8px;">
            <div class="prog-date">
                <span class="day" style="font-weight:700; font-size:14px;">${r.date}</span>
                <span class="reps" style="font-size:12px; color:var(--text-3);">${r.reps} reps</span>
            </div>
            <div style="display:flex; align-items:center; gap: 8px;">
                <span class="prog-weight" style="color:var(--success); font-weight:700;">${r.weight} kg</span>
                ${isRec ? '<span class="prog-record" style="font-size:10px; background:var(--accent); color:#fff; padding:2px 6px; border-radius:10px;"><i class="fa-solid fa-trophy"></i> Recorde</span>' : ''}
                <button class="btn-action btn-delete" onclick="openDeleteOptions('${r.sessionId}', '${exName}', ${r.setIdx})" style="padding: 6px 10px;" title="Excluir">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    // O resto do código do gráfico (Chart.js) continua igual...
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    const isLight = document.body.classList.contains('light');
    const tickColor = isLight ? '#71717a' : '#52525b';
    if (progressionChart) progressionChart.destroy();
    
    progressionChart = new Chart(document.getElementById('progressionChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: records.map(r => r.date),
            datasets: [{
                label: 'Carga (kg)', data: weights,
                borderColor: accent, backgroundColor: `${accent}18`,
                borderWidth: 2.5, fill: true, tension: 0.3,
                pointBackgroundColor: accent, pointRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: isLight ? '#18181b' : '#f4f4f5', font: { family: 'DM Sans' } } } },
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } },
                x: { grid: { display: false }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 } } }
            }
        }
    });
}
// =============================================
// === CALCULADORA DE IMC ===
// =============================================
function calculateIMC() {
    const weight = parseFloat(document.getElementById('calc-weight').value);
    const heightCm = parseFloat(document.getElementById('calc-height').value);
    const gender = document.getElementById('calc-gender').value;
    const waist  = parseFloat(document.getElementById('calc-waist').value);
    const neck   = parseFloat(document.getElementById('calc-neck').value);
    if (!weight || !heightCm) { showToast('Preencha peso e altura!', 'warning'); return; }
    const hm  = heightCm / 100;
    const imc = weight / (hm * hm);
    let imcClass = 'Peso normal';
    if (imc < 18.5) imcClass = 'Abaixo do peso';
    else if (imc >= 25 && imc < 30) imcClass = 'Sobrepeso';
    else if (imc >= 30) imcClass = 'Obesidade';
    let fat = '--', fatClass = 'Informe cintura e pescoço';
    if (waist && neck) {
        const v = gender === 'male'
            ? 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450
            : 163.205 * Math.log10(waist - neck) - 97.684 * Math.log10(heightCm) - 78.387;
        if (!isNaN(v)) {
            fat = v.toFixed(1);
            const thresholds = gender === 'male'
                ? [6,'Essencial',14,'Atleta',18,'Boa forma',25,'Aceitável',Infinity,'Elevada']
                : [14,'Essencial',21,'Atleta',25,'Boa forma',31,'Aceitável',Infinity,'Elevada'];
            for (let i = 0; i < thresholds.length; i += 2) {
                if (parseFloat(fat) < thresholds[i]) { fatClass = thresholds[i + 1]; break; }
            }
        }
    }
    document.getElementById('res-imc').innerText      = imc.toFixed(1);
    document.getElementById('res-imc-class').innerText = imcClass;
    document.getElementById('res-fat').innerText       = fat;
    document.getElementById('res-fat-class').innerText  = fatClass;
    document.getElementById('imc-result').classList.remove('hidden');
}

// =============================================
// === NUTRIÇÃO ===
// =============================================
function calculateNutrition() {
    const weight   = parseFloat(document.getElementById('nutr-weight').value);
    const height   = parseFloat(document.getElementById('nutr-height').value);
    const age      = parseFloat(document.getElementById('nutr-age').value);
    const gender   = document.getElementById('nutr-gender').value;
    const activity = parseFloat(document.getElementById('nutr-activity').value);
    const goal     = document.getElementById('nutr-goal').value;
    if (!weight || !height || !age) { showToast('Preencha todos os campos!', 'warning'); return; }
    const tmb = gender === 'male'
        ? 88.362 + 13.397*weight + 4.799*height - 5.677*age
        : 447.593 + 9.247*weight + 3.098*height - 4.330*age;
    const tdee = Math.round(tmb * activity);
    const adj  = { cut: -400, maintain: 0, bulk: 300 };
    const goalCal = tdee + adj[goal];
    const pct = { cut:{p:0.35,c:0.40,f:0.25}, maintain:{p:0.25,c:0.50,f:0.25}, bulk:{p:0.25,c:0.50,f:0.25} }[goal];
    const pG = Math.round(goalCal * pct.p / 4);
    const cG = Math.round(goalCal * pct.c / 4);
    const fG = Math.round(goalCal * pct.f / 9);
    const water = (weight * 0.035).toFixed(1);
    document.getElementById('nutr-tdee').innerText       = tdee;
    document.getElementById('nutr-goal-cal').innerText   = goalCal;
    document.getElementById('nutr-goal-label').innerText = { cut:'Déficit (emagrecer)', maintain:'Manutenção', bulk:'Superávit (massa)' }[goal];
    document.getElementById('macro-prot').innerText      = pG + 'g';
    document.getElementById('macro-carb').innerText      = cG + 'g';
    document.getElementById('macro-fat').innerText       = fG + 'g';
    document.getElementById('macro-water').innerText     = water + 'L';
    document.getElementById('macro-prot-cal').innerText  = Math.round(pG*4) + ' kcal';
    document.getElementById('macro-carb-cal').innerText  = Math.round(cG*4) + ' kcal';
    document.getElementById('macro-fat-cal').innerText   = Math.round(fG*9) + ' kcal';
    const pp = Math.round(pct.p*100), cp = Math.round(pct.c*100), fp = Math.round(pct.f*100);
    document.getElementById('macro-bars').innerHTML = [
        ['Proteína', pp, '#22c55e'],['Carboidrato', cp, '#f59e0b'],['Gordura', fp, '#ef4444']
    ].map(([l,p,c]) => `<div class="macro-bar-row">
        <span class="macro-bar-label" style="color:${c};">${l}</span>
        <div class="macro-bar-track"><div class="macro-bar-fill" style="width:${p}%;background:${c};"></div></div>
        <span class="macro-bar-pct">${p}%</span>
    </div>`).join('');
    const tips = {
        cut:[{i:'fa-fire',c:'#ef4444',t:'Priorize proteína para preservar massa durante o déficit.'},
             {i:'fa-droplet',c:'#06b6d4',t:'Hidratação adequada controla a fome e acelera o metabolismo.'},
             {i:'fa-clock',c:'#f59e0b',t:'Distribua as refeições ao longo do dia para evitar picos de fome.'}],
        maintain:[{i:'fa-scale-balanced',c:'#22c55e',t:'Consistência nas refeições estabiliza o metabolismo.'},
                  {i:'fa-dumbbell',c:'var(--accent)',t:'Treinamento de força favorece a recomposição corporal.'}],
        bulk:[{i:'fa-arrow-trend-up',c:'#22c55e',t:'Superávit de 200–300 kcal minimiza ganho de gordura.'},
              {i:'fa-egg',c:'#f59e0b',t:'Proteína distribuída em várias refeições maximiza síntese muscular.'},
              {i:'fa-bed',c:'var(--accent)',t:'O crescimento ocorre no descanso — durma 7–8h por noite.'}]
    };
    document.getElementById('nutr-tips').innerHTML = tips[goal]
        .map(t => `<div class="nutr-tip-item"><i class="fa-solid ${t.i}" style="color:${t.c};"></i><p>${t.t}</p></div>`).join('');
    document.getElementById('nutr-result').classList.remove('hidden');
    showToast('Cálculo concluído!', 'success');
}

// =============================================
// === PERFIL ===
// =============================================
let selectedObjetivo = '', selectedNivel = '';

const fichaConditions = [
    {id:'cond_cardio',  label:'Prob. cardíaco',  icon:'fa-heart-pulse',    color:'red'},
    {id:'cond_pressao', label:'Pressão alta',     icon:'fa-gauge-high',     color:'red'},
    {id:'cond_diabetes',label:'Diabetes',         icon:'fa-syringe',        color:'yellow'},
    {id:'cond_coluna',  label:'Prob. na coluna',  icon:'fa-bone',           color:'yellow'},
    {id:'cond_joelho',  label:'Prob. no joelho',  icon:'fa-person-walking', color:'yellow'},
    {id:'cond_ombro',   label:'Prob. no ombro',   icon:'fa-person-skiing',  color:'yellow'},
    {id:'cond_asma',    label:'Asma/respiração',  icon:'fa-lungs',          color:'blue'},
    {id:'cond_cirurgia',label:'Cirurgia recente', icon:'fa-scissors',       color:'red'},
    {id:'cond_gravida', label:'Gravidez',         icon:'fa-baby',           color:'blue'},
    {id:'cond_outro',   label:'Outro',            icon:'fa-notes-medical',  color:'yellow'},
];
const fichaObjetivos = [
    {value:'hipertrofia',label:'Hipertrofia',    icon:'fa-dumbbell'},
    {value:'emagrecer',  label:'Emagrecer',      icon:'fa-fire'},
    {value:'saude',      label:'Saúde geral',    icon:'fa-heart'},
    {value:'condicion',  label:'Condicionamento',icon:'fa-person-running'},
    {value:'reabilit',   label:'Reabilitação',   icon:'fa-kit-medical'},
    {value:'flexib',     label:'Flexibilidade',  icon:'fa-child-reaching'},
];

function loadProfileData() {
    const u = loggedUser;
    const birthdate   = u.birthdate  ? new Date(u.birthdate).toLocaleDateString('pt-BR') : '—';
    const memberSince = u.createdAt  ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—';
    const fichaHTML   = renderFichaBadges(u.ficha);

    document.getElementById('view-profile').innerHTML = `
        <div class="page-header"><h1>Perfil</h1></div>

        <div class="card" style="text-align:center;padding:28px 20px;">
            ${u.picture
                ? `<img src="${u.picture}" alt="Foto" style="width:88px;height:88px;border-radius:50%;margin:0 auto 14px;display:block;border:3px solid var(--accent);object-fit:cover;">`
                : `<div style="width:88px;height:88px;border-radius:50%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;border:3px solid var(--border);"><i class="fa-solid fa-user" style="font-size:36px;color:var(--text-3);"></i></div>`}
            <h2 style="font-size:20px;margin-bottom:4px;">${u.name || 'Atleta'}</h2>
            <span style="display:inline-block;font-size:11px;background:${u.isAdmin ? 'var(--accent)' : 'var(--bg-input)'};color:${u.isAdmin ? '#fff' : 'var(--text-2)'};padding:3px 12px;border-radius:20px;margin-bottom:20px;font-weight:600;">
                ${u.isAdmin ? 'Administrador' : 'Cliente'}
            </span>
            <div style="text-align:left;display:flex;flex-direction:column;gap:11px;font-size:14px;">
                <span style="display:flex;align-items:center;gap:11px;color:var(--text-2);">
                    <i class="fa-solid fa-envelope" style="color:var(--accent);width:16px;text-align:center;"></i>${u.email || '—'}
                </span>
                <span style="display:flex;align-items:center;gap:11px;color:var(--text-2);">
                    <i class="fa-solid fa-phone" style="color:var(--accent);width:16px;text-align:center;"></i>${u.phone || 'Não cadastrado'}
                </span>
                <span style="display:flex;align-items:center;gap:11px;color:var(--text-2);">
                    <i class="fa-solid fa-cake-candles" style="color:var(--accent);width:16px;text-align:center;"></i>${birthdate}
                </span>
                <span style="display:flex;align-items:center;gap:11px;color:var(--text-2);">
                    <i class="fa-solid fa-calendar-plus" style="color:var(--accent);width:16px;text-align:center;"></i>Desde ${memberSince}
                </span>
            </div>
            <button class="btn-primary btn-full" onclick="editProfile()"><i class="fa-solid fa-pen"></i> Editar Perfil</button>
        </div>

        <div class="grid-2">
            <div class="card" style="text-align:center;">
                <h3 class="card-label">Treinos feitos</h3>
                <span class="big-number">${DB.history.length}</span>
            </div>
            <div class="card" style="text-align:center;">
                <h3 class="card-label">Treinos criados</h3>
                <span class="big-number" style="color:var(--success);">${DB.workouts.length}</span>
            </div>
        </div>

        <div class="card">
            <div class="header-flex" style="margin-bottom:14px;">
                <h3 class="card-label" style="margin:0;"><i class="fa-solid fa-notes-medical" style="margin-right:6px;color:var(--accent);"></i>Ficha de Saúde</h3>
                <button class="btn-action btn-edit" style="font-size:12px;" onclick="showFichaForm()">
                    <i class="fa-solid fa-pen-to-square"></i> ${u.ficha ? 'Editar' : 'Preencher'}
                </button>
            </div>
            <div id="ficha-preview">${fichaHTML}</div>
            <div id="ficha-form-container" class="hidden" style="margin-top:16px;">
                ${renderHealthForm(u.ficha)}
            </div>
        </div>

        <div class="card">
            <h3 class="card-label" style="margin-bottom:14px;"><i class="fa-solid fa-palette" style="margin-right:6px;color:var(--accent);"></i>Cor do Aplicativo</h3>
            <div class="color-picker">
                <div class="color-swatch ${(localStorage.getItem('academax_accent')||'indigo')==='indigo'?'active':''}" data-accent="indigo" onclick="setAccent('indigo')" title="Índigo"></div>
                <div class="color-swatch ${(localStorage.getItem('academax_accent')||'')==='emerald'?'active':''}" data-accent="emerald" onclick="setAccent('emerald')" title="Esmeralda"></div>
                <div class="color-swatch ${(localStorage.getItem('academax_accent')||'')==='amber'?'active':''}" data-accent="amber" onclick="setAccent('amber')" title="Âmbar"></div>
                <div class="color-swatch ${(localStorage.getItem('academax_accent')||'')==='rose'?'active':''}" data-accent="rose" onclick="setAccent('rose')" title="Rosa"></div>
                <div class="color-swatch ${(localStorage.getItem('academax_accent')||'')==='cyan'?'active':''}" data-accent="cyan" onclick="setAccent('cyan')" title="Ciano"></div>
            </div>
        </div>

        <button class="btn-danger-outline btn-full" onclick="confirmLogout()"><i class="fa-solid fa-right-from-bracket"></i> Sair da Conta</button>
    `;
}

function editProfile() {
    const u = loggedUser;
    document.getElementById('view-profile').innerHTML = `
        <div class="page-header"><h1>Editar Perfil</h1></div>
        <div class="card">
            <div style="text-align:center;margin-bottom:20px;">
                <div id="avatar-preview" style="position:relative;width:100px;height:100px;border-radius:50%;margin:0 auto 12px;overflow:hidden;border:3px solid var(--accent);cursor:pointer;background:var(--bg-input);display:flex;align-items:center;justify-content:center;" onclick="document.getElementById('avatar-input').click()">
                    ${u.picture ? `<img src="${u.picture}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fa-solid fa-user" style="font-size:40px;color:var(--text-3);"></i>`}
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:10px;text-align:center;padding:4px;">Trocar foto</div>
                </div>
                <input type="file" id="avatar-input" accept="image/*" style="display:none;" onchange="handleAvatarUpload(event)">
            </div>
            <label>Nome</label>
            <input type="text" id="edit-name" value="${u.name || ''}">
            <label>Telefone</label>
            <input type="tel" id="edit-phone" value="${u.phone || ''}" placeholder="(11) 99999-9999">
            <div style="display:flex;gap:10px;margin-top:6px;">
                <button class="btn-ghost" style="flex:1;" onclick="loadProfileData()">Cancelar</button>
                <button class="btn-primary" id="save-profile-btn" style="flex:1;" onclick="saveProfile()">
                    <i class="fa-solid fa-check"></i> Salvar
                </button>
            </div>
        </div>
        <div class="card">
            <h3 class="card-label" style="margin-bottom:14px;"><i class="fa-solid fa-shield-halved" style="margin-right:6px;color:var(--accent);"></i>Segurança</h3>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">
                <div>
                    <p style="font-size:14px;font-weight:600;">Verificação em 2 etapas (MFA)</p>
                    <p style="font-size:12px;color:var(--text-3);">Receba um código por e-mail ao fazer login</p>
                </div>
                <label class="mfa-switch">
                    <input type="checkbox" id="mfa-toggle" ${u.mfaEnabled ? 'checked' : ''} onchange="toggleMFA(this.checked)">
                    <span class="mfa-slider"></span>
                    </label>
                </div>
            </div>`;}
    
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5000000) { showToast('Imagem muito grande (máx 5MB)', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        document.getElementById('avatar-preview').innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;">`;
        try {
            const res = await authFetch(`${API}/users/${loggedUser.id}/avatar`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 })
            });
            const data = await res.json();
            if (data.picture) {
                loggedUser.picture = data.picture;
                localStorage.setItem('academax_user', JSON.stringify(loggedUser));
                showToast('Foto atualizada!', 'success');
            }
        } catch (err) { showToast('Erro ao enviar foto', 'error'); }
    };
    reader.readAsDataURL(file);
}

async function toggleMFA(enabled) {
    try {
        const res = await authFetch(`${API}/toggle-mfa`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        
        if (data.error) {
            showToast(data.error, 'error');
            // Se der erro, reverte o botão visualmente
            document.getElementById('mfa-toggle').checked = !enabled;
            return;
        }
        
        loggedUser.mfaEnabled = data.mfaEnabled;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        showToast(data.mfaEnabled ? 'MFA ativado! 🔒' : 'MFA desativado', 'success');
    } catch (err) {
        showToast('Erro de conexão ao alterar MFA', 'error');
        // Se cair a internet, reverte o botão visualmente
        document.getElementById('mfa-toggle').checked = !enabled;
    }
}

async function saveProfile() {
    const name    = document.getElementById('edit-name').value.trim();
    
    const phone   = document.getElementById('edit-phone').value.trim();
    if (!name) { showToast('Nome não pode ficar vazio!', 'warning'); return; }
    const btn = document.getElementById('save-profile-btn');
    setButtonLoading(btn, true);
    try {
        const res  = await authFetch(`${API}/users/${loggedUser.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, picture: loggedUser.picture || '', phone })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); setButtonLoading(btn, false); return; }
        localStorage.setItem('academax_user', JSON.stringify(data));
        Object.assign(loggedUser, data);
        showToast('Perfil atualizado!', 'success');
        loadProfileData();
    } catch (e) {
        showToast('Erro de conexão.', 'error');
        setButtonLoading(btn, false);
    }
}

function confirmLogout() {
    showConfirm('Sair da conta', 'Deseja realmente encerrar sua sessão?', '👋', logout);
}
function logout() {
    localStorage.removeItem('academax_user');
    localStorage.removeItem('academax_token'); // <--- NOVO
    window.location.href = '/login';
}

// === FICHA DE SAÚDE ===
function renderHealthForm(d) {
    d = d || {};
    selectedObjetivo = d.objetivo || '';
    selectedNivel    = d.nivel    || '';
    const condChecks = fichaConditions.map(c => `
        <label class="health-check-card ${d.conditions?.includes(c.id) ? 'checked' : ''}" data-cond="${c.id}" onclick="toggleHealthCard(this)">
            <input type="checkbox" id="${c.id}" ${d.conditions?.includes(c.id) ? 'checked' : ''} style="display:none;">
            <div class="health-check-icon ${c.color}"><i class="fa-solid ${c.icon}"></i></div>
            <span>${c.label}</span>
        </label>`).join('');
    const objBtns = fichaObjetivos.map(o => `
        <button class="objetivo-card ${selectedObjetivo===o.value?'selected':''}" onclick="selectObjetivo('${o.value}')">
            <i class="fa-solid ${o.icon}"></i>
            <span>${o.label}</span>
        </button>`).join('');
    return `
        <div class="ficha-section">
            <div class="ficha-section-header">
                <i class="fa-solid fa-heart-pulse"></i>
                <p>Condições de Saúde</p>
            </div>
            <div class="health-check-grid">${condChecks}</div>
            <div class="ficha-input-group">
                <label>Medicamentos em uso</label>
                <input type="text" id="ficha-medicamentos" value="${d.medicamentos||''}" placeholder="Ex: Losartana, Metformina">
                <label>Observações / Limitações</label>
                <textarea id="ficha-obs" rows="2" placeholder="Ex: Dor no joelho ao agachar">${d.obs||''}</textarea>
            </div>
        </div>
        <div class="ficha-section">
            <div class="ficha-section-header">
                <i class="fa-solid fa-bullseye"></i>
                <p>Objetivo Principal</p>
            </div>
            <div class="objetivo-grid">${objBtns}</div>
        </div>
        <div class="ficha-section">
            <div class="ficha-section-header">
                <i class="fa-solid fa-gauge-high"></i>
                <p>Nível de Experiência</p>
            </div>
            <div class="nivel-grid">
                <button class="nivel-card ${selectedNivel==='iniciante'?'selected':''}" onclick="selectNivel('iniciante')"><span class="nivel-dot"></span> Iniciante</button>
                <button class="nivel-card ${selectedNivel==='intermediario'?'selected':''}" onclick="selectNivel('intermediario')"><span class="nivel-dot"></span> Intermediário</button>
                <button class="nivel-card ${selectedNivel==='avancado'?'selected':''}" onclick="selectNivel('avancado')"><span class="nivel-dot"></span> Avançado</button>
            </div>
        </div>
        <button class="btn-primary btn-full" id="save-ficha-btn" onclick="saveFicha()" style="margin-top:20px;">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Ficha
        </button>`;
}
function toggleHealthCard(el) {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    el.classList.toggle('checked', cb.checked);
}

function selectObjetivo(value) {
    selectedObjetivo = value;
    document.querySelectorAll('.objetivo-card').forEach(b => b.classList.remove('selected'));
    event.target.closest('.objetivo-card').classList.add('selected');
}
function selectNivel(value) {
    selectedNivel = value;
    document.querySelectorAll('.nivel-card').forEach(b => b.classList.remove('selected'));
    event.target.closest('.nivel-card').classList.add('selected');
}

async function saveFicha() {
    const btn = document.getElementById('save-ficha-btn');
    setButtonLoading(btn, true);
    const fichaData = {
        conditions:   fichaConditions.filter(c => document.getElementById(c.id)?.checked).map(c => c.id),
        medicamentos: document.getElementById('ficha-medicamentos')?.value || '',
        obs:          document.getElementById('ficha-obs')?.value || '',
        objetivo:     selectedObjetivo, nivel: selectedNivel,
        updatedAt:    new Date().toISOString()
    };
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ficha: fichaData })
        });
        // Só salva localmente se o servidor confirmar
        loggedUser.ficha = fichaData;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        showToast('Ficha salva!', 'success');
        setButtonLoading(btn, false);
        loadProfileData();
    } catch (e) {
        showToast('Erro ao salvar ficha no banco.', 'error');
        console.error(e);
        setButtonLoading(btn, false);
    }
}
function showFichaForm() {
    const form    = document.getElementById('ficha-form-container');
    const preview = document.getElementById('ficha-preview');
    form.classList.toggle('hidden');
    preview.style.display = form.classList.contains('hidden') ? 'block' : 'none';
}

function renderFichaBadges(ficha) {
    if (!ficha || (!ficha.conditions?.length && !ficha.objetivo && !ficha.nivel))
        return '<p style="color:var(--text-3);font-size:13px;">Ficha não preenchida ainda.</p>';
    const hasAlert = ficha.conditions?.some(c => ['cond_cardio','cond_pressao','cond_cirurgia'].includes(c));
    const condMap  = Object.fromEntries(fichaConditions.map(c => [c.id, c]));
    const objMap   = Object.fromEntries(fichaObjetivos.map(o => [o.value, o.label]));
    const nivelMap = { iniciante:'🌱 Iniciante', intermediario:'💪 Intermediário', avancado:'🔥 Avançado' };
    let html = '';
    if (hasAlert) html += `<div class="health-alert-banner"><i class="fa-solid fa-triangle-exclamation"></i> Restrições de saúde — adapte os treinos!</div>`;
    if (ficha.conditions?.length) {
        html += '<div style="margin-bottom:10px;">' + ficha.conditions.map(c => condMap[c] ? `<span class="health-badge ${condMap[c].color}">${condMap[c].label}</span>` : '').join('') + '</div>';
    }
    if (ficha.objetivo) html += `<div style="margin-bottom:6px;"><span class="health-badge green">${objMap[ficha.objetivo]||ficha.objetivo}</span></div>`;
    if (ficha.nivel)    html += `<div><span class="health-badge blue">${nivelMap[ficha.nivel]||ficha.nivel}</span></div>`;
    if (ficha.medicamentos) html += `<p style="font-size:13px;color:var(--text-2);margin-top:10px;"><strong>Medicamentos:</strong> ${ficha.medicamentos}</p>`;
    if (ficha.obs)          html += `<p style="font-size:13px;color:var(--text-2);margin-top:6px;"><strong>Obs:</strong> ${ficha.obs}</p>`;
    return html;
}

// =============================================
// === PAINEL ADMIN ===
// =============================================
function checkAdminStatus() {
    document.getElementById('nav-clients').style.display = loggedUser.isAdmin ? 'flex' : 'none';
}

async function renderClients() {
    const list = document.getElementById('clients-list');
    list.innerHTML = '<p class="subtitle">Carregando...</p>';
    try {
        const res = await authFetch(`${API}/users`);
        globalClients = await res.json();
        if (!globalClients.length) { list.innerHTML = '<p class="subtitle">Nenhum cliente.</p>'; return; }
        list.innerHTML = '';
        globalClients.forEach(u => {
            const div = document.createElement('div');
            div.className = 'client-card';
            div.innerHTML = `
                <div class="client-info">
                    <div class="client-avatar">${u.picture ? `<img src="${u.picture}" alt="${u.name}">` : '<i class="fa-solid fa-user"></i>'}</div>
                    <div class="client-details">
                        <h3>${u.name}${u.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</h3>
                        <p>${u.email}</p>
                    </div>
                </div>
                <button class="manage-btn" onclick="viewClient('${u.id}')"><i class="fa-solid fa-gear"></i> Gerenciar</button>`;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<p class="subtitle">Erro ao carregar.</p>';
        showToast('Erro ao carregar clientes.', 'error');
    }
}

async function viewClient(id) {
    const client = globalClients.find(u => u.id === id);
    if (!client) return;
    document.getElementById('manage-client-title').innerText = client.name;
    document.getElementById('manage-client-content').innerHTML = '<p class="subtitle">Carregando...</p>';
    let workoutsHTML = '<p class="subtitle">Nenhum treino.</p>';
    try {
        const res = await authFetch(`${API}/workouts/${id}`);
        const ws  = await res.json();
        if (ws.length) workoutsHTML = ws.map(w =>
            `<div class="workout-item"><div class="workout-info"><h3>${w.name}</h3><p>${w.desc} · ${w.exercises.length} exercícios</p></div></div>`
        ).join('');
    } catch (e) {}
    document.getElementById('manage-client-content').innerHTML = `
        <div class="card">
            <h3 class="card-label" style="margin-bottom:14px;">Dados do Cliente</h3>
            <label>Nome</label><input type="text" id="admin-edit-name" value="${client.name}">
            <label>URL da Foto</label><input type="text" id="admin-edit-picture" value="${client.picture||''}">
            <label>Telefone</label><input type="tel" id="admin-edit-phone" value="${client.phone||''}">
            <button class="btn-primary btn-full" id="admin-save-btn" onclick="adminSaveClient('${id}')">
                <i class="fa-solid fa-check"></i> Salvar
            </button>
        </div>
        <div class="card">
            <div class="header-flex" style="margin-bottom:14px;">
                <h3 class="card-label" style="margin:0;">Treinos</h3>
                <button class="btn-action btn-start" style="font-size:12px;" onclick="adminAddWorkout('${id}')">
                    <i class="fa-solid fa-plus"></i> Recomendar
                </button>
            </div>
                 <div class="workouts-list">${workoutsHTML}</div>
        </div>
        <div class="card">
            <h3 class="card-label" style="margin-bottom:14px;"><i class="fa-solid fa-paper-plane" style="margin-right:6px;color:var(--accent);"></i>Enviar Mensagem</h3>
            <textarea id="admin-msg-input" rows="3" placeholder="Ex: Não esqueça do treino de pernas hoje!"></textarea>
            <button class="btn-primary btn-full" id="admin-msg-btn" onclick="adminSendMessage('${id}')">
                <i class="fa-solid fa-paper-plane"></i> Enviar mensagem
            </button>
        </div>
        <div class="card danger-zone">
            <h3 class="card-label" style="margin-bottom:12px;"><i class="fa-solid fa-triangle-exclamation"></i> Zona de Perigo</h3>
            <button class="btn-danger btn-full" onclick="confirmDeleteClient('${id}')">
                <i class="fa-solid fa-trash-can"></i> Excluir Conta
            </button>
        </div>
        <div id="admin-ficha-section"></div>`;
    navigateTo('manage-client');
    injectAdminFicha(client);
}

async function adminSaveClient(id) {
    const btn = document.getElementById('admin-save-btn');
    setButtonLoading(btn, true);
    try {
        const res  = await authFetch(`${API}/users/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name:    document.getElementById('admin-edit-name').value,
                picture: document.getElementById('admin-edit-picture').value,
                phone:   document.getElementById('admin-edit-phone').value,
            })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); setButtonLoading(btn, false); return; }
        const i = globalClients.findIndex(u => u.id === id);
        if (i >= 0) globalClients[i] = data;
        showToast('Perfil atualizado!', 'success');
        viewClient(id);
    } catch (e) { showToast('Erro de conexão.', 'error'); setButtonLoading(btn, false); }
}

function confirmDeleteClient(id) {
    const c = globalClients.find(u => u.id === id);
    showConfirm('Excluir cliente', `Excluir a conta de "${c?.name}" permanentemente?`, '🗑️', () => adminDeleteClient(id));
}

async function adminDeleteClient(id) {
    try {
        const res  = await authFetch(`${API}/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Cliente excluído!', 'success');
        navigateTo('clients'); renderClients();
    } catch (e) { showToast('Erro de conexão.', 'error'); }
}

function adminAddWorkout(id) { targetUserIdForWorkout = id; openCreateWorkoutModal(); }

function injectAdminFicha(client) {
    const sec = document.getElementById('admin-ficha-section');
    if (!sec) return;
    sec.innerHTML = `<div class="card" style="margin-top:0;">
        <div class="header-flex" style="margin-bottom:14px;">
            <h3 class="card-label" style="margin:0;"><i class="fa-solid fa-notes-medical" style="margin-right:6px;color:var(--accent);"></i>Ficha de Saúde</h3>
            <button class="btn-action btn-edit" style="font-size:12px;" onclick="toggleAdminFichaForm('${client.id}')">
                <i class="fa-solid fa-pen-to-square"></i> ${client.ficha ? 'Editar' : 'Preencher'}
            </button>
        </div>
        <div id="admin-ficha-preview">${renderFichaBadges(client.ficha)}</div>
        <div id="admin-ficha-form" class="hidden" style="margin-top:14px;">
            ${renderHealthForm(client.ficha)}
            <button class="btn-primary btn-full" id="save-admin-ficha-btn" onclick="saveAdminFicha('${client.id}')">
                <i class="fa-solid fa-floppy-disk"></i> Salvar Ficha
            </button>
        </div>
    </div>`;
}

function toggleAdminFichaForm(id) {
    const form    = document.getElementById('admin-ficha-form');
    const preview = document.getElementById('admin-ficha-preview');
    form.classList.toggle('hidden');
    preview.style.display = form.classList.contains('hidden') ? 'block' : 'none';
}

async function saveAdminFicha(clientId) {
    const btn = document.getElementById('save-admin-ficha-btn');
    setButtonLoading(btn, true);
    const fichaData = {
        conditions:   fichaConditions.filter(c => document.getElementById(c.id)?.checked).map(c => c.id),
        medicamentos: document.getElementById('ficha-medicamentos')?.value || '',
        obs:          document.getElementById('ficha-obs')?.value || '',
        objetivo:     selectedObjetivo, nivel: selectedNivel,
        updatedAt:    new Date().toISOString()
    };
       try {
        await authFetch(`${API}/users/${clientId}/ficha`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fichaData)
        });
        authFetch(`${API}/users/${clientId}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'ficha',
                title: 'Ficha de saúde atualizada',
                message: 'Seu personal atualizou sua ficha de saúde. Confira no seu perfil!'
            })
        }).catch(() => {});
        const i = globalClients.findIndex(u => u.id === clientId);
        if (i >= 0) globalClients[i].ficha = fichaData;
        showToast('Ficha salva!', 'success');
    } catch (e) { showToast('Erro ao salvar.', 'error'); }

    setButtonLoading(btn, false);
}

// =============================================
// === INICIALIZA ===
// =============================================

// =============================================
// === MEDIDAS CORPORAIS ===
// =============================================
let bodyMeasures = JSON.parse(localStorage.getItem('academax_measures') || '[]');

function loadMeasuresView() {
    const el = document.getElementById('view-measures');
    if (!el) return;
    el.innerHTML = `
        <div class="page-header"><h1>Medidas Corporais</h1></div>
        <div class="card">
            <h3 class="card-label">Registrar Medidas</h3>
            <div class="grid-2">
                <div><label>Peso (kg)</label><input type="number" id="meas-weight" placeholder="75.5" step="0.1"></div>
                <div><label>Data</label><input type="date" id="meas-date" value="${new Date().toISOString().split('T')[0]}"></div>
            </div>
            <div class="grid-2">
                <div><label>Braço (cm)</label><input type="number" id="meas-arm" placeholder="35"></div>
                <div><label>Cintura (cm)</label><input type="number" id="meas-waist" placeholder="80"></div>
            </div>
            <div class="grid-2">
                <div><label>Peito (cm)</label><input type="number" id="meas-chest" placeholder="100"></div>
                <div><label>Coxa (cm)</label><input type="number" id="meas-thigh" placeholder="55"></div>
            </div>
            <button class="btn-primary btn-full" onclick="saveMeasure()"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
        </div>
        <div class="card">
            <h3 class="card-label">Histórico de Peso</h3>
            <div style="height: 200px; margin-top: 15px;"><canvas id="measuresChart"></canvas></div>
        </div>
        <div id="measures-list" class="workouts-list"></div>
    `;
    renderMeasuresList();
    renderMeasuresChart();
}

async function saveMeasure() {
    const m = {
        id: Date.now().toString(),
        date: document.getElementById('meas-date').value,
        weight: parseFloat(document.getElementById('meas-weight').value) || 0,
        arm: parseInt(document.getElementById('meas-arm').value) || 0,
        waist: parseInt(document.getElementById('meas-waist').value) || 0,
        chest: parseInt(document.getElementById('meas-chest').value) || 0,
        thigh: parseInt(document.getElementById('meas-thigh').value) || 0,
    };
    if (!m.weight) { showToast('Digite o peso!', 'warning'); return; }
    
    bodyMeasures.push(m);
    bodyMeasures.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    loggedUser.measures = bodyMeasures;
    localStorage.setItem('academax_user', JSON.stringify(loggedUser));

    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ measures: bodyMeasures })
        });
        showToast('Medida registrada no banco!', 'success');
    } catch (e) { 
        showToast('Erro ao salvar no banco de dados!', 'error'); 
        console.error(e);
    }
    loadMeasuresView();
}
function renderMeasuresList() {
    const list = document.getElementById('measures-list');
    if (!list) return;
    if (bodyMeasures.length === 0) { list.innerHTML = '<p class="subtitle">Nenhuma medida registrada.</p>'; return; }
    list.innerHTML = bodyMeasures.slice().reverse().map(m => `
        <div class="workout-item">
            <div class="workout-info">
                <h3>${new Date(m.date).toLocaleDateString('pt-BR')}</h3>
                <p>Peso: ${m.weight}kg ${m.arm ? '· Braço: '+m.arm+'cm' : ''} ${m.waist ? '· Cintura: '+m.waist+'cm' : ''}</p>
            </div>
            <button class="btn-action btn-delete" onclick="deleteMeasure('${m.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>`).join('');
}

async function deleteMeasure(id) {
    const oldMeasures = [...bodyMeasures];
    bodyMeasures = bodyMeasures.filter(m => m.id !== id);
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ measures: bodyMeasures })
        });
        loggedUser.measures = bodyMeasures;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        loadMeasuresView();
    } catch (e) {
        bodyMeasures = oldMeasures; // Reverte se der erro
        showToast('Erro ao excluir medida.', 'error');
        console.error(e);
    }
}

let measuresChart = null;
function renderMeasuresChart() {
    const ctx = document.getElementById('measuresChart');
    if (!ctx) return;
    if (measuresChart) measuresChart.destroy();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    const isLight = document.body.classList.contains('light');
    measuresChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: bodyMeasures.map(m => new Date(m.date).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})),
            datasets: [{
                label: 'Peso (kg)', data: bodyMeasures.map(m => m.weight),
                borderColor: accent, backgroundColor: accent+'18',
                borderWidth: 2.5, fill: true, tension: 0.3,
                pointBackgroundColor: accent, pointRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { color: isLight ? '#71717a' : '#52525b' } },
                x: { grid: { display: false }, ticks: { color: isLight ? '#71717a' : '#52525b' } }
            }
        }
    });
}

// =============================================
// === CONQUISTAS (GAMIFICAÇÃO) ===
// =============================================
const achievements = [
    { id: 'first_workout', icon: 'fa-dumbbell', title: 'Primeiro Treino', desc: 'Complete seu primeiro treino', condition: () => DB.history.length >= 1 },
    { id: '5_workouts', icon: 'fa-medal', title: '5 Treinos', desc: 'Complete 5 treinos', condition: () => DB.history.length >= 5 },
    { id: '10_workouts', icon: 'fa-trophy', title: '10 Treinos', desc: 'Complete 10 treinos', condition: () => DB.history.length >= 10 },
    { id: 'create_workout', icon: 'fa-pen', title: 'Personal Trainer', desc: 'Crie seu primeiro treino', condition: () => DB.workouts.length >= 1 },
    { id: 'volume_1000', icon: 'fa-fire', title: '1000kg', desc: 'Levante 1000kg no total', condition: () => DB.history.reduce((s,h) => s+h.volume, 0) >= 1000 },
    { id: 'volume_5000', icon: 'fa-bolt', title: '5000kg', desc: 'Levante 5000kg no total', condition: () => DB.history.reduce((s,h) => s+h.volume, 0) >= 5000 },
    { id: 'ficha_filled', icon: 'fa-notes-medical', title: 'Ficha Completa', desc: 'Preencha sua ficha de saúde', condition: () => !!loggedUser.ficha },
];

function loadAchievementsView() {
    const el = document.getElementById('view-achievements');
    if (!el) return;
    const unlocked = achievements.filter(a => a.condition());
    const locked = achievements.filter(a => !a.condition());
    el.innerHTML = `
        <div class="page-header"><h1>Conquistas</h1></div>
        <div class="card" style="text-align:center;padding:24px;">
            <p style="font-size:14px;color:var(--text-2);margin-bottom:8px;">Conquistas Desbloqueadas</p>
            <span class="big-number" style="color:var(--success);">${unlocked.length} / ${achievements.length}</span>
        </div>
        <div class="achievements-grid">
            ${unlocked.map(a => `
                <div class="achievement-card unlocked">
                    <div class="achievement-icon"><i class="fa-solid ${a.icon}"></i></div>
                    <div class="achievement-info"><h4>${a.title}</h4><p>${a.desc}</p></div>
                    <i class="fa-solid fa-check" style="color:var(--success);font-size:18px;"></i>
                </div>`).join('')}
            ${locked.map(a => `
                <div class="achievement-card locked">
                    <div class="achievement-icon"><i class="fa-solid ${a.icon}"></i></div>
                    <div class="achievement-info"><h4>${a.title}</h4><p>${a.desc}</p></div>
                    <i class="fa-solid fa-lock" style="color:var(--text-3);font-size:14px;"></i>
                </div>`).join('')}
        </div>
    `;
}

// =============================================
// === AGENDAMENTO DE TREINOS ===
// =============================================
let schedule = JSON.parse(localStorage.getItem('academax_schedule') || '{}');
const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function loadScheduleView() {
    const el = document.getElementById('view-schedule');
    if (!el) return;
    
    const workoutOptions = DB.workouts.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    
    el.innerHTML = `
        <div class="page-header"><h1>Agenda de Treinos</h1></div>
        <div class="card">
            <h3 class="card-label">Monte sua semana</h3>
            <p style="color:var(--text-2);font-size:13px;margin-bottom:16px;">Selecione qual treino você vai fazer em cada dia.</p>
            <div class="schedule-list">
                ${days.map((d, i) => `
                    <div class="schedule-row">
                        <span class="schedule-day-label">${d}</span>
                        <select class="schedule-select" data-day="${i}" onchange="setScheduleWorkout(${i}, this.value)">
                            <option value="">Descanso</option>
                            ${workoutOptions}
                        </select>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="card">
            <h3 class="card-label">Próximos Treinos</h3>
            <div id="next-workouts"></div>
        </div>
    `;
    
    // Preenche os valores já salvos
    Object.keys(schedule).forEach(k => {
        const select = document.querySelector(`.schedule-select[data-day="${k}"]`);
        if (select && schedule[k].workoutId) {
            select.value = schedule[k].workoutId;
            select.closest('.schedule-row').classList.add('active');
        }
    });
    
    renderNextWorkouts();
}

async function setScheduleWorkout(dayIndex, workoutId) {
    if (!workoutId) {
        delete schedule[dayIndex];
    } else {
        schedule[dayIndex] = { workoutId: workoutId };
    }
    
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: schedule })
        });
        loggedUser.schedule = schedule;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        showToast('Agenda salva!', 'success');
        loadScheduleView();
    } catch (e) { 
        showToast('Erro ao salvar agenda.', 'error'); 
        console.error(e);
    }
}

function renderNextWorkouts() {
    const el = document.getElementById('next-workouts');
    if (!el) return;
    const today = new Date().getDay();
    const upcoming = [];
    
    for (let i = 0; i < 7; i++) {
        const dayIdx = (today + i) % 7;
        if (schedule[dayIdx] && schedule[dayIdx].workoutId) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const workout = DB.workouts.find(w => w.id === schedule[dayIdx].workoutId);
            upcoming.push({ day: days[dayIdx], date, isToday: i === 0, workoutName: workout ? workout.name : 'Treino' });
        }
    }
    
    if (upcoming.length === 0) {
        el.innerHTML = '<p style="color:var(--text-3);font-size:14px;text-align:center;padding:16px;">Nenhum treino agendado.</p>';
        return;
    }
    
    el.innerHTML = upcoming.map(u => `
        <div class="schedule-item ${u.isToday ? 'today' : ''}">
            <div class="schedule-date">${u.day}<br><strong>${u.date.getDate()}/${u.date.getMonth()+1}</strong></div>
            <div>${u.isToday ? '🔥 Hoje: ' : ''}<strong style="color:var(--accent);">${u.workoutName}</strong></div>
        </div>
    `).join('');
}

// =============================================
// === METAS PERSONAIS ===
// =============================================
let userGoals = JSON.parse(localStorage.getItem('academax_goals') || '[]');

const goalTypes = [
    { id: 'strength',  icon: 'fa-dumbbell',     label: 'Força',         color: '#6366f1', unit: 'kg',
      desc: 'Carga alvo para um exercício', placeholder: 'Ex: Supino Reto 100kg' },
    { id: 'body',       icon: 'fa-weight-scale', label: 'Corpo',         color: '#22c55e', unit: 'kg',
      desc: 'Perder ou ganhar peso', placeholder: 'Ex: Emagrecer 6kg' },
    { id: 'frequency',  icon: 'fa-calendar-check',label: 'Constância',   color: '#f59e0b', unit: 'x',
      desc: 'Treinos por semana', placeholder: 'Ex: Treinar 4x por semana' },
    { id: 'volume',     icon: 'fa-fire',         label: 'Volume Total',  color: '#ef4444', unit: 'kg',
      desc: 'Volume total levantado', placeholder: 'Ex: Levantar 10.000kg no mês' },
];

function loadGoalsView() {
    const el = document.getElementById('view-goals');
    if (!el) return;

    // Calcula progresso das metas
    const goalsWithProgress = userGoals.map(g => {
        let current = 0;
        if (g.type === 'strength') {
            const exRecords = [];
            DB.history.forEach(h => h.sets.forEach(s => {
                if (s.exName === g.exercise && s.actualWeight) exRecords.push(s.actualWeight);
            }));
            current = exRecords.length > 0 ? Math.max(...exRecords) : 0;
        } else if (g.type === 'body') {
            // --- CORREÇÃO AQUI: Usa a variável global bodyMeasures e aceita valores negativos ---
            if (bodyMeasures.length > 0) {
                const latest = bodyMeasures[bodyMeasures.length - 1];
                const first = bodyMeasures[0];
                if (g.direction === 'lose') {
                    current = first.weight - latest.weight; // Pode ficar negativo se engordou
                } else {
                    current = latest.weight - first.weight;
                }
            }
        } else if (g.type === 'frequency') {
            const weekAgo = new Date(Date.now() - 7 * 86400000);
            current = DB.history.filter(h => new Date(h.date) > weekAgo).length;
        } else if (g.type === 'volume') {
            const monthAgo = new Date(Date.now() - 30 * 86400000);
            current = DB.history.filter(h => new Date(h.date) > monthAgo).reduce((s, h) => s + h.volume, 0);
        }
        
        g.current = current;
        // Garante que a barra de progresso não fique menor que 0% nem maior que 100%
        g.progress = g.target > 0 ? Math.min(100, Math.max(0, (current / g.target) * 100)) : 0;
        g.completed = current >= g.target;
        return g;
    });

    const completedCount = goalsWithProgress.filter(g => g.completed).length;

    el.innerHTML = `
        <div class="page-header header-flex">
            <h1>Minhas Metas</h1>
            <button class="btn-primary" style="width:auto;margin:0;padding:10px 16px;font-size:14px;" onclick="showGoalForm()">
                <i class="fa-solid fa-plus"></i> Nova Meta
            </button>
        </div>

        <div class="card" style="text-align:center;padding:24px 20px;">
            <div style="display:flex;justify-content:center;gap:30px;flex-wrap:wrap;">
                <div>
                    <p style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Metas Ativas</p>
                    <span class="big-number" style="font-size:28px;color:var(--accent);">${goalsWithProgress.filter(g => !g.completed).length}</span>
                </div>
                <div style="width:1px;background:var(--border);"></div>
                <div>
                    <p style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Concluídas</p>
                    <span class="big-number" style="font-size:28px;color:var(--success);">${completedCount}</span>
                </div>
                <div style="width:1px;background:var(--border);"></div>
                <div>
                    <p style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Taxa Sucesso</p>
                    <span class="big-number" style="font-size:28px;color:var(--warning);">${goalsWithProgress.length > 0 ? Math.round((completedCount / goalsWithProgress.length) * 100) : 0}%</span>
                </div>
            </div>
        </div>

        <div id="goal-form-container" class="hidden" style="margin-bottom:20px;"></div>

        ${goalsWithProgress.length === 0 ? `
            <div class="card" style="text-align:center;padding:48px 20px;">
                <i class="fa-solid fa-bullseye" style="font-size:48px;color:var(--text-3);margin-bottom:16px;display:block;"></i>
                <h3 style="color:var(--text-2);margin-bottom:8px;">Nenhuma meta definida</h3>
                <p style="color:var(--text-3);font-size:14px;margin-bottom:20px;">Defina seus objetivos e acompanhe seu progresso!</p>
                <button class="btn-primary" style="width:auto;margin:0 auto;" onclick="showGoalForm()">
                    <i class="fa-solid fa-plus"></i> Criar primeira meta
                </button>
            </div>
        ` : `
            <div id="goals-list">
                ${goalsWithProgress.map(g => renderGoalCard(g)).join('')}
            </div>
        `}
    `;
}

function renderGoalCard(g) {
    const type = goalTypes.find(t => t.id === g.type);
    if (!type) return '';
    
    // Exibe 0 no progresso se o usuário estiver negativo (ex: engordou em vez de emagrecer)
    const displayCurrent = Math.max(0, g.current);
    
    // Calcula o quanto falta real (se g.current for -2, o remaining será 8)
    const remaining = Math.max(0, g.target - g.current);
    
    const remainingText = g.type === 'frequency' ? `${remaining} treino${remaining !== 1 ? 's' : ''}` : g.type === 'volume' ? `${remaining.toFixed(0)} kg` : `${remaining.toFixed(1)} ${type.unit}`;
    
    let extraInfo = '';
    if (g.type === 'body' && bodyMeasures.length > 0) {
        const firstW = bodyMeasures[0].weight;
        const latestW = bodyMeasures[bodyMeasures.length - 1].weight;
        const diff = (latestW - firstW).toFixed(1);
        extraInfo = `<div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">Início: ${firstW}kg | Atual: ${latestW}kg (${diff > 0 ? '+' : ''}${diff}kg)</div>`;
    }

    return `
        <div class="goal-card ${g.completed ? 'completed' : ''}">
            <div class="goal-header">
                <div class="goal-icon" style="background:${type.color}22;color:${type.color};"><i class="fa-solid ${type.icon}"></i></div>
                <div class="goal-info"><h4>${g.title}</h4><p>${type.label}${g.exercise ? ' · ' + g.exercise : ''}</p></div>
                <button class="goal-delete" onclick="deleteGoal('${g.id}')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="goal-progress-section">
                ${extraInfo}
                <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${g.progress}%;background:${type.color};"></div></div>
                <div class="goal-stats">
                    <span>Progresso: <strong style="color:${type.color};">${displayCurrent.toFixed(g.type === 'volume' ? 0 : 1)} ${type.unit}</strong></span>
                    <span>Meta: <strong>${g.target} ${type.unit}</strong></span>
                </div>
            </div>
            ${g.completed ? `<div class="goal-completed-badge"><i class="fa-solid fa-trophy"></i> Meta concluída! 🎉</div>` : `<div class="goal-remaining">Faltam <strong style="color:${type.color};">${remainingText}</strong></div>`}
        </div>`;
}
function showGoalForm() {
    const container = document.getElementById('goal-form-container');
    if (!container) return;

    const exercises = [...new Set(DB.history.flatMap(h => h.sets.map(s => s.exName)))].sort();

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="card">
            <div class="header-flex">
                <h3 class="card-label">Nova Meta</h3>
                <button class="btn-action btn-delete" style="flex:none;padding:8px 12px;" onclick="hideGoalForm()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <label>Tipo de Meta</label>
            <div class="goal-type-grid">
                ${goalTypes.map(t => `
                    <button class="goal-type-card" data-type="${t.id}" onclick="selectGoalType('${t.id}')">
                        <div class="goal-type-icon" style="background:${t.color}22;color:${t.color};">
                            <i class="fa-solid ${t.icon}"></i>
                        </div>
                        <span>${t.label}</span>
                    </button>
                `).join('')}
            </div>

            <div id="goal-type-desc" class="info-box" style="margin-top:12px;"></div>

            <div id="goal-dynamic-fields"></div>

            <label>Título da Meta</label>
            <input type="text" id="goal-title" placeholder="Ex: Supino 100kg" oninput="updateGoalTitlePlaceholder()">

            <div id="goal-target-field" class="hidden">
                <label>Valor da Meta</label>
                <input type="number" id="goal-target" placeholder="100" min="1" step="0.5">
                <span id="goal-unit-hint" style="font-size:12px;color:var(--text-3);"></span>
            </div>

            <div id="goal-exercise-field" class="hidden">
                <label>Exercício</label>
                <select id="goal-exercise">
                    <option value="">Selecione um exercício...</option>
                    ${exercises.map(e => `<option value="${e}">${e}</option>`).join('')}
                </select>
                <p style="font-size:12px;color:var(--text-3);margin-top:4px;">Apenas exercícios que você já treinou aparecem aqui.</p>
            </div>

            <div id="goal-direction-field" class="hidden">
                <label>Direção</label>
                <div style="display:flex;gap:8px;">
                    <button class="goal-dir-btn" data-dir="lose" onclick="selectGoalDir('lose')" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-2);cursor:pointer;font-size:13px;">📉 Emagrecer</button>
                    <button class="goal-dir-btn" data-dir="gain" onclick="selectGoalDir('gain')" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-2);cursor:pointer;font-size:13px;">📈 Ganhar Massa</button>
                </div>
            </div>

            <button class="btn-primary btn-full" style="margin-top:16px;" onclick="saveGoal()">
                <i class="fa-solid fa-bullseye"></i> Criar Meta
            </button>
        </div>
    `;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let selectedGoalType = null;
let selectedGoalDir = null;

function selectGoalType(typeId) {
    selectedGoalType = typeId;
    const t = goalTypes.find(x => x.id === typeId);

    document.querySelectorAll('.goal-type-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-type="${typeId}"]`).classList.add('selected');

    document.getElementById('goal-type-desc').innerHTML = `<p style="font-size:13px;color:var(--text-2);"><i class="fa-solid fa-circle-info" style="margin-right:6px;color:${t.color};"></i>${t.desc}</p>`;
    document.getElementById('goal-unit-hint').innerText = `Unidade: ${t.unit}`;
    document.getElementById('goal-target-field').classList.remove('hidden');
    document.getElementById('goal-title').placeholder = t.placeholder;

    if (typeId === 'strength') {
        document.getElementById('goal-exercise-field').classList.remove('hidden');
    } else {
        document.getElementById('goal-exercise-field').classList.add('hidden');
    }

    if (typeId === 'body') {
        document.getElementById('goal-direction-field').classList.remove('hidden');
    } else {
        document.getElementById('goal-direction-field').classList.add('hidden');
    }
}

function selectGoalDir(dir) {
    selectedGoalDir = dir;
    document.querySelectorAll('.goal-dir-btn').forEach(b => {
        b.style.background = 'var(--bg-input)';
        b.style.color = 'var(--text-2)';
        b.style.borderColor = 'var(--border)';
    });
    const btn = document.querySelector(`[data-dir="${dir}"]`);
    btn.style.background = 'var(--accent-g)';
    btn.style.color = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
}

function updateGoalTitlePlaceholder() {
    // Auto-fill title if empty based on type
}

function hideGoalForm() {
    document.getElementById('goal-form-container').classList.add('hidden');
    selectedGoalType = null;
    selectedGoalDir = null;
}

async function saveGoal() {
    const title = document.getElementById('goal-title').value.trim();
    const target = parseFloat(document.getElementById('goal-target').value);

    if (!selectedGoalType) { showToast('Selecione o tipo de meta!', 'warning'); return; }
    if (!title) { showToast('Digite um título!', 'warning'); return; }
    if (!target || target <= 0) { showToast('Digite um valor válido!', 'warning'); return; }

    const goal = {
        id: Date.now().toString(),
        type: selectedGoalType,
        title,
        target,
        createdAt: new Date().toISOString(),
    };

    if (selectedGoalType === 'strength') {
        const ex = document.getElementById('goal-exercise').value;
        if (!ex) { showToast('Selecione um exercício!', 'warning'); return; }
        goal.exercise = ex;
    }

    if (selectedGoalType === 'body') {
        if (!selectedGoalDir) { showToast('Selecione a direção!', 'warning'); return; }
        goal.direction = selectedGoalDir;
    }

    userGoals.push(goal);

    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goals: userGoals })
        });
        loggedUser.goals = userGoals;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        showToast('Meta criada e salva no banco! 🎯', 'success');
        hideGoalForm();
        loadGoalsView();
    } catch (e) { 
        userGoals.pop(); // Remove a meta da memória se der erro
        showToast('Erro ao salvar meta.', 'error'); 
        console.error(e);
    }
}
function deleteGoal(id) {
    showConfirm('Excluir meta', 'Deseja remover esta meta?', '🗑️', async () => {
        const oldGoals = [...userGoals];
        userGoals = userGoals.filter(g => g.id !== id);
        try {
            await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goals: userGoals })
            });
            loggedUser.goals = userGoals;
            localStorage.setItem('academax_user', JSON.stringify(loggedUser));
            showToast('Meta removida.', 'info');
            loadGoalsView();
        } catch (e) {
            userGoals = oldGoals; // Reverte se der erro
            showToast('Erro ao excluir meta.', 'error');
            console.error(e);
        }
    });
}

let notifCache = [];
let notifLastCount = -1;

// Busca as notificações do usuário no servidor
async function loadNotifications(silent = true) {
    try {
        const res = await authFetch(`${API}/notifications/${loggedUser.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const unreadBefore = notifCache.filter(n => !n.read).length;
        notifCache = data;
        renderNotifBadge();
        const unreadNow = notifCache.filter(n => !n.read).length;
        // Aviso sonoro + toast quando chega notificação nova com o app aberto
        if (silent && notifLastCount !== -1 && unreadNow > unreadBefore) {
            showToast(`Você tem ${unreadNow} nova(s) notificação(ões)!`, 'info');
            playNotifSound();
        }
        notifLastCount = unreadNow;
        // se o painel estiver aberto, atualiza a lista em tempo real
        const panel = document.getElementById('notif-panel');
        if (panel && !panel.classList.contains('hidden')) renderNotifList();
    } catch (e) { /* falha silenciosa */ }
}

// Desenha o número vermelho no sininho
function renderNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = notifCache.filter(n => !n.read).length;
    if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Abre/fecha o painel do sininho
function toggleNotifPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (wasHidden) {
        renderNotifList();
        markNotifsRead();
    }
}

// Desenha a lista de notificações dentro do painel
function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifCache.length) {
        list.innerHTML = `
            <div class="notif-empty">
                <i class="fa-regular fa-bell-slash"></i>
                <p>Nenhuma notificação por aqui.<br>Quando seu personal recomendar um treino ou enviar uma mensagem, ela aparece aqui!</p>
            </div>`;
        return;
    }
    const styles = {
        workout: { icon: 'fa-dumbbell',      bg: 'var(--accent)' },
        message: { icon: 'fa-comment-dots',  bg: '#0ea5e9' },
        ficha:   { icon: 'fa-notes-medical', bg: '#f59e0b' }
    };
    list.innerHTML = notifCache.map(n => {
        const s = styles[n.type] || styles.message;
        const d = new Date(n.date);
        const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
                        ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const action = n.type === 'workout'
            ? `<button class="notif-action" onclick="goToRecommended()">Ver treino</button>` : '';
        return `
        <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-icon" style="background:${s.bg};"><i class="fa-solid ${s.icon}"></i></div>
            <div class="notif-body">
                <div class="notif-title">${n.title}</div>
                <div class="notif-msg">${n.message}</div>
                <div class="notif-date">${dateStr}${action}</div>
            </div>
        </div>`;
    }).join('');
}

// Botão "Ver treino" -> vai para a lista de treinos
function goToRecommended() {
    toggleNotifPanel();
    navigateTo('workouts');
}

// Marca tudo como lido (some com o número vermelho)
async function markNotifsRead() {
    if (!notifCache.some(n => !n.read)) return;
    try {
        await authFetch(`${API}/notifications/${loggedUser.id}/read`, { method: 'PUT' });
        notifCache = notifCache.map(n => ({ ...n, read: true }));
        renderNotifBadge();
        renderNotifList();
    } catch (e) {}
}

// Limpa todas as notificações
async function clearNotifications() {
    showConfirm('Limpar notificações', 'Apagar todas as notificações?', '🔕', async () => {
        try {
            await authFetch(`${API}/notifications/${loggedUser.id}`, { method: 'DELETE' });
            notifCache = [];
            notifLastCount = 0;
            renderNotifBadge();
            renderNotifList();
            showToast('Notificações limpas!', 'success');
        } catch (e) { showToast('Erro ao limpar.', 'error'); }
    });
}

// Som "din din" quando chega notificação nova
function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.36);
    } catch (e) {}
}

// Fecha o painel ao clicar fora
document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    const wrap  = document.querySelector('.notif-wrap');
    if (panel && wrap && !panel.classList.contains('hidden') && !wrap.contains(e.target)) {
        panel.classList.add('hidden');
    }
});

// === ADMIN: enviar mensagem para um cliente ===
async function adminSendMessage(clientId) {
    const input = document.getElementById('admin-msg-input');
    const msg = input.value.trim();
    if (!msg) { showToast('Escreva uma mensagem primeiro.', 'warning'); return; }
    const btn = document.getElementById('admin-msg-btn');
    setButtonLoading(btn, true);
    try {
        const res = await authFetch(`${API}/users/${clientId}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'message', title: 'Mensagem do Personal', message: msg })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        input.value = '';
        showToast('Mensagem enviada! O cliente verá no sininho.', 'success');
    } catch (e) { showToast('Erro de conexão.', 'error'); }
    setButtonLoading(btn, false);
}

applyTheme();

// === SERVICE WORKER (PWA) ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW erro:', err));
    });
}



checkAdminStatus();
loadDB();
loadNotifications();                                // carrega o sininho ao abrir
setInterval(() => loadNotifications(), 30000);      // verifica a cada 30 segundos