// =============================================
// === INICIALIZAÇÃO ===
// =============================================
if (!localStorage.getItem('academax_user')) {
    const legacy = localStorage.getItem('gympro_user');
    if (legacy) {
        localStorage.setItem('academax_user', legacy);
        localStorage.removeItem('gympro_user');
    } else {
        window.location.href = '/login';
    }
}

const loggedUser = JSON.parse(localStorage.getItem('academax_user') || '{}');
const API = 'https://academaxx.com.br/api';
// Helper: fetch com header de autenticação
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['x-user-id'] = loggedUser.id;
    const res = await fetch(url, options);
    if (res.status === 401) {
        showToast('Sessão expirada. Faça login novamente.', 'warning');
        localStorage.removeItem('academax_user');
        setTimeout(() => window.location.href = '/login', 1500);
        throw new Error('Unauthorized');
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
        const [resW, resH] = await Promise.all([
            authFetch(`${API}/workouts/${loggedUser.id}`),
            authFetch(`${API}/history/${loggedUser.id}`)
        ]);
        DB.workouts = await resW.json();
        DB.history  = await resH.json();
        
        // Carrega dados do usuário do banco
        userGoals = loggedUser.goals || [];
        bodyMeasures = loggedUser.measures || [];
        schedule = loggedUser.schedule || {};

        renderDashboard();
        renderWorkouts();
        renderHistory();
    } catch (err) {
        showToast('Erro ao conectar com o servidor.', 'warning');
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
        div.innerHTML = `
            <div class="workout-info">
                <h3>${h.workoutName}</h3>
                <p>${new Date(h.date).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}
                · <strong style="color:var(--success);">${h.volume.toFixed(1)} kg</strong></p>
            </div>`;
        list.appendChild(div);
    });
}

function confirmDeleteWorkout(id) {
    const w = DB.workouts.find(x => x.id === id);
    showConfirm('Excluir treino', `Excluir "${w?.name}"? Essa ação não pode ser desfeita.`, '🗑️', () => deleteWorkout(id));
}

