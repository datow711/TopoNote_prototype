# 地名 staging 合併紀錄（2026-07-20）

## 範圍

- 線上 Places 總檔：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- 合併分頁：`地名合併_staging_1150112`（`sheetId=1979813164`）
- 新清冊來源：`assets/115.1.12_地名後臺清冊_合併.xlsx`
- staging 共 63,762 列（1 列表頭、63,761 列資料）與 8 欄。
- 本次只建立合併 staging，未將資料匯入正式地名總表，也未寫入「第三期工作清單」。

## 比對規則

1. 以「縣市、鄉鎮、地名、地名類別」組成主鍵，對照 live master snapshot。
2. 主鍵只有一筆 live 候選，且沒有其他新清冊列競爭同一 live UUID 時，標記為 `UNIQUE_MATCH` 並保留原 UUID。
3. 主鍵有多筆 live 候選時，只在新座標與其中一筆 live 座標落在容許差距內才自動選定；否則標記 `AMBIGUOUS_MULTIPLE_CANDIDATES`。
4. 多筆新清冊列指向同一 live UUID 時，只允許唯一座標近似者勝出；其餘標記 `AMBIGUOUS_TARGET_COLLISION`，並保留各自的新清冊 UID，避免錯誤合併。
5. 完全找不到主鍵候選時標記 `NO_MATCH`，使用新清冊 UID。
6. 新座標必須為非零、有限且落在緯度 ±90、經度 ±180。疑似經緯度反寫時交換校正；無效座標在唯一匹配時保留原座標，否則留白。

## 8 欄設計

| 欄位 | 用途 |
| --- | --- |
| `MatchInfo` | JSON 稽核欄，保存比對狀態、方法、新清冊 UID／PlaceId、類別、地名、行政區、候選數、來源列與備註。 |
| `UUID` | 唯一匹配時使用原 UUID；collision、no-match 或多候選未決時使用新清冊 UID。 |
| `Village` | 村里。 |
| `LocationDescription` | 位置與面積描述。 |
| `HistoryDescription` | 地名沿革與文獻歷史。 |
| `StandardPlaceCode` | 標準地名代碼。 |
| `DataSource` | 資料來源。 |
| `Coordinates` | JSON 稽核欄，保存原座標、建議座標與座標處理狀態。 |

原本 26 欄的完整稽核資料壓縮成 8 欄，是因 Places 活頁簿在新增 staging 前已有 9,446,298 格；63,762 × 26 會超過 Google Sheets 1,000 萬格限制。8 欄設計使總格數約為 9,956,394。

## 統計

### 比對狀態

| 狀態 | 筆數 | UUID 規則 |
| --- | ---: | --- |
| `UNIQUE_MATCH` | 49,321 | 保留原 UUID |
| `AMBIGUOUS_TARGET_COLLISION` | 14,299 | 使用新清冊 UID |
| `NO_MATCH` | 134 | 使用新清冊 UID |
| `AMBIGUOUS_MULTIPLE_CANDIDATES` | 7 | 使用新清冊 UID |

### 座標狀態

| 狀態 | 筆數 |
| --- | ---: |
| `NEW_VALID_UPDATED` | 43,169 |
| `NEW_INVALID_LEFT_BLANK` | 20,585 |
| `NEW_SWAPPED_CORRECTED` | 7 |

- live master 資料列：100,559
- 新清冊資料列：63,761
- live UUID 重複：0
- 超長儲存格截斷：0

## 線上重建與保護範圍

- `地名合併_staging_1150112!A1:H63762` 先完整清空，再由已驗證的暫存 Google Sheet 透過 `IMPORTRANGE` 重建，展開完成後轉為靜態值。
- staging 設定凍結表頭、基本篩選器、表頭格式、固定欄寬與裁切顯示，避免長描述自動撐高。
- 傳輸用暫存 Google Sheet 在 staging 靜態化並驗證後刪除。
- 「第三期工作清單」維持 `sheetId=364534835`、6843 × 42，表頭與既有資料未更動。
