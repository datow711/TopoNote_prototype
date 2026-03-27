// ⚠️ 請替換成你最新部署的 Google Apps Script 網址
const API_URL = "https://script.google.com/macros/s/AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw/exec"; 

const CONFIG = {
    SUPABASE_URL: 'https://sikconjhtomqdkicbjal.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2NvbmpodG9tcWRraWNiamFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODk4NzAsImV4cCI6MjA5MDE2NTg3MH0.CR4zasAgXSogTsoSvLonTRwYlBkBPAyAj6jh-TKqViM',
    
    // 原本上傳音檔到 Google Drive 的 GAS 網址 (這個保留不變)
    GOOGLE_DRIVE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw/exec'
};