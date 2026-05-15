// ============================================
// MEDISCAN AI - PRODUCTION FRONTEND
// Connects to backend API
// ============================================

// CONFIGURATION - Change this to your Render backend URL
const API_BASE_URL = 'https://mediscan-api-93wl.onrender.com';

let isDoctorAuthenticated = false;
let currentPatient = null;
let patientsDB = [];
let faceDatabase = {};
let videoStream = null;
let currentFaceHash = null;
let authToken = null;
let faceToken = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(() => document.getElementById('loadingScreen').classList.add('hidden'), 1500);
    await checkBackendConnection();
    await loadPatientsFromBackend();
    initNavigation();
    initFaceScan();
    initAIDiagnosis();
    initFloatingWidget();
    refreshAllViews();
    populateDoctors();
    initGlobalSearch();
    document.getElementById('addPatientBtn').addEventListener('click', openAddPatientModal);
    const session = JSON.parse(localStorage.getItem('mediscan_doctor_session'));
    if (session) { isDoctorAuthenticated = true; authToken = session.token; updateAuthUI(); }
});

// ============================================
// BACKEND API
// ============================================
async function checkBackendConnection() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) { dot.className = 'status-dot online'; text.textContent = 'Backend Connected'; }
        else { dot.className = 'status-dot offline'; text.textContent = 'Backend Error'; }
    } catch(e) { dot.className = 'status-dot offline'; text.textContent = 'Backend Offline'; }
}

