import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, query, orderBy, where, addDoc, getCountFromServer, limit } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage";
import { getAuth, connectAuthEmulator, signInWithCustomToken, onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw",
    authDomain: "cqa-mes.firebaseapp.com",
    projectId: "cqa-mes",
    storageBucket: "cqa-mes.appspot.com",
    messagingSenderId: "500138644479",
    appId: "1:500138644479:web:1624bbe2d7459b27a6cdca",
    measurementId: "G-Q3DC8SL7GV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app);

if (import.meta.env.VITE_USE_EMULATOR === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    console.log('[Firebase] Connected to local Firebase Emulators (100% isolated sandbox)');
}

// Collection references
const devicesCol = collection(db, 'devices');
const usersCol = collection(db, 'users');
const settingsCol = collection(db, 'settings');
const ticketsCol = collection(db, 'tickets');

export { 
    app, db, storage, auth, functions, devicesCol, usersCol, settingsCol, ticketsCol, 
    doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, 
    query, orderBy, collection, where, addDoc, getCountFromServer, limit,
    ref, uploadBytes, getDownloadURL, uploadString,
    signInWithCustomToken, onAuthStateChanged, signOut,
    httpsCallable
};
