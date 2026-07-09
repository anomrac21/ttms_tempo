/**
 * TTMenus Update UI - Preview & Inline Editing (dashboard)
 * Version: 2025-01-20-v1
 */

const MenuEditor = {
  // State
  state: {
    menuData: null,
    categories: [],
    menuItems: [],
    locations: [],
    currentView: 'preview',
    editModeEnabled: false,
    editingItem: null,
    hasChanges: false,
  },

  // API Configuration
  apiConfig: {
    baseUrl:
      window.UPDATE_API_URL ||
      window.CMS_API_URL ||
      'https://cms.ttmenus.com/api',
    clientId: window.CLIENT_ID || window.SITE_CLIENT_ID || '_ttms_menu_demo',
    getClientUrl: function() {
      return `${this.baseUrl}/clients/${this.clientId}`;
    },
  },

  /**
   * Initialize the editor
   */
  async init() {
    console.log('🚀 Menu Editor initializing...');
    
    // Setup view switching
    this.setupViewSwitching();
    
    // Load menu data
    await this.loadMenuData();
    
    // Render preview
    this.renderPreview();
    
    // Setup settings panel
    this.setupSettings();
    
    console.log('✅ Menu Editor ready!');
  },

  /**
   * Setup view switching (Preview/Edit)
   */
  setupViewSwitching() {
    // Logo toggle is handled by onclick in HTML
    // Set initial view state
    this.switchView('preview');
    this.updateEditModeState();
  },

  /**
   * Toggle edit mode on/off
   */
  toggleEditMode() {
    this.state.editModeEnabled = !this.state.editModeEnabled;
    this.updateEditModeState();
  },
  
  /**
   * Update edit mode state in UI
   */
  updateEditModeState() {
    const viewIcon = document.getElementById('viewIcon');
    const viewIndicator = document.getElementById('viewIndicator');
    const previewMode = document.getElementById('previewMode');
    const iframe = previewMode?.querySelector('iframe');
    
    if (this.state.editModeEnabled) {
      // Edit mode ON - add editing controls to preview
      if (viewIcon) viewIcon.textContent = '✏️';
      if (viewIndicator) viewIndicator.textContent = 'Edit Mode';
      
      // Always show preview
      if (previewMode) previewMode.style.display = 'block';
      
      // Inject edit controls into iframe when it loads
      if (iframe) {
        // Wait for iframe to be ready
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
          this.injectEditControls(iframe);
        } else {
          // Wait for iframe to load
          iframe.addEventListener('load', () => {
            setTimeout(() => {
              this.injectEditControls(iframe);
            }, 100); // Small delay to ensure DOM is ready
          }, { once: true });
        }
      }
    } else {
      // Edit mode OFF - remove editing controls
      if (viewIcon) viewIcon.textContent = '👁️';
      if (viewIndicator) viewIndicator.textContent = 'Preview';
      
      // Always show preview
      if (previewMode) previewMode.style.display = 'block';
      
      // Remove edit controls from iframe
      if (iframe) {
        this.removeEditControls(iframe);
      }
    }
  },
  
  /**
   * Switch between preview and edit views (kept for compatibility)
   */
  switchView(view) {
    this.state.currentView = view;
    
    if (view === 'preview') {
      this.state.editModeEnabled = false;
    } else {
      this.state.editModeEnabled = true;
    }
    
    this.updateEditModeState();
  },

  /**
   * Load menu data from Hugo
   */
  async loadMenuData() {
    try {
      // Try /api/menu-items.json first (most reliable)
      let data = null;
      
      try {
        const response = await fetch('/api/menu-items.json');
        if (response.ok) {
          const apiData = await response.json();
          // Transform API data to Hugo format
          data = { pages: apiData.menu_items || [] };
          console.log('✅ Loaded from /api/menu-items.json');
        }
      } catch (e) {
        console.log('⚠️ /api/menu-items.json not available, trying index.json...');
      }
      
      // Try index.json as fallback
      if (!data) {
        try {
          const response = await fetch('/index.json');
          if (response.ok) {
            data = await response.json();
            console.log('✅ Loaded from /index.json');
          }
        } catch (e) {
          console.log('⚠️ /index.json not available');
        }
      }
      
      // If still no data, use empty structure
      if (!data) {
        console.warn('⚠️ No menu data found, using empty structure');
        data = { pages: [] };
      }
      
      this.state.menuData = data;
      
      // Extract categories and items
      this.extractMenuStructure(data);
      
      console.log('✅ Menu data loaded:', {
        categories: this.state.categories.length,
        items: this.state.menuItems.length
      });
    } catch (error) {
      console.error('❌ Error loading menu data:', error);
      this.updateStatus('Error loading menu', 'error');
      // Initialize with empty data
      this.state.menuData = { pages: [] };
      this.state.categories = [];
      this.state.menuItems = [];
    }
  },

  /**
   * Extract menu structure from Hugo data
   */
  extractMenuStructure(data) {
    this.state.categories = [];
    this.state.menuItems = [];
    
    // Process pages to extract categories and items
    if (data.pages) {
      data.pages.forEach(page => {
        // Categories (non-page sections)
        if (!page.isPage && !page.isHome) {
          this.state.categories.push({
            title: page.title || page.name,
            url: page.permalink || page.url,
            weight: page.weight || 0,
            image: page.params?.image || page.image,
            summary: page.summary,
            params: page.params || {}
          });
        }
        
        // Menu items (pages within categories)
        if (page.isPage && (page.section || page.category)) {
          this.state.menuItems.push({
            id: page.id || page.permalink || page.url,
            title: page.title || page.name,
            url: page.permalink || page.url,
            category: page.section || page.category || 'Uncategorized',
            weight: page.weight || 0,
            summary: page.summary || '',
            prices: page.params?.prices || page.prices || [],
            images: page.params?.images || page.images || [],
            tags: page.params?.tags || page.tags || [],
            ingredients: page.params?.ingredients || page.ingredients || [],
            cookingmethods: page.params?.cookingmethods || page.cookingmethods || [],
            types: page.params?.types || page.types || [],
            events: page.params?.events || page.events || []
          });
        }
      });
    }
    
    // Sort by weight
    this.state.categories.sort((a, b) => a.weight - b.weight);
    this.state.menuItems.sort((a, b) => a.weight - b.weight);
  },

  /**
   * Render preview mode (shows actual menu)
   */
  renderPreview() {
    const container = document.getElementById('menuPreviewContainer');
    if (!container) return;
    
    // Create iframe to show live menu
    const iframe = document.createElement('iframe');
    iframe.src = '/';
    iframe.style.width = '100%';
    iframe.style.height = 'calc(100vh - 60px)';
    iframe.style.border = 'none';
    iframe.title = 'Menu Preview';
    
    // When iframe loads, inject edit controls if edit mode is enabled
    iframe.addEventListener('load', () => {
      // Wait a bit for all deferred scripts to load
      setTimeout(() => {
        if (this.state.editModeEnabled) {
          this.injectEditControls(iframe);
        }
      }, 500); // Give time for defer scripts to load
    });
    
    container.innerHTML = '';
    container.appendChild(iframe);
  },
  
  /**
   * Inject editing controls into the iframe
   */
  injectEditControls(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) {
        console.warn('⚠️ Cannot access iframe document - may be cross-origin');
        return;
      }
      
      console.log('🔧 Injecting edit controls into iframe...');
      
      // Add edit mode class to body
      iframeDoc.body.classList.add('edit-mode-enabled');
      
      // Inject edit control styles
      if (!iframeDoc.getElementById('edit-controls-style')) {
        const style = iframeDoc.createElement('style');
        style.id = 'edit-controls-style';
        style.textContent = `
          .edit-mode-enabled .menu-item-card,
          .edit-mode-enabled .main-menu-bg {
            position: relative;
          }
          .edit-mode-enabled .menu-item-card:hover,
          .edit-mode-enabled .main-menu-bg:hover {
            outline: 2px solid rgba(102, 126, 234, 0.5);
            outline-offset: 4px;
          }
          .edit-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(102, 126, 234, 0.9);
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 16px;
            z-index: 100;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }
          .edit-btn:hover {
            background: rgba(102, 126, 234, 1);
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
          }
          .edit-btn:active {
            transform: scale(0.95);
          }
          .drag-handle {
            position: absolute;
            top: 0.5rem;
            left: 0.5rem;
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            border: none;
            border-radius: 4px;
            width: 32px;
            height: 32px;
            display: flex !important;
            align-items: center;
            justify-content: center;
            cursor: grab !important;
            font-size: 18px;
            z-index: 1000 !important;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            touch-action: none;
            -webkit-touch-callout: none;
            pointer-events: auto !important;
            opacity: 1 !important;
            visibility: visible !important;
          }
          .drag-handle:hover {
            background: rgba(0, 0, 0, 0.9);
            transform: scale(1.1);
          }
          .drag-handle:active {
            cursor: grabbing;
            transform: scale(1.05);
          }
          /* Sortable.js classes */
          .sortable-ghost {
            opacity: 0.4;
            background: rgba(102, 126, 234, 0.2);
          }
          .sortable-chosen {
            cursor: grabbing;
          }
          .sortable-drag {
            opacity: 0.8;
          }
          .drag-handle[draggable="true"] {
            cursor: grab;
          }
          .drag-handle[draggable="true"]:active {
            cursor: grabbing;
          }
          .edit-mode-enabled .menu-item-card {
            cursor: default;
          }
          .edit-mode-enabled .menu-item-card .drag-handle {
            cursor: grab;
          }
          .edit-mode-enabled .menu-item-card .drag-handle:active {
            cursor: grabbing;
          }
          .edit-mode-enabled .main-menu-bg {
            position: relative;
          }
          .edit-mode-enabled .headerstyle h2,
          .edit-mode-enabled .menu-summary {
            position: relative;
          }
          .edit-mode-enabled .headerstyle h2 .edit-btn,
          .edit-mode-enabled .menu-summary .edit-btn {
            position: absolute;
            top: 0;
            right: 0;
          }
        `;
        iframeDoc.head.appendChild(style);
      }
      
      // Add edit buttons and drag handles to menu items
      // Process all items consistently in a single function
      const processMenuItems = () => {
        const menuItems = iframeDoc.querySelectorAll('.menu-item-card');
        
        menuItems.forEach((item) => {
          // Skip if already processed (has both drag handle and edit button)
          const hasHandle = item.querySelector('.drag-handle');
          const hasEditBtn = item.querySelector('.edit-btn');
          
          if (hasHandle && hasEditBtn) {
            // Already processed, but ensure handle is first
            if (item.firstChild !== hasHandle) {
              hasHandle.remove();
              item.insertBefore(hasHandle, item.firstChild);
            }
            return; // Skip this item
          }
          
          item.style.position = 'relative';
          
          // Remove any existing drag handle if it exists but isn't first
          const existingHandle = item.querySelector('.drag-handle');
          if (existingHandle && existingHandle !== item.firstChild) {
            existingHandle.remove();
          }
          
          // Add drag handle as FIRST element if it doesn't exist
          if (!item.querySelector('.drag-handle')) {
            const dragHandle = iframeDoc.createElement('div');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = '⋮⋮';
            dragHandle.title = 'Drag to reorder';
            dragHandle.setAttribute('draggable', 'true');
            
            // Always insert as the very first child
            if (item.firstChild) {
              item.insertBefore(dragHandle, item.firstChild);
            } else {
              item.appendChild(dragHandle);
            }
          }
          
          // Add edit button if it doesn't exist
          if (!item.querySelector('.edit-btn')) {
            const editBtn = iframeDoc.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Edit item';
            editBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const itemUrl = item.dataset.itemUrl || item.querySelector('a')?.href;
              if (itemUrl) {
                this.editItemFromUrl(itemUrl);
              }
            });
            item.appendChild(editBtn);
          }
        });
      };
      
      // Wait for DOM to be ready, then process all items at once
      const processWhenReady = () => {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          processMenuItems();
          
          // Double-check after a brief delay to catch any items that weren't ready
          setTimeout(() => {
            processMenuItems();
          }, 100);
        });
      };
      
      // Process immediately
      processWhenReady();
      
      // Use MutationObserver only for truly new items added after initial load
      const observer = new MutationObserver((mutations) => {
        let hasNewItems = false;
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              if (node.classList && node.classList.contains('menu-item-card')) {
                hasNewItems = true;
              } else if (node.querySelector && node.querySelector('.menu-item-card')) {
                hasNewItems = true;
              }
            }
          });
        });
        if (hasNewItems) {
          // Only process new items, not all items again
          requestAnimationFrame(() => {
            processMenuItems();
          });
        }
      });
      
      // Observe the menu-items-container and packery-container for new items
      const containers = iframeDoc.querySelectorAll('.menu-items-container, #packery-container');
      containers.forEach(container => {
        if (container) {
          observer.observe(container, {
            childList: true,
            subtree: true
          });
        }
      });
      
      // Add edit buttons to category headers
      const categoryHeaders = iframeDoc.querySelectorAll('.headerstyle h2, .menu-header h2');
      categoryHeaders.forEach(header => {
        header.style.position = 'relative';
        if (!header.querySelector('.edit-btn')) {
          const editBtn = iframeDoc.createElement('button');
          editBtn.className = 'edit-btn';
          editBtn.innerHTML = '✏️';
          editBtn.title = 'Edit category';
          editBtn.style.position = 'absolute';
          editBtn.style.top = '0';
          editBtn.style.right = '0';
          editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const categoryTitle = header.textContent.trim().replace('✏️', '').trim();
            this.editCategory(categoryTitle);
          });
          header.appendChild(editBtn);
        }
      });
      
      // Add edit buttons to menu summaries
      const menuSummaries = iframeDoc.querySelectorAll('.menu-summary');
      menuSummaries.forEach(summary => {
        summary.style.position = 'relative';
        if (!summary.querySelector('.edit-btn')) {
          const editBtn = iframeDoc.createElement('button');
          editBtn.className = 'edit-btn';
          editBtn.innerHTML = '✏️';
          editBtn.title = 'Edit summary';
          editBtn.style.position = 'absolute';
          editBtn.style.top = '0';
          editBtn.style.right = '0';
          editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Find parent category
            const categoryBg = summary.closest('.main-menu-bg');
            if (categoryBg) {
              const categoryTitle = categoryBg.querySelector('h2')?.textContent.trim().replace('✏️', '').trim();
              if (categoryTitle) {
                this.editCategorySummary(categoryTitle);
              }
            }
          });
          summary.appendChild(editBtn);
        }
      });
      
      // Add drag handles to category items (.main-menu-bg)
      const categoryItems = iframeDoc.querySelectorAll('.main-menu-bg');
      categoryItems.forEach(item => {
        item.style.position = 'relative';
        
        // Remove existing drag handle if it's not first
        const existingHandle = item.querySelector('.drag-handle');
        if (existingHandle && existingHandle !== item.firstChild) {
          existingHandle.remove();
        }
        
        // Add drag handle as first element if it doesn't exist
        if (!item.querySelector('.drag-handle')) {
          const dragHandle = iframeDoc.createElement('div');
          dragHandle.className = 'drag-handle';
          dragHandle.innerHTML = '⋮⋮';
          dragHandle.title = 'Drag to reorder';
          dragHandle.setAttribute('draggable', 'true');
          // Always insert as the very first child
          item.insertBefore(dragHandle, item.firstChild);
        }
      });
      
      // Setup drag handles (Packery removed)
      // Get container after all drag handles are added
      const container = iframeDoc.getElementById('packery-container');
      if (container) {
        // Wait a bit for DOM to settle before initializing Sortable
        setTimeout(() => {
          this.setupDragHandlesOnly(iframeDoc, container);
        }, 100);
      } else {
        console.warn('⚠️ Container not found for drag handles');
      }
      
      console.log('✅ Edit controls injected successfully');
      
    } catch (error) {
      console.error('❌ Error injecting edit controls:', error);
      // Cross-origin issue - iframe might be from different domain
    }
  },
  
  /**
   * Remove editing controls from the iframe
   */
  removeEditControls(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;
      
      // Destroy Sortable instances if they exist
      const container = iframeDoc.getElementById('packery-container');
      if (container) {
        // Destroy category Sortable instance
        if (container._sortableInstance) {
          container._sortableInstance.destroy();
          container._sortableInstance = null;
        }
        
        // Destroy menu item Sortable instances
        const menuContainers = container.querySelectorAll('.menu-items-container');
        menuContainers.forEach(menuContainer => {
          if (menuContainer._sortableInstance) {
            menuContainer._sortableInstance.destroy();
            menuContainer._sortableInstance = null;
          }
        });
      }
      
      // Remove edit mode class
      iframeDoc.body.classList.remove('edit-mode-enabled');
      
      // Remove edit buttons
      const editButtons = iframeDoc.querySelectorAll('.edit-btn');
      editButtons.forEach(btn => btn.remove());
      
      // Remove drag handles
      const dragHandles = iframeDoc.querySelectorAll('.drag-handle');
      dragHandles.forEach(handle => handle.remove());
      
      // Remove edit control styles
      const style = iframeDoc.getElementById('edit-controls-style');
      if (style) style.remove();
      
      console.log('✅ Edit controls removed');
      
    } catch (error) {
      console.error('Error removing edit controls:', error);
    }
  },
  
  /**
   * Setup drag handles (Packery removed)
   */
  setupDragHandlesOnly(iframeDoc, container) {
    console.log('📦 Setting up drag handles...');
    
    // Destroy any existing Sortable instances first
    if (container && container._sortableInstance) {
      try {
        container._sortableInstance.destroy();
      } catch (e) {
        console.warn('⚠️ Error destroying container Sortable:', e);
      }
      container._sortableInstance = null;
    }
    
    if (container) {
      const menuContainers = container.querySelectorAll('.menu-items-container');
      menuContainers.forEach(menuContainer => {
        if (menuContainer._sortableInstance) {
          try {
            menuContainer._sortableInstance.destroy();
          } catch (e) {
            console.warn('⚠️ Error destroying menu container Sortable:', e);
          }
          menuContainer._sortableInstance = null;
        }
      });
    }
    
    // Wait for DOM to be fully ready, then setup
    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (container) {
          this.setupDragHandles(iframeDoc, container, null);
        } else {
          console.warn('⚠️ Container not available for drag handles');
        }
      }, 200); // Give enough time for all drag handles to be added
    });
  },
  
  /**
   * Setup drag handles for categories and menu items using Sortable.js
   */
  setupDragHandles(iframeDoc, container, packery) {
    // packery parameter kept for compatibility but not used (Packery removed)
    try {
      // Check if Sortable is available - try iframe window first, then parent window
      const iframeWindow = iframeDoc.defaultView || iframeDoc.parentWindow;
      let Sortable = iframeWindow?.Sortable;
      
      if (!Sortable) {
        Sortable = window.Sortable;
      }
      
      if (!Sortable) {
        console.error('❌ Sortable.js not available in iframe or parent window');
        console.log('iframeWindow:', iframeWindow);
        console.log('window.Sortable:', window.Sortable);
        // Wait a bit and retry - scripts might still be loading
        setTimeout(() => {
          this.setupDragHandles(iframeDoc, container, packery);
        }, 500);
        return;
      }
      
      console.log('✅ Sortable.js found:', typeof Sortable);
      
      // First, ensure all drag handles exist before initializing Sortable
      const categoryItems = container.querySelectorAll('.main-menu-bg');
      const menuItems = container.querySelectorAll('.menu-item-card');
      
      // Verify drag handles exist
      let allHandlesExist = true;
      categoryItems.forEach(item => {
        if (!item.querySelector('.drag-handle')) {
          allHandlesExist = false;
        }
      });
      menuItems.forEach(item => {
        if (!item.querySelector('.drag-handle')) {
          allHandlesExist = false;
        }
      });
      
      if (!allHandlesExist) {
        console.warn('⚠️ Some drag handles missing, retrying...');
        setTimeout(() => {
          this.setupDragHandles(iframeDoc, container, packery);
        }, 200);
        return;
      }
      
      // Destroy existing Sortable instance if it exists
      if (container._sortableInstance) {
        try {
          container._sortableInstance.destroy();
        } catch (e) {
          console.warn('⚠️ Error destroying category Sortable:', e);
        }
        container._sortableInstance = null;
      }
      
      console.log(`📋 Found ${categoryItems.length} category items`);
      
      // Initialize Sortable for categories
      if (categoryItems.length > 0) {
        try {
          // Verify container has children before initializing
          if (container.children.length === 0) {
            console.warn('⚠️ Container has no children, cannot initialize Sortable');
            return;
          }
          
          container._sortableInstance = new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            forceFallback: false, // Use native HTML5 drag if available
            fallbackOnBody: true, // Allow dragging outside container
            swapThreshold: 0.65, // Threshold for swapping items
            onStart: (evt) => {
              console.log('✅ Category drag start:', evt.oldIndex);
              evt.item.style.opacity = '0.5';
            },
            onEnd: (evt) => {
              console.log('✅ Category drag end:', { oldIndex: evt.oldIndex, newIndex: evt.newIndex });
              evt.item.style.opacity = '1';
              
              // Sortable.js already moved the item in the DOM, we just need to update state
              if (evt.oldIndex !== evt.newIndex) {
                // Get all categories in their new order
                const allCategories = Array.from(container.querySelectorAll('.main-menu-bg'));
                
                // Update weights based on new order
                allCategories.forEach((categoryEl, index) => {
                  const categoryTitle = categoryEl.querySelector('h2')?.textContent.trim().replace('✏️', '').trim();
                  if (categoryTitle) {
                    const category = this.state.categories.find(cat => cat.title === categoryTitle);
                    if (category) {
                      category.weight = index;
                    }
                  }
                });
                
                // Save the new order
                this.saveItemOrder(container);
                console.log('✅ Category order updated');
              }
            }
        });
      }
      
      // Make menu items draggable using Sortable.js
      const menuItemsContainers = container.querySelectorAll('.menu-items-container');
      console.log(`🍽️ Found ${menuItemsContainers.length} menu item containers`);
      
      menuItemsContainers.forEach((itemsContainer) => {
        // Destroy existing Sortable instance if it exists
        if (itemsContainer._sortableInstance) {
          try {
            itemsContainer._sortableInstance.destroy();
          } catch (e) {
            console.warn('⚠️ Error destroying menu item Sortable instance:', e);
          }
          itemsContainer._sortableInstance = null;
        }
        
        // Verify drag handles exist in this container
        const handles = itemsContainer.querySelectorAll('.drag-handle');
        if (handles.length === 0) {
          console.warn('⚠️ No drag handles found in menu container, skipping');
          return;
        }
        
        // Verify container has children before initializing
        if (itemsContainer.children.length === 0) {
          console.warn('⚠️ Menu container has no children, skipping Sortable');
          return;
        }
        
        // Create new Sortable instance
        try {
          itemsContainer._sortableInstance = new Sortable(itemsContainer, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            forceFallback: false, // Use native HTML5 drag if available
            fallbackOnBody: true, // Allow dragging outside container
            swapThreshold: 0.65, // Threshold for swapping items
            onStart: (evt) => {
              const itemUrl = evt.item.dataset.itemUrl || evt.item.querySelector('a')?.href || '';
              console.log('✅ Menu item drag start:', itemUrl);
              evt.item.style.opacity = '0.5';
            },
            onEnd: (evt) => {
              const draggedUrl = evt.item.dataset.itemUrl || evt.item.querySelector('a')?.href || '';
              console.log('✅ Menu item drag end:', { draggedUrl, oldIndex: evt.oldIndex, newIndex: evt.newIndex });
              evt.item.style.opacity = '1';
              
              // Sortable.js already moved the item in the DOM, we just need to update state
              if (evt.oldIndex !== evt.newIndex) {
                // Get all items in their new order
                const allItems = Array.from(itemsContainer.querySelectorAll('.menu-item-card'));
                
                // Update weights based on new order
                allItems.forEach((item, index) => {
                  const itemUrl = item.dataset.itemUrl || item.querySelector('a')?.href;
                  if (itemUrl) {
                    const menuItem = this.state.menuItems.find(i => 
                      i.url === itemUrl || itemUrl.includes(i.url)
                    );
                    if (menuItem) {
                      menuItem.weight = index;
                    }
                  }
                });
                
                // Save the new order
                this.state.hasChanges = true;
                console.log('✅ Menu item order updated');
              }
            }
          });
          console.log('✅ Menu item Sortable initialized for container');
        } catch (e) {
          console.error('❌ Error initializing menu item Sortable:', e);
        }
      });
      
      // Now ensure drag handles exist and are visible for categories
      const allCategoryItems = container.querySelectorAll('.main-menu-bg');
      allCategoryItems.forEach((item, index) => {
        item.style.position = 'relative';
        item.dataset.categoryIndex = index;
        
        // Remove existing drag handle if it's not first
        const existingHandle = item.querySelector('.drag-handle');
        if (existingHandle && existingHandle !== item.firstChild) {
          existingHandle.remove();
        }
        
        // Add drag handle as first element if it doesn't exist
        let dragHandle = item.querySelector('.drag-handle');
        if (!dragHandle) {
          dragHandle = iframeDoc.createElement('div');
          dragHandle.className = 'drag-handle';
          dragHandle.innerHTML = '⋮⋮';
          dragHandle.title = 'Drag to reorder';
          // Always insert as the very first child
          item.insertBefore(dragHandle, item.firstChild);
        }
        
        if (dragHandle) {
          // Make sure drag handle is visible and positioned correctly
          dragHandle.style.pointerEvents = 'auto';
          dragHandle.style.zIndex = '1000';
          
          // Prevent click from triggering parent handlers
          dragHandle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
        }
      });
      
      // Ensure menu item drag handles exist and prevent clicks
      const menuItems = container.querySelectorAll('.menu-item-card');
      menuItems.forEach((item) => {
        const dragHandle = item.querySelector('.drag-handle');
        if (dragHandle) {
          dragHandle.style.pointerEvents = 'auto';
          dragHandle.style.zIndex = '1000';
          
          // Prevent click from triggering parent handlers
          dragHandle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          
          // Prevent parent onclick from firing when clicking drag handle
          const originalOnclick = item.getAttribute('onclick');
          if (originalOnclick) {
            item.removeAttribute('onclick');
            item.addEventListener('click', (e) => {
              if (e.target.closest('.drag-handle') || e.target.closest('.edit-btn')) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
              if (typeof toggleItemExpansion === 'function') {
                const itemUrl = item.dataset.itemUrl || item.querySelector('a')?.href || '';
                toggleItemExpansion(item, itemUrl, e);
              }
            });
          }
        }
      });
      
      // Packery removed - no layout needed
      
      console.log('✅ Drag handles setup complete');
      
    } catch (error) {
      console.error('❌ Error setting up drag handles:', error);
    }
  },
  
  /**
   * Reorder category
   */
  reorderCategory(draggedIndex, targetIndex, container, iframeDoc) {
    const items = Array.from(container.querySelectorAll('.main-menu-bg'));
    const draggedItem = items[draggedIndex];
    const targetItem = items[targetIndex];
    
    if (!draggedItem || !targetItem || draggedItem === targetItem) {
      console.log('Invalid reorder:', { draggedIndex, targetIndex });
      return;
    }
    
    console.log('Reordering category:', { draggedIndex, targetIndex });
    
    // Get drop position (above or below target)
    const draggedRect = draggedItem.getBoundingClientRect();
    const targetRect = targetItem.getBoundingClientRect();
    const isAbove = draggedRect.top < targetRect.top;
    
    // Reorder in DOM
    if (isAbove) {
      // Insert before target
      targetItem.parentNode.insertBefore(draggedItem, targetItem);
    } else {
      // Insert after target
      if (targetItem.nextSibling) {
        targetItem.parentNode.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        targetItem.parentNode.appendChild(draggedItem);
      }
    }
    
    // Update indices
    const allItems = Array.from(container.querySelectorAll('.main-menu-bg'));
    allItems.forEach((item, index) => {
      item.dataset.categoryIndex = index;
    });
    
    // Packery removed - no layout needed
    
    // Save new order (updates weights)
    this.saveItemOrder(container);
  },
  
  /**
   * Reorder menu item within DOM (immediate visual feedback)
   */
  reorderMenuItemInDOM(draggedUrl, targetUrl, itemsContainer, packery) {
    const allItems = Array.from(itemsContainer.querySelectorAll('.menu-item-card'));
    const draggedItem = allItems.find(item => {
      const url = item.dataset.itemUrl || item.querySelector('a')?.href;
      return url === draggedUrl || (draggedUrl && url && url.includes(draggedUrl));
    });
    const targetItem = allItems.find(item => {
      const url = item.dataset.itemUrl || item.querySelector('a')?.href;
      return url === targetUrl || (targetUrl && url && url.includes(targetUrl));
    });
    
    if (!draggedItem || !targetItem || draggedItem === targetItem) return;
    
    // Get the drop position (above or below target)
    const rect = targetItem.getBoundingClientRect();
    const draggedRect = draggedItem.getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    const isAbove = draggedRect.top < midpoint;
    
    // Reorder in DOM
    if (isAbove) {
      // Insert before target
      targetItem.parentNode.insertBefore(draggedItem, targetItem);
    } else {
      // Insert after target
      if (targetItem.nextSibling) {
        targetItem.parentNode.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        targetItem.parentNode.appendChild(draggedItem);
      }
    }
    
    // Packery removed - no layout needed
    
    // Save the new order
    this.reorderMenuItem(draggedUrl, targetUrl);
  },
  
  /**
   * Save item order after reordering
   */
  saveItemOrder(container) {
    const items = container.querySelectorAll('.main-menu-bg');
    items.forEach((item, index) => {
      const categoryTitle = item.querySelector('h2')?.textContent.trim().replace('✏️', '').trim();
      if (categoryTitle) {
        const category = this.state.categories.find(cat => cat.title === categoryTitle);
        if (category) {
          category.weight = index;
          // Save draft
          const drafts = JSON.parse(localStorage.getItem('ttmenus_draft_categories') || '{}');
          drafts[categoryTitle] = category;
          localStorage.setItem('ttmenus_draft_categories', JSON.stringify(drafts));
        }
      }
    });
    this.state.hasChanges = true;
  },
  
  /**
   * Reorder menu item within category
   */
  reorderMenuItem(draggedUrl, targetUrl) {
    const draggedItem = this.state.menuItems.find(i => i.url === draggedUrl || draggedUrl.includes(i.url));
    const targetItem = this.state.menuItems.find(i => i.url === targetUrl || targetUrl.includes(i.url));
    
    if (!draggedItem || !targetItem) return;
    
    // Only allow reordering within same category
    if (draggedItem.category !== targetItem.category) {
      console.warn('Cannot move items between categories');
      return;
    }
    
    // Get all items in this category, sorted by current weight
    const categoryItems = this.state.menuItems
      .filter(i => i.category === draggedItem.category)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    // Find positions
    const draggedIndex = categoryItems.findIndex(i => i.id === draggedItem.id);
    const targetIndex = categoryItems.findIndex(i => i.id === targetItem.id);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const [removed] = categoryItems.splice(draggedIndex, 1);
    categoryItems.splice(targetIndex, 0, removed);
    
    // Reassign weights
    categoryItems.forEach((item, index) => {
      item.weight = index;
      this.saveDraft(item);
    });
    
    this.state.hasChanges = true;
    
    // Reload iframe to show new order
    const previewMode = document.getElementById('previewMode');
    const iframe = previewMode?.querySelector('iframe');
    if (iframe) {
      iframe.src = iframe.src; // Reload
    }
  },
  
  /**
   * Edit item from URL (called from iframe)
   */
  editItemFromUrl(itemUrl) {
    // Find item in our data by URL
    const item = this.state.menuItems.find(i => i.url === itemUrl || itemUrl.includes(i.url));
    if (item) {
      this.editItem(item.id);
    } else {
      console.warn('Item not found for URL:', itemUrl);
    }
  },

  /**
   * Render edit mode with inline editing
   */
  renderEditMode() {
    const container = document.getElementById('menuEditContainer');
    if (!container) return;
    
    let html = '<div class="main-body" id="packery-container">';
    
    // Group items by category URL path
    // Items belong to a category if their URL starts with the category's URL
    const itemsByCategory = {};
    this.state.categories.forEach(category => {
      itemsByCategory[category.url] = [];
    });
    
    // Helper to normalize URLs for comparison
    const normalizeUrl = (url) => {
      if (!url) return '';
      return url.endsWith('/') ? url : url + '/';
    };
    
    // Match items to categories by URL path
    this.state.menuItems.forEach(item => {
      const itemUrl = normalizeUrl(item.url);
      
      // Find the category whose URL is a prefix of the item's URL
      const matchingCategory = this.state.categories.find(cat => {
        const catUrl = normalizeUrl(cat.url);
        return itemUrl.startsWith(catUrl) && itemUrl !== catUrl; // Item URL must be longer than category URL
      });
      
      if (matchingCategory) {
        // Use original category.url as key (not normalized)
        if (!itemsByCategory[matchingCategory.url]) {
          itemsByCategory[matchingCategory.url] = [];
        }
        itemsByCategory[matchingCategory.url].push(item);
      }
    });
    
    // Sort items within each category by weight
    Object.keys(itemsByCategory).forEach(categoryUrl => {
      itemsByCategory[categoryUrl].sort((a, b) => a.weight - b.weight);
    });
    
    // Render each category
    this.state.categories.forEach(category => {
      const categoryItems = itemsByCategory[category.url] || [];
      
      html += `
        <div class="main-menu-bg ${category.title}">
          <div class="main-menu ${category.title} item">
            <div class="menu-header">
              <a class="menu-anchor" id="${category.title}"></a>
              ${category.image ? `
                <a href="${category.url || '#'}">
                  <img class="food item" src="${category.image}" alt="${category.title}" loading="lazy">
                </a>
              ` : ''}
              <div class="headerstyle item">
                <h2 class="center title editable-title" 
                    data-category="${category.title}"
                    onclick="MenuEditor.editCategory('${category.title}')">
                  <a href="${category.url || '#'}">${category.title}</a>
                </h2>
              </div>
              <div class="menu-summary item editable-summary"
                   data-category="${category.title}"
                   onclick="MenuEditor.editCategorySummary('${category.title}')">
                ${category.summary || ''}
              </div>
            </div>
            <div class="menu-items-container">
      `;
      
      // Render items in this category
      categoryItems.forEach(item => {
        html += this.renderMenuItemCard(item, true);
      });
      
      html += `
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Packery removed - no initialization needed
  },

  /**
   * Render a menu item card (editable version)
   */
  renderMenuItemCard(item, editable = false) {
    const variable1Values = [...new Set(item.prices.map(p => (p.variable1 != null ? p.variable1 : (Array.isArray(p) ? p[0] : p.size))).filter(s => s && s !== '-' && s !== 'None'))];
    const variable2Values = [...new Set(item.prices.map(p => (p.variable2 != null ? p.variable2 : (Array.isArray(p) ? p[1] : p.flavour))).filter(f => f && f !== '-' && f !== 'None'))];
    
    // Calculate price display
    const prices = item.prices.map(p => parseFloat(p.price)).sort((a, b) => a - b);
    let priceDisplay = '';
    if (prices.length > 0) {
      if (prices[0] === prices[prices.length - 1]) {
        priceDisplay = `$${prices[0].toFixed(2).replace(/\.00$/, '')}`;
      } else {
        priceDisplay = `$${prices[0].toFixed(2).replace(/\.00$/, '')} | $${prices[prices.length - 1].toFixed(2).replace(/\.00$/, '')}`;
      }
    }
    
    const firstImage = item.images && item.images.length > 0 ? item.images[0].image : null;
    
    // In edit mode, use editItem onclick, otherwise use toggleItemExpansion like the regular menu
    const onClickHandler = editable 
      ? `MenuEditor.editItem('${item.id}', event)`
      : `toggleItemExpansion(this, '${item.url}', event)`;
    
    return `
      <div class="menu-item-card ${editable ? 'editable' : ''}" 
           data-item-id="${item.id}"
           data-item-url="${item.url}"
           data-item-expanded="false"
           onclick="${onClickHandler}">
        ${editable ? '<div class="edit-overlay">Click to edit</div>' : ''}
        <div class="menu-item-row-top">
          ${firstImage ? `
            <a href="${item.url}" class="menu-item-image-link">
              <div class="menu-item-image">
                <img src="/${firstImage}" alt="${item.title}" loading="lazy" class="menu-item-img">
              </div>
            </a>
          ` : ''}
          <div class="menu-item-header-content">
            <h3 class="menu-item-title">
              <a href="${item.url}">${item.title}</a>
            </h3>
            <div class="menu-item-row-middle">
              <div class="menu-item-description">
                ${item.summary || ''}
              </div>
              <div class="menu-item-price">
                ${priceDisplay}
              </div>
            </div>
            <div class="menu-item-options">
              ${variable1Values.length > 0 ? `
                <ul class="sizes">
                  ${variable1Values.map(v => `<li>${v}</li>`).join('')}
                </ul>
              ` : ''}
              ${variable2Values.length > 0 ? `
                <ul class="flavours">
                  ${variable2Values.map(v => `<li>${v}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          </div>
        </div>
        <!-- Expanded content area (hidden by default) -->
        <div class="menu-item-expanded-content" style="display: none;">
          <div class="menu-item-expanded-loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading...</div>
          </div>
          <div class="menu-item-expanded-data" style="display: none;"></div>
        </div>
      </div>
    `;
  },

  /**
   * Edit a menu item (shows modal overlay)
   */
  editItem(itemId, event) {
    // Prevent default behavior if event is provided
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const item = this.state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    this.state.editingItem = item;
    
    // Show edit modal overlay
    this.showEditModal(item);
  },
  
  /**
   * Show edit modal overlay
   */
  showEditModal(item) {
    // Remove existing modal if any
    const existingModal = document.getElementById('edit-item-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'edit-item-modal';
    modal.className = 'edit-modal-overlay';
    modal.innerHTML = `
      <div class="edit-modal-content">
        <div class="edit-modal-header">
          <h2>Edit: ${this.escapeHtml(item.title)}</h2>
          <button class="edit-modal-close" onclick="MenuEditor.closeEditModal()">&times;</button>
        </div>
        <div class="edit-modal-body">
          ${this.createItemEditForm(item)}
          <div class="edit-form-actions">
            <button class="btn-navbar btn-navbar-primary" onclick="MenuEditor.saveItem('${item.id}')">
              💾 Save
            </button>
            <button class="btn-navbar btn-navbar-secondary" onclick="MenuEditor.closeEditModal()">
              ✖️ Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeEditModal();
      }
    });
  },
  
  /**
   * Close edit modal
   */
  closeEditModal() {
    const modal = document.getElementById('edit-item-modal');
    if (modal) {
      modal.remove();
    }
    this.state.editingItem = null;
  },

  /**
   * Create inline edit form for item
   */
  createItemEditForm(item) {
    return `
      <div class="edit-form-container">
        <div class="form-group">
          <label>Title</label>
          <input type="text" class="form-input" id="edit-title-${item.id}" value="${this.escapeHtml(item.title)}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea class="form-textarea" id="edit-description-${item.id}">${this.escapeHtml(item.summary || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Prices</label>
          <div id="edit-prices-${item.id}">
            ${(Array.isArray(item.prices) ? item.prices : []).map((price, idx) => {
              const p = Array.isArray(price) ? { variable1: price[0], variable2: price[1], price: price[2] } : price;
              return `
              <div class="price-entry">
                <input type="text" placeholder="variable1" value="${p.variable1 != null ? p.variable1 : p.size || ''}" data-price-index="${idx}">
                <input type="text" placeholder="variable2" value="${p.variable2 != null ? p.variable2 : p.flavour || ''}" data-price-index="${idx}">
                <input type="number" step="0.01" placeholder="Price" value="${p.price != null ? p.price : ''}" data-price-index="${idx}">
              </div>
            `}).join('')}
          </div>
          <button type="button" onclick="MenuEditor.addPriceEntry('${item.id}')">+ Add Price</button>
        </div>
      </div>
    `;
  },

  /**
   * Save item changes
   */
  async saveItem(itemId) {
    const item = this.state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    // Get form values
    const title = document.getElementById(`edit-title-${itemId}`)?.value;
    const description = document.getElementById(`edit-description-${itemId}`)?.value;
    
    // Get prices
    const priceInputs = document.querySelectorAll(`#edit-prices-${itemId} .price-entry`);
    const prices = [];
    priceInputs.forEach(entry => {
      const inputs = entry.querySelectorAll('input');
      if (inputs.length >= 3) {
        prices.push({
          variable1: inputs[0].value || '-',
          variable2: inputs[1].value || '-',
          price: parseFloat(inputs[2].value) || 0
        });
      }
    });
    
    // Update item
    item.title = title;
    item.summary = description;
    item.prices = prices;
    
    // Save to localStorage as draft
    this.saveDraft(item);
    
    // Close modal
    this.closeEditModal();
    
    // Reload iframe to show changes
    const previewMode = document.getElementById('previewMode');
    const iframe = previewMode?.querySelector('iframe');
    if (iframe) {
      iframe.src = iframe.src; // Reload
    }
    
    this.state.hasChanges = true;
    this.updateStatus('Changes saved (draft)', 'success');
  },

  /**
   * Cancel editing (now just closes modal)
   */
  cancelEdit(itemId) {
    this.closeEditModal();
  },

  /**
   * Save draft to localStorage
   */
  saveDraft(item) {
    const drafts = JSON.parse(localStorage.getItem('ttmenus_draft_items') || '{}');
    drafts[item.id] = {
      ...item,
      _isDraft: true,
      _updatedAt: new Date().toISOString()
    };
    localStorage.setItem('ttmenus_draft_items', JSON.stringify(drafts));
  },

  /**
   * Setup settings panel
   */
  setupSettings() {
    // Settings panel toggle is handled by openSettings/closeSettings functions
  },

  // Packery removed - no initialization needed

  /**
   * Update status message (no-op: status element removed)
   */
  updateStatus(message, type = 'info') {
    // Status element removed - method kept for compatibility
    return;
  },

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Add price entry
   */
  addPriceEntry(itemId) {
    const container = document.getElementById(`edit-prices-${itemId}`);
    if (!container) return;
    
    const entry = document.createElement('div');
    entry.className = 'price-entry';
    entry.innerHTML = `
      <input type="text" placeholder="Size" data-price-index="new">
      <input type="text" placeholder="Flavour" data-price-index="new">
      <input type="number" step="0.01" placeholder="Price" data-price-index="new">
    `;
    container.appendChild(entry);
  },

  /**
   * Edit category
   */
  editCategory(categoryTitle) {
    console.log('Edit category:', categoryTitle);
    // TODO: Implement category editing
  },

  /**
   * Edit category summary
   */
  editCategorySummary(categoryTitle) {
    console.log('Edit category summary:', categoryTitle);
    // TODO: Implement category summary editing
  },

  /**
   * Save all changes
   */
  async saveAllChanges() {
    if (!this.state.hasChanges) {
      this.updateStatus('No changes to save', 'info');
      return;
    }
    
    this.updateStatus('Saving...', 'info');
    
    try {
      // Get all drafts
      const drafts = JSON.parse(localStorage.getItem('ttmenus_draft_items') || '{}');
      
      // TODO: Send to API
      console.log('Saving drafts:', drafts);
      
      this.updateStatus('All changes saved!', 'success');
      this.state.hasChanges = false;
    } catch (error) {
      console.error('Error saving:', error);
      this.updateStatus('Error saving changes', 'error');
    }
  },
  
  /**
   * Load locations data from various sources
   */
  async loadLocationsData() {
    // Try multiple sources in order of preference
    
    // 1. Try Hugo-generated data JSON endpoint
    try {
      const response = await fetch('/data/locations.json');
      if (response.ok) {
        const data = await response.json();
        if (data.locations && Array.isArray(data.locations)) {
          console.log('✅ Locations loaded from /data/locations.json');
          return data.locations;
        }
      }
    } catch (e) {
      console.log('⚠️ /data/locations.json not available');
    }
    
    // 2. Try locations page JSON (if it contains data)
    try {
      const response = await fetch('/locations/index.json');
      if (response.ok) {
        const data = await response.json();
        // Check if it has locations data embedded
        if (data.locations && Array.isArray(data.locations)) {
          console.log('✅ Locations loaded from /locations/index.json');
          return data.locations;
        }
        // Check if it has data property with locations
        if (data.data && data.data.locations && Array.isArray(data.data.locations)) {
          console.log('✅ Locations loaded from /locations/index.json (data property)');
          return data.data.locations;
        }
      }
    } catch (e) {
      console.log('⚠️ /locations/index.json not available or doesn\'t contain locations');
    }
    
    // 3. Try API endpoint (if available)
    try {
      const response = await fetch('/api/locations.json');
      if (response.ok) {
        const data = await response.json();
        if (data.locations && Array.isArray(data.locations)) {
          console.log('✅ Locations loaded from /api/locations.json');
          return data.locations;
        }
      }
    } catch (e) {
      console.log('⚠️ /api/locations.json not available');
    }
    
    // 4. Check if locations are already in state (from previous import)
    if (this.state.locations && this.state.locations.length > 0) {
      console.log('✅ Using locations from state');
      return this.state.locations;
    }
    
    // 5. Check localStorage for saved locations
    try {
      const saved = localStorage.getItem('ttmenus_locations');
      if (saved) {
        const locations = JSON.parse(saved);
        if (Array.isArray(locations) && locations.length > 0) {
          console.log('✅ Locations loaded from localStorage');
          this.state.locations = locations;
          return locations;
        }
      }
    } catch (e) {
      console.log('⚠️ Could not load locations from localStorage');
    }
    
    // Fallback: return empty array
    console.log('⚠️ No locations data found, returning empty array');
    return [];
  },
  
  /**
   * Export menu to JSON format (round-trip compatible)
   * This JSON can be used to rebuild the menu
   */
  async exportMenuToJSON() {
    // Load locations data
    const locations = await this.loadLocationsData();
    
    const menuData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      metadata: {
        siteTitle: document.title || '',
        baseURL: window.location.origin
      },
      categories: this.state.categories.map(cat => ({
        title: cat.title,
        url: cat.url,
        weight: cat.weight || 0,
        image: cat.image || cat.params?.images?.primary || null,
        summary: cat.summary || '',
        images: {
          primary: cat.params?.images?.primary || cat.image || null,
          secondary: cat.params?.images?.secondary || cat.params?.slidein?.slideinimage || null
        },
        params: {
          ...cat.params,
          images: {
            primary: cat.params?.images?.primary || cat.image,
            secondary: cat.params?.images?.secondary || cat.params?.slidein?.slideinimage
          }
        }
      })),
      menuItems: this.state.menuItems.map(item => ({
        id: item.id,
        title: item.title,
        url: item.url,
        category: item.category,
        categoryUrl: item.categoryUrl || '',
        weight: item.weight || 0,
        summary: item.summary || '',
        prices: item.prices || [],
        images: item.images || [],
        tags: item.tags || [],
        ingredients: item.ingredients || [],
        cookingmethods: item.cookingmethods || [],
        types: item.types || [],
        events: item.events || [],
        // Include any additional data
        sides: item.sides || [],
        additions: item.additions || [],
        modifications: item.modifications || [],
        side_categories: item.side_categories || [],
        sideconfig: item.sideconfig || []
      })),
      locations: locations.map(loc => ({
        address: loc.address,
        city: loc.city || null,
        island: loc.island || null,
        latlon: loc.latlon || null,
        phone: loc.phone || null,
        whatsapp: loc.whatsapp || null,
        orderingtables: loc.orderingtables || [],
        delivery: loc.delivery || null,
        opening_hours: loc.opening_hours || null,
        subcategories: loc.subcategories || []
      }))
    };
    
    return JSON.stringify(menuData, null, 2);
  },
  
  /**
   * Import menu from JSON format
   * Rebuilds the menu structure from JSON
   */
  importMenuFromJSON(jsonString) {
    try {
      const menuData = JSON.parse(jsonString);
      
      // Validate structure
      if (!menuData.categories || !menuData.menuItems) {
        throw new Error('Invalid menu JSON: missing categories or menuItems');
      }
      
      // Update state with imported data
      this.state.categories = menuData.categories.map(cat => ({
        title: cat.title,
        url: cat.url,
        weight: cat.weight || 0,
        image: cat.image || cat.params?.images?.primary || cat.params?.image,
        summary: cat.summary || '',
        params: {
          ...cat.params,
          images: {
            primary: cat.params?.images?.primary || cat.image || cat.params?.image,
            secondary: cat.params?.images?.secondary || cat.params?.slidein?.slideinimage
          }
        }
      }));
      
      this.state.menuItems = menuData.menuItems.map(item => ({
        id: item.id || item.url,
        title: item.title,
        url: item.url,
        category: item.category,
        categoryUrl: item.categoryUrl || '',
        weight: item.weight || 0,
        summary: item.summary || '',
        prices: item.prices || [],
        images: item.images || [],
        tags: item.tags || [],
        ingredients: item.ingredients || [],
        cookingmethods: item.cookingmethods || [],
        types: item.types || [],
        events: item.events || [],
        sides: item.sides || [],
        additions: item.additions || [],
        modifications: item.modifications || [],
        side_categories: item.side_categories || [],
        sideconfig: item.sideconfig || []
      }));
      
      // Import locations if present
      if (menuData.locations && Array.isArray(menuData.locations)) {
        this.state.locations = menuData.locations.map(loc => ({
          address: loc.address,
          city: loc.city || null,
          island: loc.island || null,
          latlon: loc.latlon || null,
          phone: loc.phone || null,
          whatsapp: loc.whatsapp || null,
          orderingtables: loc.orderingtables || [],
          delivery: loc.delivery || null,
          opening_hours: loc.opening_hours || null,
          subcategories: loc.subcategories || []
        }));
        
        // Save locations to localStorage for use
        try {
          localStorage.setItem('ttmenus_locations', JSON.stringify(this.state.locations));
          console.log('✅ Locations saved to localStorage');
        } catch (e) {
          console.warn('⚠️ Could not save locations to localStorage:', e);
        }
      }
      
      // Sort by weight
      this.state.categories.sort((a, b) => a.weight - b.weight);
      this.state.menuItems.sort((a, b) => a.weight - b.weight);
      
      // Mark as having changes
      this.state.hasChanges = true;
      
      // Re-render preview
      if (this.state.currentView === 'preview') {
        this.renderPreview();
      }
      
      console.log('✅ Menu imported from JSON:', {
        categories: this.state.categories.length,
        items: this.state.menuItems.length,
        locations: this.state.locations?.length || 0
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error importing menu from JSON:', error);
      alert('Error importing menu: ' + error.message);
      return false;
    }
  },
  
  /**
   * Download menu as JSON file
   */
  async downloadMenuJSON() {
    try {
      const json = await this.exportMenuToJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ Menu JSON downloaded');
    } catch (error) {
      console.error('❌ Error downloading menu JSON:', error);
      alert('Error exporting menu: ' + error.message);
    }
  },
  
  /**
   * Load menu from JSON file
   */
  loadMenuFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonString = e.target.result;
      if (this.importMenuFromJSON(jsonString)) {
        alert('Menu loaded successfully!');
      }
    };
    reader.onerror = () => {
      alert('Error reading file');
    };
    reader.readAsText(file);
  },
  
  /**
   * Build menu HTML from JSON data
   * This creates the same HTML structure as home.html
   */
  buildMenuFromJSON(menuData) {
    if (typeof menuData === 'string') {
      menuData = JSON.parse(menuData);
    }
    
    let html = '<div class="main-body" id="packery-container">';
    
    // Sort categories by weight
    const categories = [...menuData.categories].sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    categories.forEach(category => {
      // Get items for this category
      const categoryItems = menuData.menuItems
        .filter(item => item.category === category.title)
        .sort((a, b) => (a.weight || 0) - (b.weight || 0));
      
      if (categoryItems.length === 0) return;
      
      html += `
        <div class="main-menu-bg ${category.title}">
          <div class="main-menu ${category.title} item">
            <div class="menu-header">
              <a class="menu-anchor" id="${category.title}"></a>
              ${(category.images?.primary || category.image) ? `
                <a href="${category.url}">
                  <img class="food item" src="${category.images?.primary || category.image}" alt="${category.title}" loading="lazy">
                </a>
              ` : ''}
              <div class="headerstyle item">
                <h2 class="center title">
                  <a href="${category.url}">${category.title}</a>
                  ${(category.images?.secondary || category.params?.slidein?.slideinimage) ? `
                    <img class="slideinimg" 
                         src="${category.images?.secondary || category.params?.slidein?.slideinimage}" 
                         alt="${category.title} decoration" 
                         loading="lazy">
                  ` : ''}
                </h2>
              </div>
              <div class="menu-summary item">
                ${category.summary || ''}
              </div>
            </div>
            <div class="menu-items-container">
      `;
      
      categoryItems.forEach(item => {
        // Extract variable1 and variable2 values from prices
        const variable1Values = [...new Set(item.prices.map(p => (p.variable1 != null ? p.variable1 : (Array.isArray(p) ? p[0] : p.size))).filter(s => s && s !== '-' && s !== 'None'))];
        const variable2Values = [...new Set(item.prices.map(p => (p.variable2 != null ? p.variable2 : (Array.isArray(p) ? p[1] : p.flavour))).filter(f => f && f !== '-' && f !== 'None'))];
        
        // Calculate price display
        const prices = item.prices.map(p => parseFloat(p.price)).filter(p => !isNaN(p)).sort((a, b) => a - b);
        let priceDisplay = '';
        if (prices.length > 0) {
          if (prices[0] === prices[prices.length - 1]) {
            priceDisplay = `$${prices[0].toFixed(2).replace(/\.00$/, '')}`;
          } else {
            priceDisplay = `$${prices[0].toFixed(2).replace(/\.00$/, '')} | $${prices[prices.length - 1].toFixed(2).replace(/\.00$/, '')}`;
          }
        }
        
        // Get first image
        const firstImage = item.images && item.images.length > 0 ? item.images[0].image : null;
        
        html += `
          <div class="menu-item-card" 
               data-item-url="${item.url}"
               data-item-expanded="false"
               onclick="toggleItemExpansion(this, '${item.url}', event);">
            <div class="menu-item-row-top">
              ${firstImage ? `
                <a href="${item.url}" class="menu-item-image-link">
                  <div class="menu-item-image">
                    <img src="/${firstImage}" alt="${item.title}" loading="lazy" class="menu-item-img">
                  </div>
                </a>
              ` : ''}
              <div class="menu-item-header-content">
                <h3 class="menu-item-title">
                  <a href="${item.url}">${item.title}</a>
                </h3>
                <div class="menu-item-row-middle">
                  <div class="menu-item-description">
                    ${item.summary || ''}
                  </div>
                  <div class="menu-item-price">
                    ${priceDisplay}
                  </div>
                </div>
                <div class="menu-item-options">
                  ${variable1Values.length > 0 ? `
                    <ul class="sizes">
                      ${variable1Values.map(v => `<li>${v}</li>`).join('')}
                    </ul>
                  ` : ''}
                  ${variable2Values.length > 0 ? `
                    <ul class="flavours">
                      ${variable2Values.map(v => `<li>${v}</li>`).join('')}
                    </ul>
                  ` : ''}
                </div>
              </div>
            </div>
            <div class="menu-item-expanded-content" style="display: none;">
              <div class="menu-item-expanded-loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading...</div>
              </div>
              <div class="menu-item-expanded-data" style="display: none;"></div>
            </div>
          </div>
        `;
      });
      
      html += `
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }
};

// Global functions for onclick handlers
window.MenuEditor = MenuEditor;

// Expose setLayout globally
window.setLayout = (layout) => MenuEditor.setLayout(layout);

function openSettings() {
  const panel = document.getElementById('settingsPanel');
  if (panel) {
    panel.classList.add('open');
  }
}

function closeSettings() {
  const panel = document.getElementById('settingsPanel');
  if (panel) {
    panel.classList.remove('open');
  }
}

function saveAllChanges() {
  MenuEditor.saveAllChanges();
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MenuEditor.init());
} else {
  MenuEditor.init();
}
