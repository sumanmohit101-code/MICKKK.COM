// auth.js — Master Authentication & Role Controller for Mickkk.com
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpa5zxymgAvV0k-gZvM9e2hefLnogG4As", // <-- Yahan apni real API Key dalein
  authDomain: "mickkk-terminal.firebaseapp.com",
  projectId: "mickkk-terminal",
  storageBucket: "mickkk-terminal.appspot.com",
  messagingSenderId: "708877453716",
  appId: "1:708877453716:web:5d371d47ec10b014126781"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Google Login
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Auth Error:", error.message);
      alert("Login Error: " + error.message);
    }
  }
}

// User Profile Sync (Firestore me naya record create karna)
async function syncUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      name: user.displayName || "Trader",
      email: user.email,
      photoURL: user.photoURL || "",
      role: "free", // Default Free
      createdAt: serverTimestamp()
    });
  }
}

// Role Check
export async function getUserRole(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data().role || "free";
    }
  } catch (e) {
    console.warn("Error fetching role:", e);
  }
  return "free";
}

// Logout
export async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout Error:", error.message);
  }
}

// Global Auth Listener
export function initAuthListener(onUserLogged, onUserLoggedOut) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const role = await getUserRole(user.uid);
      user.role = role;
      updateUIForUser(user);
      if (onUserLogged) onUserLogged(user, role);
    } else {
      updateUIForGuest();
      if (onUserLoggedOut) onUserLoggedOut();
    }
  });
}

// Route Guard (Bina login ke terminal kholne par index.html par redirect karega)
export function requireAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "index.html?auth=required";
    }
  });
}

function updateUIForUser(user) {
  document.querySelectorAll(".auth-logged-out").forEach(el => el.style.display = "none");
  document.querySelectorAll(".auth-logged-in").forEach(el => el.style.display = "flex");

  document.querySelectorAll(".auth-user-name").forEach(el => el.innerText = user.displayName || "Trader");
  document.querySelectorAll(".auth-user-email").forEach(el => el.innerText = user.email || "");

  document.querySelectorAll(".auth-user-avatar").forEach(el => {
    if (user.photoURL) {
      el.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="w-full h-full rounded-lg object-cover" referrerpolicy="no-referrer" />`;
    } else {
      el.innerText = (user.displayName || "U")[0].toUpperCase();
    }
  });
}

function updateUIForGuest() {
  document.querySelectorAll(".auth-logged-in").forEach(el => el.style.display = "none");
  document.querySelectorAll(".auth-logged-out").forEach(el => el.style.display = "flex");

  document.querySelectorAll(".auth-user-name").forEach(el => el.innerText = "Guest Trader");
  document.querySelectorAll(".auth-user-email").forEach(el => el.innerText = "Sign in to access");
  document.querySelectorAll(".auth-user-avatar").forEach(el => el.innerText = "G");
}
