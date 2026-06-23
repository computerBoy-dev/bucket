// config.js
name=config.js url=https://github.com/computerBoy-dev/bucket/blob/main/js/config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Firebase configuration object containing API keys and project identifiers.
 * Used to initialize the Firebase application instance with the Bucket project.
 * @type {Object}
 * @property {string} apiKey - Firebase API key for authentication and API requests
 * @property {string} authDomain - Firebase authentication domain
 * @property {string} projectId - Firebase project identifier
 * @property {string} storageBucket - Firebase cloud storage bucket name
 * @property {string} messagingSenderId - Firebase messaging sender ID
 * @property {string} appId - Firebase application ID
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBPCMSyOuE3cmqOzQYBpiDbnTrVlG92zmE",
  authDomain: "bucket-650eb.firebaseapp.com",
  projectId: "bucket-650eb",
  storageBucket: "bucket-650eb.firebasestorage.app",
  messagingSenderId: "469812149420",
  appId: "1:469812149420:web:c908fabd72829552e8b309"
};

/**
 * Base64 encoded Telegram bot token for secure storage.
 * Decoded at runtime for API authentication with Telegram Bot API.
 * @type {string}
 */
export const ENCODED_BOT_TOKEN = btoa("8180142935:AAHG_8_1OciJAiLHjAqvvbauqCY5m7WOi2I");

/**
 * Base64 encoded Telegram chat ID for secure storage.
 * Decoded at runtime to identify the target chat for file chunk uploads.
 * @type {string}
 */
export const ENCODED_CHAT_ID = btoa("-1003749727946");

/**
 * Maximum file size limit in bytes (1 GB).
 * Files exceeding this size will be rejected during upload validation.
 * @type {number}
 * @constant
 */
export const MAX_FILE_SIZE = 1024 * 1024 * 1024;

/**
 * File chunk size in bytes (15 MB).
 * Large files are split into chunks of this size for Telegram upload reliability.
 * @type {number}
 * @constant
 */
export const CHUNK_SIZE = 15 * 1024 * 1024;

/**
 * Initialized Firebase application instance.
 * Serves as the base for all Firebase services (Auth, Firestore, etc.).
 * @type {FirebaseApp}
 */
export const app = initializeApp(firebaseConfig);

/**
 * Firebase Authentication service instance.
 * Manages user sign-up, sign-in, password reset, and session handling.
 * @type {Auth}
 */
export const auth = getAuth(app);

/**
 * Firebase Firestore database instance.
 * Provides NoSQL database operations for file metadata and user profiles.
 * @type {Firestore}
 */
export const db = getFirestore(app);

/**
 * Global application state object.
 * Tracks current user, active view, filters, selected items, and navigation context.
 * Attached to window object to ensure accessibility across all modules.
 * @type {Object}
 * @property {Object|null} currentUser - Currently authenticated Firebase user object
 * @property {string} currentUsername - Bucket username of the authenticated user
 * @property {Array} allFiles - Array of file/folder objects loaded from Firestore
 * @property {string} currentView - Active view mode ('home', 'recent', 'starred', 'trash')
 * @property {string} viewMode - File display mode ('list' or 'grid')
 * @property {string} advFilterType - Advanced filter by type ('all', 'image', 'video', 'document')
 * @property {string} advFilterDate - Advanced filter by date ('any', 'today', '7days', '30days')
 * @property {string} currentSearch - Current search query string
 * @property {string|null} currentPreviewUrl - Blob URL of file being previewed
 * @property {string|null} currentFolderId - ID of the currently open folder
 * @property {Array} breadcrumbs - Navigation breadcrumb trail with folder path
 * @property {string|null} itemToDelete - File ID pending permanent deletion
 * @property {string|null} itemToRename - File ID being renamed
 * @property {Set} selectedItems - Set of file IDs selected for bulk operations
 */
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
