# 錄音調查員 UI 展示版

這個展示版沿用正式入口的 index.html、style.css 與 main.js，只在展示模式注入固定示範資料。畫面版型與錄音調查員實際使用的 UI 共用同一份渲染與樣式，不需要登入，也不會寫入 Supabase、Google Sheet 或 Google Drive。

## 開啟方式

1. 啟動本機靜態伺服器，執行 npm.cmd run dev。

2. 開啟 ui-showcase.html，或直接前往 http://localhost:5173/ui-showcase.html。

展示頁會預先開啟一筆示範任務；錄音、選檔、播放與上傳按鈕只模擬畫面狀態。若要提供給他人，可部署同一份靜態網站後分享 /ui-showcase.html。
