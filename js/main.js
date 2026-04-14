import { db, State } from './config.js';
import { UI } from './ui.js';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, query, where, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { deleteFromTelegram } from './api.js';

// --- BULK SELECTION ACTIONS ---
export function toggleSelect(id, event) {
    if(event) event.stopPropagation();
    if(State.selectedItems.has(id)) State.selectedItems.delete(id);
    else State.selectedItems.add(id);
    renderFiles();
}
window.toggleSelect = toggleSelect;

export function clearSelection() {
    State.selectedItems.clear();
    renderFiles();
}
window.clearSelection = clearSelection;

export async function bulkMoveToTrash() {
    if(State.selectedItems.size === 0) return;
    const batch = writeBatch(db);
    State.selectedItems.forEach(id => {
        batch.update(doc(db, "files", id), { inTrash: true, deletedAt: Date.now() });
        const item = State.allFiles.find(f => f.id === id);
        if(item) item.inTrash = true;
    });
    try {
        await batch.commit();
        UI.showToast(`${State.selectedItems.size} items moved to trash`, 'success');
        State.selectedItems.clear();
        renderFiles();
    } catch(e) { UI.showToast('Failed to move items', 'error'); }
}
window.bulkMoveToTrash = bulkMoveToTrash;

export async function bulkRestore() {
    if(State.selectedItems.size === 0) return;
    const batch = writeBatch(db);
    State.selectedItems.forEach(id => {
        batch.update(doc(db, "files", id), { inTrash: false, deletedAt: null });
        const item = State.allFiles.find(f => f.id === id);
        if(item) item.inTrash = false;
    });
    try {
        await batch.commit();
        UI.showToast(`${State.selectedItems.size} items restored`, 'success');
        State.selectedItems.clear();
        renderFiles();
    } catch(e) { UI.showToast('Failed to restore', 'error'); }
}
window.bulkRestore = bulkRestore;

export function openBulkDeleteModal() {
    UI.openModal('bulk-delete-modal');
    const cnt = document.getElementById('bulk-delete-count');
    if(cnt) cnt.innerText = State.selectedItems.size;
}
window.openBulkDeleteModal = openBulkDeleteModal;

export async function confirmBulkDelete() {
    UI.closeModal('bulk-delete-modal');
    if(State.selectedItems.size === 0) return;
    
    // Permanent Telegram Delete for Bulk
    for (const id of State.selectedItems) {
        const file = State.allFiles.find(f => f.id === id);
        if (file) await deleteFromTelegram(file);
    }

    const batch = writeBatch(db);
    State.selectedItems.forEach(id => { batch.delete(doc(db, "files", id)); });
    try {
        await batch.commit();
        UI.showToast(`${State.selectedItems.size} items permanently deleted`, 'success');
        State.allFiles = State.allFiles.filter(f => !State.selectedItems.has(f.id));
        State.selectedItems.clear();
        renderFiles();
    } catch(e) { UI.showToast('Failed to delete', 'error'); }
}
window.confirmBulkDelete = confirmBulkDelete;

export async function bulkToggleStar() {
    if(State.selectedItems.size === 0) return;
    const batch = writeBatch(db);
    let anyUnstarred = false;
    State.selectedItems.forEach(id => {
        const item = State.allFiles.find(f => f.id === id);
        if(item && !item.isStarred) anyUnstarred = true;
    });

    State.selectedItems.forEach(id => {
        batch.update(doc(db, "files", id), { isStarred: anyUnstarred });
        const item = State.allFiles.find(f => f.id === id);
        if(item) item.isStarred = anyUnstarred;
    });
    try {
        await batch.commit();
        UI.showToast(anyUnstarred ? 'Added to Starred' : 'Removed from Starred', 'success');
        State.selectedItems.clear();
        renderFiles();
    } catch(e) { UI.showToast('Failed to update stars', 'error'); }
}
window.bulkToggleStar = bulkToggleStar;

