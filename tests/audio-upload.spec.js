const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

function successResponse(id = 9001, extra = {}) {
  return {
    success: true,
    recordData: {
      id,
      taskId: '101',
      sourceId: 'SRC-101',
      language: '台語',
      audioFileId: 'https://drive.google.com/file/d/test/view',
      recorderAccount: 'user@example.com',
      recorderName: '測試調查員',
      createdAt: '2026-08-20T00:00:00.000Z',
      ...extra
    }
  };
}

async function prepareUploadPage(page) {
  await page.goto(appUrl);
  await page.evaluate(() => {
    const place = {
      id: 101,
      sourceId: 'SRC-101',
      placeName: '甲地',
      county: '測試縣',
      town: '測試鄉',
      type: '測試',
      tAssignee: 'user@example.com',
      hAssignee: '',
      taiAudioCount: 0,
      hakAudioCount: 0,
      recordingStatus: '未錄音'
    };
    state.userId = 'user@example.com';
    state.userEmail = 'user@example.com';
    state.userName = '測試調查員';
    state.userRole = 'user';
    state.currentTab = 'assigned';
    state.assignedPlaces = [place];
    state.allPlaces = [place];
    state.filteredPlaces = [place];
    state.uploadedRecords = [];
    state.uploadReportRecords = [];
    state.reviewQueue = [];
    state.selectedTowns = [];
    state.selectedTypes = [];
    state.selectedTaiClasses = [];
    state.selectedHakClasses = [];
    state.availableTypes = [];
    state.availableTaiClasses = [];
    state.availableHakClasses = [];
    state.selectedStatuses = [...STATUS_FILTER_VALUES];
    state.selectedStatus = 'all';
    state.selectedHakArea = 'all';
    state.selectedPlace = place;
    switchAnnotationLanguage('台語');
    document.getElementById('tl1-input').value = 'tsu';
    document.getElementById('respondent-key-input').value = 'R01';
    document.getElementById('audio-confirm-panel').classList.remove('hidden');
    window.confirm = () => true;
    window.alert = message => {
      window.__lastAlert = String(message || '');
    };
    window.__lastAlert = '';
    audioBlob = new Blob(['test audio'], { type: 'audio/mp4' });
    uploadedFileName = 'voice.m4a';
    pendingUploadJob = null;
    uploadInProgress = false;
  });
}

test('現場錄音保留瀏覽器實際 MIME 並產生對應副檔名', async ({ page }) => {
  await page.goto(appUrl);

  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] })
      }
    });

    class MockMediaRecorder {
      static isTypeSupported(mimeType) {
        return mimeType === 'audio/mp4';
      }

      constructor(stream, options) {
        this.stream = stream;
        this.mimeType = options?.mimeType || '';
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({
          data: new Blob(['mp4 audio'], { type: 'audio/mp4' })
        });
        this.onstop?.();
      }
    }

    window.MediaRecorder = MockMediaRecorder;
    await startRecording();
    stopRecording();
    return {
      mimeType: audioBlob.type,
      fileName: uploadedFileName,
      status: document.getElementById('status').innerText
    };
  });

  expect(result).toEqual({
    mimeType: 'audio/mp4',
    fileName: '現場錄音.m4a',
    status: '錄音完成，請先播放確認。可以重錄，也可以直接上傳。'
  });
});

test('不支援錄音或拒絕麥克風權限時提供可操作的上傳 fallback', async ({ page }) => {
  await page.goto(appUrl);

  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: undefined
    });
    await startRecording();
    const unsupported = document.getElementById('status').innerText;

    class MockMediaRecorder {}
    window.MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('permission denied', 'NotAllowedError');
        }
      }
    });
    await startRecording();
    return {
      unsupported,
      denied: document.getElementById('status').innerText
    };
  });

  expect(result.unsupported).toContain('不支援現場錄音');
  expect(result.unsupported).toContain('改用上傳音檔');
  expect(result.denied).toContain('麥克風權限被拒絕');
  expect(result.denied).toContain('改用上傳音檔');
});

