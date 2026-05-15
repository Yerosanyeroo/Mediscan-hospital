// ============================================
// MEDISCAN AI - BACKEND CONNECTED + OFFLINE FALLBACK
// ============================================

// 🔗 Your Render Backend URL
const API_BASE_URL = 'https://mediscan-api-93wl.onrender.com';

let isDoctorAuthenticated = false;
let currentPatient = null;
let patientsDB = [];
let faceDatabase = {};
let videoStream = null;
let currentFaceHash = null;
let backendAvailable = false;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MediScan AI Starting...');
    console.log('🔗 API:', API_BASE_URL);
    
    try {
        // Check if backend is available
        await checkBackendConnection();
        
        // Load data from backend first, fallback to localStorage
        if (backendAvailable) {
            await loadPatientsFromBackend();
        } else {
            loadFromLocalStorage();
            console.log('ℹ️ Using local storage (backend not available)');
        }
        
        // Hide loading screen
        setTimeout(() => {
            const loader = document.getElementById('loadingScreen');
            if (loader) loader.classList.add('hidden');
        }, 1500);
        
        // Initialize everything
        initNavigation();
        initFaceScan();
        initAIDiagnosis();
        initFloatingWidget();
        refreshAllViews();
        populateDoctors();
        initGlobalSearch();
        
        // Setup buttons
        const addBtn = document.getElementById('addPatientBtn');
        if (addBtn) addBtn.addEventListener('click', openAddPatientModal);
        
        // Check doctor session
        const session = localStorage.getItem('mediscan_doctor_session');
        if (session) {
            try {
                const data = JSON.parse(session);
                isDoctorAuthenticated = data.authenticated || false;
            } catch(e) {}
        }
        updateAuthUI();
        
        console.log('✅ MediScan AI Ready');
        console.log('🔗 Backend:', backendAvailable ? 'Connected' : 'Offline (using local storage)');
    } catch(error) {
        console.error('❌ Init Error:', error);
        document.getElementById('loadingScreen')?.classList.add('hidden');
    }
});

// ============================================
// BACKEND CONNECTION CHECK
// ============================================
async function checkBackendConnection() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const res = await fetch(`${API_BASE_URL}/health`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (res.ok) {
            backendAvailable = true;
            if (dot) dot.className = 'status-dot online';
            if (text) text.textContent = 'Backend Connected';
            console.log('✅ Backend is online');
        } else {
            backendAvailable = false;
            if (dot) dot.className = 'status-dot offline';
            if (text) text.textContent = 'Backend Error';
        }
    } catch(e) {
        backendAvailable = false;
        if (dot) dot.className = 'status-dot offline';
        if (text) text.textContent = 'Local Mode';
        console.log('⚠️ Backend not reachable, using local storage');
    }
}

// ============================================
// LOAD FROM BACKEND
// ============================================
async function loadPatientsFromBackend() {
    try {
        const res = await fetch(`${API_BASE_URL}/patients`);
        if (res.ok) {
            const data = await res.json();
            if (data.patients && data.patients.length > 0) {
                patientsDB = data.patients;
                console.log('📂 Loaded', patientsDB.length, 'patients from backend');
                
                // Also load faces from backend
                for (const patient of patientsDB) {
                    if (patient.faceEmbedding) {
                        faceDatabase[patient.id] = patient.faceEmbedding;
                    }
                }
                console.log('👤 Loaded', Object.keys(faceDatabase).length, 'face profiles');
            }
        }
    } catch(e) {
        console.log('⚠️ Could not load from backend, using local storage');
        loadFromLocalStorage();
    }
}

// ============================================
// SAVE TO BACKEND
// ============================================
async function savePatientToBackend(patient) {
    if (!backendAvailable) return false;
    
    try {
        const res = await fetch(`${API_BASE_URL}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patient)
        });
        
        if (res.ok) {
            console.log('✅ Patient saved to backend:', patient.name);
            return true;
        }
        return false;
    } catch(e) {
        console.log('⚠️ Could not save to backend, saved locally');
        return false;
    }
}

async function saveFaceToBackend(patientId, faceEmbedding) {
    if (!backendAvailable) return false;
    
    try {
        const res = await fetch(`${API_BASE_URL}/faces/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, faceEmbedding })
        });
        
        if (res.ok) {
            console.log('✅ Face saved to backend for:', patientId);
            return true;
        }
        return false;
    } catch(e) {
        console.log('⚠️ Could not save face to backend');
        return false;
    }
}

