/**
 * Firebase Auto-Sync Engine
 * A.R.S Crackers Seller Billing App
 *
 * Handles real-time synchronization between local data and Firestore
 */

class AutoSyncEngine {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.currentSellerId = null;
    this.unsubscribers = [];
    this.syncInterval = null;
    this.lastSyncTime = {};

    this.setupEventListeners();
  }

  setupEventListeners() {
    window.addEventListener('online', () => {
      console.log('📡 Network: Online');
      this.isOnline = true;
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      console.log('📡 Network: Offline');
      this.isOnline = false;
    });
  }

  // Initialize auto-sync for a seller
  async initialize(sellerId) {
    try {
      if (this.isInitialized && this.currentSellerId === sellerId) {
        return true;
      }

      this.currentSellerId = sellerId;

      // Start real-time listeners
      this.setupInvoiceSync(sellerId);
      this.setupProductSync(sellerId);
      this.setupSellerDataSync(sellerId);

      // Periodic sync every 5 minutes
      this.syncInterval = setInterval(() => {
        if (this.isOnline) {
          this.triggerSync();
        }
      }, 5 * 60 * 1000);

      this.isInitialized = true;
      console.log('✅ Auto-Sync initialized for seller:', sellerId);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize auto-sync:', error);
      return false;
    }
  }

  // Setup real-time invoice synchronization
  setupInvoiceSync(sellerId) {
    const unsubscribe = window.firebaseUtils.listenToInvoices(
      sellerId,
      (invoices) => {
        // Store in local storage
        localStorage.setItem(`invoices_${sellerId}`, JSON.stringify(invoices));
        this.lastSyncTime.invoices = new Date();

        // Dispatch custom event for UI update
        window.dispatchEvent(new CustomEvent('invoicesUpdated', {
          detail: { invoices, timestamp: this.lastSyncTime.invoices }
        }));

        console.log('✅ Invoices synced:', invoices.length, 'items');
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  // Setup real-time product synchronization
  setupProductSync(sellerId) {
    // Get shop ID from seller data
    window.firebaseUtils.loadSellerData(sellerId).then((sellerData) => {
      if (sellerData && sellerData.shopId) {
        const unsubscribe = window.firebaseUtils.listenToProducts(
          sellerData.shopId,
          (products) => {
            // Store in local storage
            localStorage.setItem(`products_${sellerId}`, JSON.stringify(products));
            this.lastSyncTime.products = new Date();

            // Dispatch custom event for UI update
            window.dispatchEvent(new CustomEvent('productsUpdated', {
              detail: { products, timestamp: this.lastSyncTime.products }
            }));

            console.log('✅ Products synced:', products.length, 'items');
          }
        );

        this.unsubscribers.push(unsubscribe);
      }
    });
  }

  // Setup real-time seller data synchronization
  setupSellerDataSync(sellerId) {
    const unsubscribe = window.firebaseUtils.listenToSellerUpdates(
      sellerId,
      (sellerData) => {
        // Store in local storage
        localStorage.setItem(`sellerData_${sellerId}`, JSON.stringify(sellerData));
        this.lastSyncTime.sellerData = new Date();

        // Dispatch custom event for UI update
        window.dispatchEvent(new CustomEvent('sellerDataUpdated', {
          detail: { sellerData, timestamp: this.lastSyncTime.sellerData }
        }));

        console.log('✅ Seller data synced');
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  // Save invoice and sync to Firestore
  async saveInvoice(sellerId, invoiceData) {
    try {
      // Save to local storage first (optimistic update)
      const localKey = `localInvoice_${Date.now()}`;
      localStorage.setItem(localKey, JSON.stringify({
        ...invoiceData,
        localId: localKey,
        pendingSync: true
      }));

      // Sync to Firestore if online
      if (this.isOnline) {
        const result = await window.firebaseUtils.saveInvoice(sellerId, invoiceData);

        if (result.success) {
          // Remove from local pending and add to synced
          localStorage.removeItem(localKey);
          this.lastSyncTime.invoices = new Date();
          console.log('✅ Invoice saved and synced:', result.invoiceId);
          return { success: true, invoiceId: result.invoiceId, synced: true };
        }
      } else {
        // Queue for sync when online
        window.firebaseUtils.syncQueue.add('saveInvoice', {
          sellerId: sellerId,
          ...invoiceData
        });

        console.log('⏱️  Invoice queued for sync');
        return { success: true, synced: false, queued: true };
      }
    } catch (error) {
      console.error('❌ Error saving invoice:', error);
      return { success: false, error: error.message };
    }
  }

  // Update analytics and sync
  async updateAnalytics(sellerId, salesData) {
    try {
      if (this.isOnline) {
        const result = await window.firebaseUtils.updateAnalytics(sellerId, salesData);

        if (result.success) {
          this.lastSyncTime.analytics = new Date();
          console.log('✅ Analytics updated');
          return result;
        }
      } else {
        window.firebaseUtils.syncQueue.add('updateAnalytics', {
          sellerId: sellerId,
          ...salesData
        });

        console.log('⏱️  Analytics queued for sync');
      }
    } catch (error) {
      console.error('❌ Error updating analytics:', error);
      return { success: false, error: error.message };
    }
  }

  // Create automatic backup
  async createAutoBackup(sellerId) {
    try {
      const backupData = {
        invoices: JSON.parse(localStorage.getItem(`invoices_${sellerId}`) || '[]'),
        products: JSON.parse(localStorage.getItem(`products_${sellerId}`) || '[]'),
        sellerData: JSON.parse(localStorage.getItem(`sellerData_${sellerId}`) || '{}'),
        timestamp: new Date().toISOString()
      };

      if (this.isOnline) {
        const result = await window.firebaseUtils.createBackup(sellerId, backupData);

        if (result.success) {
          console.log('✅ Auto-backup created:', result.backupId);
          return result;
        }
      }
    } catch (error) {
      console.error('❌ Error creating auto-backup:', error);
    }
  }

  // Manual sync trigger
  async triggerSync() {
    if (!this.isOnline || !this.currentSellerId) {
      return;
    }

    try {
      console.log('🔄 Triggering manual sync...');

      // Sync pending items
      await window.firebaseUtils.syncQueue.syncAll();

      // Get fresh data from Firestore
      const sellerData = await window.firebaseUtils.loadSellerData(this.currentSellerId);
      const products = await window.firebaseUtils.loadProducts(sellerData?.shopId);

      localStorage.setItem(`sellerData_${this.currentSellerId}`, JSON.stringify(sellerData));
      localStorage.setItem(`products_${this.currentSellerId}`, JSON.stringify(products));

      console.log('✅ Manual sync complete');

      return { success: true };
    } catch (error) {
      console.error('❌ Sync error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get local cached data
  getLocalInvoices(sellerId) {
    return JSON.parse(localStorage.getItem(`invoices_${sellerId}`) || '[]');
  }

  getLocalProducts(sellerId) {
    return JSON.parse(localStorage.getItem(`products_${sellerId}`) || '[]');
  }

  getLocalSellerData(sellerId) {
    return JSON.parse(localStorage.getItem(`sellerData_${sellerId}`) || '{}');
  }

  // Get sync status
  getSyncStatus(sellerId) {
    return {
      isOnline: this.isOnline,
      isInitialized: this.isInitialized,
      currentSellerId: this.currentSellerId,
      lastSyncTime: this.lastSyncTime,
      pendingSync: window.firebaseUtils.syncQueue.queue.filter(i => !i.synced).length,
      localDataSize: {
        invoices: new Blob([localStorage.getItem(`invoices_${sellerId}`) || '']).size,
        products: new Blob([localStorage.getItem(`products_${sellerId}`) || '']).size,
        sellerData: new Blob([localStorage.getItem(`sellerData_${sellerId}`) || '']).size
      }
    };
  }

  // Cleanup and stop sync
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.unsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });

    this.unsubscribers = [];
    this.isInitialized = false;
    console.log('🛑 Auto-Sync stopped');
  }
}

// Create global auto-sync instance
const autoSync = new AutoSyncEngine();

// Make available globally
window.autoSync = autoSync;

// ============================================
// USAGE EXAMPLES
// ============================================

/*

// Initialize auto-sync when user logs in
async function handleLogin(sellerId, password) {
  const auth = await window.firebaseUtils.authenticateUser(sellerId, password);

  if (auth.success) {
    // Start auto-sync
    await window.autoSync.initialize(sellerId);

    // Listen for updates
    window.addEventListener('invoicesUpdated', (e) => {
      console.log('New invoices:', e.detail.invoices);
      // Update UI
    });

    window.addEventListener('productsUpdated', (e) => {
      console.log('New products:', e.detail.products);
      // Update UI
    });
  }
}

// Save invoice
async function handleSaveInvoice(invoiceData) {
  const result = await window.autoSync.saveInvoice('seller001', invoiceData);

  if (result.synced) {
    showNotification('✅ Saved & Synced', 'Invoice synced to cloud');
  } else if (result.queued) {
    showNotification('⏱️ Queued', 'Will sync when online');
  }
}

// Get sync status
function showSyncStatus() {
  const status = window.autoSync.getSyncStatus('seller001');
  console.log('Sync Status:', status);
}

// Create auto-backup every hour
setInterval(() => {
  window.autoSync.createAutoBackup('seller001');
}, 60 * 60 * 1000);

*/
