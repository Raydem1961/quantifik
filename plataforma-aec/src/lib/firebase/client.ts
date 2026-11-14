'use client';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Sem configuração do Firebase o app roda em modo demonstração (dados em memória). */
export const MODO_DEMO = !config.apiKey || !config.projectId;

const REGIAO = process.env.NEXT_PUBLIC_FUNCTIONS_REGION ?? 'southamerica-east1';
/** Desenvolvimento local: aponta os SDKs para o Firebase Emulator Suite (`firebase emulators:start`). */
const EMULADORES = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

function app(): FirebaseApp {
  if (getApps().length) return getApp();
  const novo = initializeApp(config);
  if (EMULADORES) {
    connectAuthEmulator(getAuth(novo), 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(novo), '127.0.0.1', 8080);
    connectStorageEmulator(getStorage(novo), '127.0.0.1', 9199);
    connectFunctionsEmulator(getFunctions(novo, REGIAO), '127.0.0.1', 5001);
  }
  return novo;
}
export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
export const storage = () => getStorage(app());
export const functions = () => getFunctions(app(), REGIAO);
