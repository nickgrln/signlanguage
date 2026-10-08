import { initializeApp, getApps } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

let firestore: Firestore | null = null;

export function getCloudStore() {
  if (firestore) return firestore;
  const { NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID } = process.env;
  if (!NEXT_PUBLIC_FIREBASE_API_KEY || !NEXT_PUBLIC_FIREBASE_PROJECT_ID) return null;
  const app = getApps()[0] ?? initializeApp({
    apiKey: NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: NEXT_PUBLIC_FIREBASE_APP_ID
  });
  firestore = getFirestore(app);
  return firestore;
}
