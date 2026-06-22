# BUCKET Architecture Documentation

## Overview

**BUCKET** is a decentralized, zero-knowledge cloud storage platform that uses **Telegram's Bot API** as a globally distributed file storage backend and **Firebase** for authentication and metadata indexing. Files up to **1 GB** are chunked at **15 MB per chunk** and reconstructed client-side with zero server involvement.

### Core Design Principles

1. **Zero proprietary infrastructure** — No owned servers; persistence layer is Telegram's infrastructure
2. **Zero-knowledge by design** — Files stored as binary blobs; Firestore contains only metadata
3. **Chunk-first architecture** — All files treated as sequences of equal-size chunks; enables resumable, parallelizable transfer
4. **Serverless & scalable** — Client-side processing eliminates backend bottlenecks

---

## System Architecture

```
┌─────────────────────���───────────────────────────────────────────┐
│                      BUCKET CLIENT (Browser)                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Auth Layer   │  │ File Engine  │  │ UI Layer     │          │
│  │ (Firebase)   │  │ (Chunker)    │  │ (Drive-like) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                   │                 │
│         ▼                  ▼                   ▼                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Firebase Layer                                │   │
│  │  Auth (email/password) │ Firestore (metadata index)     │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                  Chunk References
              { fileId, messageId, index }
                            │
                            ▼
          ┌──────────────────────────────┐
          │  Telegram Bot API             │
          │  (Distributed Binary Storage) │
          │                              │
          │  ┌──────┐ ┌──────┐ ┌──────┐ │
          │  │Chunk0│ │Chunk1│ │ChunkN│ │
          │  │15 MB │ │15 MB │ │ nMB  │ │
          │  └──────┘ └──────┘ └──────┘ │
          │                              │
          └──────────────────────────────┘
```

---

## Core Layers

### 1. Authentication Layer (`js/api.js`)

**Responsibility:** User registration, login, password management, session persistence.

#### Username-First Authentication Flow

```
User Input: @username (e.g. @aaryan or aaryan)
    ↓
Firestore lookup: profiles/{username}
    ↓
Retrieve: recoveryEmail
    ↓
Firebase Auth: signInWithEmailAndPassword(recoveryEmail, password)
```

**Key Features:**
- **Username namespace** globally unique, collision-checked at registration
- **Recovery email** stored in `profiles` collection, never exposed to UI
- **Passwords** hashed by Firebase Auth (never stored plaintext)
- **onAuthStateChanged** automatically syncs UI and loads files on auth state change

**Forms:**
- **Login** — Username → recovery email → Firebase Auth
- **Register** — Create username, store email, set password
- **Reset** — Username → recovery email → Firebase password reset link

#### Signup/Login Flow

```javascript
// Registration
const username = cleanUsername(input);  // Remove @, lowercase
const exists = await getDoc(profiles/{username});
if (exists) throw "Username taken"
const cred = createUserWithEmailAndPassword(email, password);
setDoc(profiles/{username}, { userId, recoveryEmail, displayName });

// Login
const email = await getRecoveryEmail(username);
signInWithEmailAndPassword(email, password);

// Session Persistence
onAuthStateChanged(auth, async (user) => {
    if (user) {
        State.currentUser = user;
        loadFiles();  // Fetch user's file index
        renderFiles();
    }
});
```

---

### 2. File Operations Layer (`js/api.js`, `js/main.js`)

**Responsibility:** Upload, download, delete, metadata persistence, Telegram interaction.

#### Upload Pipeline

**Triggered by:** Drag-and-drop or file input change

```javascript
async handleFileUpload(files) {
    for each file:
        1. Validate size (max 1 GB)
        2. Calculate chunks = ceil(fileSize / CHUNK_SIZE)
        3. For each chunk (i):
           - Slice blob from file
           - Create FormData with chunk bytes
           - POST to Telegram Bot API → sendDocument
           - Receive messageId & fileId
           - Store in chunks array: { index, messageId, fileId }
        4. After all chunks uploaded:
           - Write to Firestore/files/{docId}:
             {
               userId, fileName, fileSize, fileType,
               totalChunks, chunks: [{ index, messageId, fileId }],
               parentId, createdAt,
               isFolder: false, isStarred: false, inTrash: false
             }
        5. Update State.allFiles
        6. Re-render file list
}
```

