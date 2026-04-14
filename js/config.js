import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- CONFIGURATION ---
export const firebaseConfig = {
  apiKey: "AIzaSyBPCMSyOuE3cmqOzQYBpiDbnTrVlG92zmE",
  authDomain: "bucket-650eb.firebaseapp.com",
  projectId: "bucket-650eb",
  storageBucket: "bucket-650eb.firebasestorage.app",
  messagingSenderId: "469812149420",
  appId: "1:469812149420:web:c908fabd72829552e8b309"
};

export const ENCODED_BOT_TOKEN = btoa("8180142935:AAHG_8_1OciJAiLHjAqvvbauqCY5m7WOi2I"); 
export const ENCODED_CHAT_ID = btoa("-1003749727946");
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; 
export const CHUNK_SIZE = 15 * 1024 * 1024;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// GLOBAL STATE (Attached to window immediately to prevent ReferenceError)
export const State = {
    currentUser: null,
    currentUsername: '', 
    allFiles: [],
    currentView: 'home', 
    viewMode: 'list',
    advFilterType: 'all',
    advFilterDate: 'any',
    currentSearch: '',
    currentPreviewUrl: null,
    currentFolderId: null,
    breadcrumbs: [{ id: null, name: 'My Drive' }],
    itemToDelete: null,
    itemToRename: null,
    selectedItems: new Set() 
};

window.State = State;