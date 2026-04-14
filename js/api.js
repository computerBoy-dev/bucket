import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, getDocs, getDoc, setDoc, query, where, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db, ENCODED_BOT_TOKEN, ENCODED_CHAT_ID, MAX_FILE_SIZE, CHUNK_SIZE, State } from './config.js';
import { UI } from './ui.js';

// --- AUTH LOGIC ---
function cleanUsername(raw) { return raw.trim().toLowerCase().replace('@bucket.space', '').replace('@bucket', ''); }

async function getRecoveryEmail(username) {
    const docSnap = await getDoc(doc(db, "profiles", username));
    if (docSnap.exists()) return docSnap.data().recoveryEmail;
    throw new Error("Invalid Username. Please check your spelling or register.");
}

if(UI.loginForm) {
    UI.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.setLoading('btn-login-submit', true, '...');
        try {
            const email = await getRecoveryEmail(cleanUsername(document.getElementById('login-username').value));
            await signInWithEmailAndPassword(auth, email, document.getElementById('login-password').value);
            UI.showToast('Welcome back!', 'success');
            UI.loginForm.reset();
        } catch (err) { 
            UI.showToast(err.message.replace('Firebase: ', ''), 'error'); 
        } finally { 
            UI.setLoading('btn-login-submit', false, 'Sign In'); 
        }
    });
}

if(UI.regForm) {
    UI.regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.setLoading('btn-reg-submit', true, '...');
        const user = cleanUsername(document.getElementById('reg-username').value);
        const email = document.getElementById('reg-recovery-email').value;
        const name = document.getElementById('reg-name').value;
        const pass = document.getElementById('reg-password').value;
        try {
            const docSnap = await getDoc(doc(db, "profiles", user));
            if (docSnap.exists()) throw new Error("Username is already taken.");
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, "profiles", user), { userId: cred.user.uid, recoveryEmail: email, displayName: name });
            await updateProfile(cred.user, { displayName: name });
            UI.showToast('Vault Created Successfully!', 'success');
            UI.regForm.reset();
        } catch (err) { 
            UI.showToast(err.message.replace('Firebase: ', ''), 'error'); 
        } finally { 
            UI.setLoading('btn-reg-submit', false, 'Join Network'); 
        }
    });
}

// --- FORGOT PASSWORD (RESET) LOGIC ---
if(UI.resetForm) {
    UI.resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.setLoading('btn-reset-submit', true, '...');
        try {
            const rawUsername = document.getElementById('reset-username').value;
            if (!rawUsername) throw new Error("Please enter your username.");

            const user = cleanUsername(rawUsername);
            const email = await getRecoveryEmail(user);
            
            await sendPasswordResetEmail(auth, email);
            UI.showToast('Recovery link sent to your registered email!', 'success');
            
            UI.resetForm.reset(); // Input clear karna zaroori hai
            UI.switchForm('login');
        } catch (err) { 
            console.error("Reset Error:", err);
            UI.showToast(err.message.replace('Firebase: ', ''), 'error'); 
        } finally { 
            UI.setLoading('btn-reset-submit', false, 'Send Recovery Link'); 
        }
    });
}

const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        State.currentUser = user;
        if(UI.landingState) {
            UI.landingState.classList.add('hidden');
            UI.landingState.classList.remove('grid');
        }
        if(UI.dashboardState) UI.dashboardState.classList.remove('hidden');
        if(UI.sidebar) {
            UI.sidebar.classList.remove('hidden', 'sm:hidden');
            UI.sidebar.classList.add('sm:flex');
        }
        if(UI.authInfoSection) UI.authInfoSection.classList.remove('hidden');
        
        const dName = user.displayName || 'User';
        const uEl = document.getElementById('user-display-name');
        const aEl = document.getElementById('user-avatar');
        if(uEl) uEl.innerText = dName;
        if(aEl) aEl.innerText = dName.charAt(0);
        
        try {
            const q = query(collection(db, "profiles"), where("userId", "==", user.uid));
            const snap = await getDocs(q);
            if(!snap.empty) {
                State.currentUsername = snap.docs[0].id;
                const eEl = document.getElementById('user-email');
                if(eEl) eEl.innerText = `@${State.currentUsername}.space`;
            }
        } catch(e) {}
        
        State.currentFolderId = null;
        State.breadcrumbs = [{ id: null, name: 'My Drive' }];
        cleanupOldTrash();
        
        UI.switchView('home'); 
        if(typeof window.loadFiles === 'function') window.loadFiles();
    } else {
        State.currentUser = null;
        State.currentUsername = '';
        if(UI.landingState) {
            UI.landingState.classList.remove('hidden');
            UI.landingState.classList.add('grid');
        }
        if(UI.dashboardState) UI.dashboardState.classList.add('hidden');
        if(UI.sidebar) {
            UI.sidebar.classList.add('hidden', 'sm:hidden');
            UI.sidebar.classList.remove('sm:flex');
        }
        if(UI.authInfoSection) UI.authInfoSection.classList.add('hidden');
        UI.switchForm('login');
    }
});

