import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, where, limit } from 'firebase/firestore';

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
    try {
        const snap = await getDocs(query(collection(db, 'devices'), limit(100)));
        const statuses = new Set();
        snap.forEach(d => statuses.add(d.data().status));
        console.log('Statuses found:', Array.from(statuses));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

check();