**Upload State Display:**
- Top banner shows upload progress with circular loader
- Displays "File X of Y (filename.ext)"
- Progress updates in real-time via SVG stroke-dashoffset animation

#### Download/Preview Pipeline

```javascript
async processFileAction(docId, actionType = 'download' | 'preview') {
    1. Retrieve file from State.allFiles
    2. Sort chunks by index
    3. For each chunk:
       - GET /getFile?file_id=fileId → receive file_path
       - Use Cloudflare proxy to fetch file_path (CORS workaround)
       - Fetch chunk blob
       - Accumulate in blobs array
    4. Combine blobs into final Blob
    5. Create Object URL
    
    If preview:
        - Detect type: image/* → <img>, video/* → <video>, else → error
        - Display in modal
        - Add download button
    
    If download:
        - Create <a> element, set href=blobUrl, download=fileName
        - Click to trigger browser download
        - Revoke Object URL after completion
}
```

#### Delete Pipeline

**Soft Delete (Move to Trash):**
```javascript
moveToTrash(id) {
    updateDoc(files/{id}, { inTrash: true, deletedAt: Date.now() })
}
```

**Permanent Delete:**
```javascript
confirmDelete(id) {
    1. Get file from State.allFiles
    2. For each chunk:
       - POST Telegram /deleteMessage?message_id=messageId
    3. deleteDoc(files/{id})
    4. Remove from State.allFiles
}
```

**Auto-cleanup (7-day retention):**
```javascript
cleanupOldTrash() {
    Query all files where (inTrash == true AND (now - deletedAt) > 7 days)
    For each file:
        deleteFromTelegram(file)
        batch.delete(firestore doc)
    batch.commit()
}
// Called on every user login
```

---

### 3. State Management (`js/config.js`)

**Global singleton** attached to `window.State`. Single source of truth for entire application.

```javascript
State = {
    currentUser,           // Firebase user object
    currentUsername,       // @username handle
    allFiles,              // Full file index (from Firestore, client-filtered)
    currentView,           // 'home' | 'recent' | 'starred' | 'trash'
    viewMode,              // 'list' | 'grid'
    advFilterType,         // 'all' | 'image' | 'video' | 'document'
    advFilterDate,         // 'any' | 'today' | '7days' | '30days'
    currentSearch,         // Search string (real-time filtering)
    currentFolderId,       // Active folder ID (null = root)
    breadcrumbs,           // Navigation trail [{ id, name }]
    selectedItems,         // Set<fileId> for bulk operations
    itemToDelete,          // Pending delete target
    itemToRename,          // Pending rename target
    currentPreviewUrl      // Object URL for active preview (revoked on close)
}
```

**Immutability Pattern:**
- Any state mutation triggers `renderFiles()`
- `renderFiles()` is **pure function of State** — deterministic output
- No intermediate rendering states; React-like unidirectional flow

---

### 4. Firestore Schema

**Collections:**

#### `profiles/{username}`
```
{
  userId: string         // Firebase UID (links to auth.uid)
  displayName: string    // User's display name
  recoveryEmail: string  // Hidden email for password reset
}
```

#### `files/{docId}`
```
{
  userId: string              // Owner's Firebase UID
  fileName: string            // Display name (max 255 chars)
  fileType: string            // MIME type (e.g. "image/jpeg")
  fileSize: number            // Bytes (0 for folders)
  totalChunks: number         // Number of 15 MB chunks
  chunks: [{
    index: number             // Chunk sequence (0 → totalChunks-1)
    messageId: number         // Telegram message ID (for deletion)
    fileId: string            // Telegram file_id (for download)
  }]
  parentId: string | null     // Parent folder ID (null = root)
  isFolder: boolean           // Folder flag
  isStarred: boolean          // Star flag
  inTrash: boolean            // Soft-delete flag
  deletedAt: number | null    // Trash timestamp (epoch ms, null if not in trash)
  createdAt: number           // Upload timestamp (epoch ms)
}
```

**Query Patterns:**
- All user files: `where("userId", "==", auth.currentUser.uid)`
- Files in trash: `where("userId", "==", uid) AND where("inTrash", "==", true)`
- Files in folder: `where("parentId", "==", folderId)`
- Recently uploaded: Sort by `createdAt` DESC, limit 20

