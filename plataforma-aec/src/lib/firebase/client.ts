'use client';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

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

const app = (): FirebaseApp => (getApps().length ? getApp() : initializeApp(config));
export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
export const storage = () => getStorage(app());
export const functions = () => getFunctions(app(), process.env.NEXT_PUBLIC_FUNCTIONS_REGION ?? 'southamerica-east1');
