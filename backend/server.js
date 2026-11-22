import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const app = express();
const prisma = new PrismaClient();

const corsOptions = {
    origin: ['https://academaxx.com.br', 'https://www.academaxx.com.br', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function authMiddleware(req, res, next) {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ error: 'Usuário inválido' });
        req.user = user;
        next();
    } catch { res.status(401).json({ error: 'Sessão expirada' }); }
}

async function adminMiddleware(req, res, next) {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    next();
}

const mfaCodes = new Map();
const resetTokens = new Map();

function isValidEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

// === CADASTRO ===
app.post('/api/register', async (req, res) => {
    const { name, email, password, birthdate } = req.body;
    if (!name || !email || !password || !birthdate)
        return res.status(400).json({ error: 'Preencha todos os campos' });
    if (!isValidEmail(email))
        return res.status(400).json({ error: 'E-mail inválido' });
    if (password.length < 6)
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword, birthdate,
                    isAdmin: email === 'admin@academaxx.com.br' }
        });
        res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
    } catch { res.status(400).json({ error: 'E-mail já cadastrado' }); }
});

// === LOGIN (com MFA) ===
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Senha incorreta" });
    
    if (user.mfaEnabled) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        mfaCodes.set(email, { code, expiry: Date.now() + 300000 });
        try {
            await transporter.sendMail({
                from: `"AcadeMax" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: '🔐 Seu código — AcadeMax',
                html: `<div style="font-family:Arial;max-width:400px;margin:auto;background:#111114;border-radius:16px;padding:32px;">
                    <h2 style="color:#f4f4f5;text-align:center;">Código de Verificação</h2>
                    <p style="color:#a1a1aa;text-align:center;">Use o código abaixo:</p>
                    <div style="background:#1c1c21;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
                        <span style="font-size:32px;font-weight:700;color:#6366f1;letter-spacing:8px;">${code}</span>
                    </div>
                    <p style="color:#52525b;font-size:12px;text-align:center;">Expira em 5 minutos.</p>
                </div>`
            });
        } catch(e) { console.error('Erro MFA:', e); }
        return res.json({ requiresMFA: true, email });
    }
    
    res.json({ 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        picture: user.picture, 
        phone: user.phone,
        birthdate: user.birthdate,
        isAdmin: user.isAdmin,
        mfaEnabled: user.mfaEnabled,
        ficha: user.ficha,
        goals: user.goals,
        measures: user.measures,
        schedule: user.schedule
    });
});

// === VERIFICAR MFA ===
app.post('/api/verify-mfa', async (req, res) => {
    const { email, code } = req.body;
    const record = mfaCodes.get(email);
    if (!record) return res.status(400).json({ error: 'Solicite um novo código.' });
    if (Date.now() > record.expiry) { mfaCodes.delete(email); return res.status(400).json({ error: 'Código expirado.' }); }
    if (record.code !== code) return res.status(401).json({ error: 'Código incorreto' });
    mfaCodes.delete(email);
    const user = await prisma.user.findUnique({ where: { email } });
    res.json({ 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        picture: user.picture, 
        phone: user.phone,
        birthdate: user.birthdate,
        isAdmin: user.isAdmin,
        mfaEnabled: user.mfaEnabled,
        ficha: user.ficha,
        goals: user.goals,
        measures: user.measures,
        schedule: user.schedule
    });
});

// === TOGGLE MFA ===
app.post('/api/toggle-mfa', authMiddleware, async (req, res) => {
    const { enabled } = req.body;
    try {
        const updated = await prisma.user.update({ where: { id: req.user.id }, data: { mfaEnabled: enabled } });
        res.json({ mfaEnabled: updated.mfaEnabled });
    } catch { res.status(500).json({ error: 'Erro ao alterar MFA' }); }
});

// === GOOGLE LOGIN ===
app.post('/api/google-login', async (req, res) => {
    const { name, email, picture } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });
    
    const user = await prisma.user.upsert({
        where: { email },
        update: { name, picture },
        create: { name, email, picture, password: 'google_oauth' }
    });
    
    res.json({ 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        picture: user.picture, 
        phone: user.phone,
        birthdate: user.birthdate,
        isAdmin: user.isAdmin,
        mfaEnabled: user.mfaEnabled,
        ficha: user.ficha,
        goals: user.goals,
        measures: user.measures,
        schedule: user.schedule
    });
});

// === ESQUECI SENHA ===
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.json({ message: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });
        if (user.password === 'google_oauth')
            return res.json({ message: 'Esta conta usa login com Google.' });
        const token = crypto.randomBytes(32).toString('hex');
        resetTokens.set(token, { email, expiry: Date.now() + 1800000 });
        const resetLink = `https://academaxx.com.br/login?reset=${token}`;
        await transporter.sendMail({
            from: `"AcadeMax" <${process.env.EMAIL_USER}>`,
            to: email, subject: '🔑 Redefinir senha — AcadeMax',
            html: `<div style="font-family:Arial;max-width:480px;margin:auto;background:#111114;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                <div style="padding:24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <span style="font-size:22px;font-weight:800;color:#f4f4f5;">ACADE<span style="color:#6366f1;">MAX</span></span>
                </div>
                <div style="padding:28px;">
                    <h2 style="color:#f4f4f5;font-size:18px;margin:0 0 10px;">Redefinir sua senha</h2>
                    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 20px;">Olá, <strong style="color:#f4f4f5;">${user.name}</strong>!</p>
                    <a href="${resetLink}" style="display:block;background:#6366f1;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:20px;">🔑 Redefinir minha senha</a>
                    <p style="color:#52525b;font-size:12px;">Este link expira em 30 minutos.</p>
                </div>
            </div>`
        });
        res.json({ message: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });
    } catch (e) { console.error('Erro email:', e); res.status(500).json({ error: 'Erro ao enviar e-mail' }); }
});

