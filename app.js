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
    document.getElementById('exercises-tabs').innerHTML = muscles
        .map(m => `<button class="tab-btn ${m === currentMuscleTab ? 'active-tab' : ''}" onclick="changeMuscleTab('${m}')">${m}</button>`)
        .join('');
    document.getElementById('exercises-library').innerHTML = exerciseLibrary
        .filter(ex => ex.muscle === currentMuscleTab)
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
                <label style="position:relative;display:inline-block;width:44px;height:24px;">
                    <input type="checkbox" id="mfa-toggle" ${u.mfaEnabled ? 'checked' : ''} onchange="toggleMFA(this.checked)" style="opacity:0;width:0;height:0;">
                    <span onclick="document.getElementById('mfa-toggle').click()" style="position:absolute;cursor:pointer;inset:0;background:${u.mfaEnabled ? 'var(--accent)' : 'var(--bg-input)'};border-radius:24px;transition:0.3s;">
                        <span style="position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:0.3s;transform:translateX(${u.mfaEnabled ? '20px' : '0'});"></span>
                    </span>
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
        loggedUser.mfaEnabled = data.mfaEnabled;
        localStorage.setItem('academax_user', JSON.stringify(loggedUser));
        showToast(enabled ? 'MFA ativado!' : 'MFA desativado', 'success');
    } catch (err) { showToast('Erro ao alterar MFA', 'error'); }
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
        <label class="health-check-item">
            <input type="checkbox" id="${c.id}" ${d.conditions?.includes(c.id) ? 'checked' : ''}>
            <i class="fa-solid ${c.icon}" style="font-size:14px;"></i> ${c.label}
        </label>`).join('');
    const objBtns = fichaObjetivos.map(o => `
        <button class="objetivo-btn ${selectedObjetivo===o.value?'selected':''}" onclick="selectObjetivo('${o.value}')">
            <i class="fa-solid ${o.icon}"></i>${o.label}
        </button>`).join('');
    return `
        <div class="health-section">
            <p class="health-section-title">Condições de Saúde</p>
            <div class="health-check-grid">${condChecks}</div>
            <label style="margin-top:12px;">Medicamentos (opcional)</label>
            <input type="text" id="ficha-medicamentos" value="${d.medicamentos||''}" placeholder="Ex: Losartana, Metformina">
            <label>Observações</label>
            <input type="text" id="ficha-obs" value="${d.obs||''}" placeholder="Ex: dor no joelho ao agachar">
        </div>
        <div class="health-section">
            <p class="health-section-title">Objetivo</p>
            <div class="objetivo-btn-grid" id="objetivo-grid">${objBtns}</div>
        </div>
        <div class="health-section">
            <p class="health-section-title">Nível</p>
            <div class="nivel-btn-grid">
                <button class="nivel-btn ${selectedNivel==='iniciante'?'selected':''}" onclick="selectNivel('iniciante')">🌱 Iniciante</button>
                <button class="nivel-btn ${selectedNivel==='intermediario'?'selected':''}" onclick="selectNivel('intermediario')">💪 Intermediário</button>
                <button class="nivel-btn ${selectedNivel==='avancado'?'selected':''}" onclick="selectNivel('avancado')">🔥 Avançado</button>
            </div>
        </div>
        <button class="btn-primary btn-full" id="save-ficha-btn" onclick="saveFicha()">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Ficha
        </button>`;
}

function selectObjetivo(value) {
    selectedObjetivo = value;
    document.querySelectorAll('.objetivo-btn').forEach(b => b.classList.remove('selected'));
    event.target.closest('.objetivo-btn').classList.add('selected');
}
function selectNivel(value) {
    selectedNivel = value;
    document.querySelectorAll('.nivel-btn').forEach(b => b.classList.remove('selected'));
    event.target.closest('.nivel-btn').classList.add('selected');
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
applyTheme();

// === SERVICE WORKER (PWA) ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW erro:', err));
    });
}
checkAdminStatus();
loadDB();
