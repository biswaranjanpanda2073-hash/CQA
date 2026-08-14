import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, where } from 'firebase/firestore';

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
const devicesCol = collection(db, 'devices');

async function testWipQuery() {
    try {
        console.log("Querying all WIP units globally...");
        const q = query(devicesCol, where('status', 'in', ['Processing', 'In Progress', 'WIP', 'In-Progress', 'Processing...']));
        const snap = await getDocs(q);
        console.log(`Found ${snap.docs.length} active WIP units globally!`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
testWipQuery();
