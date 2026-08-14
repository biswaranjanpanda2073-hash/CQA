import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';

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

async function check() {
    const docRef = doc(db, 'devices', 'T-2600-20260107000379');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data();
        console.log('Device Data keys:', Object.keys(data));
        console.log('History in array?', Array.isArray(data.history) ? data.history.length : 'No');
        const hist = await getDocs(collection(docRef, 'history')).catch(e => {
             console.log('Subcollection fetch failed:', e.message);
             return { docs: [] };
        });
        console.log('Subcollection docs:', hist.docs.length);
    } else {
        console.log('NOT FOUND: T-2600-20260107000379');
    }
    process.exit(0);
}

check().catch(console.error);
