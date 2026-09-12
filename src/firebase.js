import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, query, orderBy, where, addDoc, getCountFromServer } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage";
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

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

// Collection references
const devicesCol = collection(db, 'devices');
const usersCol = collection(db, 'users');
const settingsCol = collection(db, 'settings');
const ticketsCol = collection(db, 'tickets');

export { 
    app, db, storage, auth, functions, devicesCol, usersCol, settingsCol, ticketsCol, 
    doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, 
    query, orderBy, collection, where, addDoc, getCountFromServer,
    ref, uploadBytes, getDownloadURL, uploadString,
    signInWithCustomToken, onAuthStateChanged, signOut,
    httpsCallable
};