test('選取檔案時以實際 MIME 優先，不被錯誤副檔名覆蓋', async ({ page }) => {
  await page.goto(appUrl);

  const result = await page.evaluate(() => {
    state.selectedPlace = {
      id: 101,
      sourceId: 'SRC-101',
      placeName: '甲地',
      tAssignee: 'user@example.com',
      hAssignee: ''
    };
    const file = new File(['webm audio'], 'voice.m4a', { type: 'audio/webm' });
    handleFileUpload({
      target: {
        files: [file],
        value: 'voice.m4a'
      }
    });
    return {
      blobType: audioBlob.type,
      originalFileName: uploadedFileName,
      summary: document.getElementById('audio-file-summary').innerText
    };
  });

  expect(result.blobType).toBe('audio/webm');
  expect(result.originalFileName).toBe('voice.m4a');
  expect(result.summary).toContain('voice.m4a');
});

test('上傳快照固定原始地名，payload 使用安全檔名且成功回傳正式 record id', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse();

  const result = await page.evaluate(async responseData => {
    const requests = [];
    window.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => responseData };
    };

    uploadAudio();
    const clientUploadId = pendingUploadJob.clientUploadId;
    state.selectedPlace = {
      id: 202,
      sourceId: 'SRC-202',
      placeName: '乙地',
      tAssignee: 'user@example.com',
      hAssignee: ''
    };
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });

    return {
      clientUploadId,
      payload: requests[0],
      records: state.uploadedRecords.map(record => ({
        recordId: record.recordId,
        placeId: record.placeId,
        url: record.url
      }))
    };
  }, formalResponse);

  expect(result.payload.clientUploadId).toBe(result.clientUploadId);
  expect(result.payload.requestId).toBe(result.clientUploadId);
  expect(result.payload.taskId).toBe('101');
  expect(result.payload.placeName).toBe('甲地');
  expect(result.payload.filename).toMatch(/^Record_101_[0-9a-f-]+\.m4a$/);
  expect(result.payload.filename).not.toContain('user@example.com');
  expect(result.records).toEqual([{
    recordId: 9001,
    placeId: '101',
    url: 'https://drive.google.com/file/d/test/view'
  }]);
});

test('Drive 或正式紀錄階段失敗後保留工作，重試沿用同一 request ID', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse(9002);

  const result = await page.evaluate(async responseData => {
    const requests = [];
    let attempt = 0;
    window.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: false,
          json: async () => ({
            success: false,
            stage: 'DRIVE',
            code: 'DRIVE_UPLOAD_FAILED',
            message: 'Drive 暫時無法寫入'
          })
        };
      }
      return { ok: true, json: async () => responseData };
    };

    uploadAudio();
    const clientUploadId = pendingUploadJob.clientUploadId;
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });
    const pendingAfterFailure = pendingUploadJob?.clientUploadId || '';
    uploadAudio();
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });

    return {
      pendingAfterFailure,
      requestIds: requests.map(request => request.clientUploadId),
      recordIds: state.uploadedRecords.map(record => record.recordId),
      status: document.getElementById('status').innerText
    };
  }, formalResponse);

  expect(result.pendingAfterFailure).toBeTruthy();
  expect(result.requestIds).toHaveLength(2);
  expect(result.requestIds[0]).toBe(result.requestIds[1]);
  expect(result.recordIds).toEqual([9002]);
  expect(result.status).toContain('錄音上傳完成');
});

test('伺服器回應遺失時可用同一 request ID 重試且不新增重複本機紀錄', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse(9003);

  const result = await page.evaluate(async responseData => {
    const requests = [];
    let attempt = 0;
    window.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: true,
          json: async () => {
            throw new Error('response body lost');
          }
        };
      }
      return { ok: true, json: async () => responseData };
    };

    uploadAudio();
    const clientUploadId = pendingUploadJob.clientUploadId;
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });
    const pendingAfterLoss = pendingUploadJob?.clientUploadId || '';
    uploadAudio();
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });

    return {
      clientUploadId,
      pendingAfterLoss,
      requestIds: requests.map(request => request.clientUploadId),
      recordIds: state.uploadedRecords.map(record => record.recordId)
    };
  }, formalResponse);

  expect(result.pendingAfterLoss).toBe(result.clientUploadId);
  expect(result.requestIds[0]).toBe(result.requestIds[1]);
  expect(result.recordIds).toEqual([9003]);
});

