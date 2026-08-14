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

async function testHistory() {
    const q = query(collection(db, 'devices'), where('project', '==', 'Device'), limit(50));
    const snap = await getDocs(q);
    const passFailByKey = {};
    for (const docSnap of snap.docs) {
        const histSnap = await getDocs(collection(docSnap.ref, 'history'));
        const history = histSnap.docs.map(h => h.data());
        
        history.forEach(h => {
            const sKey = (h.station || '').trim().toUpperCase();
            if (!sKey) return;
            const r = (h.result || '').toUpperCase();
            if (!passFailByKey[sKey]) passFailByKey[sKey] = { pass: 0, fail: 0 };
            if (r === 'PASS' || r === 'COMPLETED') passFailByKey[sKey].pass++;
            else if (r === 'FAIL' || r === 'SCRAP' || r === 'REJECTED') passFailByKey[sKey].fail++;
        });
    }
    console.log(passFailByKey);
}
testHistory();
