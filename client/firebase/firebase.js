// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDtriC1-ZO9t4DiqKPFsWW7ssbOUFtbcKg",
  authDomain: "openbounty-b3e69.firebaseapp.com",
  projectId: "openbounty-b3e69",
  storageBucket: "openbounty-b3e69.firebasestorage.app",
  messagingSenderId: "369360821349",
  appId: "1:369360821349:web:e9a6d38bca84feb5f67a8c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
