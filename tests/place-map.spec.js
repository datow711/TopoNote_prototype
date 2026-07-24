const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function installFakeLeaflet(page) {
  await page.addInitScript(() => {
    window.__fakeLeafletMarkers = [];
    const fakeMap = {
      zoom: 8,
      setView(center, zoom) {
        this.lastSetView = { center, zoom };
        if (zoom) this.zoom = zoom;
        return this;
      },
      fitBounds(bounds, options) {
        this.lastFitBounds = { bounds, options };
        return this;
      },
      invalidateSize() {
        this.invalidated = true;
        this.invalidateCount = (this.invalidateCount || 0) + 1;
        return this;
      },
      getZoom() {
        return this.zoom;
      },
      once(type, handler) {
        this[`on_${type}`] = handler;
        return this;
      },
      locate() {
        if (this.on_locationfound) {
          this.on_locationfound({ latlng: { lat: 23.5, lng: 121 }, accuracy: 120 });
        }
        return this;
      }
    };
    window.__fakeLeafletMap = fakeMap;
    window.L = {
      map() {
        return fakeMap;
      },
      tileLayer() {
        return { addTo: () => ({}) };
      },
      layerGroup() {
        return {
          clearLayers() {},
          addTo() { return this; },
          addLayer() {}
        };
      },
      circleMarker(latlng, options) {
        const marker = {
          latlng,
          options,
          addTo() { return this; },
          bindTooltip() { return this; },
          on(type, handler) { this[`on_${type}`] = handler; return this; },
          remove() {},
          setStyle(nextOptions) { this.options = { ...this.options, ...nextOptions }; return this; },
          bringToFront() { return this; }
        };
        window.__fakeLeafletMarkers.push(marker);
        return marker;
      },
      circle() {
        return { addTo() { return this; }, remove() {} };
      },
      latLngBounds() {
        return {
          valid: false,
          extend() { this.valid = true; return this; },
          isValid() { return this.valid; }
        };
      }
    };
  });
}

test('place map controls only appear for village or coordinate data', async ({ page }) => {
  await installFakeLeaflet(page);
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.uploadedRecords = [];
    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList([
      normalizeTask({
        task_id: 201,
        source_id: 'MAP-201',
        place_name: '只有鄉鎮',
        county: '甲縣',
        town: '乙鄉',
        info: '補充',
        location: '自然語言位置'
      }),
      normalizeTask({
        task_id: 202,
        source_id: 'MAP-202',
        place_name: '有村里',
        county: '甲縣',
        town: '乙鄉',
        village: '丙村',
        location: '村內'
      }),
      normalizeTask({
        task_id: 203,
        source_id: 'MAP-203',
        place_name: '有座標',
        county: '甲縣',
        town: '乙鄉',
        longitude: 121,
        latitude: 23.5
      })
    ]);
  });

  await expect(page.locator('#place-map-toggle')).toBeVisible();
  await expect(page.locator('#place-map-summary')).toContainText('1 筆可精準定位');
  await expect(page.locator('#place-map-summary')).toContainText('1 筆僅有村里');

  await page.evaluate(() => openRecordingUI(getPlaceByTaskId(201), null));
  await expect(page.locator('#selected-place-location-row')).toBeVisible();
  await expect(page.locator('#selected-place-location-content')).toHaveText('自然語言位置');
  await expect(page.locator('#selected-place-location-btn')).toBeHidden();

  await page.evaluate(() => openRecordingUI(getPlaceByTaskId(202), null));
  await expect(page.locator('#selected-place-location-btn')).toBeVisible();

  await page.locator('#place-map-toggle').click();
  await expect(page.locator('#place-map-panel')).toBeVisible();
  await expect(page.locator('#place-map-status')).toContainText('2 筆可開啟地圖');
  await expect(page.locator('#place-map-status')).toContainText('1 筆有經緯度');
  await expect(page.locator('#leaflet-js')).toHaveCount(0);
});

test('selected coordinate place shows straight-line distance after user location', async ({ page }) => {
  await installFakeLeaflet(page);
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.uploadedRecords = [];
    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList([
      normalizeTask({
        task_id: 301,
        source_id: 'MAP-301',
        place_name: '距離測試地名',
        county: '甲縣',
        town: '乙鄉',
        village: '丙村',
        longitude: 121,
        latitude: 23.51,
        location: '測試位置'
      })
    ]);
    openRecordingUI(getPlaceByTaskId(301), null);
  });

  await page.locator('#selected-place-location-btn').click();
  await page.evaluate(() => {
    state.placeMap.userPosition = { lat: 23.5, lng: 121, accuracy: 120 };
    renderSelectedMapCard(getPlaceByTaskId(301));
  });

  await expect(page.locator('#place-map-card')).toContainText('距離你約');
  await expect(page.locator('#place-map-card')).toContainText('直線距離');
  await expect(page.locator('#place-map-card')).toContainText('目前定位精度較低，距離僅供參考');
});

test('mobile place map panel covers the full viewport and keeps both close controls', async ({ page }) => {
  await installFakeLeaflet(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.uploadedRecords = [];
    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList([
      normalizeTask({
        task_id: 401,
        source_id: 'MAP-401',
        place_name: 'Mobile map place',
        county: 'Test county',
        town: 'Test town',
        village: 'Test village',
        longitude: 121,
        latitude: 23.5
      })
    ]);
  });

  await page.locator('#place-map-toggle').click();
  await expect.poll(async () => {
    const panelBox = await page.locator('#place-map-panel').boundingBox();
    return Math.round(panelBox.x);
  }).toBeLessThanOrEqual(1);
  const panelBox = await page.locator('#place-map-panel').boundingBox();
  const collapseBox = await page.locator('.place-map-collapse').boundingBox();
  const canvasBox = await page.locator('#place-map-canvas').boundingBox();
  const collapseZIndex = await page.locator('.place-map-collapse').evaluate(el => Number(getComputedStyle(el).zIndex));
  expect(panelBox.width).toBeGreaterThanOrEqual(388);
  expect(collapseBox.x).toBeLessThanOrEqual(1);
  expect(collapseBox.x + collapseBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  expect(canvasBox.width).toBeGreaterThan(300);
  expect(canvasBox.height).toBeGreaterThan(300);
  expect(collapseZIndex).toBeGreaterThanOrEqual(1000);
  await expect.poll(() => page.evaluate(() => window.__fakeLeafletMap.invalidateCount || 0)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.place-map-collapse')).toBeVisible();
  await expect(page.locator('.place-map-close')).toBeVisible();
});