// --- INDIVIDUAL FILE & FOLDER ACTIONS ---
export async function createFolder() {
    const nameInput = document.getElementById('new-folder-name');
    if(!nameInput) return;
    const name = nameInput.value.trim();
    if(!name) return UI.showToast('Folder name required', 'error');
    UI.closeModal('folder-modal');
    try {
        await addDoc(collection(db, "files"), {
            userId: State.currentUser.uid, fileName: name, isFolder: true,
            parentId: State.currentFolderId, inTrash: false, isStarred: false, createdAt: Date.now()
        });
        UI.showToast('Folder created', 'success');
        loadFiles();
    } catch(e) { UI.showToast('Error creating folder', 'error'); }
}
window.createFolder = createFolder;

export async function renameItem() {
    if(!State.itemToRename) return;
    const input = document.getElementById('rename-input');
    if(!input) return;
    const newName = input.value.trim();
    if(!newName) return UI.showToast('Name cannot be empty', 'error');
    UI.closeModal('rename-modal');
    try {
        await updateDoc(doc(db, "files", State.itemToRename), { fileName: newName });
        const item = State.allFiles.find(f => f.id === State.itemToRename);
        if(item) item.fileName = newName;
        renderFiles();
        UI.showToast('Renamed successfully', 'success');
    } catch(e) { UI.showToast('Failed to rename', 'error'); }
    State.itemToRename = null;
}
window.renameItem = renameItem;

export async function toggleStar(id) {
    const file = State.allFiles.find(f => f.id === id);
    if(!file) return;
    try {
        await updateDoc(doc(db, "files", id), { isStarred: !file.isStarred });
        file.isStarred = !file.isStarred;
        renderFiles();
        UI.showToast(file.isStarred ? 'Added to Starred' : 'Removed from Starred', 'success');
    } catch(e) { UI.showToast('Error updating', 'error'); }
}
window.toggleStar = toggleStar;

export async function moveToTrash(id) {
    try {
        await updateDoc(doc(db, "files", id), { inTrash: true, deletedAt: Date.now() });
        const item = State.allFiles.find(f => f.id === id);
        if(item) item.inTrash = true;
        State.selectedItems.delete(id); 
        renderFiles();
        UI.showToast('Moved to Trash', 'success');
    } catch(e) { UI.showToast('Error', 'error'); }
}
window.moveToTrash = moveToTrash;

export async function restoreFromTrash(id) {
    try {
        await updateDoc(doc(db, "files", id), { inTrash: false, deletedAt: null });
        const item = State.allFiles.find(f => f.id === id);
        if(item) item.inTrash = false;
        State.selectedItems.delete(id);
        renderFiles();
        UI.showToast('Restored', 'success');
    } catch(e) { UI.showToast('Error', 'error'); }
}
window.restoreFromTrash = restoreFromTrash;

export async function confirmDelete() {
    if (!State.itemToDelete) return;
    UI.closeModal('delete-modal');
    try {
        // Permanent Telegram Delete
        const file = State.allFiles.find(f => f.id === State.itemToDelete);
        if (file) await deleteFromTelegram(file);

        await deleteDoc(doc(db, "files", State.itemToDelete));
        UI.showToast('Item deleted permanently', 'success');
        State.allFiles = State.allFiles.filter(f => f.id !== State.itemToDelete);
        State.selectedItems.delete(State.itemToDelete);
        renderFiles();
    } catch (err) { UI.showToast('Failed to delete', 'error'); }
    State.itemToDelete = null;
}
window.confirmDelete = confirmDelete;

// --- NAVIGATION & FILTERS ---
export function enterFolder(id, name) {
    State.currentFolderId = id;
    State.breadcrumbs.push({ id, name });
    State.selectedItems.clear();
    renderFiles();
}
window.enterFolder = enterFolder;

export function goToBreadcrumb(index) {
    State.breadcrumbs = State.breadcrumbs.slice(0, index + 1);
    State.currentFolderId = State.breadcrumbs[State.breadcrumbs.length - 1].id;
    State.selectedItems.clear();
    renderFiles();
}
window.goToBreadcrumb = goToBreadcrumb;

export function applyAdvancedSearch() {
    const typeSelect = document.getElementById('adv-search-type');
    const dateSelect = document.getElementById('adv-search-date');
    if(typeSelect) State.advFilterType = typeSelect.value;
    if(dateSelect) State.advFilterDate = dateSelect.value;
    UI.closeModal('search-modal');
    renderFiles();
}
window.applyAdvancedSearch = applyAdvancedSearch;

