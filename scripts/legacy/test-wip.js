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

async function testQuery(project) {
    try {
        console.log(`Testing query for project: ${project}`);
        const q = query(devicesCol, where('project', 'in', [project]));
        const snap = await getDocs(q);
        console.log(`Found ${snap.docs.length} docs for ${project}`);
        
        let inProgressCount = 0;
        snap.docs.forEach(d => {
            const u = d.data();
            if (u.status === 'Processing' || u.status === 'In Progress' || u.status === 'WIP') {
                inProgressCount++;
                console.log(`WIP Unit: ${d.id} | Status: ${u.status} | Station: ${u.stationName}`);
            }
        });
        console.log(`Total WIP for ${project}: ${inProgressCount}`);
    } catch (e) {
        console.error(`Error for ${project}:`, e.message);
    }
}

async function run() {
    await testQuery('Device');
    await testQuery('Peripherals');
    await testQuery('Inward QC');
    process.exit(0);
}
run();