async function deleteWorkout(id) {
    try {
        const res = await authFetch(`${API}/workouts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
    } catch (err) {
        showToast('Erro ao excluir no servidor.', 'error');
    }
    DB.workouts = DB.workouts.filter(w => w.id !== id);
    renderWorkouts();
    showToast('Treino excluído!', 'success');
}

// =============================================
// === VÍDEO INLINE ===
// =============================================
const videoIds = {
    'Supino Reto com Barra': 'kTltYjpGQRk', 'Supino Reto com Halteres': 'v6RfC3Z3h5Q',
    'Supino Inclinado': 'vJiNHUqLpV0', 'Crucifixo no Banco': 'H6qMqLdKpQE',
    'Crossover na Polia': 'M3zGqZcqP9k', 'Flexão de Braço': 'IODKqqHjHnI',
    'Peck Deck (Máquina)': 'qM5nJ9mRp5o', 'Supino Declinado': 't3D1F4q6p9w',
    'Crucifixo Inclinado': 'wR5Lj3rZ4Uc', 'Paralelas (Mergulho)': 'Gfo7qJ8Vq5E',
    'Puxada Frontal': 'CAo7hKvxeXQ', 'Barra Fixa': 'Gfo7qJ8Vq5E',
    'Remada Curvada': 'kBji6j5XNQ4', 'Remada Baixa (Triângulo)': 'GZbfZ033f74',
    'Remada Unilateral': 'rT7DgCr-3pg', 'Levantamento Terra': 'Nyju6b1Z3UE',
    'Pulldown (Pegada Aberta)': 'vJiNHUqLpV0', 'Face Pull': 'Gfo7qJ8Vq5E',
    'Agachamento Livre': 'ultWZbUMPL8', 'Agachamento no Smith': 'kTltYjpGQRk',
    'Leg Press 45°': 'IZQ0Q1N_NtU', 'Cadeira Extensora': 'YyvSfVjQeL0',
    'Cadeira Flexora': 't3D1F4q6p9w', 'Mesa Flexora': 'wR5Lj3rZ4Uc',
    'Stiff': 'Nyju6b1Z3UE', 'Afundo (Passada)': 'Gfo7qJ8Vq5E',
    'Panturrilha em Pé': 'gwLzBJYoWlQ', 'Panturrilha Sentada': 'qM5nJ9mRp5o',
    'Hack Agachamento': 'v6RfC3Z3h5Q', 'Rosca Direta com Barra': 'kwG2ipFRgfo',
    'Rosca Direta com Halteres': 'v6RfC3Z3h5Q', 'Rosca Alternada': 'TwD-YGVP4Bk',
    'Rosca Martelo': 'TwD-YGVP4Bk', 'Rosca Concentrada': 'rT7DgCr-3pg',
    'Rosca Scott (Máquina)': 'qM5nJ9mRp5o', 'Rosca 21': 'kBji6j5XNQ4',
    'Tríceps Pulley (Barra)': '2-LAMcpzODU', 'Tríceps Pulley (Corda)': 'l3rHYPtMUo8',
    'Tríceps Francês': 'l3rHYPtMUo8', 'Tríceps Testa': 'l3rHYPtMUo8',
    'Tríceps Banco (Dips)': 'Gfo7qJ8Vq5E', 'Tríceps Coice': '2-LAMcpzODU',
    'Desenvolvimento com Halteres': 'qEwKCR5JCog', 'Desenvolvimento no Smith': 'qEwKCR5JCog',
    'Elevação Lateral': '3VcKaXpzqRo', 'Elevação Frontal': '3VcKaXpzqRo',
    'Crucifixo Inverso (Posterior)': 'Gfo7qJ8Vq5E', 'Remada Alta': 'kBji6j5XNQ4',
    'Encolhimento': 'gwLzBJYoWlQ', 'Abdominal Supra (Crunch)': 'jDwoBqPH0jk',
    'Abdominal Infra': 'jDwoBqPH0jk', 'Prancha (Plank)': 'ASdvN_8wVSc',
    'Abdominal Bicicleta': 'ASdvN_8wVSc', 'Elevação de Pernas': 'jDwoBqPH0jk',
    'Abdominal na Polia': 'jDwoBqPH0jk', 'Prancha Lateral': 'ASdvN_8wVSc',
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
    { name: 'Supino Reto com Barra', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Supino Reto com Halteres', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=100&q=80' },
    { name: 'Supino Inclinado', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=100&q=80' },
    { name: 'Supino Declinado', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Crucifixo no Banco', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Crucifixo Inclinado', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Crossover na Polia', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100&q=80' },
    { name: 'Peck Deck (Máquina)', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100&q=80' },
    { name: 'Flexão de Braço', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Paralelas (Mergulho)', muscle: 'Peito', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Puxada Frontal', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=100&q=80' },
    { name: 'Barra Fixa', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=100&q=80' },
    { name: 'Remada Curvada', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Remada Baixa (Triângulo)', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1597347306199-68b3a8d1c9e1?w=100&q=80' },
    { name: 'Remada Unilateral', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Levantamento Terra', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1584466977773-e625c64c8d3b?w=100&q=80' },
    { name: 'Pulldown (Pegada Aberta)', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=100&q=80' },
    { name: 'Face Pull', muscle: 'Costas', img: 'https://images.unsplash.com/photo-1597347306199-68b3a8d1c9e1?w=100&q=80' },
    { name: 'Agachamento Livre', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=100&q=80' },
    { name: 'Agachamento no Smith', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=100&q=80' },
    { name: 'Leg Press 45°', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Cadeira Extensora', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=100&q=80' },
    { name: 'Cadeira Flexora', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=100&q=80' },
    { name: 'Mesa Flexora', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Stiff', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1584466977773-e625c64c8d3b?w=100&q=80' },
    { name: 'Afundo (Passada)', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=100&q=80' },
    { name: 'Panturrilha em Pé', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100&q=80' },
    { name: 'Panturrilha Sentada', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100&q=80' },
    { name: 'Hack Agachamento', muscle: 'Pernas', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=100&q=80' },
    { name: 'Rosca Direta com Barra', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Rosca Direta com Halteres', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Rosca Alternada', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Rosca Martelo', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Rosca Concentrada', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Rosca Scott (Máquina)', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=100&q=80' },
    { name: 'Rosca 21', muscle: 'Bíceps', img: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&q=80' },
    { name: 'Tríceps Pulley (Barra)', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Tríceps Pulley (Corda)', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Tríceps Francês', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=100&q=80' },
    { name: 'Tríceps Testa', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=100&q=80' },
    { name: 'Tríceps Banco (Dips)', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Tríceps Coice', muscle: 'Tríceps', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80' },
    { name: 'Desenvolvimento com Halteres', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1521804906057-1df8fdb718b7?w=100&q=80' },
    { name: 'Desenvolvimento no Smith', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1521804906057-1df8fdb718b7?w=100&q=80' },
    { name: 'Elevação Lateral', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=100&q=80' },
    { name: 'Elevação Frontal', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=100&q=80' },
    { name: 'Crucifixo Inverso (Posterior)', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=100&q=80' },
    { name: 'Remada Alta', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1583500178690-f7f4aca4d0b1?w=100&q=80' },
    { name: 'Encolhimento', muscle: 'Ombro', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=100&q=80' },
    { name: 'Abdominal Supra (Crunch)', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Abdominal Infra', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Prancha (Plank)', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=100&q=80' },
    { name: 'Abdominal Bicicleta', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Elevação de Pernas', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=100&q=80' },
    { name: 'Abdominal na Polia', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2dcb?w=100&q=80' },
    { name: 'Prancha Lateral', muscle: 'Abdômen', img: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=100&q=80' },
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
            return `<div class="exercise-lib-item">
                <img src="${ex.img}" alt="${ex.name}" class="ex-thumb" onerror="this.src='https://placehold.co/80x80/1c1c21/6366f1?text=A'">
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
        await authFetch(`${API}/workouts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, desc, exercises: tempExercisesToAdd, userId })
        });
    } catch (e) {}
    if (!targetUserIdForWorkout) {
        if (editingWorkoutId) {
            const w = DB.workouts.find(x => x.id === editingWorkoutId);
            if (w) { w.name = name; w.desc = desc; w.exercises = tempExercisesToAdd; }
            showToast('Treino atualizado!', 'success');
        } else {
            DB.workouts.push({ id: Date.now().toString(), name, desc, exercises: tempExercisesToAdd });
            showToast('Treino criado!', 'success');
        }
        renderWorkouts();
    } else {
        viewClient(targetUserIdForWorkout);
        showToast('Treino recomendado ao cliente!', 'success');
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
        if (timeLeft <= 0) { clearInterval(timerInterval); renderActiveSet(); }
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
    DB.history.forEach(s => s.sets.forEach(set => {
        if (set.exName === exName && set.actualWeight)
            records.push({ date: new Date(s.date).toLocaleDateString('pt-BR'), weight: set.actualWeight, reps: set.actualReps });
    }));
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
    list.innerHTML = records.slice().reverse().map(r => {
        const isRec = r.weight === Math.max(...weights);
        return `<div class="prog-item">
            <div class="prog-date">
                <span class="day">${r.date}</span>
                <span class="reps">${r.reps} reps</span>
            </div>
            <div style="display:flex;align-items:center;">
                <span class="prog-weight">${r.weight} kg</span>
                ${isRec ? '<span class="prog-record"><i class="fa-solid fa-trophy"></i> Recorde</span>' : ''}
            </div>
        </div>`;
    }).join('');

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
        await authFetch(`${API}/users/${loggedUser.id}/ficha`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fichaData)
        });
    } catch (e) {}
    const updated = { ...loggedUser, ficha: fichaData };
    localStorage.setItem('academax_user', JSON.stringify(updated));
    Object.assign(loggedUser, updated);
    showToast('Ficha salva!', 'success');
    setButtonLoading(btn, false);
    loadProfileData();
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
    
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ measures: bodyMeasures })
        });
        showToast('Medida registrada no banco!', 'success');
    } catch (e) { showToast('Erro ao salvar no banco', 'error'); }
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
    bodyMeasures = bodyMeasures.filter(m => m.id !== id);
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ measures: bodyMeasures })
        });
    } catch (e) {}
    loadMeasuresView();
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
        showToast('Agenda salva!', 'success');
        loadScheduleView(); // Atualiza a tela e a lista de próximos
    } catch (e) { 
        showToast('Erro ao salvar', 'error'); 
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

async function toggleDay(dayIndex) {
    schedule[dayIndex] = !schedule[dayIndex];
    if (!schedule[dayIndex]) delete schedule[dayIndex];
    
    try {
        await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: schedule })
        });
        showToast(schedule[dayIndex] ? 'Dia marcado!' : 'Dia desmarcado!', 'success');
    } catch (e) { showToast('Erro ao salvar agenda', 'error'); }
    loadScheduleView();
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
            // Pega a maior carga do exercício no histórico
            const exRecords = [];
            DB.history.forEach(h => h.sets.forEach(s => {
                if (s.exName === g.exercise && s.actualWeight) exRecords.push(s.actualWeight);
            }));
            current = exRecords.length > 0 ? Math.max(...exRecords) : 0;
        } else if (g.type === 'body') {
            const measures = JSON.parse(localStorage.getItem('academax_measures') || '[]');
            if (measures.length > 0) {
                const latest = measures[measures.length - 1];
                const first = measures[0];
                if (g.direction === 'lose') {
                    current = Math.max(0, (first.weight - latest.weight));
                } else {
                    current = Math.max(0, (latest.weight - first.weight));
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
        g.progress = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
        g.completed = g.current >= g.target;
        return g;
    });

    // Atualiza conquistas de metas
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
                <div class="goal-stats"><span>Progresso: <strong style="color:${type.color};">${g.current.toFixed(g.type === 'volume' ? 0 : 1)} ${type.unit}</strong></span><span>Meta: <strong>${g.target} ${type.unit}</strong></span></div>
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
        showToast('Meta criada e salva no banco! 🎯', 'success');
    } catch (e) { showToast('Erro ao salvar meta', 'error'); }
    hideGoalForm();
    loadGoalsView();
}

function deleteGoal(id) {
    showConfirm('Excluir meta', 'Deseja remover esta meta?', '🗑️', async () => {
        userGoals = userGoals.filter(g => g.id !== id);
        try {
            await authFetch(`${API}/users/${loggedUser.id}/user-data`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goals: userGoals })
            });
        } catch (e) {}
        showToast('Meta removida.', 'info');
        loadGoalsView();
    });
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
