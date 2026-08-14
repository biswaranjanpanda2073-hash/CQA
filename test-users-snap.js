import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw',
    authDomain: 'cqa-mes.firebaseapp.com',
    projectId: 'cqa-mes',
    storageBucket: 'cqa-mes.appspot.com',
    messagingSenderId: '500138644479',
    appId: '1:500138644479:web:1624bbe2d7459b27a6cdca'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("Setting up snapshot...");
const unsub = onSnapshot(collection(db, 'users'), snap => {
    console.log("Snapshot received! Docs count:", snap.docs.length);
    process.exit(0);
}, err => {
    console.error("Snapshot error:", err);
    process.exit(1);
});