**Filtering Strategy:** All filtering (by type, date, search) happens **client-side** after `loadFiles()`. No secondary queries; reduces Firestore read count.

---

### 5. UI Layer (`index.html`, `style.css`, `js/ui.js`)

**Framework:** Vanilla JavaScript + Tailwind CSS + Lucide icons

#### Layout Structure

```
Header (sticky)
├─ Logo + "BUCKET"
├─ User info (display name, avatar)
└─ Settings, Logout

Sidebar (hidden on mobile, visible on sm+)
├─ New Upload button
├─ Navigation: Home, Recent, Starred, Trash
└─ Logout

Main Content
├─ Selection bar (slides down from top when items selected)
├─ View header (title, view toggle, search, advanced filter)
├─ Breadcrumbs (My Drive / Folder A / Folder B)
├─ New Folder button (only in Home view)
├─ File List / Grid
└─ Upload banner (progress indicator)
```

#### Views

| View | Purpose | Filters |
|------|---------|---------|
| **Home** | Root folder navigation | `parentId == null` (non-trash) |
| **Recent** | Last 20 uploaded files | All files sorted by `createdAt` DESC, no folders, limit 20 |
| **Starred** | Bookmarked files | `isStarred == true` (non-trash) |
| **Trash** | Soft-deleted items | `inTrash == true` (7-day retention) |

#### File Operations Menu

**List View (one row per file):**
- Checkbox (multi-select)
- Filename (clickable → preview)
- Date modified
- File size
- Actions: Share, Rename, Star, Download, Delete

**Grid View (card per file):**
- Type-specific icon (image/video/pdf/generic)
- Filename (truncated)
- Size + date (bottom)
- Hover actions overlay

#### Modals

| Modal | Trigger | Action |
|-------|---------|--------|
| `folder-modal` | "New Folder" button | Create folder in current folder |
| `rename-modal` | Rename action | Update `fileName` in Firestore |
| `delete-modal` | Single delete | Confirm permanent deletion |
| `bulk-delete-modal` | Delete selected | Confirm bulk permanent deletion |
| `search-modal` | Filter icon | Set type + date filters |
| `share-modal` | Share action | Generate & copy public link |
| `settings-modal` | Settings icon | Edit profile, change password, view storage |
| `preview-modal` | File click | Display image/video/unsupported |
| `action-modal` | Upload/download | Progress overlay during fetch |
| `legal-modal` | Privacy/Terms/License | Display legal documents |

#### Toast Notifications

- **Success** (green): Slide down from top-center
- **Error** (red): Slide down from top-center
- **Info** (dark): Slide down from top-center
- Auto-dismiss after 3.5 seconds

---

### 6. Selection & Bulk Operations (`js/main.js`)

**Multi-select state:** `State.selectedItems = new Set<fileId>`

**Bulk Actions:**
- **Star** — Toggle starred on all selected (if any unstarred, star all; else unstar all)
- **Move to Trash** — Set `inTrash: true, deletedAt: now()` on all
- **Restore** — Set `inTrash: false, deletedAt: null` on all (trash view only)
- **Permanently Delete** — Delete from Telegram + Firestore (trash view only)

**Implementation:**
```javascript
bulkToggleStar() {
    const anyUnstarred = selectedItems.find(id => !allFiles[id].isStarred);
    batch = writeBatch(db);
    selectedItems.forEach(id => {
        batch.update(files/{id}, { isStarred: anyUnstarred })
    })
    batch.commit();
}
```

**Selection Bar:**
- Fixed at top when items selected
- Shows count + contextual action buttons
- Slides in from top with transform animation

---

### 7. File Chunking & Reconstruction

**Chunk Constants:**
- `CHUNK_SIZE = 15 * 1024 * 1024` (15 MB)
- `MAX_FILE_SIZE = 1024 * 1024 * 1024` (1 GB)

**Upload:**
```
File (1 GB max)
  → Slice into [0, 15MB), [15MB, 30MB), ... [nMB, end)
  → Each blob sent as multipart/form-data to Telegram
  → Receive file_id + message_id per chunk
  → Store in chunks array
```

