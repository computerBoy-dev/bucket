<div align="center">

<br/>

```
██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗████████╗
██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝
██████╔╝██║   ██║██║     █████╔╝ █████╗     ██║   
██╔══██╗██║   ██║██║     ██╔═██╗ ██╔══╝     ██║   
██████╔╝╚██████╔╝╚██████╗██║  ██╗███████╗   ██║   
╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝   
```

**A distributed, chunk-based file storage network with zero-knowledge architecture, Telegram-backed persistence, and a Google Drive-grade interface.**

<br/>

[![Network](https://img.shields.io/badge/Network-Distributed%20Node-3b82f6?style=flat-square)](https://github.com)
[![Storage](https://img.shields.io/badge/Storage-Chunk--Based-10b981?style=flat-square)](https://github.com)
[![Encryption](https://img.shields.io/badge/Architecture-Zero--Knowledge-7c3aed?style=flat-square)](https://github.com)
[![Backend](https://img.shields.io/badge/Index-Firebase%20Firestore-ef4444?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Auth](https://img.shields.io/badge/Auth-Passwordless%20Username-f59e0b?style=flat-square)](https://github.com)
[![Chunk](https://img.shields.io/badge/Chunk%20Size-15%20MB-6366f1?style=flat-square)](https://github.com)
[![Max File](https://img.shields.io/badge/Max%20File-1%20GB-ec4899?style=flat-square)](https://github.com)
[![License](https://img.shields.io/badge/License-Proprietary-6b7280?style=flat-square)](LICENSE)

<br/>

*Bucket is not a wrapper around an existing storage API. It is a custom-engineered distributed file network that fragments files into 15 MB chunks, routes them across a Telegram-backed message bus, indexes them in Firestore, and reconstructs them on demand — with no server infrastructure of its own.*

<br/>

</div>

---

## Overview

Bucket is a **serverless distributed storage network** built on an unconventional but powerful architectural choice: using Telegram's Bot API as a globally distributed, high-availability, free binary storage layer. Files uploaded to Bucket are split into chunks, transmitted as Telegram message payloads, and the resulting message IDs are stored in Firestore as a reconstruction index.

The result is a system that stores up to **1 GB per file** with **zero infrastructure cost**, **no single point of failure**, and **no proprietary storage vendor lock-in**. The interface is a polished, Google Drive-grade web application with folder hierarchies, starred files, trash with retention, bulk operations, and a real-time sync engine.

Bucket was engineered by **31E0** as a proof of concept in infrastructure-independent distributed storage.

---

## Philosophy & Design Thinking

> *"Infrastructure should be invisible. Storage should be limitless. Privacy should be default."*

Three principles drove every architectural decision in Bucket:

**1. Zero proprietary infrastructure.** Bucket owns no servers, no storage volumes, no CDN. The persistence layer is a Telegram channel — globally replicated, highly available, and operated by a third party. Bucket's only owned infrastructure is a Firestore index.

**2. Zero-knowledge by design.** Bucket cannot read your data. Files are stored as binary blobs across a distributed message network. The index (Firestore) contains only metadata: filenames, sizes, chunk IDs, and timestamps. No content is indexed, no content is processed server-side.

**3. Chunk-first architecture.** Every file, regardless of size, is treated as a sequence of equal-size binary chunks. This enables uploads and downloads that are resumable, parallelizable, and resilient to mid-transfer failures.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                            BUCKET CLIENT                               │
│                                                                        │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  Auth      │    │  File Engine │    │  UI Layer    │              │
│  │  Layer     │    │  (Chunker)   │    │  (Drive-like)│              │
│  └─────┬──────┘    └──────┬───────┘    └──────┬───────┘              │
│        │                  │                    │                       │
│        ▼                  ▼                    ▼                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Firebase Layer                                │  │
│  │   Auth (email/password)  │  Firestore (metadata index)          │  │
│  └───────────────────────────────────┬─────────────────────────────┘  │
│                                      │                                 │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │
                              File Chunk Records
                     { fileId, chunkIndex, messageId, chatId }
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │      Telegram Bot API             │
                    │   (Distributed Binary Storage)    │
                    │                                   │
                    │  ┌────────┐ ┌────────┐ ┌──────┐  │
                    │  │Chunk 0 │ │Chunk 1 │ │ ...  │  │
                    │  │15MB    │ │15MB    │ │ nMB  │  │
                    │  └────────┘ └────────┘ └──────┘  │
                    │   Stored as Telegram file blobs   │
                    └──────────────────────────────────┘
```

---

## Core Systems

### Chunking Engine

Files up to **1 GB** are processed entirely in the browser using the File API. The chunking system slices files into sequential 15 MB segments using `File.prototype.slice()`:

```
File (up to 1 GB)
  │
  ├─ Chunk 0: bytes [0, 15MB)      → Telegram message → messageId_0
  ├─ Chunk 1: bytes [15MB, 30MB)   → Telegram message → messageId_1
  ├─ Chunk 2: bytes [30MB, 45MB)   → Telegram message → messageId_2
  └─ Chunk N: bytes [N*15MB, end)  → Telegram message → messageId_N
```

Each chunk is uploaded as a `multipart/form-data` payload to the Telegram Bot API. The returned `message_id` is stored in Firestore under the file's chunk index. On download, chunks are fetched in order by `message_id`, reassembled into a `Blob`, and served as a browser download.

### Metadata Index (Firestore)

Bucket's Firestore schema is designed for minimal metadata with maximum query flexibility:

```
files/{fileId}
  ├─ userId         string     Owner's Firebase UID
  ├─ fileName       string     Display name
  ├─ fileType       string     MIME type
  ├─ fileSize       number     Total bytes
  ├─ parentId       string?    Parent folder ID (null = root)
  ├─ isFolder       boolean    Folder flag
  ├─ isStarred      boolean    Star flag
  ├─ inTrash        boolean    Soft-delete flag
  ├─ deletedAt      number?    Trash timestamp (epoch ms)
  ├─ createdAt      number     Upload timestamp (epoch ms)
  └─ chunks         [{index, messageId}]   Reconstruction index
```

Files are queried with a single compound filter: `userId == currentUser.uid`. All view-level filtering (trash, starred, recent, folder scope) is applied client-side for instant UI response.

### Authentication System

Bucket implements a **username-first authentication flow** on top of Firebase Auth:

```
User provides: @username (e.g. @aaryan or aaryan)
       │
       ▼
Firestore lookup: profiles/{username}
       │
       ▼
Retrieves: recoveryEmail (stored at registration)
       │
       ▼
Firebase Auth: signInWithEmailAndPassword(recoveryEmail, password)
```

This design means:
- Users never see or interact with email addresses during login
- Emails are only stored as recovery credentials in the `profiles` collection
- Username namespace is globally unique and collision-checked at registration
- Passwords are never stored in plaintext (Firebase Auth handles hashing)

### Trash & Retention System

Bucket implements a **soft-delete trash system** with 7-day automatic retention:

```
moveToTrash(id)
  → sets { inTrash: true, deletedAt: Date.now() }

Trash view
  → shows all files where inTrash == true

Permanent delete
  → deleteFromTelegram(file)     Deletes each chunk from Telegram
  → deleteDoc(db, "files", id)  Removes Firestore record
```

Files in trash are fully reconstructable until permanently deleted. On permanent deletion, the system iterates chunk IDs and issues Telegram `deleteMessage` API calls before removing the Firestore document.

---

## Interface & User Experience

Bucket's interface is a full-featured file management system with a visual language inspired by Google Drive:

### Views
- **My Drive** — root folder, hierarchical navigation with breadcrumbs
- **Recent** — last 20 uploaded files, sorted by `createdAt`
- **Starred** — bookmarked files
- **Trash** — soft-deleted items with restore and permanent delete

### File Operations
| Operation | Mechanism |
|---|---|
| Upload | Chunked multipart upload to Telegram, Firestore metadata write |
| Download | Chunk reconstruction from Telegram message IDs, `Blob` assembly |
| Preview | Browser-native preview for images, video, PDF, text |
| Rename | Firestore `updateDoc` on `fileName` field |
| Star / Unstar | Firestore `updateDoc` on `isStarred` field |
| Move to Trash | Soft delete — `inTrash: true`, `deletedAt` timestamp |
| Restore | Unsets `inTrash`, clears `deletedAt` |
| Permanent Delete | Telegram chunk deletion + Firestore `deleteDoc` |
| Share | Generates a reconstructible link via message ID references |
| Create Folder | Writes `isFolder: true` document to Firestore |
| Bulk Select | Multi-item selection with batch Firestore `writeBatch` operations |

### Display Modes

The file browser supports two display modes:

**List View** — Tabular layout with filename, date, size, and inline action buttons. Column visibility adapts to screen width.

**Grid View** — Card-based layout with type-specific icons (image, video, PDF, file). Hover reveals actions.

---

## State Management

Global application state is managed through a centralized `State` singleton:

```js
State = {
    currentUser,           // Firebase user object
    currentUsername,       // @username handle
    allFiles,              // Full file index (client-side filtered per view)
    currentView,           // 'home' | 'recent' | 'starred' | 'trash'
    viewMode,              // 'list' | 'grid'
    advFilterType,         // 'all' | 'image' | 'video' | 'document'
    advFilterDate,         // 'any' | 'today' | '7days' | '30days'
    currentSearch,         // Search string (real-time filtering)
    currentFolderId,       // Active folder ID (null = root)
    breadcrumbs,           // Navigation trail [{ id, name }]
    selectedItems,         // Set<fileId> — multi-select state
    itemToDelete,          // Pending delete target
    itemToRename,          // Pending rename target
    currentPreviewUrl,     // Object URL for previewed file (revoked on close)
}
```

This design allows all UI components to read a single source of truth. `renderFiles()` is a pure function of `State` — any state mutation followed by `renderFiles()` produces a deterministic UI output.

---

## Project Structure

```
bucket/
├── index.html          Dashboard shell — Drive-like file browser UI
├── account.html        Authentication shell — login, register, reset
├── config.js           Firebase init, global State singleton, constants
├── api.js              Auth logic, Telegram upload/download/delete, Firestore ops
├── main.js             File operations — CRUD, bulk, folder nav, renderFiles()
├── ui.js               UI utilities — toasts, modals, view switching, selection bar
└── style.css           Tailwind utilities, custom scrollbars, toast animations
```

---

## Performance & Scalability

- **Client-side chunking** — Files are sliced in the browser with zero server involvement. Upload throughput is limited only by the client's network connection to Telegram's API.
- **Optimistic UI** — State mutations are applied immediately to `State.allFiles` before the Firestore write resolves, giving instant visual feedback.
- **Batch operations** — Bulk select actions use Firestore `writeBatch` to commit multiple document updates in a single network round-trip.
- **Lazy file loading** — `loadFiles()` fetches all file metadata on auth, then all subsequent filtering and sorting happens client-side with no additional network requests.
- **Object URL lifecycle management** — Preview URLs are created with `URL.createObjectURL()` and explicitly revoked with `URL.revokeObjectURL()` when the preview modal closes, preventing memory leaks.

---

## Privacy Model

Bucket's privacy architecture has three properties:

1. **No content indexing.** Firestore stores only filenames, sizes, MIME types, and chunk IDs. File contents are never written to any database.

2. **User-owned data.** All file records are scoped by `userId`. No cross-user data access is possible without credentials.

3. **Operator-blind storage.** Files are stored as binary payloads in Telegram's infrastructure. Neither Bucket nor 31E0 has the ability to read file contents.

---

## Roadmap

- [ ] End-to-end encryption — client-side AES-256 encryption before chunk upload
- [ ] Resumable uploads — checkpoint system for large file interruption recovery
- [ ] Shared drives — multi-user collaborative folders with permission tiers
- [ ] Public links — time-limited signed URLs for unauthenticated file access
- [ ] Storage analytics — per-user storage dashboard with chunk-level audit logs
- [ ] Bucket CLI — command-line interface for programmatic file operations
- [ ] Mobile-native app — React Native client with background upload support

---

## License

© 2026 Aaryan · 31E0. All Rights Reserved. Proprietary Software.

Reproduction, cloning, reverse-engineering, or redistribution of Bucket's source code or architecture without explicit written permission from 31E0 is strictly prohibited.

---

<div align="center">

**No servers. No storage costs. No vendor lock-in.**

*Bucket proves that infrastructure independence is an engineering choice, not a constraint.*

<br/>

`Chunks` · `Telegram` · `Firestore` · `Zero-Knowledge` · `Serverless` · `Distributed`

</div>
