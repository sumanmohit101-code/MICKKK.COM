// auth.js — Central Authentication Module for Mickkk.com
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Firebase configuration for Mickkk-Terminal
const firebaseConfig = {
  apiKey: "AIzaSyBpa5zxymgAvV0k-gZvM9e2hefLnogG4As", // <-- Yahan apni Config wali apiKey dalein
  authDomain: "mickkk-terminal.firebaseapp.com",
  projectId: "mickkk-terminal",
  storageBucket: "mickkk-terminal.appspot.com",
  messagingSenderId: "708877453716",
  appId: "1:708877453716:web:5d371d47ec10b014126781"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Google Login Function
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Auth Error:", error.message);
      alert("Login Error: " + error.message);
    }
  }
}

// Logout Function
export async function logoutUser() {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (error) {
    console.error("Logout Error:", error.message);
  }
}

// Global Auth State Observer
export function initAuthListener(onUserLogged, onUserLoggedOut) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      updateUIForUser(user);
      if (onUserLogged) onUserLogged(user);
    } else {
      updateUIForGuest();
      if (onUserLoggedOut) onUserLoggedOut();
    }
  });
}

// UI Sync for Logged-In User
function updateUIForUser(user) {
  document.querySelectorAll(".auth-user-name").forEach(el => el.innerText = user.displayName || "Trader");
  document.querySelectorAll(".auth-user-email").forEach(el => el.innerText = user.email || "");
  
  document.querySelectorAll(".auth-user-avatar").forEach(el => {
    if (user.photoURL) {
      el.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="w-full h-full rounded-lg object-cover" referrerpolicy="no-referrer" />`;
    } else {
      el.innerText = (user.displayName || "U")[0].toUpperCase();
    }
  });

  document.querySelectorAll(".auth-login-btn").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".auth-logout-btn").forEach(el => el.classList.remove("hidden"));
  document.querySelectorAll(".auth-user-panel").forEach(el => el.classList.remove("hidden"));
}

// UI Sync for Guest
function updateUIForGuest() {
  document.querySelectorAll(".auth-user-name").forEach(el => el.innerText = "Guest User");
  document.querySelectorAll(".auth-user-email").forEach(el => el.innerText = "Click to Login");
  document.querySelectorAll(".auth-user-avatar").forEach(el => el.innerText = "G");

  document.querySelectorAll(".auth-login-btn").forEach(el => el.classList.remove("hidden"));
  document.querySelectorAll(".auth-logout-btn").forEach(el => el.classList.add("hidden"));
}