**Download:**
```
chunks = [{ index: 0, messageId: 123, fileId: "ABC" }, ...]
  → For each chunk:
       getFile?file_id=ABC → file_path
       fetch via Cloudflare proxy → blob
  → Combine blobs in order
  → new Blob(blobs, { type: mimeType })
  → URL.createObjectURL() → blobUrl
```

**Retry Logic:**
```javascript
async fetchWithRetry(url, opts, retries=3) {
    for i in 0..retries:
        try: return fetch(url, opts).json()
        catch: if (i < retries-1) sleep(1000 * (i+1))
    throw error
}
```

---

### 8. Telegram Integration

**Bot Token & Chat ID:** Encoded in `config.js` as base64 (basic obfuscation)

```javascript
ENCODED_BOT_TOKEN = btoa("8180142935:AAHG_8_...")
ENCODED_CHAT_ID = btoa("-1003749727946")
// Decoded at runtime: bot = atob(ENCODED_BOT_TOKEN)
```

**API Endpoints Used:**

| Endpoint | Purpose |
|----------|---------|
| `POST /sendDocument` | Upload file chunk |
| `GET /getFile?file_id=X` | Get file path for download |
| `POST /deleteMessage?message_id=X` | Delete chunk |

**CORS Workaround:**
- Direct Telegram file fetch fails due to CORS headers
- Solution: Cloudflare Worker proxy at `https://fragrant-cloud-6ed7.iaaryan37.workers.dev/`
- Proxy transforms request to bypass CORS restrictions

---

## Data Flow

### Upload
```
User selects files
  → File input change event
  → handleFileUpload(files[])
  → For each file:
       Calculate chunks
       For each chunk:
           Slice blob
           FormData + chunk bytes
           POST Telegram/sendDocument
           Receive messageId
           Store in array
       Write to Firestore
       Update State.allFiles
  → renderFiles()
  → UI updates with new files
```

### Navigation
```
User clicks folder
  → enterFolder(id, name)
  → State.currentFolderId = id
  → State.breadcrumbs.push({ id, name })
  → renderFiles()
  → Filter: parentId == State.currentFolderId
  → Display filtered files
```

### View Switching
```
User clicks "Starred"
  → UI.switchView('starred')
  → State.currentView = 'starred'
  → State.currentFolderId = null (reset)
  → renderFiles()
  → Filter: isStarred == true (exclude trash)
  → Display filtered files
```

### Search & Filter
```
User types in search box
  → Input event
  → State.currentSearch = value
  → renderFiles()
  → Filter: fileName.includes(currentSearch)
  → Apply advFilterType & advFilterDate
  → Re-render list
```

---

## File Structure

```
bucket/
├── index.html              Main dashboard + landing + all modals
├── account.html            (Referenced but not present in current build)
├── style.css               Tailwind utilities, custom scrollbars, animations
│
├── js/
│   ├── config.js           Firebase init, State singleton, constants
│   ├── api.js              Auth forms, Telegram upload/download/delete, drag-drop
│   ├── main.js             File operations, folder nav, rendering logic
│   └── ui.js               UI utilities, modals, toasts, form switching
│
└── README.md               Architecture documentation (now in ARCHITECTURE.md)
```

**Module Dependencies:**
```
index.html
  ├── Tailwind CSS CDN
  ├── Lucide Icons CDN
  ├── style.css
  └── js/main.js (type="module")
      ├── js/config.js
      ├── js/api.js
      ├── js/ui.js
      └── Firebase SDK (imported in modules)
```

---

## Performance Optimizations

### 1. Client-Side Chunking
- Files never sent as monolithic blobs; sliced in browser
- Upload throughput limited only by client's network connection
- Each chunk independently retriable

### 2. Optimistic UI Updates
```javascript
// Update local state immediately
State.allFiles.push({ ...newFile });
renderFiles();  // Render first

// Then persist to Firestore
addDoc(collection(db, "files"), newFile);
```
Result: Instant UI feedback, no perceived lag.

### 3. Batch Firestore Operations
```javascript
const batch = writeBatch(db);
selectedItems.forEach(id => {
    batch.update(files/{id}, { inTrash: true })
})
batch.commit();  // Single atomic write
```
Result: 100 updates in 1 request, not 100 requests.

