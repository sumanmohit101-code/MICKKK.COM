// auth.js — Master Authentication & Role Controller for Mickkk.com
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpa5zxymgAvV0k-gZvM9e2hefLnogG4As",
  authDomain: "mickkk-terminal.firebaseapp.com",
  projectId: "mickkk-terminal",
  storageBucket: "mickkk-terminal.appspot.com",
  messagingSenderId: "708877453716",
  appId: "1:708877453716:web:5d371d47ec10b014126781"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Clean Unique Referral Code Generator
function makeReferralCode(user) {
  const base = (user.email || user.uid).split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
  const suffix = user.uid.slice(-4).toLowerCase();
  return (base || "trader") + suffix;
}

// User Profile & Referral Code Auto-Sync
async function syncUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.exists() ? userSnap.data() : null;

  const profile = {
    uid: user.uid,
    name: user.displayName || "Trader",
    email: user.email || "",
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp()
  };

  if (!data) {
    // Naya User: Generate code & create Free account
    const refCode = makeReferralCode(user);
    await setDoc(userRef, {
      ...profile,
      role: "free",
      referralCode: refCode,
      referralCount: 0,
      createdAt: serverTimestamp()
    });

    // Public lookup mapping me bhi register karein
    try {
      await setDoc(doc(db, "referralCodes", refCode), {
        uid: user.uid,
        email: user.email || "",
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Could not register referral code mapping:", e);
    }
  } else {
    // Existing User: Agar pehle se referral code missing ho, toh bana dein
    if (!data.referralCode) {
      const refCode = makeReferralCode(user);
      profile.referralCode = refCode;
      profile.referralCount = Number(data.referralCount || 0);

      try {
        await setDoc(doc(db, "referralCodes", refCode), {
          uid: user.uid,
          email: user.email || "",
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("Could not register referral code mapping:", e);
      }
    }
    await setDoc(userRef, profile, { merge: true });
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Auth Error:", error);
      alert("Login Error: " + (error.message || "Please try again."));
    }
    throw error;
  }
}

export async function getUserRole(uid) {
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const expiry = Number(data.planExpires || 0);
      // Agar Pro plan ki date nikal gayi ho toh turant Free treat karein
      if (data.role === "pro" && expiry && expiry <= Date.now()) return "free";
      return data.role || "free";
    }
  } catch (e) {
    console.warn("Error fetching role:", e);
  }
  return "free";
}

export async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout Error:", error);
    alert("Logout failed. Please try again.");
  }
}

export function initAuthListener(onUserLogged, onUserLoggedOut) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await syncUserProfile(user);
        const role = await getUserRole(user.uid);
        user.role = role;
        updateUIForUser(user);
        if (onUserLogged) await onUserLogged(user, role);
      } catch (e) {
        console.error("Auth profile/listener error:", e);
        updateUIForUser(user);
      }
    } else {
      updateUIForGuest();
      if (onUserLoggedOut) onUserLoggedOut();
    }
  });
}

export function requireAuth() {
  return onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "index.html?auth=required";
  });
}

function updateUIForUser(user) {
  document.querySelectorAll(".auth-logged-out").forEach(el => el.style.display = "none");
  document.querySelectorAll(".auth-logged-in").forEach(el => el.style.display = "flex");
  document.querySelectorAll(".auth-user-name").forEach(el => el.textContent = user.displayName || "Trader");
  document.querySelectorAll(".auth-user-email").forEach(el => el.textContent = user.email || "");
  document.querySelectorAll(".auth-user-avatar").forEach(el => {
    if (user.photoURL) {
      const img = document.createElement("img");
      img.src = user.photoURL;
      img.alt = "avatar";
      img.referrerPolicy = "no-referrer";
      img.className = "w-full h-full rounded-lg object-cover";
      el.replaceChildren(img);
    } else {
      el.textContent = (user.displayName || "U").charAt(0).toUpperCase();
    }
  });
}

function updateUIForGuest() {
  document.querySelectorAll(".auth-logged-in").forEach(el => el.style.display = "none");
  document.querySelectorAll(".auth-logged-out").forEach(el => el.style.display = "flex");
  document.querySelectorAll(".auth-user-name").forEach(el => el.textContent = "Guest Trader");
  document.querySelectorAll(".auth-user-email").forEach(el => el.textContent = "Sign in to access");
  document.querySelectorAll(".auth-user-avatar").forEach(el => el.textContent = "G");
}