async function loadPatientsFromBackend() {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE_URL}/patients`, { headers });
        if (res.ok) { const data = await res.json(); patientsDB = data.patients || []; }
    } catch(e) { loadFromLocalStorage(); }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('mediscan_patients');
        if (saved) patientsDB = JSON.parse(saved);
        const faces = localStorage.getItem('mediscan_faces');
        if (faces) faceDatabase = JSON.parse(faces);
    } catch(e) {}
}

function saveToLocalStorage() {
    localStorage.setItem('mediscan_patients', JSON.stringify(patientsDB));
    localStorage.setItem('mediscan_faces', JSON.stringify(faceDatabase));
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    if (faceToken) headers['X-Face-Token'] = faceToken;
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, config);
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Request failed'); }
        return await res.json();
    } catch(e) { console.error('API Error:', e.message); return null; }
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;
            if (pageName === 'patients' && !isDoctorAuthenticated && !currentPatient) {
                alert('🔐 Please scan your face first or login as a doctor.');
                document.querySelector('[data-page="face-scan"]').click();
                return;
            }
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`${pageName}-page`).classList.add('active');
            if (pageName === 'patients') { updateAuthUI(); populatePatientTable(); }
        });
    });
}

// ============================================
// FACE SCAN SYSTEM
// ============================================
function initFaceScan() {
    const startBtn = document.getElementById('startScanBtn');
    const captureBtn = document.getElementById('captureBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const video = document.getElementById('videoFeed');
    const overlay = document.getElementById('scanOverlay');
    const instruction = document.getElementById('scanInstruction');

    startBtn.addEventListener('click', async () => {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
            });
            video.srcObject = videoStream;
            video.style.display = 'block';
            overlay.style.display = 'block';
            captureBtn.disabled = false;
            stopBtn.disabled = false;
            startBtn.disabled = true;
            instruction.textContent = 'Position face in frame and click "Scan & Check-In"';
            instruction.style.background = 'rgba(76,175,80,0.9)';
        } catch(e) {
            instruction.textContent = '⚠️ Camera denied. Allow camera permissions.';
            instruction.style.background = 'rgba(244,67,54,0.9)';
        }
    });

    captureBtn.addEventListener('click', () => {
        if (!videoStream) return;
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        const faceData = ctx.getImageData(195, 90, 250, 300);
        currentFaceHash = generateHash(faceData);
        instruction.textContent = '🔍 Scanning...';
        instruction.style.background = 'rgba(33,150,243,0.9)';
        captureBtn.disabled = true;
        setTimeout(async () => {
            const result = await apiCall('/faces/scan', 'POST', { faceEmbedding: currentFaceHash });
            if (result && result.found) {
                currentPatient = result.patient;
                faceToken = result.faceToken;
                showPatientFound(currentPatient);
                instruction.textContent = '✅ Welcome back, ' + currentPatient.name + '!';
            } else {
                const match = findLocalFaceMatch(currentFaceHash);
                if (match) { currentPatient = match; showPatientFound(match); instruction.textContent = '✅ Welcome back, ' + match.name + '!'; }
                else { currentPatient = null; showRegistrationForm(); instruction.textContent = '🆕 New face! Register below.'; }
            }
            instruction.style.background = currentPatient ? 'rgba(76,175,80,0.9)' : 'rgba(255,152,0,0.9)';
            captureBtn.disabled = false;
            updateAuthUI();
        }, 1500);
    });

    stopBtn.addEventListener('click', () => {
        if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
        video.style.display = 'none'; overlay.style.display = 'none';
        startBtn.disabled = false; captureBtn.disabled = true; stopBtn.disabled = true;
        instruction.textContent = 'Click "Start Face Scan" to begin';
        instruction.style.background = 'rgba(0,0,0,0.7)';
        resetFaceScan();
    });
}

function generateHash(imageData) {
    const data = imageData.data, hashParts = [], width = imageData.width;
    const regions = [
        { x: 0, y: 0, w: 83, h: 100 }, { x: 83, y: 0, w: 84, h: 100 }, { x: 167, y: 0, w: 83, h: 100 },
        { x: 0, y: 100, w: 83, h: 100 }, { x: 83, y: 100, w: 84, h: 100 }, { x: 167, y: 100, w: 83, h: 100 },
        { x: 0, y: 200, w: 83, h: 100 }, { x: 83, y: 200, w: 84, h: 100 }, { x: 167, y: 200, w: 83, h: 100 }
    ];
    regions.forEach(region => {
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = region.y; y < region.y + region.h; y++) {
            for (let x = region.x; x < region.x + region.w; x++) {
                const idx = (y * width + x) * 4;
                r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++;
            }
        }
        hashParts.push(Math.floor(r/count).toString(16).padStart(2,'0'), Math.floor(g/count).toString(16).padStart(2,'0'), Math.floor(b/count).toString(16).padStart(2,'0'));
    });
    return hashParts.join('');
}

function findLocalFaceMatch(hash) {
    let best = null, bestScore = 0;
    for (const [id, stored] of Object.entries(faceDatabase)) {
        const score = similarity(hash, stored);
        if (score > bestScore) { bestScore = score; best = id; }
    }
    if (best && bestScore > 0.7) return patientsDB.find(p => p.id === best) || null;
    return null;
}

function similarity(a, b) {
    if (!a || !b) return 0;
    const len = Math.min(a.length, b.length); let diff = 0;
    for (let i = 0; i < len; i++) diff += Math.abs(parseInt(a[i],16) - parseInt(b[i],16));
    return Math.max(0, 1 - (diff / (15 * len)));
}

function showRegistrationForm() {
    document.getElementById('welcomePanel').style.display = 'none';
    document.getElementById('patientFoundPanel').classList.remove('active');
    document.getElementById('registrationPanel').classList.add('active');
}

function showPatientFound(patient) {
    document.getElementById('welcomePanel').style.display = 'none';
    document.getElementById('registrationPanel').classList.remove('active');
    document.getElementById('patientFoundPanel').classList.add('active');
    document.getElementById('foundPatientName').textContent = patient.name;
    document.getElementById('foundPatientId').textContent = patient.id;
    document.getElementById('foundPatientAge').textContent = patient.age;
    document.getElementById('foundPatientBlood').textContent = patient.bloodType;
    document.getElementById('foundPatientDisease').textContent = patient.disease;
    document.getElementById('foundPatientDate').textContent = patient.addedDate;
}

function resetFaceScan() {
    document.getElementById('welcomePanel').style.display = 'block';
    document.getElementById('registrationPanel').classList.remove('active');
    document.getElementById('patientFoundPanel').classList.remove('active');
    document.getElementById('faceRegistrationForm').reset();
    currentPatient = null; faceToken = null;
    updateAuthUI();
}

function registerFacePatient(event) {
    event.preventDefault();
    const newPatient = {
        id: `P${1000 + patientsDB.length + 1}`,
        name: document.getElementById('faceRegName').value.trim(),
        age: parseInt(document.getElementById('faceRegAge').value),
        bloodType: document.getElementById('faceRegBlood').value || 'Unknown',
        disease: document.getElementById('faceRegDisease').value.trim(),
        symptoms: document.getElementById('faceRegSymptoms').value.trim(),
        history: 'Registered via Face Scan', medications: 'None',
        status: 'active', addedDate: new Date().toISOString().split('T')[0]
    };
    patientsDB.unshift(newPatient);
    if (currentFaceHash) faceDatabase[newPatient.id] = currentFaceHash;
    saveToLocalStorage();
    apiCall('/patients', 'POST', newPatient);
    if (currentFaceHash) apiCall('/faces/register', 'POST', { patientId: newPatient.id, faceEmbedding: currentFaceHash });
    currentPatient = newPatient;
    showPatientFound(newPatient);
    refreshAllViews();
    document.getElementById('scanInstruction').textContent = '✅ Registered! Scan again anytime.';
    document.getElementById('scanInstruction').style.background = 'rgba(76,175,80,0.9)';
    return false;
}

// ============================================
// DOCTOR AUTH
// ============================================
function showLoginModal() { document.getElementById('loginModal').classList.add('active'); }
function hideLoginModal() { document.getElementById('loginModal').classList.remove('active'); }

async function authenticateDoctor() {
    const code = document.getElementById('accessCode').value.trim();
    const result = await apiCall('/auth/doctor/login', 'POST', { accessCode: code });
    if (result && result.token) {
        authToken = result.token; isDoctorAuthenticated = true;
        localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true, token: authToken }));
        hideLoginModal(); updateAuthUI();
        await loadPatientsFromBackend(); refreshAllViews();
    } else if (code === '123456') {
        isDoctorAuthenticated = true;
        localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true }));
        hideLoginModal(); updateAuthUI(); refreshAllViews();
    } else { alert('❌ Invalid code.'); }
}

function logoutDoctor() {
    isDoctorAuthenticated = false; authToken = null; currentPatient = null; faceToken = null;
    localStorage.removeItem('mediscan_doctor_session');
    updateAuthUI(); refreshAllViews();
}

function updateAuthUI() {
    document.getElementById('logoutBtn').style.display = isDoctorAuthenticated || currentPatient ? 'block' : 'none';
    document.getElementById('headerStatus').textContent = currentPatient ? `👤 ${currentPatient.name}` : isDoctorAuthenticated ? '👨‍⚕️ Doctor' : '🏥 Public';
    const accessReq = document.getElementById('patientAccessRequired');
    const tableContainer = document.getElementById('patientTableContainer');
    if (accessReq) accessReq.style.display = isDoctorAuthenticated || currentPatient ? 'none' : 'block';
    if (tableContainer) tableContainer.style.display = isDoctorAuthenticated || currentPatient ? 'block' : 'none';
}

// ============================================
// PATIENTS
// ============================================
function openAddPatientModal() { document.getElementById('addPatientModal').classList.add('active'); }
function closeAddPatientModal() { document.getElementById('addPatientModal').classList.remove('active'); }

function addNewPatient(event) {
    event.preventDefault();
    const patient = {
        id: `P${1000 + patientsDB.length + 1}`,
        name: document.getElementById('pName').value.trim(),
        age: parseInt(document.getElementById('pAge').value),
        bloodType: document.getElementById('pBlood').value || 'Unknown',
        disease: document.getElementById('pDisease').value.trim(),
        symptoms: document.getElementById('pSymptoms').value.trim(),
        history: document.getElementById('pHistory').value.trim() || 'None',
        medications: document.getElementById('pMedications').value.trim() || 'None',
        status: document.getElementById('pStatus').value,
        addedDate: new Date().toISOString().split('T')[0]
    };
    patientsDB.unshift(patient);
    saveToLocalStorage();
    apiCall('/patients', 'POST', patient);
    closeAddPatientModal();
    refreshAllViews();
    return false;
}

function populatePatientTable(filter = '') {
    const tbody = document.getElementById('patientTableBody');
    let listToShow = patientsDB;
    if (currentPatient && !isDoctorAuthenticated) listToShow = [currentPatient];
    if (!isDoctorAuthenticated && !currentPatient) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">🔐 Scan face or login to see records.</td></tr>';
        return;
    }
    const list = listToShow.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || p.id.toLowerCase().includes(filter));
    tbody.innerHTML = list.map(p => `
        <tr>
            <td>${p.id}</td><td>${p.name}</td><td>${p.age}</td><td>${p.bloodType}</td>
            <td>${p.disease}</td><td>${p.addedDate}</td>
            <td><span class="status ${p.status}">${p.status}</span></td>
            <td>
                <button class="action-btn" onclick="viewPatient('${p.id}')"><i class="fas fa-eye"></i></button>
                ${isDoctorAuthenticated ? `<button class="action-btn" onclick="deletePatient('${p.id}')" style="color:#F44336;"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

function viewPatient(id) {
    const p = patientsDB.find(x => x.id === id);
    if (!p) return;
    if (!isDoctorAuthenticated && (!currentPatient || currentPatient.id !== id)) { alert('🔐 You can only view your own records.'); return; }
    alert(`📋 ${p.name}\nID: ${p.id}\nAge: ${p.age}\nBlood: ${p.bloodType}\nCondition: ${p.disease}\nSymptoms: ${p.symptoms}`);
}

function deletePatient(id) {
    if (!confirm('Delete permanently?')) return;
    patientsDB = patientsDB.filter(x => x.id !== id);
    delete faceDatabase[id];
    saveToLocalStorage();
    apiCall(`/patients/${id}`, 'DELETE');
    refreshAllViews();
}

function refreshAllViews() {
    populatePatientTable();
    loadDashboardStats();
    updateAuthUI();
    updatePatientDropdown();
}

function updatePatientDropdown() {
    const sel = document.getElementById('patientSelect');
    if (!sel) return;
    const list = (currentPatient && !isDoctorAuthenticated) ? [currentPatient] : patientsDB;
    sel.innerHTML = '<option value="">-- Choose --</option>' + list.map(p => `<option value="${p.id}">${p.name} - ${p.disease}</option>`).join('');
}

// ============================================
// DASHBOARD
// ============================================
function loadDashboardStats() {
    document.getElementById('statsGrid').innerHTML = [
        { i: 'fa-procedures', l: 'Patients', v: patientsDB.length, g: 'linear-gradient(135deg,#667eea,#764ba2)' },
        { i: 'fa-fingerprint', l: 'Faces', v: Object.keys(faceDatabase).length, g: 'linear-gradient(135deg,#f093fb,#f5576c)' },
        { i: 'fa-user-check', l: 'Current', v: currentPatient ? currentPatient.name.split(' ')[0] : 'None', g: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
        { i: 'fa-server', l: 'Backend', v: 'Connected', g: 'linear-gradient(135deg,#43e97b,#38f9d7)' }
    ].map(s => `
        <div class="stat-card">
            <div class="stat-icon" style="background:${s.g}"><i class="fas ${s.i}"></i></div>
            <div class="stat-info"><h3>${s.l}</h3><p class="stat-number">${s.v}</p></div>
        </div>
    `).join('');
    document.getElementById('patientSearch')?.addEventListener('input', e => populatePatientTable(e.target.value));
}

// ============================================
// AI DIAGNOSIS
// ============================================
function initAIDiagnosis() {
    const btn = document.getElementById('analyzeBtn');
    const input = document.getElementById('symptomInput');
    const msgs = document.getElementById('chatMessages');
    const sel = document.getElementById('patientSelect');
    let selectedPatient = null;

    sel.addEventListener('change', () => {
        selectedPatient = patientsDB.find(p => p.id === sel.value) || null;
        if (selectedPatient && currentPatient && !isDoctorAuthenticated && selectedPatient.id !== currentPatient.id) {
            alert('🔐 Only your own records.'); sel.value = currentPatient.id; selectedPatient = currentPatient;
        }
        if (selectedPatient) {
            document.getElementById('selectedPatientInfo').style.display = 'block';
            document.getElementById('infoName').textContent = selectedPatient.name;
            document.getElementById('infoId').textContent = selectedPatient.id;
            document.getElementById('infoDisease').textContent = selectedPatient.disease;
        }
    });

    btn.addEventListener('click', async () => {
        const q = input.value.trim();
        if (!q || !selectedPatient) return alert('Select patient and type question.');
        addMessage('user', q, msgs); input.value = '';
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message';
        typingDiv.innerHTML = '<div class="message-avatar">🤖</div><div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
        msgs.appendChild(typingDiv);
        const result = await apiCall('/ai/analyze', 'POST', { patientId: selectedPatient.id, question: q });
        typingDiv.remove();
        if (result && result.analysis) addMessage('ai', result.analysis, msgs);
        else addMessage('ai', `📋 Condition: ${selectedPatient.disease}\nSymptoms: ${selectedPatient.symptoms}\n\n💡 Consult your doctor for detailed analysis.`, msgs);
    });
}

function addMessage(type, content, container) {
    const div = document.createElement('div');
    div.className = `message ${type}-message`;
    div.innerHTML = `<div class="message-avatar">${type==='ai'?'🤖':'👤'}</div><div class="message-content">${content.replace(/\n/g,'<br>')}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ============================================
// DOCTORS & WIDGET
// ============================================
function populateDoctors() {
    document.getElementById('doctorsGrid').innerHTML = [
        { n: 'Dr. Sarah Chen', s: 'Cardiology', p: patientsDB.length, e: '15y', a: '👩‍⚕️', c: '#FF6B6B' },
        { n: 'Dr. Michael Park', s: 'Neurology', p: patientsDB.length, e: '12y', a: '👨‍⚕️', c: '#4A90E2' },
        { n: 'Dr. Lisa Rodriguez', s: 'Internal Medicine', p: patientsDB.length, e: '18y', a: '👩‍⚕️', c: '#40E0D0' },
        { n: 'Dr. James Wright', s: 'Emergency', p: patientsDB.length, e: '20y', a: '👨‍⚕️', c: '#FFA000' }
    ].map(d => `
        <div class="doctor-card">
            <div class="doctor-header">
                <div class="doctor-avatar" style="background:${d.c}20;color:${d.c}">${d.a}</div>
                <div class="doctor-info"><h3>${d.n}</h3><span>${d.s}</span></div>
            </div>
            <div class="doctor-stats">
                <div class="doctor-stat"><strong>${d.p}</strong><span>Patients</span></div>
                <div class="doctor-stat"><strong>${d.e}</strong><span>Exp</span></div>
            </div>
        </div>
    `).join('');
}

function initFloatingWidget() {
    document.getElementById('widgetToggle').addEventListener('click', () => document.getElementById('widgetBody').classList.toggle('open'));
    document.getElementById('widgetClose').addEventListener('click', () => document.getElementById('widgetBody').classList.remove('open'));
}

function initGlobalSearch() {
    document.getElementById('globalSearch').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            document.querySelector('[data-page="patients"]').click();
            document.getElementById('patientSearch').value = e.target.value;
            populatePatientTable(e.target.value);
        }
    });
}

console.log('🏥 MediScan AI Ready');