async function scanFaceOnBackend(faceEmbedding) {
    if (!backendAvailable) return null;
    
    try {
        const res = await fetch(`${API_BASE_URL}/faces/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faceEmbedding })
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.found) {
                console.log('✅ Face matched on backend:', data.patient.name);
                return data.patient;
            }
        }
        return null;
    } catch(e) {
        console.log('⚠️ Backend face scan failed, using local');
        return null;
    }
}

async function deletePatientFromBackend(id) {
    if (!backendAvailable) return false;
    
    try {
        const res = await fetch(`${API_BASE_URL}/patients/${id}`, {
            method: 'DELETE'
        });
        return res.ok;
    } catch(e) {
        return false;
    }
}

async function getAIAnalysis(patientId, question) {
    if (!backendAvailable) return null;
    
    try {
        const res = await fetch(`${API_BASE_URL}/ai/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, question })
        });
        
        if (res.ok) {
            const data = await res.json();
            return data.analysis;
        }
        return null;
    } catch(e) {
        return null;
    }
}

// ============================================
// LOCAL STORAGE (Always works as backup)
// ============================================
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('mediscan_patients');
        if (saved) patientsDB = JSON.parse(saved);
        const faces = localStorage.getItem('mediscan_faces');
        if (faces) faceDatabase = JSON.parse(faces);
        console.log('📂 Local:', patientsDB.length, 'patients,', Object.keys(faceDatabase).length, 'faces');
    } catch(e) {
        patientsDB = [];
        faceDatabase = {};
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('mediscan_patients', JSON.stringify(patientsDB));
        localStorage.setItem('mediscan_faces', JSON.stringify(faceDatabase));
    } catch(e) {}
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
            
            const page = document.getElementById(`${pageName}-page`);
            if (page) page.classList.add('active');
            
            if (pageName === 'patients') {
                updateAuthUI();
                populatePatientTable();
            }
        });
    });
}

