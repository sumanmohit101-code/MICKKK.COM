import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpa5zxymgAvV0k-gZvM9e2hefLnogG4As",
  authDomain: "mickkk-terminal.firebaseapp.com",
  projectId: "mickkk-terminal",
  storageBucket: "mickkk-terminal.appspot.com",
  messagingSenderId: "708877453716",
  appId: "1:708877453716:web:5d371d47ec10b014126781"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.journalAuth = { signOut: () => signOut(auth) };

let resolveJournalUser;
window.journalStoreReady = new Promise(resolve => { resolveJournalUser = resolve; });

function currentUser() {
  const user = window.journalUser;
  if (!user) throw new Error("Sign-in is required");
  return user;
}

function userCollection(name) { 
  return collection(db, "users", currentUser().uid, name); 
}

function safeDocId(id) { 
  return String(id).replace(/[\/#?\[\]]/g, "_"); 
}

window.journalStore = {
  async listTrades() {
    const snap = await getDocs(userCollection("trades"));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  async saveTrade(trade) {
    const id = safeDocId(trade.id);
    await setDoc(doc(db, "users", currentUser().uid, "trades", id), { 
      ...trade, 
      id, 
      ownerUid: currentUser().uid, 
      updatedAt: serverTimestamp() 
    }, { merge: true });
  },
  async deleteTrade(id) { 
    await deleteDoc(doc(db, "users", currentUser().uid, "trades", safeDocId(id))); 
  },
  async listWatchlist() {
    const snap = await getDocs(userCollection("watchlist"));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },
  async saveWatchlistItem(item) {
    const id = safeDocId(item.id);
    await setDoc(doc(db, "users", currentUser().uid, "watchlist", id), { 
      ...item, 
      id, 
      ownerUid: currentUser().uid, 
      updatedAt: serverTimestamp() 
    }, { merge: true });
  },
  async deleteWatchlistItem(id) { 
    await deleteDoc(doc(db, "users", currentUser().uid, "watchlist", safeDocId(id))); 
  }
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.journalUser = null;
    window.location.replace("index.html?auth=required");
    return;
  }
  window.journalUser = user;
  resolveJournalUser(user);

  if (typeof window.updateUserHeaderBadge === "function") {
    window.updateUserHeaderBadge();
  }

  // Fetch Role from Firestore
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    let role = "free";
    if (userSnap.exists()) {
      const data = userSnap.data();
      const expiry = Number(data.planExpires || 0);
      if (data.role === "pro" && expiry && expiry > Date.now()) {
        role = "pro";
      } else if (data.role === "pro" && !expiry) {
        role = "pro";
      }
    }
    window.journalUserRole = role;
    if (typeof window.applyJournalRoleRules === "function") {
      window.applyJournalRoleRules(role);
    }
  } catch (e) {
    console.warn("Role check error:", e);
    if (typeof window.applyJournalRoleRules === "function") {
      window.applyJournalRoleRules("free");
    }
  }
});
