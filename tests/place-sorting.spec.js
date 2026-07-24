const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

function buildPlace(overrides) {
  return {
    id: overrides.id,
    sourceId: overrides.sourceId || `PLACE-${overrides.id}`,
    placeName: overrides.placeName,
    county: overrides.county,
    town: overrides.town,
    village: overrides.village,
    type: 'Type',
    recordingStatus: 'Not recorded',
    taiAudioCount: 0,
    hakAudioCount: 0,
    ...overrides
  };
}

test('place browsing sorts by county town village name and UUID', async ({ page }) => {
  await page.goto(appUrl);
  const places = [
    buildPlace({ id: 6, sourceId: 'PLACE-6', county: 'County B', town: 'Town A', village: 'Village A', placeName: 'Alpha' }),
    buildPlace({ id: 5, sourceId: 'PLACE-5', county: 'County A', town: 'Town B', village: 'Village A', placeName: 'Alpha' }),
    buildPlace({ id: 4, sourceId: 'PLACE-4', county: 'County A', town: 'Town A', village: 'Village B', placeName: 'Alpha' }),
    buildPlace({ id: 10, sourceId: 'PLACE-10', county: 'County A', town: 'Town A', village: 'Village A', placeName: 'Alpha' }),
    buildPlace({ id: 2, sourceId: 'PLACE-2', county: 'County A', town: 'Town A', village: 'Village A', placeName: 'Alpha' }),
    buildPlace({ id: 3, sourceId: 'PLACE-3', county: 'County A', town: 'Town A', village: 'Village A', placeName: 'Beta' })
  ];

  const displayedIds = await page.evaluate(inputPlaces => {
    state.userRole = 'user';
    state.currentTab = 'assigned';
    state.assignedPlaces = inputPlaces;
    state.allPlaces = [];
    state.availableTypes = [];
    state.availableTowns = [];
    state.selectedTowns = [];
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('county-filter').value = '';
    document.getElementById('search-box').value = '';
    applyFilters();
    return Array.from(document.querySelectorAll('.place-item .place-meta > .meta-badge:first-child'))
      .map(badge => badge.textContent.replace('UUID: ', ''));
  }, places);

  expect(displayedIds).toEqual([
    'PLACE-2',
    'PLACE-10',
    'PLACE-3',
    'PLACE-4',
    'PLACE-5',
    'PLACE-6'
  ]);
});

test('task download rows sort by county town village and name', async ({ page }) => {
  await page.goto(appUrl);
  const sortedIds = await page.evaluate(() => {
    state.assignedPlaces = [
      { id: 5, county: 'County B', town: 'Town A', village: 'Village A', placeName: 'Alpha' },
      { id: 4, county: 'County A', town: 'Town B', village: 'Village A', placeName: 'Alpha' },
      { id: 3, county: 'County A', town: 'Town A', village: 'Village B', placeName: 'Alpha' },
      { id: 2, county: 'County A', town: 'Town A', village: 'Village A', placeName: 'Beta' },
      { id: 1, county: 'County A', town: 'Town A', village: 'Village A', placeName: 'Alpha' }
    ];
    return getAssignedTaskExportRows().map(place => place.id);
  });

  expect(sortedIds).toEqual([1, 2, 3, 4, 5]);
});