// === REDEFINIR SENHA ===
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Dados incompletos' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
    const record = resetTokens.get(token);
    if (!record) return res.status(400).json({ error: 'Link inválido' });
    if (Date.now() > record.expiry) { resetTokens.delete(token); return res.status(400).json({ error: 'Link expirado' }); }
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { email: record.email }, data: { password: hashedPassword } });
        resetTokens.delete(token);
        res.json({ message: 'Senha redefinida com sucesso!' });
    } catch { res.status(500).json({ error: 'Erro ao redefinir senha' }); }
});

// === LISTAR USUÁRIOS (PROTEGIDO) ===
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
    const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, picture: true, phone: true, isAdmin: true, createdAt: true, mfaEnabled: true }
    });
    res.json(users);
});

// === UPLOAD AVATAR ===
app.post('/api/users/:id/avatar', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Imagem obrigatória' });
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fs = await import('fs');
    const dir = '/var/www/academax/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `avatar-${id}-${Date.now()}.jpg`;
    fs.writeFileSync(`${dir}/${filename}`, buffer);
    const pictureUrl = `/uploads/${filename}`;
    await prisma.user.update({ where: { id }, data: { picture: pictureUrl } });
    res.json({ picture: pictureUrl });
});

// === ATUALIZAR PERFIL ===
app.put('/api/users/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    const { name, picture, phone } = req.body;
    try {
        const updatedUser = await prisma.user.update({ where: { id }, data: { name, picture, phone } });
        res.json({ id: updatedUser.id, name: updatedUser.name, email: updatedUser.email,
                   picture: updatedUser.picture, phone: updatedUser.phone, isAdmin: updatedUser.isAdmin,
                   mfaEnabled: updatedUser.mfaEnabled });
    } catch { res.status(500).json({ error: 'Erro ao atualizar perfil' }); }
});

// === EXCLUIR CLIENTE ===
app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.workout.deleteMany({ where: { userId: id } });
        await prisma.workoutSession.deleteMany({ where: { userId: id } });
        await prisma.user.delete({ where: { id } });
        res.json({ message: 'Cliente deletado' });
    } catch { res.status(500).json({ error: 'Erro ao deletar' }); }
});

// === TREINOS ===
app.post('/api/workouts', authMiddleware, async (req, res) => {
    const { name, desc, exercises, userId } = req.body;
    if (req.user.id !== userId && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const workout = await prisma.workout.create({ data: { name, desc, exercises: JSON.stringify(exercises), userId } });
        res.json(workout);
    } catch { res.status(500).json({ error: 'Erro ao salvar treino' }); }
});

