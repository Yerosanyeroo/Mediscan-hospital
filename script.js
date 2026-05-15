// SIMPLE WORKING VERSION
console.log('MediScan AI Starting...');

let patients = [];
let faces = {};
let isDoctor = false;
let videoStream = null;
let currentFaceHash = null;

// Load saved data
try {
    const p = localStorage.getItem('mediscan_patients');
    if (p) patients = JSON.parse(p);
    const f = localStorage.getItem('mediscan_faces');
    if (f) faces = JSON.parse(f);
} catch(e) {}

function save() {
    localStorage.setItem('mediscan_patients', JSON.stringify(patients));
    localStorage.setItem('mediscan_faces', JSON.stringify(faces));
}

// Hide loading
setTimeout(function() {
    document.getElementById('loadingScreen').classList.add('hidden');
    updateDashboard();
}, 1000);

// Tab switching
function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    event.target.classList.add('active');
    document.getElementById(name).classList.add('active');
    if (name === 'patients' && !isDoctor) {
        document.getElementById('patientAuthRequired').style.display = 'block';
        document.getElementById('patientList').style.display = 'none';
    } else if (name === 'patients' && isDoctor) {
        document.getElementById('patientAuthRequired').style.display = 'none';
        document.getElementById('patientList').style.display = 'block';
        showPatients();
    }
    if (name === 'dashboard') updateDashboard();
    if (name === 'aichat') updateAIPatientList();
}

// Doctor login
function showLoginPrompt() {
    var code = prompt('Enter doctor access code:');
    if (code === '123456') {
        isDoctor = true;
        document.getElementById('loginStatus').textContent = '👨‍⚕️ Doctor Mode';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'inline-block';
        alert('✅ Doctor authenticated!');
    } else if (code) {
        alert('❌ Invalid code. Default: 123456');
    }
}

function logoutDoctor() {
    isDoctor = false;
    document.getElementById('loginStatus').textContent = 'Not logged in';
    document.getElementById('loginBtn').style.display = 'inline-block';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('patientAuthRequired').style.display = 'block';
    document.getElementById('patientList').style.display = 'none';
}

// Register patient
function registerPatient(event) {
    event.preventDefault();
    var patient = {
        id: 'P' + (1000 + patients.length + 1),
        name: document.getElementById('regName').value,
        age: parseInt(document.getElementById('regAge').value),
        bloodType: document.getElementById('regBlood').value || 'Unknown',
        disease: document.getElementById('regDisease').value,
        symptoms: document.getElementById('regSymptoms').value,
        history: 'Manual registration',
        medications: 'None',
        status: 'active',
        date: new Date().toISOString().split('T')[0]
    };
    patients.unshift(patient);
    save();
    document.getElementById('registerForm').reset();
    alert('✅ Patient ' + patient.name + ' registered! ID: ' + patient.id);
    updateDashboard();
}

// Show patients
function showPatients(filter) {
    filter = filter || '';
    var list = patients;
    if (filter) {
        list = patients.filter(function(p) {
            return p.name.toLowerCase().includes(filter.toLowerCase()) || p.id.includes(filter);
        });
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var p = list[i];
        html += '<div class="patient-card">';
        html += '<h3>' + p.name + ' (' + p.id + ')</h3>';
        html += '<p><strong>Age:</strong> ' + p.age + ' | <strong>Blood:</strong> ' + p.bloodType + '</p>';
        html += '<p><strong>Condition:</strong> ' + p.disease + '</p>';
        html += '<p><strong>Symptoms:</strong> ' + p.symptoms + '</p>';
        html += '<p><strong>Date:</strong> ' + p.date + ' | <span class="status-badge status-' + p.status + '">' + p.status + '</span></p>';
        html += '<button class="btn btn-red" style="margin-top:10px;" onclick="deletePatient(\'' + p.id + '\')">🗑️ Delete</button>';
        html += '</div>';
    }
    if (list.length === 0) html = '<p>No patients found.</p>';
    document.getElementById('patientCards').innerHTML = html;
    
    document.getElementById('searchInput').oninput = function() {
        showPatients(this.value);
    };
}

function deletePatient(id) {
    if (!confirm('Delete permanently?')) return;
    patients = patients.filter(function(p) { return p.id !== id; });
    delete faces[id];
    save();
    showPatients();
    updateDashboard();
}

// Face Scan
document.getElementById('startScanBtn').addEventListener('click', function() {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
        .then(function(stream) {
            videoStream = stream;
            document.getElementById('videoFeed').srcObject = stream;
            document.getElementById('captureBtn').disabled = false;
            document.getElementById('scanResult').textContent = '✅ Camera ready! Click "Scan & Identify"';
            document.getElementById('scanResult').style.background = '#E8F5E9';
        })
        .catch(function() {
            document.getElementById('scanResult').textContent = '⚠️ Camera denied. Allow camera access.';
            document.getElementById('scanResult').style.background = '#FFEBEE';
        });
});

