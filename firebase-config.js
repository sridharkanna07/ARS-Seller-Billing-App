/**
 * Firebase Configuration & Initialization
 * A.R.S Crackers Seller Billing App
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Create new project or select existing
 * 3. Enable Firestore Database
 * 4. Go to Project Settings > Service Accounts
 * 5. Click "Generate New Private Key"
 * 6. Replace the config below with your credentials
 */

// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firestore instance
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence().catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open - offline persistence disabled');
  } else if (err.code === 'unimplemented') {
    console.warn('Browser does not support offline persistence');
  }
});

// ============================================
// FIRESTORE COLLECTIONS STRUCTURE
// ============================================

const COLLECTIONS = {
  users: 'users',
  sellers: 'sellers',
  invoices: 'invoices',
  products: 'products',
  transactions: 'transactions',
  analytics: 'analytics',
  backups: 'backups'
};

// ============================================
// USER AUTHENTICATION
// ============================================

async function authenticateUser(sellerId, password) {
  try {
    const userRef = db.collection(COLLECTIONS.users).doc(sellerId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }

    // In production, use proper authentication - this is just demo
    const user = userDoc.data();

    if (user.password === password) {
      return {
        success: true,
        userId: sellerId,
        user: user
      };
    }

    return { success: false, error: 'Invalid credentials' };
  } catch (error) {
    console.error('Auth error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// SELLERS SYNC
// ============================================

async function loadSellerData(sellerId) {
  try {
    const sellerRef = db.collection(COLLECTIONS.sellers).doc(sellerId);
    const sellerDoc = await sellerRef.get();

    if (sellerDoc.exists) {
      return sellerDoc.data();
    }

    return null;
  } catch (error) {
    console.error('Error loading seller data:', error);
    throw error;
  }
}

// Real-time listener for seller data
function listenToSellerUpdates(sellerId, callback) {
  return db.collection(COLLECTIONS.sellers).doc(sellerId)
    .onSnapshot((doc) => {
      if (doc.exists) {
        callback(doc.data());
      }
    }, (error) => {
      console.error('Error listening to seller updates:', error);
    });
}

// ============================================
// INVOICE SYNC
// ============================================

async function saveInvoice(sellerId, invoiceData) {
  try {
    const invoiceRef = db.collection(COLLECTIONS.invoices).doc();

    const invoice = {
      id: invoiceRef.id,
      sellerId: sellerId,
      ...invoiceData,
      createdAt: firebase.firestore.Timestamp.now(),
      updatedAt: firebase.firestore.Timestamp.now(),
      synced: true
    };

    await invoiceRef.set(invoice);

    // Update seller's last invoice timestamp
    await db.collection(COLLECTIONS.sellers).doc(sellerId).update({
      lastInvoiceTime: firebase.firestore.Timestamp.now(),
      totalInvoices: firebase.firestore.FieldValue.increment(1)
    });

    return { success: true, invoiceId: invoiceRef.id };
  } catch (error) {
    console.error('Error saving invoice:', error);
    return { success: false, error: error.message };
  }
}

// Real-time listener for invoices
function listenToInvoices(sellerId, callback) {
  return db.collection(COLLECTIONS.invoices)
    .where('sellerId', '==', sellerId)
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      const invoices = [];
      snapshot.forEach((doc) => {
        invoices.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(invoices);
    }, (error) => {
      console.error('Error listening to invoices:', error);
    });
}

// ============================================
// PRODUCTS SYNC
// ============================================

async function loadProducts(shopId) {
  try {
    const productsSnapshot = await db.collection(COLLECTIONS.products)
      .where('shopId', '==', shopId)
      .get();

    const products = [];
    productsSnapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return products;
  } catch (error) {
    console.error('Error loading products:', error);
    throw error;
  }
}

// Real-time listener for products
function listenToProducts(shopId, callback) {
  return db.collection(COLLECTIONS.products)
    .where('shopId', '==', shopId)
    .onSnapshot((snapshot) => {
      const products = [];
      snapshot.forEach((doc) => {
        products.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(products);
    }, (error) => {
      console.error('Error listening to products:', error);
    });
}

// ============================================
// ANALYTICS & AUTO-SYNC
// ============================================

async function updateAnalytics(sellerId, salesData) {
  try {
    const analyticsRef = db.collection(COLLECTIONS.analytics)
      .doc(`${sellerId}-${new Date().toISOString().split('T')[0]}`);

    await analyticsRef.set({
      sellerId: sellerId,
      date: new Date().toISOString().split('T')[0],
      ...salesData,
      updatedAt: firebase.firestore.Timestamp.now()
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.error('Error updating analytics:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// BACKUP & RESTORE
// ============================================

async function createBackup(sellerId, backupData) {
  try {
    const backupRef = db.collection(COLLECTIONS.backups).doc();

    await backupRef.set({
      sellerId: sellerId,
      data: backupData,
      timestamp: firebase.firestore.Timestamp.now(),
      size: JSON.stringify(backupData).length
    });

    return { success: true, backupId: backupRef.id };
  } catch (error) {
    console.error('Error creating backup:', error);
    return { success: false, error: error.message };
  }
}

async function restoreBackup(backupId) {
  try {
    const backupDoc = await db.collection(COLLECTIONS.backups).doc(backupId).get();

    if (backupDoc.exists) {
      return { success: true, data: backupDoc.data().data };
    }

    return { success: false, error: 'Backup not found' };
  } catch (error) {
    console.error('Error restoring backup:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// OFFLINE SYNC QUEUE
// ============================================

class SyncQueue {
  constructor() {
    this.queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
  }

  add(action, data) {
    this.queue.push({
      id: Date.now(),
      action: action,
      data: data,
      timestamp: new Date().toISOString(),
      synced: false
    });
    this.save();
  }

  save() {
    localStorage.setItem('syncQueue', JSON.stringify(this.queue));
  }

  async syncAll() {
    const pendingItems = this.queue.filter(item => !item.synced);

    for (const item of pendingItems) {
      try {
        switch (item.action) {
          case 'saveInvoice':
            await saveInvoice(item.data.sellerId, item.data);
            break;
          case 'updateAnalytics':
            await updateAnalytics(item.data.sellerId, item.data);
            break;
        }

        item.synced = true;
        this.save();
      } catch (error) {
        console.error(`Failed to sync ${item.action}:`, error);
      }
    }
  }

  clear() {
    this.queue = [];
    this.save();
  }
}

// Create global sync queue
const syncQueue = new SyncQueue();

// Monitor connection status and sync when online
window.addEventListener('online', async () => {
  console.log('🟢 Back online - syncing...');
  await syncQueue.syncAll();
});

window.addEventListener('offline', () => {
  console.log('🔴 Offline - queuing changes');
});

// ============================================
// EXPORTS
// ============================================

// Make functions available globally
window.firebaseUtils = {
  authenticateUser,
  loadSellerData,
  listenToSellerUpdates,
  saveInvoice,
  listenToInvoices,
  loadProducts,
  listenToProducts,
  updateAnalytics,
  createBackup,
  restoreBackup,
  syncQueue,
  db,
  COLLECTIONS
};
