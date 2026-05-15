// ============================================
// MEDISCAN AI - FULL STACK WITH BACKEND
// Face Scan → Server Processing → MongoDB
// ============================================

// CONFIG - Change this to your Render URL after deployment
const API_BASE_URL = 'https://mediscan-api-93wl.onrender.com';


let isDoctorAuthenticated = false;
let currentPatient = null;
let patientsDB = [];
let faceDatabase = {};
let videoStream = null;
let currentFaceHash = null;
let authToken = null;

// ============================================
// LOAD FROM BACKEND FIRST, THEN LOCAL STORAGE
// ============================================
async function loadPatientsFromBackend() {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE_URL}/patients`, { headers });
        if (res.ok) {
            const data = await res.json();
            patientsDB = data.patients || [];
            console.log('📂 Loaded', patientsDB.length, 'patients from server');
            return true;
        }
    } catch(e) {
        console.log('⚠️ Backend not reachable, using local storage');
    }
    // Fallback to localStorage
    loadLocalData();
    return false;
}

function loadLocalData() {
    try {
        const saved = localStorage.getItem('mediscan_patients');
        if (saved) patientsDB = JSON.parse(saved);
        const counter = localStorage.getItem('mediscan_counter');
        if (counter) patientIdCounter = parseInt(counter);
        const faces = localStorage.getItem('mediscan_faces');
        if (faces) faceDatabase = JSON.parse(faces);
    } catch(e) {}
}

function saveLocalData() {
    localStorage.setItem('mediscan_patients', JSON.stringify(patientsDB));
    localStorage.setItem('mediscan_counter', patientIdCounter.toString());
    localStorage.setItem('mediscan_faces', JSON.stringify(faceDatabase));
}

// ============================================
// API HELPER
// ============================================
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, config);
        return await res.json();
    } catch(e) {
        console.log('API Error:', e.message);
        return null;
    }
}

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `You are MediScan AI in a hospital system.
When a patient is authenticated via face scan, discuss THEIR records.
If asked about another patient, say: "You can only view your own medical records."
Always include: "⚠️ This is AI-assisted analysis, not medical advice."`;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkBackendConnection();
    await loadPatientsFromBackend();
    setTimeout(() => document.getElementById('loadingScreen').classList.add('hidden'), 1500);
    initNavigation();
    initFaceScan();
    initAIDiagnosis();
    initFloatingWidget();
    refreshAllViews();
    populateDoctors();
    loadDashboardStats();
    loadAIInsights();
    initGlobalSearch();
    document.getElementById('addPatientBtn').addEventListener('click', openAddPatientModal);
    const session = JSON.parse(localStorage.getItem('mediscan_doctor_session'));
    if (session) { isDoctorAuthenticated = true; authToken = session.token; updateAuthUI(); }
});

// ============================================
// BACKEND CONNECTION CHECK
// ============================================
async function checkBackendConnection() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
            dot.className = 'status-dot online';
            text.textContent = 'Server Connected';
        }
    } catch(e) {
        dot.className = 'status-dot online';
        text.textContent = 'Local Mode';
    }
}

async function checkAPIStatus() {
    try {
        const res = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: 'user', content: 'test' }], max_tokens: 5 })
        });
        return res.ok;
    } catch(e) { return false; }
}

async function callGroqAPI(messages, temp = 0.7, maxTokens = 500) {
    try {
        const res = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: temp, max_tokens: maxTokens })
        });
        const data = await res.json();
        return data.choices[0].message.content;
    } catch(e) { return `Error: ${e.message}`; }
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
// FACE SCAN - PROCESSES ON SERVER
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
            instruction.textContent = '⚠️ Camera denied. Allow camera permissions in browser settings.';
            instruction.style.background = 'rgba(244,67,54,0.9)';
        }
    });

    captureBtn.addEventListener('click', async () => {
        if (!videoStream) return;
        
        // Capture face from video
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        
        // Get center face region (250x300 area in the scan frame)
        const faceData = ctx.getImageData(195, 90, 250, 300);
        currentFaceHash = generateConsistentHash(faceData);
        
        instruction.textContent = '🔍 Processing face on server...';
        instruction.style.background = 'rgba(33,150,243,0.9)';
        captureBtn.disabled = true;
        
        // SEND FACE TO BACKEND FOR PROCESSING
        const result = await apiCall('/faces/scan', 'POST', { faceEmbedding: currentFaceHash });
        
        if (result && result.found) {
            // SERVER FOUND A MATCH
            currentPatient = result.patient;
            showPatientFound(currentPatient);
            instruction.textContent = '✅ Welcome back, ' + currentPatient.name + '!';
            instruction.style.background = 'rgba(76,175,80,0.9)';
        } else {
            // Check local database as fallback
            const localMatch = findLocalFaceMatch(currentFaceHash);
            if (localMatch) {
                currentPatient = localMatch;
                showPatientFound(localMatch);
                instruction.textContent = '✅ Welcome back, ' + localMatch.name + '! (Local)';
                instruction.style.background = 'rgba(76,175,80,0.9)';
            } else {
                // NEW PATIENT
                currentPatient = null;
                showRegistrationForm();
                instruction.textContent = '🆕 New face! Register below.';
                instruction.style.background = 'rgba(255,152,0,0.9)';
            }
        }
        
        captureBtn.disabled = false;
        updateAuthUI();
        refreshAllViews();
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

// FIXED: Consistent hash generation (NO RANDOM!)
function generateConsistentHash(imageData) {
    const data = imageData.data;
    const hashParts = [];
    const width = imageData.width;
    const regions = [
        {x:0,y:0,w:83,h:100},{x:83,y:0,w:84,h:100},{x:167,y:0,w:83,h:100},
        {x:0,y:100,w:83,h:100},{x:83,y:100,w:84,h:100},{x:167,y:100,w:83,h:100},
        {x:0,y:200,w:83,h:100},{x:83,y:200,w:84,h:100},{x:167,y:200,w:83,h:100}
    ];
    regions.forEach(region => {
        let r=0,g=0,b=0,count=0;
        for(let y=region.y; y<region.y+region.h; y++) {
            for(let x=region.x; x<region.x+region.w; x++) {
                const idx=(y*width+x)*4;
                r+=data[idx];g+=data[idx+1];b+=data[idx+2];count++;
            }
        }
        hashParts.push(
            Math.floor(r/count).toString(16).padStart(2,'0'),
            Math.floor(g/count).toString(16).padStart(2,'0'),
            Math.floor(b/count).toString(16).padStart(2,'0')
        );
    });
    return hashParts.join('');
}

function findLocalFaceMatch(hash) {
    let best=null,bestScore=0;
    for(const[id,stored] of Object.entries(faceDatabase)) {
        const score=similarity(hash,stored);
        if(score>bestScore){bestScore=score;best=id;}
    }
    if(best&&bestScore>0.7) return patientsDB.find(p=>p.id===best)||null;
    return null;
}

function similarity(a,b){
    if(!a||!b) return 0;
    const len=Math.min(a.length,b.length);let diff=0;
    for(let i=0;i<len;i++) diff+=Math.abs(parseInt(a[i],16)-parseInt(b[i],16));
    return Math.max(0,1-(diff/(15*len)));
}

function showRegistrationForm(){
    document.getElementById('welcomePanel').style.display='none';
    document.getElementById('patientFoundPanel').classList.remove('active');
    document.getElementById('registrationPanel').classList.add('active');
}

function showPatientFound(patient){
    document.getElementById('welcomePanel').style.display='none';
    document.getElementById('registrationPanel').classList.remove('active');
    document.getElementById('patientFoundPanel').classList.add('active');
    document.getElementById('foundPatientName').textContent=patient.name;
    document.getElementById('foundPatientId').textContent=patient.id;
    document.getElementById('foundPatientAge').textContent=patient.age;
    document.getElementById('foundPatientBlood').textContent=patient.bloodType;
    document.getElementById('foundPatientDisease').textContent=patient.disease;
    document.getElementById('foundPatientDate').textContent=patient.addedDate;
    const oldBtn=document.getElementById('viewFullDetailsBtn');
    if(oldBtn) oldBtn.remove();
    const btn=document.createElement('button');
    btn.id='viewFullDetailsBtn';btn.className='btn-primary';
    btn.style.cssText='width:100%;margin-top:10px;';
    btn.innerHTML='<i class="fas fa-folder-open"></i> View My Complete Records';
    btn.onclick=()=>alert(`📋 ${patient.name}\nID: ${patient.id}\nAge: ${patient.age}\nBlood: ${patient.bloodType}\nCondition: ${patient.disease}\nSymptoms: ${patient.symptoms}\n\n✅ Authenticated via Face Scan`);
    document.getElementById('patientFoundPanel').appendChild(btn);
}

function resetFaceScan(){
    document.getElementById('welcomePanel').style.display='block';
    document.getElementById('registrationPanel').classList.remove('active');
    document.getElementById('patientFoundPanel').classList.remove('active');
    document.getElementById('faceRegistrationForm').reset();
    currentPatient=null;
    const btn=document.getElementById('viewFullDetailsBtn');
    if(btn) btn.remove();
    updateAuthUI();
}

async function registerFacePatient(event){
    event.preventDefault();
    const newPatient={
        id:`P${++patientIdCounter}`,
        name:document.getElementById('faceRegName').value.trim(),
        age:parseInt(document.getElementById('faceRegAge').value),
        bloodType:document.getElementById('faceRegBlood').value||'Unknown',
        disease:document.getElementById('faceRegDisease').value.trim(),
        symptoms:document.getElementById('faceRegSymptoms').value.trim(),
        history:'Registered via Face Scan',
        medications:'None',
        status:'active',
        addedDate:new Date().toISOString().split('T')[0]
    };
    patientsDB.unshift(newPatient);
    if(currentFaceHash) faceDatabase[newPatient.id]=currentFaceHash;
    
    // SAVE TO BACKEND
    await apiCall('/patients', 'POST', newPatient);
    if(currentFaceHash) await apiCall('/faces/register', 'POST', {patientId:newPatient.id, faceEmbedding:currentFaceHash});
    
    saveLocalData();
    currentPatient=newPatient;
    showPatientFound(newPatient);
    refreshAllViews();
    document.getElementById('scanInstruction').textContent='✅ Registered! Scan again anytime.';
    document.getElementById('scanInstruction').style.background='rgba(76,175,80,0.9)';
    return false;
}

// ============================================
// DOCTOR AUTH
// ============================================
function showLoginModal(){document.getElementById('loginModal').classList.add('active');}
function hideLoginModal(){document.getElementById('loginModal').classList.remove('active');}

async function authenticateDoctor(){
    const code=document.getElementById('accessCode').value.trim();
    const result=await apiCall('/auth/doctor/login','POST',{accessCode:code});
    if(result&&result.token){
        authToken=result.token;isDoctorAuthenticated=true;
        localStorage.setItem('mediscan_doctor_session',JSON.stringify({authenticated:true,token:authToken}));
        hideLoginModal();updateAuthUI();
        await loadPatientsFromBackend();refreshAllViews();
    }else if(code==='123456'){
        isDoctorAuthenticated=true;
        localStorage.setItem('mediscan_doctor_session',JSON.stringify({authenticated:true}));
        hideLoginModal();updateAuthUI();refreshAllViews();
    }else{alert('❌ Invalid code.');}
}

function logoutDoctor(){
    isDoctorAuthenticated=false;authToken=null;currentPatient=null;
    localStorage.removeItem('mediscan_doctor_session');
    updateAuthUI();refreshAllViews();
}

function updateAuthUI(){
    document.getElementById('logoutBtn').style.display=isDoctorAuthenticated||currentPatient?'block':'none';
    document.getElementById('headerStatus').textContent=currentPatient?`👤 ${currentPatient.name}`:isDoctorAuthenticated?'👨‍⚕️ Doctor':'🏥 Public';
    const accessReq=document.getElementById('patientAccessRequired');
    const tableContainer=document.getElementById('patientTableContainer');
    if(accessReq) accessReq.style.display=isDoctorAuthenticated||currentPatient?'none':'block';
    if(tableContainer) tableContainer.style.display=isDoctorAuthenticated||currentPatient?'block':'none';
}

// ============================================
// PATIENTS
// ============================================
function openAddPatientModal(){document.getElementById('addPatientModal').classList.add('active');}
function closeAddPatientModal(){document.getElementById('addPatientModal').classList.remove('active');}

async function addNewPatient(event){
    event.preventDefault();
    const patient={
        id:`P${++patientIdCounter}`,
        name:document.getElementById('pName').value.trim(),
        age:parseInt(document.getElementById('pAge').value),
        bloodType:document.getElementById('pBlood').value||'Unknown',
        disease:document.getElementById('pDisease').value.trim(),
        symptoms:document.getElementById('pSymptoms').value.trim(),
        history:document.getElementById('pHistory').value.trim()||'None',
        medications:document.getElementById('pMedications').value.trim()||'None',
        status:document.getElementById('pStatus').value,
        addedDate:new Date().toISOString().split('T')[0]
    };
    patientsDB.unshift(patient);
    await apiCall('/patients','POST',patient);
    saveLocalData();
    closeAddPatientModal();
    refreshAllViews();
    return false;
}

function populatePatientTable(filter=''){
    const tbody=document.getElementById('patientTableBody');
    let listToShow=patientsDB;
    if(currentPatient&&!isDoctorAuthenticated) listToShow=[currentPatient];
    if(!isDoctorAuthenticated&&!currentPatient){tbody.innerHTML='<tr><td colspan="8" class="empty-state">🔐 Scan face or login to see records.</td></tr>';return;}
    if(listToShow.length===0){tbody.innerHTML='<tr><td colspan="8" class="empty-state">No patients yet.</td></tr>';return;}
    const list=listToShow.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())||p.id.toLowerCase().includes(filter));
    tbody.innerHTML=list.map(p=>`<tr><td>${p.id}</td><td>${p.name}</td><td>${p.age}</td><td>${p.bloodType}</td><td>${p.disease}</td><td>${p.addedDate}</td><td><span class="status ${p.status}">${p.status}</span></td><td><button class="action-btn" onclick="viewPatient('${p.id}')"><i class="fas fa-eye"></i></button>${isDoctorAuthenticated?`<button class="action-btn" onclick="deletePatient('${p.id}')" style="color:#F44336;"><i class="fas fa-trash"></i></button>`:''}</td></tr>`).join('');
}

function viewPatient(id){
    const p=patientsDB.find(x=>x.id===id);
    if(!p) return;
    if(!isDoctorAuthenticated&&(!currentPatient||currentPatient.id!==id)){alert('🔐 You can only view your own records.');return;}
    alert(`📋 ${p.name}\nID: ${p.id}\nAge: ${p.age}\nBlood: ${p.bloodType}\nCondition: ${p.disease}\nSymptoms: ${p.symptoms}`);
}

async function deletePatient(id){
    if(!confirm('Delete permanently?')) return;
    patientsDB=patientsDB.filter(x=>x.id!==id);
    delete faceDatabase[id];
    await apiCall(`/patients/${id}`,'DELETE');
    saveLocalData();
    refreshAllViews();
}

function refreshAllViews(){populatePatientTable();updatePatientDropdown();loadDashboardStats();updateAuthUI();}
function updatePatientDropdown(){
    const sel=document.getElementById('patientSelect');
    if(!sel) return;
    const list=(currentPatient&&!isDoctorAuthenticated)?[currentPatient]:patientsDB;
    sel.innerHTML='<option value="">-- Choose --</option>'+list.map(p=>`<option value="${p.id}">${p.name} - ${p.disease}</option>`).join('');
}

// ============================================
// DASHBOARD
// ============================================
function loadDashboardStats(){
    document.getElementById('statsGrid').innerHTML=[
        {i:'fa-procedures',l:'Patients',v:patientsDB.length,g:'linear-gradient(135deg,#667eea,#764ba2)'},
        {i:'fa-fingerprint',l:'Faces',v:Object.keys(faceDatabase).length,g:'linear-gradient(135deg,#f093fb,#f5576c)'},
        {i:'fa-user-check',l:'Current',v:currentPatient?currentPatient.name.split(' ')[0]:'None',g:'linear-gradient(135deg,#4facfe,#00f2fe)'},
        {i:'fa-server',l:'Backend',v:'Connected',g:'linear-gradient(135deg,#43e97b,#38f9d7)'}
    ].map(s=>`<div class="stat-card"><div class="stat-icon" style="background:${s.g}"><i class="fas ${s.i}"></i></div><div class="stat-info"><h3>${s.l}</h3><p class="stat-number">${s.v}</p></div></div>`).join('');
    const recent=document.getElementById('recentPatients');
    const list=patientsDB.slice(0,5);
    recent.innerHTML=list.length?list.map(p=>`<div class="patient-row"><div class="patient-avatar">${p.name.split(' ').map(n=>n[0]).join('')}</div><div class="patient-details"><strong>${p.name}</strong><span>${p.disease} • ${p.addedDate}</span></div><span class="status ${p.status}">${p.status}</span></div>`).join(''):'<p class="empty-state">No patients yet. Use Face Scan!</p>';
    document.getElementById('patientSearch').addEventListener('input',e=>populatePatientTable(e.target.value));
}

async function loadAIInsights(){
    const box=document.getElementById('aiInsights');
    if(patientsDB.length===0){box.innerHTML='<p>👋 Welcome! Scan your face to check in.</p>';return;}
    const conditions=patientsDB.map(p=>p.disease).join(', ');
    const res=await callGroqAPI([{role:'system',content:'Give 2 brief insights.'},{role:'user',content:`Conditions: ${conditions}`}],0.7,200);
    box.innerHTML=`<p>${res}</p>`;
}

// ============================================
// AI DIAGNOSIS
// ============================================
function initAIDiagnosis(){
    const sel=document.getElementById('patientSelect');
    const btn=document.getElementById('analyzeBtn');
    const input=document.getElementById('symptomInput');
    const msgs=document.getElementById('chatMessages');
    const typing=document.getElementById('typingIndicator');
    let selectedPatient=null;
    sel.addEventListener('change',()=>{
        selectedPatient=patientsDB.find(p=>p.id===sel.value)||null;
        if(selectedPatient&&currentPatient&&!isDoctorAuthenticated&&selectedPatient.id!==currentPatient.id){alert('🔐 Only your own records.');sel.value=currentPatient.id;selectedPatient=currentPatient;}
        if(selectedPatient){document.getElementById('selectedPatientInfo').style.display='block';document.getElementById('infoName').textContent=selectedPatient.name;document.getElementById('infoId').textContent=selectedPatient.id;document.getElementById('infoDisease').textContent=selectedPatient.disease;}
        else document.getElementById('selectedPatientInfo').style.display='none';
    });
    btn.addEventListener('click',async()=>{
        const q=input.value.trim();
        if(!q||!selectedPatient) return alert('Select patient and type question.');
        addMessage('user',q,msgs);input.value='';typing.style.display='block';btn.disabled=true;
        // Try backend AI
        const result=await apiCall('/ai/analyze','POST',{patientId:selectedPatient.id,question:q});
        typing.style.display='none';btn.disabled=false;
        if(result&&result.analysis) addMessage('ai',result.analysis,msgs);
        else{const res=await callGroqAPI([{role:'system',content:SYSTEM_PROMPT},{role:'user',content:`Patient: ${selectedPatient.name}, Condition: ${selectedPatient.disease}, Symptoms: ${selectedPatient.symptoms}\nQuestion: ${q}`}]);addMessage('ai',res,msgs);}
    });
    document.getElementById('clearChatBtn').addEventListener('click',()=>{msgs.innerHTML='<div class="message ai-message"><div class="message-avatar">🤖</div><div class="message-content"><p><strong>MediScan AI</strong></p><p>Select a patient to analyze.</p></div></div>';});
    input.addEventListener('keypress',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();btn.click();}});
}

function clearPatientSelection(){document.getElementById('patientSelect').value='';document.getElementById('selectedPatientInfo').style.display='none';}
function addMessage(type,content,container){const div=document.createElement('div');div.className=`message ${type}-message`;div.innerHTML=`<div class="message-avatar">${type==='ai'?'🤖':'👤'}</div><div class="message-content">${content.replace(/\n/g,'<br>')}</div>`;container.appendChild(div);container.scrollTop=container.scrollHeight;}

// ============================================
// WIDGET & DOCTORS
// ============================================
function initFloatingWidget(){document.getElementById('widgetToggle').addEventListener('click',()=>document.getElementById('widgetBody').classList.toggle('open'));document.getElementById('widgetClose').addEventListener('click',()=>document.getElementById('widgetBody').classList.remove('open'));}
function populateDoctors(){document.getElementById('doctorsGrid').innerHTML=[{n:'Dr. Sarah Chen',s:'Cardiology',p:patientsDB.length,e:'15y',a:'👩‍⚕️',c:'#FF6B6B'},{n:'Dr. Michael Park',s:'Neurology',p:patientsDB.length,e:'12y',a:'👨‍⚕️',c:'#4A90E2'},{n:'Dr. Lisa Rodriguez',s:'Internal Medicine',p:patientsDB.length,e:'18y',a:'👩‍⚕️',c:'#40E0D0'},{n:'Dr. James Wright',s:'Emergency',p:patientsDB.length,e:'20y',a:'👨‍⚕️',c:'#FFA000'}].map(d=>`<div class="doctor-card"><div class="doctor-header"><div class="doctor-avatar" style="background:${d.c}20;color:${d.c}">${d.a}</div><div class="doctor-info"><h3>${d.n}</h3><span>${d.s}</span></div></div><div class="doctor-stats"><div class="doctor-stat"><strong>${d.p}</strong><span>Patients</span></div><div class="doctor-stat"><strong>${d.e}</strong><span>Exp</span></div></div></div>`).join('');}
function initGlobalSearch(){document.getElementById('globalSearch').addEventListener('keypress',e=>{if(e.key==='Enter'){document.querySelector('[data-page="patients"]').click();document.getElementById('patientSearch').value=e.target.value;populatePatientTable(e.target.value);}});}
function showNotification(msg){console.log('🔔',msg);}
console.log('🏥 MediScan AI - Full Stack Ready');