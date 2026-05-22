function showStatusSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('地名狀態批次工具')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 取得指定欄位的名稱、位置與其對應的第一個資料列的下拉選單內容
 */
function getColumnConfigs() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const targetNames = ["TaiClass", "T_State", "T_Annotator", "HakClass", "H_State", "H_Annotator"];
  
  const configs = targetNames.map(name => {
    const index = headers.indexOf(name);
    let options = [];
    
    if (index !== -1) {
      // 取得第二列的下拉選單規則
      const cell = sheet.getRange(2, index + 1);
      const rule = cell.getDataValidation();
      
      if (rule) {
        const criteriaValues = rule.getCriteriaValues();
        const firstCriteria = criteriaValues[0];
        
        // 修正點：判斷下拉選單是「直接輸入項目」還是「來自範圍」
        if (Array.isArray(firstCriteria)) {
          // 情況 A: 直接在驗證規則輸入清單 (List of items)
          options = firstCriteria;
        } else if (firstCriteria && typeof firstCriteria === 'object' && firstCriteria.getValues) {
          // 情況 B: 選單來源是一個範圍 (List from range)
          options = firstCriteria.getValues().flat().filter(String);
        }
      }
    }
    
    return {
      name: name,
      index: index + 1,
      options: options
    };
  });
  
  // 過濾掉沒找到的欄位
  return configs.filter(c => c.index > 0);
}

/**
 * 批次更新選取的資料 (整合 AuditLogger 版本)
 * @param {Object} updateData 格式為 { 欄位Index: "新數值", ... }
 */
function batchUpdateMultiColumns(updateData) {
  const sheet = SpreadsheetApp.getActiveSheet();
  
  // 安全檢查：確保是在正確的工作表操作
  if (sheet.getName() !== GLOBAL_CFG.sheetName) {
    return "❌ 錯誤：請在「" + GLOBAL_CFG.sheetName + "」工作表使用此功能";
  }

  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();
  
  // 跳過標題列
  const actualStartRow = (startRow === 1) ? 2 : startRow;
  const actualNumRows = (startRow === 1) ? numRows - 1 : numRows;
  
  if (actualNumRows <= 0) return "❌ 請先選取要修改的資料列";

  // --- 核心整合邏輯 ---
  
  // 1. 取得標題對照表 (從 AuditLogger 的 _headerMap 取得)
  const hdr = _headerMap();
  
  // 2. 建立「索引 -> 欄位名」的反向查找表
  const indexToNameMap = {};
  for (let name in hdr) {
    indexToNameMap[hdr[name]] = name;
  }

  // 3. 準備給 gasUpdateRows 的資料結構
  // 格式需為: [{ row: 2, data: { T_State: '已完成', ... } }, ...]
  const updates = [];
  
  // 建立每一列要更新的內容
  const rowDataToUpdate = {};
  for (let colIdx in updateData) {
    const colName = indexToNameMap[colIdx];
    if (colName) {
      rowDataToUpdate[colName] = updateData[colIdx];
    }
  }

  // 封裝成每一列的 update 物件
  for (let i = 0; i < actualNumRows; i++) {
    updates.push({
      row: actualStartRow + i,
      data: rowDataToUpdate
    });
  }

  // 4. 呼叫 AuditLogger 提供的核心函式
  // 指定 uid 為 'BatchStateAssign'
  try {
    const processedRows = gasUpdateRows(updates, 'BatchStateAssign');
    return `✅ 成功批次更新 ${processedRows.length} 列資料，並已記錄審計日誌！`;
  } catch (e) {
    return `❌ 更新失敗：${e.message}`;
  }
}