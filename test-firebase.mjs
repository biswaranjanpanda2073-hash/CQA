import { initializeApp } from 'firebase/app'; 
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore'; 

const app = initializeApp({ 
    apiKey: 'AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw', 
    authDomain: 'cqa-mes.firebaseapp.com', 
    projectId: 'cqa-mes', 
    storageBucket: 'cqa-mes.appspot.com', 
    messagingSenderId: '500138644479', 
    appId: '1:500138644479:web:1624bbe2d7459b27a6cdca' 
}); 

const db = getFirestore(app); 

async function test() { 
    const q = query(collection(db, 'devices'), limit(10)); 
    const snap = await getDocs(q); 
    for (const d of snap.docs) { 
        const hSnap = await getDocs(collection(d.ref, 'history')); 
        console.log('Device:', d.id, 'History records:', hSnap.size); 
    } 
    process.exit(0); 
} 
test();
