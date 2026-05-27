# 新 session 第一個 prompt

請讀取 `NEXT_CHAT_HANDOFF.md`、`logs/timeline.md`、最近的 `logs/sessions/`，並用 `git status --short --branch` 和 `git log --oneline -8` 確認目前 repo 狀態。

目前專案是 `TopoNote_App`，工作目錄：

`H:\我的雲端硬碟\kunui711工作資料夾\地名登錄工具_prototype\TopoNote_App`

請接著協助我開發。除非我明確說不用，之後每次完成改動都請幫我 commit；push 預設我自己來，只有我明確要求時才 push。

目前最新重點：
- 使用者 UI 顯示已改為姓名，hover 看 email。
- 管理員使用者列表會並排顯示姓名、email、手機，並可切 active。
- 指派與篩選仍要用 account/email 作為資料值，不能用姓名寫入 DB。
- 測試地名 `TEST0001` 到 `TEST0010` 已走 `test_places`，審查回寫應進 `TestEntries`。
- 審查頁已改成錄音資料比較表與最終審定欄位。

開始前請先確認工作樹是否乾淨，以及目前 `main` 是否仍只比 `origin/main` 超前本地 commit。