app.get('/api/workouts/:userId', authMiddleware, async (req, res) => {
    if (req.user.id !== req.params.userId && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    const workouts = await prisma.workout.findMany({ where: { userId: req.params.userId } });
    res.json(workouts.map(w => ({ ...w, exercises: JSON.parse(w.exercises) })));
});

app.delete('/api/workouts/:id', authMiddleware, async (req, res) => {
    try { await prisma.workout.delete({ where: { id: req.params.id } }); res.json({ message: 'Treino excluído' }); }
    catch { res.status(500).json({ error: 'Erro ao excluir' }); }
});

// === HISTÓRICO ===
app.post('/api/history', authMiddleware, async (req, res) => {
    const { userId, workoutId, volume, sets } = req.body;
    if (req.user.id !== userId && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const session = await prisma.workoutSession.create({ data: { userId, workoutId, volume, sets: JSON.stringify(sets) } });
        res.json(session);
    } catch { res.status(500).json({ error: 'Erro ao salvar histórico' }); }
});

app.get('/api/history/:userId', authMiddleware, async (req, res) => {
    if (req.user.id !== req.params.userId && !req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    const sessions = await prisma.workoutSession.findMany({ where: { userId: req.params.userId }, include: { workout: true } });
    res.json(sessions.map(s => ({ ...s, sets: JSON.parse(s.sets), workoutName: s.workout ? s.workout.name : 'Treino Removido' })));
});

// === VERIFICAÇÃO DE E-MAIL NO CADASTRO ===
const registerCodes = new Map();

app.post('/api/send-verification', async (req, res) => {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Dados incompletos' });
    
    // Verifica se o e-mail já existe
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });
    
    // Gera código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    registerCodes.set(email, { code, name, expiry: Date.now() + 600000 }); // 10 min
    
    try {
        await transporter.sendMail({
            from: `"AcadeMax" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '✅ Confirme seu cadastro — AcadeMax',
            html: `<div style="font-family:Arial;max-width:400px;margin:auto;background:#111114;border-radius:16px;padding:32px;">
                <div style="text-align:center;margin-bottom:24px;">
                    <span style="font-size:22px;font-weight:800;color:#f4f4f5;">ACADE<span style="color:#6366f1;">MAX</span></span>
                </div>
                <h2 style="color:#f4f4f5;font-size:18px;text-align:center;">Confirme seu cadastro</h2>
                <p style="color:#a1a1aa;font-size:14px;text-align:center;margin:12px 0 20px;">Olá, <strong style="color:#f4f4f5;">${name}</strong>! Use o código abaixo para confirmar seu cadastro:</p>
                <div style="background:#1c1c21;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
                    <span style="font-size:36px;font-weight:700;color:#6366f1;letter-spacing:10px;">${code}</span>
                </div>
                <p style="color:#52525b;font-size:12px;text-align:center;">Este código expira em 10 minutos. Se você não solicitou este cadastro, ignore este e-mail.</p>
            </div>`
        });
        res.json({ message: 'Código enviado!' });
    } catch (e) {
        console.error('Erro ao enviar código:', e);
        res.status(500).json({ error: 'Erro ao enviar e-mail. Verifique se o e-mail é válido.' });
    }
});

app.post('/api/verify-registration', async (req, res) => {
    const { email, code, name, password, birthdate } = req.body;
    
    const record = registerCodes.get(email);
    if (!record) return res.status(400).json({ error: 'Nenhum código enviado. Solicite um novo.' });
    if (Date.now() > record.expiry) {
        registerCodes.delete(email);
        return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }
    if (record.code !== code) return res.status(401).json({ error: 'Código incorreto' });
    
    registerCodes.delete(email);
    
    // Agora cria o usuário
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword, birthdate,
                    isAdmin: email === 'admin@academaxx.com.br' }
        });
        res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
    } catch {
        res.status(400).json({ error: 'E-mail já cadastrado' });
    }
});

// === SALVAR METAS, MEDIDAS E AGENDA ===
app.put('/api/users/:id/user-data', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && !req.user.isAdmin) return res.status(403).json({ error: "Acesso negado" });
    
    const { goals, measures, schedule } = req.body;
    const dataToUpdate = {};
    if (goals !== undefined) dataToUpdate.goals = goals;
    if (measures !== undefined) dataToUpdate.measures = measures;
    if (schedule !== undefined) dataToUpdate.schedule = schedule;

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: dataToUpdate
        });
        res.json({ 
            goals: updatedUser.goals, 
            measures: updatedUser.measures, 
            schedule: updatedUser.schedule 
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar dados do usuário" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend do AcadeMax rodando na porta ${PORT}`));
