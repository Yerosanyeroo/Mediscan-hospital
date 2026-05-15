// ============================================
// MEDISCAN AI - CONNECTED TO BACKEND
// Saves everything to MongoDB via Render API
// ============================================

const API_BASE_URL = 'https://mediscan-api.onrender.com/api';

let isDoctorAuthenticated = false;
let currentPatient = null;
let patientsDB = [];
let faceDatabase = {};
let videoStream = null;
let currentFaceHash = null;
let authToken = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MediScan AI Starting...');
    console.log('🔗 API:', API_BASE_URL);
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1500);
    
    // Load patients from backend
    await loadPatientsFromServer();
    
    // Initialize all features
    initNavigation();
    initFaceScan();
    initAIDiagnosis();
    initFloatingWidget();
    refreshAllViews();
    populateDoctors();
    initGlobalSearch();
    
    // Setup buttons
    document.getElementById('addPatientBtn').addEventListener('click', openAddPatientModal);
    
    // Check for saved doctor session
    const session = localStorage.getItem('mediscan_doctor_session');
    if (session) {
        try {
            const data = JSON.parse(session);
            if (data.authenticated) {
                isDoctorAuthenticated = true;
                authToken = data.token || null;
                await loadPatientsFromServer();
            }
        } catch(e) {}
    }
    
    updateAuthUI();
    checkBackendHealth();
    console.log('✅ MediScan AI Ready');
});

// ============================================
// BACKEND API CALLS
// ============================================
async function checkBackendHealth() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
            dot.className = 'status-dot online';
            text.textContent = 'Server Connected';
            console.log('✅ Backend connected');
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Server Error';
        }
    } catch(e) {
        dot.className = 'status-dot offline';
        text.textContent = 'Server Offline';
        console.warn('⚠️ Backend not reachable');
    }
}

async function loadPatientsFromServer() {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        
        const res = await fetch(`${API_BASE_URL}/patients`, { headers });
        if (res.ok) {
            const data = await res.json();
            patientsDB = data.patients || [];
            console.log('📂 Loaded', patientsDB.length, 'patients from server');
        }
    } catch(e) {
        console.warn('⚠️ Could not load from server, using local fallback');
        loadFromLocalFallback();
    }
}

function loadFromLocalFallback() {
    try {
        const saved = localStorage.getItem('mediscan_patients_backup');
        if (saved) patientsDB = JSON.parse(saved);
        const faces = localStorage.getItem('mediscan_faces_backup');
        if (faces) faceDatabase = JSON.parse(faces);
    } catch(e) {}
}

function saveLocalBackup() {
    localStorage.setItem('mediscan_patients_backup', JSON.stringify(patientsDB));
    localStorage.setItem('mediscan_faces_backup', JSON.stringify(faceDatabase));
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
                return;
            }
            
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`${pageName}-page`).classList.add('active');
            
            if (pageName === 'patients') {
                updateAuthUI();
                populatePatientTable();
            }
        });
    });
}