// ============================================
// FACE SCAN - TRIES BACKEND FIRST, FALLS BACK TO LOCAL
// ============================================
function initFaceScan() {
    const startBtn = document.getElementById('startScanBtn');
    const captureBtn = document.getElementById('captureBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const video = document.getElementById('videoFeed');
    const overlay = document.getElementById('scanOverlay');
    const instruction = document.getElementById('scanInstruction');
    
    if (!startBtn) return;

    startBtn.addEventListener('click', async () => {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
            });
            if (video) {
                video.srcObject = videoStream;
                video.style.display = 'block';
            }
            if (overlay) overlay.style.display = 'block';
            if (captureBtn) captureBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;
            startBtn.disabled = true;
            if (instruction) {
                instruction.textContent = 'Position face in frame and click "Scan & Check-In"';
                instruction.style.background = 'rgba(76,175,80,0.9)';
            }
        } catch(e) {
            if (instruction) {
                instruction.textContent = '⚠️ Camera denied. Allow camera permissions.';
                instruction.style.background = 'rgba(244,67,54,0.9)';
            }
        }
    });

    captureBtn?.addEventListener('click', async () => {
        if (!videoStream) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        const faceData = ctx.getImageData(195, 90, 250, 300);
        currentFaceHash = generateHash(faceData);
        
        if (instruction) {
            instruction.textContent = '🔍 Scanning face...';
            instruction.style.background = 'rgba(33,150,243,0.9)';
        }
        captureBtn.disabled = true;
        
        // Try backend first
        let match = null;
        if (backendAvailable) {
            match = await scanFaceOnBackend(currentFaceHash);
        }
        
        // Fallback to local
        if (!match) {
            match = findLocalFaceMatch(currentFaceHash);
        }
        
        setTimeout(() => {
            if (match) {
                currentPatient = match;
                showPatientFound(match);
                if (instruction) {
                    instruction.textContent = '✅ Welcome back, ' + match.name + '!';
                    instruction.style.background = 'rgba(76,175,80,0.9)';
                }
            } else {
                currentPatient = null;
                showRegistrationForm();
                if (instruction) {
                    instruction.textContent = '🆕 New face! Please register below.';
                    instruction.style.background = 'rgba(255,152,0,0.9)';
                }
            }
            
            captureBtn.disabled = false;
            updateAuthUI();
        }, 1500);
    });

    stopBtn?.addEventListener('click', () => {
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        if (video) video.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        if (startBtn) startBtn.disabled = false;
        if (captureBtn) captureBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        if (instruction) {
            instruction.textContent = 'Click "Start Face Scan" to begin';
            instruction.style.background = 'rgba(0,0,0,0.7)';
        }
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
    document.getElementById('patientFoundPanel')?.classList.remove('active');
    document.getElementById('registrationPanel')?.classList.add('active');
}

function showPatientFound(patient) {
    document.getElementById('welcomePanel').style.display = 'none';
    document.getElementById('registrationPanel')?.classList.remove('active');
    document.getElementById('patientFoundPanel')?.classList.add('active');
    
    document.getElementById('foundPatientName').textContent = patient.name || '--';
    document.getElementById('foundPatientId').textContent = patient.id || '--';
    document.getElementById('foundPatientAge').textContent = patient.age || '--';
    document.getElementById('foundPatientBlood').textContent = patient.bloodType || '--';
    document.getElementById('foundPatientDisease').textContent = patient.disease || '--';
    document.getElementById('foundPatientDate').textContent = patient.addedDate || '--';
}

function resetFaceScan() {
    document.getElementById('welcomePanel').style.display = 'block';
    document.getElementById('registrationPanel')?.classList.remove('active');
    document.getElementById('patientFoundPanel')?.classList.remove('active');
    document.getElementById('faceRegistrationForm')?.reset();
    currentPatient = null;
    updateAuthUI();
}

async function registerFacePatient(event) {
    event.preventDefault();
    
    const newPatient = {
        id: `P${1000 + patientsDB.length + 1}`,
        name: document.getElementById('faceRegName')?.value?.trim() || 'Unknown',
        age: parseInt(document.getElementById('faceRegAge')?.value) || 0,
        bloodType: document.getElementById('faceRegBlood')?.value || 'Unknown',
        disease: document.getElementById('faceRegDisease')?.value?.trim() || 'Not specified',
        symptoms: document.getElementById('faceRegSymptoms')?.value?.trim() || 'Not specified',
        history: 'Registered via Face Scan',
        medications: 'None',
        status: 'active',
        addedDate: new Date().toISOString().split('T')[0]
    };
    
    // Save locally
    patientsDB.unshift(newPatient);
    if (currentFaceHash) faceDatabase[newPatient.id] = currentFaceHash;
    saveToLocalStorage();
    
    // Save to backend
    await savePatientToBackend(newPatient);
    if (currentFaceHash) await saveFaceToBackend(newPatient.id, currentFaceHash);
    
    currentPatient = newPatient;
    showPatientFound(newPatient);
    refreshAllViews();
    
    const instruction = document.getElementById('scanInstruction');
    if (instruction) {
        instruction.textContent = '✅ Registered! ' + (backendAvailable ? 'Saved to server.' : 'Saved locally.');
        instruction.style.background = 'rgba(76,175,80,0.9)';
    }
    return false;
}

// ============================================
// DOCTOR AUTH
// ============================================
function showLoginModal() { document.getElementById('loginModal')?.classList.add('active'); }
function hideLoginModal() { document.getElementById('loginModal')?.classList.remove('active'); }

async function authenticateDoctor() {
    const code = document.getElementById('accessCode')?.value?.trim();
    
    // Try backend auth first
    if (backendAvailable) {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessCode: code })
            });
            if (res.ok) {
                const data = await res.json();
                isDoctorAuthenticated = true;
                localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true, token: data.token }));
                hideLoginModal();
                updateAuthUI();
                refreshAllViews();
                return;
            }
        } catch(e) {}
    }
    
    // Fallback local auth
    if (code === '123456') {
        isDoctorAuthenticated = true;
        localStorage.setItem('mediscan_doctor_session', JSON.stringify({ authenticated: true }));
        hideLoginModal();
        updateAuthUI();
        refreshAllViews();
    } else {
        alert('❌ Invalid code. Default code is: 123456');
    }
}

function logoutDoctor() {
    isDoctorAuthenticated = false;
    currentPatient = null;
    localStorage.removeItem('mediscan_doctor_session');
    updateAuthUI();
    refreshAllViews();
}