const searchInput = document.getElementById('search-input');
if(searchInput) {
    searchInput.addEventListener('input', (e) => { 
        State.currentSearch = e.target.value; 
        renderFiles(); 
    });
}

// --- RENDER LOGIC ---
export function renderFiles() {
    const mainContainer = document.getElementById('main-content-container') || document.getElementById('file-list');
    if (!mainContainer) return;
    
    UI.updateSelectionBar();
    mainContainer.innerHTML = '';
    
    const bcContainer = document.getElementById('breadcrumbs');
    if (bcContainer) {
        bcContainer.innerHTML = State.breadcrumbs.map((bc, i) => `
            <span class="${i === State.breadcrumbs.length-1 ? 'text-gray-900 font-bold' : 'cursor-pointer hover:text-blue-600 transition-colors'}" onclick="${i !== State.breadcrumbs.length-1 ? `goToBreadcrumb(${i})` : ''}">${bc.name}</span>
            ${i < State.breadcrumbs.length - 1 ? '<i data-lucide="chevron-right" class="w-4 h-4 text-gray-400"></i>' : ''}
        `).join('');
    }

    let viewFiles = State.allFiles.filter(f => {
        if (State.currentView === 'trash') return f.inTrash;
        if (f.inTrash) return false; 
        if (State.currentView === 'starred') return f.isStarred;
        if (State.currentView === 'recent') return !f.isFolder; 
        return f.parentId === State.currentFolderId; 
    });

    const now = Date.now();
    const day = 86400000;
    
    let filtered = viewFiles.filter(f => {
        if(!f.fileName.toLowerCase().includes(State.currentSearch.toLowerCase())) return false;
        let matchType = true;
        if(State.advFilterType !== 'all') {
            if(State.advFilterType === 'image') matchType = f.fileType?.startsWith('image/');
            else if(State.advFilterType === 'video') matchType = f.fileType?.startsWith('video/');
            else if(State.advFilterType === 'document') matchType = f.fileType?.includes('pdf') || f.fileType?.includes('text');
        }
        let matchDate = true;
        if(State.advFilterDate !== 'any') {
            const age = now - f.createdAt;
            if(State.advFilterDate === 'today') matchDate = age <= day;
            else if(State.advFilterDate === '7days') matchDate = age <= 7 * day;
            else if(State.advFilterDate === '30days') matchDate = age <= 30 * day;
        }
        return matchType && matchDate;
    });

    if (State.currentView === 'recent') filtered = filtered.slice(0, 20);

    // FOLDER TRASH FIX: Folders are now rendered if they pass the filters above
    const folders = filtered.filter(f => f.isFolder);
    const files = filtered.filter(f => !f.isFolder);

    if (filtered.length === 0) {
        mainContainer.innerHTML = `
        <div class="py-16 px-6 text-center bg-gray-50/50 border-2 border-dashed border-gray-300 rounded-3xl hover:bg-blue-50/50 hover:border-blue-400 transition-all cursor-pointer group mt-4" onclick="document.getElementById('file-input').click()">
            <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm group-hover:scale-110 group-hover:text-blue-600 transition-transform">
                <i data-lucide="cloud-upload" class="w-10 h-10 text-gray-400 group-hover:text-blue-500 transition-colors"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-800 mb-1">Drag & Drop files here</h3>
            <p class="text-sm font-medium text-gray-500">or click to browse from your computer</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    let finalHTML = '';

    // Render Folders
    if (folders.length > 0) {
        finalHTML += `<div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">`;
        folders.forEach(f => {
            const isSelected = State.selectedItems.has(f.id);
            const selectClass = isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-blue-300 bg-white';
            
            const trashAction = State.currentView === 'trash' 
                ? `<button onclick="event.stopPropagation(); window.restoreFromTrash('${f.id}')" class="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>
                   <button onclick="event.stopPropagation(); UI.openDeleteModal('${f.id}')" class="text-red-500 hover:bg-red-50 p-1.5 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
                : `<button onclick="event.stopPropagation(); UI.openRenameModal('${f.id}', '${f.fileName}')" class="text-gray-400 hover:text-blue-600 p-1.5 rounded"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                   <button onclick="event.stopPropagation(); window.moveToTrash('${f.id}')" class="text-gray-400 hover:text-red-500 p-1.5 rounded"><i data-lucide="trash" class="w-4 h-4"></i></button>`;

            finalHTML += `
            <div class="${selectClass} border rounded-xl p-3 cursor-pointer flex items-center gap-3 group transition-all" onclick="${State.currentView !== 'trash' ? `window.enterFolder('${f.id}', '${f.fileName}')` : ''}">
                <button onclick="event.stopPropagation(); window.toggleSelect('${f.id}', event)" class="shrink-0 p-1 rounded-md ${isSelected ? 'text-blue-600 opacity-100' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500'} transition-opacity">
                    <i data-lucide="${isSelected ? 'check-square' : 'square'}" class="w-5 h-5 ${isSelected ? 'fill-blue-100' : ''}"></i>
                </button>
                <div class="flex items-center gap-2 truncate flex-grow">
                    <i data-lucide="folder" class="w-5 h-5 text-blue-500 fill-blue-100 shrink-0"></i>
                    <span class="text-sm font-bold text-gray-800 truncate">${f.fileName}</span>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    ${!isSelected ? trashAction : ''}
                </div>
            </div>`;
        });
        finalHTML += `</div>`;
    }

    // Render Files
    if (files.length > 0) {
        if (State.viewMode === 'list') {
            finalHTML += `<div class="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"><table class="w-full text-left text-sm text-gray-600">
                <thead class="bg-gray-50/80 border-b border-gray-200"><tr class="text-[11px] uppercase tracking-wider text-gray-500 font-bold"><th class="px-5 py-3 w-10"></th><th class="px-2 py-3">Name</th><th class="px-5 py-3 hidden md:table-cell">Date Modified</th><th class="px-5 py-3 hidden sm:table-cell">Size</th><th class="px-5 py-3 text-right">Actions</th></tr></thead><tbody class="divide-y divide-gray-100">`;
                
            files.forEach(file => {
                const sizeMB = (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB';
                const starColor = file.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-gray-600';
                const isSelected = State.selectedItems.has(file.id);
                
                let actions = State.currentView === 'trash' 
                    ? `<button onclick="window.restoreFromTrash('${file.id}')" class="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>
                       <button onclick="UI.openDeleteModal('${file.id}')" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
                    : `<button onclick="window.shareFile('${file.id}')" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md" title="Share"><i data-lucide="link" class="w-4 h-4"></i></button>
                       <button onclick="UI.openRenameModal('${file.id}', '${file.fileName}')" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md" title="Rename"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                       <button onclick="window.toggleStar('${file.id}')" class="p-1.5 rounded-md hover:bg-gray-100" title="Star"><i data-lucide="star" class="w-4 h-4 ${starColor}"></i></button>
                       <button onclick="window.processFileAction('${file.id}', 'download')" class="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md"><i data-lucide="download" class="w-4 h-4"></i></button>
                       <button onclick="window.moveToTrash('${file.id}')" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"><i data-lucide="trash" class="w-4 h-4"></i></button>`;

                finalHTML += `
                <tr class="${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors group">
                    <td class="px-5 py-3.5 w-12 cursor-pointer" onclick="event.stopPropagation(); window.toggleSelect('${file.id}', event)">
                        <i data-lucide="${isSelected ? 'check-square' : 'square'}" class="w-5 h-5 inline-block ${isSelected ? 'text-blue-600 fill-blue-100' : 'text-gray-300 hover:text-gray-500'}"></i>
                    </td>
                    <td class="px-2 py-3.5 font-bold text-gray-900 flex items-center gap-3 cursor-pointer" onclick="${State.currentView !== 'trash' ? `window.processFileAction('${file.id}', 'preview')` : ''}"><i data-lucide="file" class="w-5 h-5 text-gray-400 shrink-0"></i> <span class="truncate max-w-[150px] sm:max-w-[300px]">${file.fileName}</span></td>
                    <td class="px-5 py-3.5 font-medium hidden md:table-cell text-gray-500">${new Date(file.createdAt).toLocaleDateString()}</td>
                    <td class="px-5 py-3.5 font-medium hidden sm:table-cell text-gray-500">${sizeMB}</td>
                    <td class="px-5 py-3.5 text-right flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">${!isSelected ? actions : ''}</td>
                </tr>`;
            });
            finalHTML += `</tbody></table></div>`;
        } 
        else {
            // GRID VIEW
            finalHTML += `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">`;
            files.forEach(file => {
                const sizeMB = (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB';
                let icon = 'file';
                if(file.fileType?.startsWith('image/')) icon = 'image';
                if(file.fileType?.startsWith('video/')) icon = 'video';
                if(file.fileType?.includes('pdf')) icon = 'file-text';

                const starColor = file.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-gray-600';
                const isSelected = State.selectedItems.has(file.id);
                const selectClass = isSelected ? 'ring-2 ring-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-blue-300 bg-white';
                
                let actions = State.currentView === 'trash' 
                    ? `<button onclick="event.stopPropagation(); window.restoreFromTrash('${file.id}')" class="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>
                       <button onclick="event.stopPropagation(); UI.openDeleteModal('${file.id}')" class="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
                    : `<button onclick="event.stopPropagation(); UI.openRenameModal('${file.id}', '${file.fileName}')" class="p-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                       <button onclick="event.stopPropagation(); window.toggleStar('${file.id}')" class="p-1.5 bg-gray-100 rounded-md hover:bg-gray-200"><i data-lucide="star" class="w-4 h-4 ${starColor}"></i></button>
                       <button onclick="event.stopPropagation(); window.moveToTrash('${file.id}')" class="p-1.5 bg-gray-100 text-red-500 rounded-md hover:bg-red-50"><i data-lucide="trash" class="w-4 h-4"></i></button>`;

                finalHTML += `
                <div class="${selectClass} border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group relative flex flex-col" onclick="${State.currentView !== 'trash' ? `window.processFileAction('${file.id}', 'preview')` : ''}">
                    
                    <button onclick="event.stopPropagation(); window.toggleSelect('${file.id}', event)" class="absolute top-2 left-2 z-20 p-1 rounded-md ${isSelected ? 'opacity-100 text-blue-600 bg-white' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-white/80'} transition-opacity">
                        <i data-lucide="${isSelected ? 'check-square' : 'square'}" class="w-5 h-5 ${isSelected ? 'fill-blue-100' : ''}"></i>
                    </button>

                    <div class="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">${!isSelected ? actions : ''}</div>
                    
                    <div class="h-32 ${isSelected ? 'bg-transparent' : 'bg-gray-50'} flex items-center justify-center shrink-0">
                        <i data-lucide="${icon}" class="w-12 h-12 text-gray-300 group-hover:text-blue-400 transition-colors transform group-hover:scale-110 duration-300"></i>
                    </div>
                    
                    <div class="p-3 border-t border-gray-100 flex-grow flex flex-col justify-center">
                        <p class="text-sm font-bold text-gray-800 truncate" title="${file.fileName}">${file.fileName}</p>
                        <p class="text-[10px] font-semibold text-gray-400 mt-0.5">${sizeMB} • ${new Date(file.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>`;
            });
            finalHTML += `</div>`;
        }
    }

    mainContainer.innerHTML = finalHTML;
    
    const totalBytes = State.allFiles.filter(f => !f.isFolder && !f.inTrash).reduce((sum, f) => sum + f.fileSize, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const displayEl = document.getElementById('storage-used-display');
    if (displayEl) displayEl.innerText = totalMB > 1024 ? (totalMB / 1024).toFixed(2) + ' GB' : totalMB + ' MB';
    
    lucide.createIcons();
}
window.renderFiles = renderFiles;

export async function loadFiles() {
    if(UI.fileLoader) UI.fileLoader.classList.remove('hidden');
    try {
        const q = query(collection(db, "files"), where("userId", "==", State.currentUser.uid));
        const snapshot = await getDocs(q);
        
        State.allFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        State.allFiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        if(UI.fileLoader) UI.fileLoader.classList.add('hidden');
        renderFiles();
    } catch (err) { 
        if(UI.fileLoader) UI.fileLoader.classList.add('hidden'); 
        UI.showToast('Failed to load files. Try refreshing.', 'error'); 
    }
}
window.loadFiles = loadFiles;