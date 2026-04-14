import { State } from './config.js';

export const UI = {
    loginForm: document.getElementById('login-form'),
    regForm: document.getElementById('register-form'),
    resetForm: document.getElementById('reset-form'),
    landingState: document.getElementById('landing-state'),
    dashboardState: document.getElementById('dashboard-state'),
    sidebar: document.getElementById('sidebar'),
    authInfoSection: document.getElementById('auth-info-section'),
    mainContentContainer: document.getElementById('main-content-container'),
    fileLoader: document.getElementById('file-loader'),
    viewTitle: document.getElementById('current-view-title'),
    btnNewFolder: document.getElementById('btn-new-folder'),

    switchForm(formName) {
        if(this.loginForm) this.loginForm.classList.toggle('hidden', formName !== 'login');
        if(this.regForm) this.regForm.classList.toggle('hidden', formName !== 'register');
        if(this.resetForm) this.resetForm.classList.toggle('hidden', formName !== 'reset');
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        const bgClass = type === 'error' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-900 text-white border-black/5';
        const iconColor = type === 'error' ? 'text-red-500' : type === 'success' ? 'text-green-400' : 'text-white';
        const icon = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-triangle' : 'info';
        
        toast.className = `toast-enter pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-full shadow-xl border ${bgClass} w-max max-w-sm`;
        toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 shrink-0 ${iconColor}"></i><span class="text-sm font-semibold tracking-wide">${message}</span>`;
        container.appendChild(toast);
        lucide.createIcons();
        setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 200); }, 3500);
    },

    setLoading(btnId, isLoading, text) {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        btn.disabled = isLoading;
        btn.innerHTML = isLoading ? `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>` : text;
        if(isLoading) lucide.createIcons();
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('invisible', 'opacity-0');
        if(modal.firstElementChild) modal.firstElementChild.classList.remove('scale-95');
        if(id === 'preview-modal') {
            const ph = document.getElementById('preview-header');
            if (ph) ph.classList.remove('scale-95');
        }
    },
    
    closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if(modal.firstElementChild) modal.firstElementChild.classList.add('scale-95');
        if(id === 'preview-modal') {
            const ph = document.getElementById('preview-header');
            if (ph) ph.classList.add('scale-95');
        }
        modal.classList.add('opacity-0');
        setTimeout(() => { modal.classList.add('invisible'); }, 200);

        if(id === 'preview-modal' && State.currentPreviewUrl) {
            document.getElementById('preview-content').innerHTML = '';
            URL.revokeObjectURL(State.currentPreviewUrl); 
            State.currentPreviewUrl = null;
        }
        if(id === 'folder-modal') { const f = document.getElementById('new-folder-name'); if(f) f.value = ''; }
        if(id === 'rename-modal') { const r = document.getElementById('rename-input'); if(r) r.value = ''; }
    },

    updateSelectionBar() {
        const bar = document.getElementById('selection-bar');
        const count = document.getElementById('selection-count');
        const actions = document.getElementById('selection-actions');
        
        if(!bar || !count || !actions) return;

        if (State.selectedItems.size > 0) {
            count.innerText = `${State.selectedItems.size} selected`;
            if (State.currentView === 'trash') {
                actions.innerHTML = `
                    <button onclick="window.bulkRestore()" class="p-2 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> <span class="hidden sm:inline">Restore</span></button>
                    <button onclick="window.openBulkDeleteModal()" class="p-2 hover:bg-red-500 hover:text-white text-blue-100 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold ml-2"><i data-lucide="trash-2" class="w-4 h-4"></i> <span class="hidden sm:inline">Delete Forever</span></button>
                `;
            } else {
                actions.innerHTML = `
                    <button onclick="window.bulkToggleStar()" class="p-2 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold"><i data-lucide="star" class="w-4 h-4"></i> <span class="hidden sm:inline">Star</span></button>
                    <button onclick="window.bulkMoveToTrash()" class="p-2 hover:bg-red-500 hover:text-white text-blue-100 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold ml-2"><i data-lucide="trash" class="w-4 h-4"></i> <span class="hidden sm:inline">Trash</span></button>
                `;
            }
            bar.classList.remove('-translate-y-full');
            bar.classList.add('translate-y-0');
        } else {
            bar.classList.add('-translate-y-full');
            bar.classList.remove('translate-y-0');
        }
        lucide.createIcons();
    },

    switchView(viewName) {
        State.currentView = viewName;
        State.currentFolderId = null; 
        State.breadcrumbs = [{ id: null, name: 'My Drive' }];
        State.selectedItems.clear(); 
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('bg-blue-50', 'text-blue-700', 'font-bold');
            btn.classList.add('text-gray-600', 'hover:bg-gray-100', 'font-medium');
        });
        
        const activeBtn = document.getElementById(`nav-${viewName}`);
        if(activeBtn) {
            activeBtn.classList.remove('text-gray-600', 'hover:bg-gray-100', 'font-medium');
            activeBtn.classList.add('bg-blue-50', 'text-blue-700', 'font-bold');
        }
        
        const titles = { home: 'My Drive', recent: 'Recent Files', starred: 'Starred', trash: 'Trash' };
        if(this.viewTitle) this.viewTitle.innerText = titles[viewName];
        if(this.btnNewFolder) this.btnNewFolder.style.display = viewName === 'home' ? 'flex' : 'none';
        
        if (typeof window.renderFiles === 'function') window.renderFiles();
    },

    toggleViewMode() {
        State.viewMode = State.viewMode === 'list' ? 'grid' : 'list';
        const icon = document.getElementById('view-icon');
        if(icon) {
            icon.setAttribute('data-lucide', State.viewMode === 'list' ? 'layout-grid' : 'list');
            lucide.createIcons();
        }
        if (typeof window.renderFiles === 'function') window.renderFiles();
    },

    openCreateFolderModal() { 
        this.openModal('folder-modal'); 
        setTimeout(() => { const i = document.getElementById('new-folder-name'); if(i) i.focus(); }, 100); 
    },
    
    openRenameModal(id, currentName) {
        State.itemToRename = id;
        const i = document.getElementById('rename-input');
        if(i) i.value = currentName;
        this.openModal('rename-modal');
        setTimeout(() => { if(i) i.focus(); }, 100);
    },

    openAdvancedSearch() { this.openModal('search-modal'); },
    
    openSettings() { 
        const n = document.getElementById('settings-name');
        const p = document.getElementById('settings-password');
        const d = document.getElementById('settings-domain');

        if (n) n.value = State.currentUser?.displayName || '';
        if (p) p.value = '';
        if (d) d.value = `${State.currentUsername}@bucket.space`;
        
        this.openModal('settings-modal'); 
    },
    
    closePreview() { this.closeModal('preview-modal'); },
    
    openDeleteModal(id) { 
        State.itemToDelete = id; 
        this.openModal('delete-modal'); 
    },

    // --- LEGAL MODALS INTEGRATION ---
    openLegal(type) {
        const titleMap = {
            'privacy': 'Privacy Policy',
            'terms': 'Terms & Conditions',
            'license': 'Proprietary License'
        };

        const contentMap = {
            'privacy': `
                <div class="space-y-6">
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">1. Zero-Knowledge Architecture</h4>
                        <p>Bucket is a secure node network designed to prioritize your privacy. We cannot read your data. All user data is stored in an encrypted format on a globally distributed network.</p>
                    </section>
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">2. Data Retention Policy</h4>
                        <p>When you delete a file, it is moved to the Trash for a period of 7 days. After 7 days, the system permanently and irretrievably deletes the data from the distributed servers and our database.</p>
                    </section>
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">3. User Authentication</h4>
                        <p>We only store your recovery email and username for authentication purposes. We never save your password in plain-text.</p>
                    </section>
                    <p class="text-sm italic text-gray-400 mt-6">Contact: <a href="mailto:iaaryan37@gmail.com" class="text-blue-500 hover:underline">iaaryan37@gmail.com</a> for privacy-related queries.</p>
                </div>
            `,
            'terms': `
                <div class="space-y-6">
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">1. Usage Agreement</h4>
                        <p>By using Bucket, you agree that you will not use this platform for any illegal activities or to host malicious content. The 31E0 team holds no responsibility for user-generated content.</p>
                    </section>
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">2. Service Availability</h4>
                        <p>We provide this service on an "as-is" basis. Although our infrastructure is highly resilient, slight delays may occur during global server maintenance or propagation.</p>
                    </section>
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">3. Governing Law</h4>
                        <p>This platform operates under the laws and regulations of India. Any disputes will be subject to the exclusive jurisdiction of the courts of India.</p>
                    </section>
                </div>
            `,
            'license': `
                <div class="space-y-6">
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">Proprietary Software Notice</h4>
                        <p class="mb-4">© 2026 Aaryan (Founder of 31E0). All Rights Reserved.</p>
                        <p>This software is a <strong>Proprietary</strong> product. Its source code, design, and architecture are the private and exclusive property of <strong>31E0</strong> (Specializing in System Architecture, Research-Oriented System Development, Game Dev, App Dev, and AI).</p>
                        <p class="mt-2">You may access and utilize this platform for your personal use, but reproduction, distribution, cloning, or reverse-engineering of this product without explicit written permission is strictly prohibited.</p>
                    </section>
                    <section>
                        <h4 class="text-lg font-bold text-gray-900 mb-2">Ownership & IP</h4>
                        <p>The user remains the sole owner of their uploaded data. The intellectual property and ownership of the system architecture, UI/UX, and infrastructure logic remain entirely with Aaryan and 31E0.</p>
                    </section>
                </div>
            `
        };

        const modal = document.getElementById('legal-modal');
        const contentArea = document.getElementById('legal-content');
        const titleArea = document.getElementById('legal-title');

        if(modal && contentArea && titleArea) {
            titleArea.innerText = titleMap[type] || 'Legal Documents';
            contentArea.innerHTML = contentMap[type] || '<p>Content not found.</p>';
            this.openModal('legal-modal');
        }
    }
};

// Expose to window for inline HTML onclick handlers
window.UI = UI;
window.closeModal = (id) => UI.closeModal(id);
window.openLegal = (type) => UI.openLegal(type);