function updateAuthUI() {
    document.getElementById('logoutBtn').style.display = (isDoctorAuthenticated || currentPatient) ? 'block' : 'none';
    document.getElementById('headerStatus').textContent = currentPatient ? `👤 ${currentPatient.name}` : isDoctorAuthenticated ? '👨‍⚕️ Doctor' : '🏥 Public';
    
    const accessReq = document.getElementById('patientAccessRequired');
    const tableContainer = document.getElementById('patientTableContainer');
    if (accessReq) accessReq.style.display = (isDoctorAuthenticated || currentPatient) ? 'none' : 'block';
    if (tableContainer) tableContainer.style.display = (isDoctorAuthenticated || currentPatient) ? 'block' : 'none';
}

// ============================================
// PATIENTS
// ============================================
function openAddPatientModal() { document.getElementById('addPatientModal')?.classList.add('active'); }
function closeAddPatientModal() { document.getElementById('addPatientModal')?.classList.remove('active'); }

async function addNewPatient(event) {
    event.preventDefault();
    
    const patient = {
        id: `P${1000 + patientsDB.length + 1}`,
        name: document.getElementById('pName')?.value?.trim() || 'Unknown',
        age: parseInt(document.getElementById('pAge')?.value) || 0,
        bloodType: document.getElementById('pBlood')?.value || 'Unknown',
        disease: document.getElementById('pDisease')?.value?.trim() || 'Not specified',
        symptoms: document.getElementById('pSymptoms')?.value?.trim() || 'Not specified',
        history: document.getElementById('pHistory')?.value?.trim() || 'None',
        medications: document.getElementById('pMedications')?.value?.trim() || 'None',
        status: document.getElementById('pStatus')?.value || 'active',
        addedDate: new Date().toISOString().split('T')[0]
    };
    
    patientsDB.unshift(patient);
    saveToLocalStorage();
    await savePatientToBackend(patient);
    closeAddPatientModal();
    refreshAllViews();
    return false;
}

