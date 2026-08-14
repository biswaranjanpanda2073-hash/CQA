import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, collection, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
    apiKey: 'AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw',
    authDomain: 'cqa-mes.firebaseapp.com',
    projectId: 'cqa-mes',
    storageBucket: 'cqa-mes.appspot.com',
    messagingSenderId: '575640700516',
    appId: '1:575640700516:web:8e357ce678a17e0129a391'
});

const auth = getAuth(app);
const db = getFirestore(app);

const testProcessUnit = async () => {
    try {
        await signInWithEmailAndPassword(auth, 'admin@cqa.com', 'admin123'); // Assuming standard admin
        console.log("Logged in!");
        
        const cleanId = '4011943';
        const docRef = doc(db, 'devices', cleanId);
        const historyRef = doc(collection(docRef, 'history'));
        
        const batch = writeBatch(db);
        
        // Let's just try to write a dummy document to history
        batch.set(historyRef, { test: true });
        
        console.log("Setting batch...");
        await batch.commit();
        console.log("Batch committed successfully!");
    } catch (e) {
        console.error("Firebase Error:", e);
    }
};

testProcessUnit();
