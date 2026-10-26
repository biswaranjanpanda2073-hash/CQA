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

const resolveActiveProject = (unit) => {
    if (!unit) return 'Device';
    const stName = (unit.stationName || '').toUpperCase().trim();
    
    if (['INSPECTION', 'DEBUG', 'REWORK', 'FINAL QC', 'PACKING', 'SCRAP REVIEW'].some(s => stName === s)) return 'Device';
    if (stName === 'IQC' || stName === 'INWARD QC') return 'Inward QC';
    if (stName === 'QC' || stName === 'PERIPHERALS QC') return 'Peripherals';
    if (stName === 'REJECTION REVIEW') return 'Peripherals';
    if (stName === 'REJECTION') return 'Inward QC';
    
    if (!unit) return 'Other';
    if (unit.project) return unit.project;
    const h = unit.history;
    if (!h || h.length === 0) return 'Device';
    for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].project) return h[i].project;
    }
    return 'Device';
};

async function checkMetrics(project) {
    const q = query(collection(db, 'devices'), where('status', '==', 'Processing'));
    const snap = await getDocs(q); 
    
    const projectDisp = project; // For simplicity, assume project = projectDisp
    
    const wipUnits = snap.docs.map(d => d.data())
        .filter(u => {
            const activeP = resolveActiveProject(u);
            const isRefurb = project === 'Device' || project === 'Refurbishment' || projectDisp === 'Refurbishment';
            if (isRefurb && (activeP === 'Device' || activeP === 'Refurbishment')) return true;
            return activeP === project || activeP === projectDisp;
        });
        
    const wipCountPerStation = wipUnits.reduce((acc, u) => { 
        if (u.stationName) {
            const sKey = u.stationName.toUpperCase().trim();
            acc[sKey] = (acc[sKey] || 0) + 1; 
        }
        return acc; 
    }, {});
    
    return wipCountPerStation;
}

async function run() {
    console.log("Device:", await checkMetrics('Device'));
    console.log("Peripherals:", await checkMetrics('Peripherals'));
    console.log("Inward QC:", await checkMetrics('Inward QC'));
    process.exit(0);
}

run().catch(console.error);