test('正式紀錄成功但 Records 補寫失敗時保留權威紀錄並顯示警告', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse(9004, { legacyLogPending: true });

  const result = await page.evaluate(async responseData => {
    window.fetch = async () => ({
      ok: true,
      json: async () => responseData
    });

    uploadAudio();
    await new Promise(resolve => {
      const check = () => uploadInProgress ? setTimeout(check, 5) : resolve();
      check();
    });

    return {
      recordIds: state.uploadedRecords.map(record => record.recordId),
      status: document.getElementById('status').innerText,
      pending: Boolean(pendingUploadJob)
    };
  }, formalResponse);

  expect(result.recordIds).toEqual([9004]);
  expect(result.status).toContain('Records 尚待補寫');
  expect(result.pending).toBe(false);
});

test('WebM MediaRecorder 仍保留 webm MIME 與副檔名', async ({ page }) => {
  await page.goto(appUrl);

  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] })
      }
    });

    class MockMediaRecorder {
      static isTypeSupported(mimeType) {
        return mimeType === 'audio/webm';
      }

      constructor(stream, options) {
        this.mimeType = options?.mimeType || 'audio/webm';
        this.state = 'inactive';
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({
          data: new Blob(['webm audio'], { type: 'audio/webm' })
        });
        this.onstop?.();
      }
    }

    window.MediaRecorder = MockMediaRecorder;
    await startRecording();
    stopRecording();
    return { mimeType: audioBlob.type, fileName: uploadedFileName };
  });

  expect(result).toEqual({
    mimeType: 'audio/webm',
    fileName: '現場錄音.webm'
  });
});

test('上傳期間重複點擊不會建立第二個 request', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse(9005);

  const result = await page.evaluate(async responseData => {
    let calls = 0;
    let releaseFetch = null;
    window.fetch = async () => {
      calls += 1;
      return new Promise(resolve => {
        releaseFetch = () => resolve({ ok: true, json: async () => responseData });
      });
    };

    uploadAudio();
    const clientUploadId = pendingUploadJob.clientUploadId;
    uploadAudio();
    while (!releaseFetch) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const callsBeforeRelease = calls;
    releaseFetch();
    while (uploadInProgress) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return {
      clientUploadId,
      callsBeforeRelease,
      calls,
      recordIds: state.uploadedRecords.map(record => record.recordId)
    };
  }, formalResponse);

  expect(result.clientUploadId).toMatch(/^[0-9a-f-]{36}$/);
  expect(result.callsBeforeRelease).toBe(1);
  expect(result.calls).toBe(1);
  expect(result.recordIds).toEqual([9005]);
});

test('特殊帳號與顯示姓名只進 metadata，不進安全 Drive 檔名', async ({ page }) => {
  await prepareUploadPage(page);
  const formalResponse = successResponse(9006);

  const result = await page.evaluate(async responseData => {
    state.userId = '王 小明 +@example.com';
    state.userEmail = '王 小明 +@example.com';
    state.userName = '王 小明 +@顯示名';
    state.allUserRecords = [{ account: state.userId, email: state.userEmail, name: state.userName, role: 'user', is_active: true }];
    const requests = [];
    window.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => responseData };
    };

    uploadAudio();
    while (uploadInProgress) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return {
      payload: requests[0],
      record: state.uploadedRecords[0]
    };
  }, formalResponse);

  expect(result.payload.recorderAccount).toBe('王 小明 +@example.com');
  expect(result.payload.recorderName).toBe('王 小明 +@顯示名');
  expect(result.payload.filename).toMatch(/^Record_101_[0-9a-f-]+\.m4a$/);
  expect(result.payload.filename).not.toContain('王');
  expect(result.payload.filename).not.toContain('@');
  expect(result.record.recordId).toBe(9006);
});