// Settings Save - Profile
const profileForm = document.getElementById('settings-profile-form');
if(profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.setLoading('btn-save-name', true, '...');
        const newName = document.getElementById('settings-name').value;
        try {
            await updateProfile(State.currentUser, { displayName: newName });
            if(State.currentUsername) await setDoc(doc(db, "profiles", State.currentUsername), { displayName: newName }, { merge: true });
            
            const uEl = document.getElementById('user-display-name');
            const aEl = document.getElementById('user-avatar');
            if(uEl) uEl.innerText = newName;
            if(aEl) aEl.innerText = newName.charAt(0);
            
            UI.showToast('Profile updated', 'success');
        } catch (err) { UI.showToast('Update failed', 'error'); }
        finally { UI.setLoading('btn-save-name', false, 'Save'); }
    });
}

// Settings Save - Change Password
const passForm = document.getElementById('settings-password-form');
if(passForm) {
    passForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.setLoading('btn-save-password', true, '...');
        try {
            const pass = document.getElementById('settings-password').value;
            await updatePassword(State.currentUser, pass);
            UI.showToast('Password changed successfully', 'success');
            document.getElementById('settings-password').value = '';
        } catch (err) { 
            UI.showToast(err.code === 'auth/requires-recent-login' ? 'Re-login required to change password.' : 'Failed to update', 'error'); 
        } finally { 
            UI.setLoading('btn-save-password', false, 'Change'); 
        }
    });
}

// Telegram Cloud Delete Export
export async function deleteFromTelegram(file) {
    if (file.isFolder || !file.chunks) return;
    const bot = atob(ENCODED_BOT_TOKEN);
    const chat = atob(ENCODED_CHAT_ID);
    const promises = file.chunks.map(chunk => {
        if (chunk.messageId) {
            return fetch(`https://api.telegram.org/bot${bot}/deleteMessage?chat_id=${chat}&message_id=${chunk.messageId}`).catch(()=>{});
        }
        return Promise.resolve();
    });
    await Promise.all(promises);
}
window.deleteFromTelegram = deleteFromTelegram;

async function cleanupOldTrash() {
    try {
        const q = query(collection(db, "files"), where("userId", "==", auth.currentUser.uid), where("inTrash", "==", true));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        snap.forEach(d => { 
            const data = d.data();
            if (data.deletedAt && (now - data.deletedAt > sevenDays)) { 
                deleteFromTelegram(data);
                batch.delete(d.ref); 
            } 
        });
        await batch.commit();
    } catch(e) {}
}

window.shareFile = function(id) {
    const link = `${window.location.origin}/?share=${id}`;
    const inp = document.getElementById('share-link-input');
    if(inp) inp.value = link;
    UI.openModal('share-modal');
};

window.copyShareLink = function() {
    const copyText = document.getElementById("share-link-input");
    if(!copyText) return;
    copyText.select();
    document.execCommand("copy");
    UI.showToast('Public link copied!', 'success');
    UI.closeModal('share-modal');
};

// --- GLOBAL DRAG AND DROP EVENTS ---
let dragCounter = 0;
const dragOverlay = document.getElementById('drag-overlay');

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (State.currentUser && dragOverlay) {
        dragCounter++;
        dragOverlay.classList.remove('hidden', 'pointer-events-none');
        dragOverlay.classList.add('flex');
        setTimeout(() => dragOverlay.classList.remove('opacity-0'), 10);
    }
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0 && State.currentUser && dragOverlay) {
        dragOverlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => { dragOverlay.classList.add('hidden'); dragOverlay.classList.remove('flex'); }, 300);
    }
});

window.addEventListener('dragover', (e) => e.preventDefault());

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (State.currentUser && dragOverlay) {
        dragOverlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => { dragOverlay.classList.add('hidden'); dragOverlay.classList.remove('flex'); }, 300);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(Array.from(e.dataTransfer.files));
        }
    }
});

const fileInput = document.getElementById('file-input');
if(fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(Array.from(e.target.files));
    });
}

// --- CORE UPLOAD LOGIC ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchWithRetry(url, opts, retries=3) {
    for (let i=0; i<retries; i++) {
        try { const res = await fetch(url, opts); if(res.ok) return await res.json(); } 
        catch (err) { if(i === retries-1) throw err; await sleep(1000 * (i+1)); }
    }
}