function populatePatientTable(filter = '') {
    const tbody = document.getElementById('patientTableBody');
    if (!tbody) return;
    
    let listToShow = patientsDB;
    if (currentPatient && !isDoctorAuthenticated) listToShow = [currentPatient];
    
    if (!isDoctorAuthenticated && !currentPatient) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">🔐 Scan face or login to see records.</td></tr>';
        return;
    }
    
    if (listToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No patients yet. Use Face Scan to register!</td></tr>';
        return;
    }
    
    const list = listToShow.filter(p => 
        (p.name && p.name.toLowerCase().includes(filter.toLowerCase())) || 
        (p.id && p.id.toLowerCase().includes(filter))
    );
    
    tbody.innerHTML = list.map(p => `
        <tr>
            <td>${p.id || '--'}</td><td>${p.name || '--'}</td><td>${p.age || '--'}</td>
            <td>${p.bloodType || '--'}</td><td>${p.disease || '--'}</td><td>${p.addedDate || '--'}</td>
            <td><span class="status ${p.status || 'active'}">${p.status || 'active'}</span></td>
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
    if (!isDoctorAuthenticated && (!currentPatient || currentPatient.id !== id)) {
        alert('🔐 You can only view your own records.'); return;
    }
    alert(`📋 ${p.name}\n\nID: ${p.id}\nAge: ${p.age}\nBlood: ${p.bloodType}\nCondition: ${p.disease}\nSymptoms: ${p.symptoms}\nHistory: ${p.history}\nMedications: ${p.medications}`);
}

async function deletePatient(id) {
    if (!confirm('Delete this patient permanently?')) return;
    patientsDB = patientsDB.filter(x => x.id !== id);
    delete faceDatabase[id];
    saveToLocalStorage();
    await deletePatientFromBackend(id);
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
    sel.innerHTML = '<option value="">-- Choose --</option>' + list.map(p => `<option value="${p.id}">${p.name || '?'} - ${p.disease || 'N/A'}</option>`).join('');
}

// ============================================
// DASHBOARD
// ============================================
function loadDashboardStats() {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    
    grid.innerHTML = [
        { i: 'fa-procedures', l: 'Patients', v: patientsDB.length, g: 'linear-gradient(135deg,#667eea,#764ba2)' },
        { i: 'fa-fingerprint', l: 'Faces', v: Object.keys(faceDatabase).length, g: 'linear-gradient(135deg,#f093fb,#f5576c)' },
        { i: 'fa-server', l: 'Backend', v: backendAvailable ? 'Online' : 'Local', g: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
        { i: 'fa-user-check', l: 'User', v: currentPatient ? currentPatient.name.split(' ')[0] : 'None', g: 'linear-gradient(135deg,#43e97b,#38f9d7)' }
    ].map(s => `
        <div class="stat-card">
            <div class="stat-icon" style="background:${s.g}"><i class="fas ${s.i}"></i></div>
            <div class="stat-info"><h3>${s.l}</h3><p class="stat-number">${s.v}</p></div>
        </div>
    `).join('');
    
    const recent = document.getElementById('recentPatients');
    if (recent) {
        const list = patientsDB.slice(0, 5);
        recent.innerHTML = list.length ? list.map(p => `
            <div class="patient-row">
                <div class="patient-avatar">${(p.name||'?').split(' ').map(n=>n[0]).join('')}</div>
                <div class="patient-details"><strong>${p.name||'Unknown'}</strong><span>${p.disease||'N/A'} • ${p.addedDate||'N/A'}</span></div>
                <span class="status ${p.status||'active'}">${p.status||'active'}</span>
            </div>
        `).join('') : '<p class="empty-state">No patients yet. Use Face Scan to register!</p>';
    }
    
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

    sel?.addEventListener('change', () => {
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

    btn?.addEventListener('click', async () => {
        const q = input?.value?.trim();
        if (!q || !selectedPatient) { alert('Select patient and type question.'); return; }
        
        addMessage('user', q, msgs);
        if (input) input.value = '';
        
        // Show typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message';
        typingDiv.innerHTML = '<div class="message-avatar">🤖</div><div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
        msgs?.appendChild(typingDiv);
        
        // Try backend AI first
        let response = null;
        if (backendAvailable) {
            response = await getAIAnalysis(selectedPatient.id, q);
        }
        
        typingDiv.remove();
        
        // Fallback response
        if (!response) {
            response = `📋 **Analysis for ${selectedPatient.name}**\n\n🔍 **Condition:** ${selectedPatient.disease}\n🤒 **Symptoms:** ${selectedPatient.symptoms}\n📋 **History:** ${selectedPatient.history}\n💊 **Medications:** ${selectedPatient.medications}\n\n💡 **Recommendations:**\n1. Monitor symptoms regularly\n2. Take prescribed medications\n3. Schedule follow-up\n4. Contact doctor if symptoms worsen\n\n⚠️ This is AI-assisted analysis. Consult your doctor.`;
        }
        
        addMessage('ai', response, msgs);
    });
}

function addMessage(type, content, container) {
    if (!container) return;
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
    const grid = document.getElementById('doctorsGrid');
    if (!grid) return;
    grid.innerHTML = [
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
    document.getElementById('widgetToggle')?.addEventListener('click', () => {
        document.getElementById('widgetBody')?.classList.toggle('open');
    });
    document.getElementById('widgetClose')?.addEventListener('click', () => {
        document.getElementById('widgetBody')?.classList.remove('open');
    });
    document.getElementById('widgetSend')?.addEventListener('click', () => {
        const input = document.getElementById('widgetInput');
        const msg = input?.value?.trim();
        if (msg) {
            addMessage('user', msg, document.getElementById('widgetMessages'));
            if (input) input.value = '';
            setTimeout(() => {
                addMessage('ai', 'For detailed patient analysis, please use the AI Diagnosis page.', document.getElementById('widgetMessages'));
            }, 500);
        }
    });
}

function initGlobalSearch() {
    document.getElementById('globalSearch')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            document.querySelector('[data-page="patients"]')?.click();
            document.getElementById('patientSearch').value = e.target.value;
            populatePatientTable(e.target.value);
        }
    });
}

// Modal close on outside click
document.getElementById('loginModal')?.addEventListener('click', function(e) { if (e.target === this) hideLoginModal(); });
document.getElementById('addPatientModal')?.addEventListener('click', function(e) { if (e.target === this) closeAddPatientModal(); });

console.log('✅ MediScan AI Ready - Backend: ' + (backendAvailable ? 'Connected' : 'Offline'));
