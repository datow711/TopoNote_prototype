const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('AAC MIME helpers normalize generic Drive and mobile file types', async ({ page }) => {
  await page.goto(appUrl);

  const values = await page.evaluate(() => {
    return {
      aac: resolveAudioMimeType('voice.aac', 'application/octet-stream'),
      alias: resolveAudioMimeType('', 'audio/x-aac'),
      m4a: resolveAudioMimeType('voice.m4a', 'application/octet-stream'),
      normalized: normalizeAudioDataUrl('data:application/octet-stream;base64,AAE=', 'voice.aac')
    };
  });

  expect(values).toEqual({
    aac: 'audio/aac',
    alias: 'audio/aac',
    m4a: 'audio/mp4',
    normalized: 'data:audio/aac;base64,AAE='
  });
});

test('AAC upload preview and payload keep the corrected MIME type', async ({ page }) => {
  await page.goto(appUrl);

  const values = await page.evaluate(async () => {
    const file = new File([new Uint8Array([255, 241, 80, 128])], 'voice.aac', { type: 'application/octet-stream' });
    handleFileUpload({ target: { files: [file], value: 'voice.aac' } });

    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(audioBlob);
    });

    return { mimeType: audioBlob.type, dataUrl };
  });

  expect(values.mimeType).toBe('audio/aac');
  expect(values.dataUrl).toMatch(/^data:audio\/aac;base64,/);
});

test('cloud playback corrects a generic Drive Data URL before creating audio', async ({ page }) => {
  await page.goto(appUrl);

  const src = await page.evaluate(async () => {
    const container = document.createElement('div');
    container.id = 'aac-player';
    document.body.appendChild(container);
    const originalFetch = window.fetch;
    window.fetch = async () => ({ json: async () => ({
      success: true,
      dataUrl: 'data:application/octet-stream;base64,//FQgA==',
      fileName: 'drive-recording.aac',
      mimeType: 'audio/aac'
    }) });

    try {
      await fetchAndPlayAudioToContainer('https://drive.google.com/file/d/test/view', 'aac-player');
      return container.querySelector('audio')?.getAttribute('src') || '';
    } finally {
      window.fetch = originalFetch;
    }
  });

  expect(src).toBe('data:audio/aac;base64,//FQgA==');
});
