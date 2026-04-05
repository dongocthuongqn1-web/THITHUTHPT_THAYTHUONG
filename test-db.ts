import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import config from './firebase-applet-config.json';

const app = initializeApp(config);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Testing connection...");
    await getDoc(doc(db, 'test/1'));
    console.log("Success!");
    process.exit(0);
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
test();