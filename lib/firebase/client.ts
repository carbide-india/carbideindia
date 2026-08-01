// Firebase client SDK (browser only).
//
// Imported by client components exclusively. Initialization is LAZY: importing
// this module never calls getAuth() at module scope. That matters because these
// client modules are also server-rendered — and if getAuth() ran during SSR
// with the NEXT_PUBLIC_FIREBASE_* config absent (e.g. a build that predates the
// env vars), it throws `auth/invalid-api-key` and 500s every route. With lazy
// init the real Auth is only built on first property access, i.e. inside the
// browser event handlers that actually sign in — so a misconfigured build
// degrades to "auth unavailable" instead of taking the whole site down.
//
// NOTE: never call getAnalytics() at module scope — it references `window` and
// breaks SSR. Use the browser + isSupported() guarded helper below.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Lazily get (or create) the singleton app — never runs at module load. */
function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let cachedAuth: Auth | null = null;

/**
 * The client Auth instance, initialized lazily on first call (memoized). Call
 * this from BROWSER code paths only (event handlers, effects) — never at module
 * scope — so importing this file during SSR never runs getAuth(). Returns the
 * real Auth object (no proxy), so the stateful SDK behaves normally.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}

/**
 * Lazily load Firebase Analytics, guarded for SSR and browser support.
 * Returns null on the server or where analytics isn't supported.
 */
export async function getFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;
  return getAnalytics(getFirebaseApp());
}
