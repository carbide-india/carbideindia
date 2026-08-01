import "server-only";

// Firebase Admin SDK (server only).
//
// The admin credentials (FIREBASE_ADMIN_*) may be EMPTY during early rollout —
// the user pastes the service-account secret later. So this module must import
// cleanly at module-eval time even without credentials; we only throw when a
// caller actually tries to USE adminAuth (lazy init). That keeps the app from
// crashing on boot before the secret exists.
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

const ADMIN_APP_NAME = "carbide-admin";

function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Private keys are frequently stored with literal "\n" escape sequences
  // (e.g. when pasted into a single-line env var). Normalize them back to
  // real newlines or the PEM parser rejects the key.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY in the environment.",
    );
  }

  return initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
    },
    ADMIN_APP_NAME,
  );
}

// Lazy `adminAuth`: the actual Auth instance is only built on first property
// access, so importing this module never touches (possibly-missing) creds.
export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const auth = getAuth(getAdminApp());
    const value = Reflect.get(auth as object, prop, receiver);
    return typeof value === "function" ? value.bind(auth) : value;
  },
});