document.getElementById('captureBtn').addEventListener('click', function() {
    if (!videoStream) return;
    document.getElementById('scanResult').textContent = '🔍 Scanning...';
    document.getElementById('scanResult').style.background = '#E3F2FD';
    
    var canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(document.getElementById('videoFeed'), 0, 0, 640, 480);
    var faceData = ctx.getImageData(195, 90, 250, 300);
    currentFaceHash = generateHash(faceData);
    
    setTimeout(function() {
        var match = findMatch(currentFaceHash);
        if (match) {
            document.getElementById('scanResult').innerHTML = '✅ <strong>Welcome back, ' + match.name + '!</strong><br>ID: ' + match.id + '<br>Condition: ' + match.disease + '<br>Symptoms: ' + match.symptoms;
            document.getElementById('scanResult').style.background = '#E8F5E9';
        } else {
            document.getElementById('scanResult').innerHTML = '🆕 <strong>New face detected!</strong><br>Go to "Register Patient" tab to register.';
            document.getElementById('scanResult').style.background = '#FFF3E0';
        }
    }, 1500);
});

function generateHash(data) {
    var parts = [];
    var w = data.width;
    var regions = [[0,0,83,100],[83,0,84,100],[167,0,83,100],[0,100,83,100],[83,100,84,100],[167,100,83,100],[0,200,83,100],[83,200,84,100],[167,200,83,100]];
    for (var i = 0; i < regions.length; i++) {
        var r = 0, g = 0, b = 0, count = 0;
        for (var y = regions[i][1]; y < regions[i][1] + regions[i][3]; y++) {
            for (var x = regions[i][0]; x < regions[i][0] + regions[i][2]; x++) {
                var idx = (y * w + x) * 4;
                r += data.data[idx]; g += data.data[idx+1]; b += data.data[idx+2]; count++;
            }
        }
        if (count > 0) {
            parts.push(Math.floor(r/count).toString(16).padStart(2,'0'));
            parts.push(Math.floor(g/count).toString(16).padStart(2,'0'));
            parts.push(Math.floor(b/count).toString(16).padStart(2,'0'));
        }
    }
    return parts.join('');
}

function findMatch(hash) {
    var best = null, bestScore = 0;
    for (var id in faces) {
        var score = sim(hash, faces[id]);
        if (score > bestScore) { bestScore = score; best = id; }
    }
    if (best && bestScore > 0.7) {
        for (var i = 0; i < patients.length; i++) {
            if (patients[i].id === best) return patients[i];
        }
    }
    return null;
}

function sim(a, b) {
    if (!a || !b) return 0;
    var len = Math.min(a.length, b.length), diff = 0;
    for (var i = 0; i < len; i++) diff += Math.abs(parseInt(a[i]||0,16) - parseInt(b[i]||0,16));
    return Math.max(0, 1 - (diff / (15 * len)));
}

// AI Chat
function askAI() {
    var q = document.getElementById('aiQuestion').value.trim();
    var patientId = document.getElementById('aiPatientSelect').value;
    var msgs = document.getElementById('chatMessages');
    
    if (!q) return;
    
    msgs.innerHTML += '<p style="color:#4A90E2;"><strong>You:</strong> ' + q + '</p>';
    document.getElementById('aiQuestion').value = '';
    
    var response = '';
    if (patientId) {
        var p = null;
        for (var i = 0; i < patients.length; i++) {
            if (patients[i].id === patientId) { p = patients[i]; break; }
        }
        if (p) {
            response = '📋 <strong>Analysis for ' + p.name + ':</strong><br><br>🔍 Condition: ' + p.disease + '<br>🤒 Symptoms: ' + p.symptoms + '<br>📋 History: ' + p.history + '<br>💊 Medications: ' + p.medications + '<br><br>💡 Monitor symptoms and consult your doctor.<br><br>⚠️ This is AI-assisted analysis, not medical advice.';
        }
    } else {
        response = '🤖 I can help with general medical questions. For patient-specific analysis, please select a patient from the dropdown.';
    }
    
    setTimeout(function() {
        msgs.innerHTML += '<p><strong>🤖 AI:</strong> ' + response + '</p>';
        msgs.scrollTop = msgs.scrollHeight;
    }, 500);
}

function updateAIPatientList() {
    var sel = document.getElementById('aiPatientSelect');
    sel.innerHTML = '<option value="">General Question</option>';
    for (var i = 0; i < patients.length; i++) {
        sel.innerHTML += '<option value="' + patients[i].id + '">' + patients[i].name + ' - ' + patients[i].disease + '</option>';
    }
}

// Dashboard
function updateDashboard() {
    document.getElementById('totalPatients').textContent = patients.length;
    document.getElementById('totalFaces').textContent = Object.keys(faces).length;
    document.getElementById('backendStatus').textContent = 'Local Mode';
}

console.log('✅ MediScan AI Ready');