// ============================================
// FACE SCAN
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
            instruction.textContent = '⚠️ Camera denied. Please allow camera permissions.';
            instruction.style.background = 'rgba(244,67,54,0.9)';
        }
    });

    captureBtn.addEventListener('click', async () => {
        if (!videoStream) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        const faceData = ctx.getImageData(195, 90, 250, 300);
        currentFaceHash = generateHash(faceData);
        
        instruction.textContent = '🔍 Scanning face on server...';
        instruction.style.background = 'rgba(33,150,243,0.9)';
        captureBtn.disabled = true;
        
        // Try server first
        try {
            const res = await fetch(`${API_BASE_URL}/faces/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faceEmbedding: currentFaceHash })
            });
            
            if (res.ok) {
                const result = await res.json();
                if (result.found && result.patient) {
                    currentPatient = result.patient;
                    showPatientFound(currentPatient);
                    instruction.textContent = '✅ Welcome back, ' + currentPatient.name + '!';
                    instruction.style.background = 'rgba(76,175,80,0.9)';
                    captureBtn.disabled = false;
                    updateAuthUI();
                    return;
                }
            }
        } catch(e) {
            console.log('Server scan failed, trying local match...');
        }
        
        // Fallback to local
        const match = findLocalFaceMatch(currentFaceHash);
        if (match) {
            currentPatient = match;
            showPatientFound(match);
            instruction.textContent = '✅ Welcome back, ' + match.name + '! (Local)';
            instruction.style.background = 'rgba(76,175,80,0.9)';
        } else {
            currentPatient = null;
            showRegistrationForm();
            instruction.textContent = '🆕 New face! Register below.';
            instruction.style.background = 'rgba(255,152,0,0.9)';
        }
        
        captureBtn.disabled = false;
        updateAuthUI();
    });

    stopBtn.addEventListener('click', () => {
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        video.style.display = 'none';
        overlay.style.display = 'none';
        startBtn.disabled = false;
        captureBtn.disabled = true;
        stopBtn.disabled = true;
        instruction.textContent = 'Click "Start Face Scan" to begin';
        instruction.style.background = 'rgba(0,0,0,0.7)';
        resetFaceScan();
    });
}

function generateHash(imageData) {
    const data = imageData.data;
    const hashParts = [];
    const width = imageData.width;
    const regions = [
        { x: 0, y: 0, w: 83, h: 100 }, { x: 83, y: 0, w: 84, h: 100 }, { x: 167, y: 0, w: 83, h: 100 },
        { x: 0, y: 100, w: 83, h: 100 }, { x: 83, y: 100, w: 84, h: 100 }, { x: 167, y: 100, w: 83, h: 100 },
        { x: 0, y: 200, w: 83, h: 100 }, { x: 83, y: 200, w: 84, h: 100 }, { x: 167, y: 200, w: 83, h: 100 }
    ];
    
    regions.forEach(region => {
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = region.y; y < region.y + region.h && y < imageData.height; y++) {
            for (let x = region.x; x < region.x + region.w && x < width; x++) {
                const idx = (y * width + x) * 4;
                r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++;
            }
        }
        if (count > 0) {
            hashParts.push(
                Math.floor(r/count).toString(16).padStart(2,'0'),
                Math.floor(g/count).toString(16).padStart(2,'0'),
                Math.floor(b/count).toString(16).padStart(2,'0')
            );
        }
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
    const len = Math.min(a.length, b.length);
    let diff = 0;
    for (let i = 0; i < len; i++) diff += Math.abs(parseInt(a[i]||0,16) - parseInt(b[i]||0,16));
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
    document.getElementById('foundPatientName').textContent = patient.name || '--';
    document.getElementById('foundPatientId').textContent = patient.id || '--';
    document.getElementById('foundPatientAge').textContent = patient.age || '--';
    document.getElementById('foundPatientBlood').textContent = patient.bloodType || '--';
    document.getElementById('foundPatientDisease').textContent = patient.disease || '--';
    document.getElementById('foundPatientDate').textContent = patient.addedDate || '--';
}

function resetFaceScan() {
    document.getElementById('welcomePanel').style.display = 'block';
    document.getElementById('registrationPanel').classList.remove('active');
    document.getElementById('patientFoundPanel').classList.remove('active');
    document.getElementById('faceRegistrationForm').reset();
    currentPatient = null;
    updateAuthUI();
}

async function registerFacePatient(event) {
    event.preventDefault();
    
    const newPatient = {
        name: document.getElementById('faceRegName').value.trim(),
        age: parseInt(document.getElementById('faceRegAge').value) || 0,
        bloodType: document.getElementById('faceRegBlood').value || 'Unknown',
        disease: document.getElementById('faceRegDisease').value.trim(),
        symptoms: document.getElementById('faceRegSymptoms').value.trim(),
        history: 'Registered via Face Scan',
        medications: 'None',
        status: 'active',
        addedDate: new Date().toISOString().split('T')[0]
    };
    
    // Save to server
    try {
        const res = await fetch(`${API_BASE_URL}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPatient)
        });
        
        if (res.ok) {
            const saved = await res.json();
            patientsDB.unshift(saved);
            
            // Register face on server
            if (currentFaceHash) {
                await fetch(`${API_BASE_URL}/faces/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patientId: saved.patientId || saved.id, faceEmbedding: currentFaceHash })
                });
                faceDatabase[saved.patientId || saved.id] = currentFaceHash;
            }
            
            saveLocalBackup();
            currentPatient = saved;
            showPatientFound(saved);
            refreshAllViews();
            
            document.getElementById('scanInstruction').textContent = '✅ Registered on server! Scan again anytime.';
            document.getElementById('scanInstruction').style.background = 'rgba(76,175,80,0.9)';
        } else {
            throw new Error('Server save failed');
        }
    } catch(e) {
        console.error('Server save failed:', e);
        // Fallback to local
        const localPatient = {
            ...newPatient,
            id: `P${1000 + patientsDB.length + 1}`
        };
        patientsDB.unshift(localPatient);
        if (currentFaceHash) faceDatabase[localPatient.id] = currentFaceHash;
        saveLocalBackup();
        currentPatient = localPatient;
        showPatientFound(localPatient);
        refreshAllViews();
        
        document.getElementById('scanInstruction').textContent = '⚠️ Saved locally (server unavailable).';
        document.getElementById('scanInstruction').style.background = 'rgba(255,152,0,0.9)';
    }
    
    return false;
}

// ============================================
// DOCTOR AUTH
// ============================================
function showLoginModal() { document.getElementById('loginModal').classList.add('active'); }
function hideLoginModal() { document.getElementById('loginModal').classList.remove('active'); }

async function authenticateDoctor() {
    const code = document.getElementById('accessCode').value.trim();
    
    try {
        const res = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessCode: code })
        });
        
        if (res.ok) {
            const data = await res.json();
            authToken = data.token;
            isDoctorAuthenticated = true;
            localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true, token: authToken }));
            hideLoginModal();
            await loadPatientsFromServer();
            updateAuthUI();
            refreshAllViews();
            return;
        }
    } catch(e) {
        console.log('Server auth failed, trying local...');
    }
    
    if (code === '123456') {
        isDoctorAuthenticated = true;
        localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true }));
        hideLoginModal();
        updateAuthUI();
        refreshAllViews();
    } else {
        alert('❌ Invalid code. Default: 123456');
    }
}

function logoutDoctor() {
    isDoctorAuthenticated = false;
    authToken = null;
    currentPatient = null;
    localStorage.removeItem('mediscan_doctor_session');
    updateAuthUI();
    refreshAllViews();
}

function updateAuthUI() {
    document.getElementById('logoutBtn').style.display = (isDoctorAuthenticated || currentPatient) ? 'block' : 'none';
    document.getElementById('headerStatus').textContent = currentPatient ? `👤 ${currentPatient.name}` : isDoctorAuthenticated ? '👨‍⚕️ Doctor' : '🏥 Public';
    document.getElementById('patientAccessRequired').style.display = (isDoctorAuthenticated || currentPatient) ? 'none' : 'block';
    document.getElementById('patientTableContainer').style.display = (isDoctorAuthenticated || currentPatient) ? 'block' : 'none';
}

// ============================================
// PATIENTS
// ============================================
function openAddPatientModal() { document.getElementById('addPatientModal').classList.add('active'); }
function closeAddPatientModal() { document.getElementById('addPatientModal').classList.remove('active'); }

async function addNewPatient(event) {
    event.preventDefault();
    
    const patient = {
        name: document.getElementById('pName').value.trim(),
        age: parseInt(document.getElementById('pAge').value) || 0,
        bloodType: document.getElementById('pBlood').value || 'Unknown',
        disease: document.getElementById('pDisease').value.trim(),
        symptoms: document.getElementById('pSymptoms').value.trim(),
        history: document.getElementById('pHistory').value.trim() || 'None',
        medications: document.getElementById('pMedications').value.trim() || 'None',
        status: document.getElementById('pStatus').value || 'active',
        addedDate: new Date().toISOString().split('T')[0]
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patient)
        });
        if (res.ok) {
            const saved = await res.json();
            patientsDB.unshift(saved);
        }
    } catch(e) {
        patient.id = `P${1000 + patientsDB.length + 1}`;
        patientsDB.unshift(patient);
    }
    
    saveLocalBackup();
    closeAddPatientModal();
    refreshAllViews();
    return false;
}

function populatePatientTable(filter = '') {
    const tbody = document.getElementById('patientTableBody');
    let list = patientsDB;
    
    if (currentPatient && !isDoctorAuthenticated) list = [currentPatient];
    if (!isDoctorAuthenticated && !currentPatient) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">🔐 Scan face or login to see records.</td></tr>';
        return;
    }
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No patients yet.</td></tr>';
        return;
    }
    
    const filtered = list.filter(p => 
        (p.name||'').toLowerCase().includes(filter.toLowerCase()) || 
        (p.id||'').toLowerCase().includes(filter)
    );
    
    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td>${p.patientId || p.id || '--'}</td>
            <td>${p.name || '--'}</td>
            <td>${p.age || '--'}</td>
            <td>${p.bloodType || '--'}</td>
            <td>${p.disease || '--'}</td>
            <td>${p.addedDate || '--'}</td>
            <td><span class="status ${p.status || 'active'}">${p.status || 'active'}</span></td>
            <td>
                <button class="action-btn" onclick="viewPatient('${p.patientId || p.id}')"><i class="fas fa-eye"></i></button>
                ${isDoctorAuthenticated ? `<button class="action-btn" onclick="deletePatient('${p.patientId || p.id}')" style="color:#F44336;"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

function viewPatient(id) {
    const p = patientsDB.find(x => (x.patientId || x.id) === id);
    if (!p) return;
    if (!isDoctorAuthenticated && (!currentPatient || (currentPatient.patientId || currentPatient.id) !== id)) {
        alert('🔐 You can only view your own records.');
        return;
    }
    alert(`📋 ${p.name}\n\nID: ${p.patientId || p.id}\nAge: ${p.age}\nBlood: ${p.bloodType}\nCondition: ${p.disease}\nSymptoms: ${p.symptoms}`);
}

async function deletePatient(id) {
    if (!confirm('Delete permanently?')) return;
    
    try {
        await fetch(`${API_BASE_URL}/patients/${id}`, { method: 'DELETE' });
    } catch(e) {}
    
    patientsDB = patientsDB.filter(x => (x.patientId || x.id) !== id);
    delete faceDatabase[id];
    saveLocalBackup();
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
    sel.innerHTML = '<option value="">-- Choose --</option>' + 
        list.map(p => `<option value="${p.patientId || p.id}">${p.name || 'Unknown'} - ${p.disease || 'N/A'}</option>`).join('');
}

// ============================================
// DASHBOARD
// ============================================
function loadDashboardStats() {
    document.getElementById('statsGrid').innerHTML = [
        { i: 'fa-procedures', l: 'Patients', v: patientsDB.length, g: 'linear-gradient(135deg,#667eea,#764ba2)' },
        { i: 'fa-fingerprint', l: 'Faces', v: Object.keys(faceDatabase).length, g: 'linear-gradient(135deg,#f093fb,#f5576c)' },
        { i: 'fa-server', l: 'Backend', v: 'Connected', g: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
        { i: 'fa-user-check', l: 'Current', v: currentPatient ? currentPatient.name.split(' ')[0] : 'None', g: 'linear-gradient(135deg,#43e97b,#38f9d7)' }
    ].map(s => `
        <div class="stat-card">
            <div class="stat-icon" style="background:${s.g}"><i class="fas ${s.i}"></i></div>
            <div class="stat-info"><h3>${s.l}</h3><p class="stat-number">${s.v}</p></div>
        </div>
    `).join('');
    
    document.getElementById('patientSearch').addEventListener('input', e => populatePatientTable(e.target.value));
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
        const id = sel.value;
        selectedPatient = patientsDB.find(p => (p.patientId || p.id) === id) || null;
        
        if (selectedPatient && currentPatient && !isDoctorAuthenticated && (selectedPatient.patientId || selectedPatient.id) !== (currentPatient.patientId || currentPatient.id)) {
            alert('🔐 Only your own records.');
            sel.value = currentPatient.patientId || currentPatient.id;
            selectedPatient = currentPatient;
        }
        
        if (selectedPatient) {
            document.getElementById('selectedPatientInfo').style.display = 'block';
            document.getElementById('infoName').textContent = selectedPatient.name;
            document.getElementById('infoId').textContent = selectedPatient.patientId || selectedPatient.id;
            document.getElementById('infoDisease').textContent = selectedPatient.disease;
        }
    });

    btn.addEventListener('click', async () => {
        const q = input.value.trim();
        if (!q || !selectedPatient) return alert('Select patient and type question.');
        
        addMessage('user', q, msgs);
        input.value = '';
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message';
        typingDiv.innerHTML = '<div class="message-avatar">🤖</div><div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
        msgs.appendChild(typingDiv);
        
        // Try server AI
        try {
            const res = await fetch(`${API_BASE_URL}/ai/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    patientId: selectedPatient.patientId || selectedPatient.id, 
                    question: q 
                })
            });
            
            typingDiv.remove();
            
            if (res.ok) {
                const data = await res.json();
                addMessage('ai', data.analysis || 'No analysis available', msgs);
                return;
            }
        } catch(e) {}
        
        typingDiv.remove();
        addMessage('ai', `📋 Analysis for ${selectedPatient.name}:\n\nCondition: ${selectedPatient.disease}\nSymptoms: ${selectedPatient.symptoms}\n\n💡 Consult your doctor for detailed AI analysis.`, msgs);
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
    document.getElementById('widgetToggle').addEventListener('click', () => {
        document.getElementById('widgetBody').classList.toggle('open');
    });
    document.getElementById('widgetClose').addEventListener('click', () => {
        document.getElementById('widgetBody').classList.remove('open');
    });
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

// Close modals on outside click
document.getElementById('loginModal').addEventListener('click', function(e) {
    if (e.target === this) hideLoginModal();
});
document.getElementById('addPatientModal').addEventListener('click', function(e) {
    if (e.target === this) closeAddPatientModal();
});

console.log('✅ MediScan AI Ready - Connected to Server');