### 4. Lazy Client-Side Filtering
```javascript
loadFiles()  // Single Firestore query: userId == current
// All subsequent filtering (trash, starred, search) happens in-memory
renderFiles()  // Pure function, no network
```
Result: Instant view switching, no additional queries.

### 5. Object URL Lifecycle Management
```javascript
// Create URL
const blobUrl = URL.createObjectURL(blob);

// Use in preview
preview.src = blobUrl;

// Revoke when done
URL.revokeObjectURL(blobUrl);
State.currentPreviewUrl = null;
```
Result: No memory leaks from orphaned blob references.

### 6. SVG Circular Loader
- Animated via CSS stroke-dashoffset
- No image re-requests or repaints
- Smooth 60fps animation

---

## Security Model

### Authentication
- **Firebase Auth** handles password hashing + session management
- **Recovery email** stored in Firestore, masked from UI
- **Username namespace** globally unique, prevents impersonation

### Data Privacy
- **Zero-knowledge:** Bucket cannot read file contents
- **User-scoped:** All queries filtered by `userId == auth.uid`
- **No indexing:** Firestore stores only filename, size, MIME type, chunk IDs
- **Client-side encryption:** Not yet implemented (roadmap item)

### Trash Retention
- **7-day auto-cleanup:** Files deleted after 7 days automatically
- **Reversible soft-delete:** Users can restore within retention window
- **Permanent deletion:** Iterates chunk IDs, calls Telegram deleteMessage API

---

## Known Limitations & Future Work

### Current Limitations
1. **No E2E encryption** — Files stored as plaintext on Telegram
2. **No resumable uploads** — Interruption requires restart
3. **Max file size 1 GB** — Telegram file_id limitation
4. **Chunk size 15 MB** — Fixed, not configurable

### Roadmap
- [ ] AES-256 client-side encryption before chunk upload
- [ ] Resumable uploads with checkpoint system
- [ ] Shared drives with permission tiers
- [ ] Public time-limited signed URLs
- [ ] Storage analytics dashboard
- [ ] CLI interface
- [ ] Mobile React Native app

---

## Configuration

### Firebase Project
```javascript
firebaseConfig = {
  apiKey: "AIzaSyBPCMSyOuE3cmqOzQYBpiDbnTrVlG92zmE",
  authDomain: "bucket-650eb.firebaseapp.com",
  projectId: "bucket-650eb",
  storageBucket: "bucket-650eb.firebasestorage.app",
  messagingSenderId: "469812149420",
  appId: "1:469812149420:web:c908fabd72829552e8b309"
}
```

### Telegram Bot
- **Token:** Encoded in `config.js`
- **Chat ID:** Private channel for storage (encoded)
- **API Base:** `https://api.telegram.org/bot{token}/`

### CORS Proxy
- **Endpoint:** `https://fragrant-cloud-6ed7.iaaryan37.workers.dev/`
- **Purpose:** Bypass Telegram file download CORS restrictions

---

## Development Notes

### Entry Point
```html
<script type="module" src="js/main.js"></script>
```

### Module Initialization Order
1. `config.js` — Firebase init, State singleton
2. `api.js` — Auth listeners, Telegram integration
3. `ui.js` — UI utilities export
4. `main.js` — File operations, rendering

### Browser APIs Used
- **File API** — `File.slice()` for chunking
- **Fetch API** — HTTP uploads/downloads
- **FormData** — Multipart file uploads
- **Blob API** — Binary data handling, `URL.createObjectURL()`
- **Firebase SDK** — Auth, Firestore, password reset

### Debugging
- Console logs disabled in production
- Error messages sanitized before display (Firebase errors stripped)
- Toast notifications for user-facing errors

---

## Summary

BUCKET is an **unconventional but elegant** proof-of-concept in infrastructure-independent storage. By leveraging **Telegram's globally replicated infrastructure** as a free storage backend and **Firebase** for lightweight metadata indexing, it achieves:

✅ **1 GB per file** storage  
✅ **Zero infrastructure cost**  
✅ **No single point of failure**  
✅ **Zero-knowledge architecture**  
✅ **Google Drive-grade interface**  
✅ **Client-side processing** (no backend required)

The codebase is **modular, maintainable, and extensible** — ready for future additions like E2E encryption, resumable uploads, and shared drives.
