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
    const cleanId = 'T-2600-20260107000379';
    try {
        const docRef = doc(db, 'devices', cleanId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const u = snap.data();
            const unitData = { ...u, id: snap.id };

            try {
                const historySnap = await getDocs(collection(docRef, 'history'));
                const subcolHistory = historySnap.docs.map(d => d.data());
                
                const oldHistory = Array.isArray(u.history) ? u.history : [];
                const combined = [...oldHistory, ...subcolHistory];
                
                const uniqueHistoryMap = new Map();
                combined.forEach(h => {
                    if (h.timestamp) uniqueHistoryMap.set(h.timestamp, h);
                });
                const uniqueHistory = Array.from(uniqueHistoryMap.values());

                unitData.history = uniqueHistory.sort((a, b) => {
                    if (!a.timestamp) return -1;
                    if (!b.timestamp) return 1;
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
            } catch (histErr) {
                console.warn(`Failed to fetch history subcollection for ${cleanId}:`, histErr.message);
                const oldHistory = Array.isArray(u.history) ? u.history : [];
                unitData.history = oldHistory.sort((a, b) => {
                    if (!a.timestamp) return -1;
                    if (!b.timestamp) return 1;
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
            }
            
            console.log('FINAL UNIT HISTORY LENGTH:', unitData.history.length);
        } else {
            console.log('NOT FOUND');
        }
    } catch (e) {
        console.error('Outer catch:', e);
    }
    process.exit(0);
}

check().catch(console.error);