async function handleFileUpload(files) {
    if (!files.length) return;
    if (files.some(f => f.size > MAX_FILE_SIZE)) return UI.showToast('Files exceed 1GB limit.', 'error');

    // Main Top Banner
    const banner = document.getElementById('upload-banner');
    const circle = document.getElementById('loader-circle');
    const text = document.getElementById('loader-text');
    const count = document.getElementById('loader-count');
    
    if(banner) banner.classList.remove('hidden');
    
    const bot = atob(ENCODED_BOT_TOKEN);
    const chat = atob(ENCODED_CHAT_ID);

    for (let fIndex = 0; fIndex < files.length; fIndex++) {
        const file = files[fIndex];
        const statusText = `File ${fIndex + 1} of ${files.length} (${file.name})`;
        if(count) count.innerText = statusText;
        if(circle) circle.style.strokeDashoffset = '251.2';
        
        const total = Math.ceil(file.size / CHUNK_SIZE);
        let chunks = [];

        try {
            for (let i = 0; i < total; i++) {
                const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
                const fd = new FormData();
                fd.append("chat_id", chat);
                fd.append("document", new File([blob], `${file.name}.part${i}`));

                const data = await fetchWithRetry(`https://api.telegram.org/bot${bot}/sendDocument`, { method: 'POST', body: fd });
                
                chunks.push({ 
                    fileId: data.result.document.file_id, 
                    messageId: data.result.message_id, 
                    index: i 
                });
                
                const percent = Math.round(((i + 1) / total) * 100);
                const pctText = `${percent}%`;
                const offset = 251.2 - (percent / 100) * 251.2;
                
                if(text) text.innerText = pctText;
                if(circle) circle.style.strokeDashoffset = offset;
                
                await sleep(400); 
            }

            await addDoc(collection(db, "files"), {
                userId: State.currentUser.uid, fileName: file.name, fileSize: file.size,
                fileType: file.type || 'application/octet-stream', totalChunks: total, chunks: chunks,
                isFolder: false, isStarred: false, inTrash: false,
                parentId: State.currentFolderId, createdAt: Date.now()
            });
        } catch (err) { UI.showToast(`Failed: ${file.name}`, 'error'); } 
    }
    
    const fi = document.getElementById('file-input');
    if(fi) fi.value = '';
    
    if(banner) banner.classList.add('hidden');
    
    UI.showToast('Upload finished!', 'success');
    if(typeof window.loadFiles === 'function') window.loadFiles();
}

window.processFileAction = async function(docId, actionType = 'download') {
    UI.openModal('action-modal');
    const mt = document.getElementById('modal-title');
    if(mt) mt.innerText = actionType === 'preview' ? 'Preparing Preview' : 'Downloading';
    
    try {
        const file = State.allFiles.find(f => f.id === docId);
        const bot = atob(ENCODED_BOT_TOKEN);
        let blobs = [];
        file.chunks.sort((a, b) => a.index - b.index);

        for (let i = 0; i < file.totalChunks; i++) {
            const pathRes = await fetchWithRetry(`https://api.telegram.org/bot${bot}/getFile?file_id=${file.chunks[i].fileId}`);
            const proxy = `https://fragrant-cloud-6ed7.iaaryan37.workers.dev/?url=${encodeURIComponent(`https://api.telegram.org/file/bot${bot}/${pathRes.result.file_path}`)}`;
            const fileRes = await fetch(proxy);
            if (!fileRes.ok) throw new Error("Chunk failed");
            
            blobs.push(await fileRes.blob());
            const mp = document.getElementById('modal-progress');
            if(mp) mp.style.width = `${((i + 1) / file.totalChunks) * 100}%`;
        }

        const finalBlob = new Blob(blobs, { type: file.fileType });
        const blobUrl = URL.createObjectURL(finalBlob);
        UI.closeModal('action-modal');

        if (actionType === 'preview') {
            const pt = document.getElementById('preview-title');
            if(pt) pt.innerText = file.fileName;
            
            const content = document.getElementById('preview-content');
            State.currentPreviewUrl = blobUrl;
            
            const pBtn = document.getElementById('preview-download-btn');
            if(pBtn) {
                pBtn.onclick = () => {
                    const a = document.createElement("a"); a.href = blobUrl; a.download = file.fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                };
            }

            if (content) {
                if (file.fileType.startsWith('image/')) content.innerHTML = `<img src="${blobUrl}" class="max-w-full max-h-full object-contain shadow-2xl">`;
                else if (file.fileType.startsWith('video/')) content.innerHTML = `<video src="${blobUrl}" controls autoplay class="max-w-full max-h-full shadow-2xl"></video>`;
                else content.innerHTML = `<div class="text-center text-white/60"><i data-lucide="file-question" class="w-20 h-20 mx-auto mb-4 opacity-50"></i><p>No preview for this type.</p></div>`;
            }
            UI.openModal('preview-modal');
            lucide.createIcons();
        } else {
            const a = document.createElement("a"); a.href = blobUrl; a.download = file.fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            UI.showToast('Download complete', 'success');
        }
    } catch (err) { UI.closeModal('action-modal'); UI.showToast('Network Error', 'error'); }
};