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

async function testQuery() {
    try {
        console.log("Testing with duplicate in array: ['Peripherals', 'Peripherals']");
        const q = query(devicesCol, where('project', 'in', ['Peripherals', 'Peripherals']));
        const snap = await getDocs(q);
        console.log("Success! Docs:", snap.docs.length);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
testQuery();
